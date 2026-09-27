/**
 * Frame-accurate decoding with WebCodecs VideoDecoder, fed with coded samples read
 * straight from the file at the byte offsets in the sample table (no demuxer copy of
 * the whole file). Decoding starts at the keyframe before the first wanted frame; frames
 * outside the request are closed immediately. Memory is bounded by the decode queue
 * limit, the pending-output limit and the sample read batch size.
 */
import type { ByteSource } from './byteSource.ts'
import { planDecodeSegments } from './decodePlan.ts'
import type { DecodeOptions, DecodeStats, FrameProducer, ProducedFrame } from './frameTypes.ts'
import { isDisposable, nalFormatFor, type NalFormat } from './nalRef.ts'
import type { ProbeResult } from './probe.ts'
import type { SampleInfo } from './timing.ts'

export function hasWebCodecs(): boolean {
  return typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function'
}

export function decoderConfigFor(
  probe: ProbeResult,
  hardwareAcceleration: HardwareAcceleration = 'no-preference',
): VideoDecoderConfig {
  const config: VideoDecoderConfig = {
    codec: probe.video.decoderCodec,
    codedWidth: probe.video.codedWidth,
    codedHeight: probe.video.codedHeight,
    hardwareAcceleration,
    optimizeForLatency: false,
  }
  if (probe.video.description) config.description = probe.video.description
  return config
}

export interface WebCodecsSupport {
  supported: boolean
  config: VideoDecoderConfig
  reason: string
}

export async function checkWebCodecsSupport(
  probe: ProbeResult,
  hardwareAcceleration: HardwareAcceleration = 'no-preference',
): Promise<WebCodecsSupport> {
  const config = decoderConfigFor(probe, hardwareAcceleration)
  if (!hasWebCodecs()) return { supported: false, config, reason: 'WebCodecs VideoDecoder is not available.' }
  try {
    const result = await VideoDecoder.isConfigSupported(config)
    return result.supported
      ? { supported: true, config, reason: `WebCodecs supports ${config.codec}.` }
      : { supported: false, config, reason: `WebCodecs does not support ${config.codec} here.` }
  } catch (error) {
    return { supported: false, config, reason: `isConfigSupported(${config.codec}) threw: ${String(error)}` }
  }
}

const MICROS = 1_000_000

/** Reads coded samples in batches of contiguous file ranges. */
class SampleReader {
  private batchFirst = -1
  private batchLast = -1
  private batchOffset = 0
  private bytes: Uint8Array = new Uint8Array(0)
  private readonly source: ByteSource
  private readonly samples: readonly SampleInfo[]
  private readonly lastSample: number
  private readonly maxBatchBytes: number
  private readonly maxBatchSamples: number

  constructor(source: ByteSource, samples: readonly SampleInfo[], lastSample: number, maxBatchBytes = 8 << 20, maxBatchSamples = 90) {
    this.source = source
    this.samples = samples
    this.lastSample = lastSample
    this.maxBatchBytes = maxBatchBytes
    this.maxBatchSamples = maxBatchSamples
  }

  async read(index: number): Promise<Uint8Array> {
    if (index < this.batchFirst || index > this.batchLast) await this.loadBatch(index)
    const sample = this.samples[index]
    const from = sample.offset - this.batchOffset
    return this.bytes.subarray(from, from + sample.size)
  }

  private async loadBatch(first: number): Promise<void> {
    const head = this.samples[first]
    let lo = head.offset
    let hi = head.offset + head.size
    let last = first
    while (last < this.lastSample && last - first + 1 < this.maxBatchSamples) {
      const next = this.samples[last + 1]
      const nextLo = Math.min(lo, next.offset)
      const nextHi = Math.max(hi, next.offset + next.size)
      if (nextHi - nextLo > this.maxBatchBytes) break
      lo = nextLo
      hi = nextHi
      last++
    }
    const bytes = await this.source.read(lo, hi - lo)
    if (bytes.byteLength < hi - lo) throw new Error(`File truncated: sample ${first} data missing.`)
    this.bytes = bytes
    this.batchOffset = lo
    this.batchFirst = first
    this.batchLast = last
  }
}

export interface WebCodecsDecoderOptions {
  config: VideoDecoderConfig
  /** Max chunks waiting inside the decoder before feeding pauses. */
  maxDecodeQueue?: number
  /** Max decoded frames buffered before the consumer takes them. */
  maxPendingFrames?: number
  /**
   * Leave out samples that are neither wanted nor referenced by any other picture (nalRef.ts).
   * Every decoded frame is bit-identical either way. Default true.
   */
  skipDisposable?: boolean
}

function abortError(): Error {
  return new DOMException('Decoding aborted.', 'AbortError')
}

export class WebCodecsFrameProducer implements FrameProducer {
  readonly path = 'webcodecs' as const
  private readonly probe: ProbeResult
  private readonly source: ByteSource
  private readonly config: VideoDecoderConfig
  private readonly maxDecodeQueue: number
  private readonly maxPendingFrames: number
  /** Chunk timestamp (us) -> presentation index. */
  private readonly indexByTimestamp = new Map<number, number>()
  /** Decode-order sample -> presentation index. */
  private readonly frameOfSample: Int32Array
  /** NAL framing when disposable samples may be skipped; null otherwise. */
  private readonly nal: NalFormat | null
  private closed = false

  constructor(probe: ProbeResult, source: ByteSource, options: WebCodecsDecoderOptions) {
    this.probe = probe
    this.source = source
    this.config = options.config
    this.maxDecodeQueue = options.maxDecodeQueue ?? 12
    this.maxPendingFrames = options.maxPendingFrames ?? 6
    for (const frame of probe.frames) this.indexByTimestamp.set(this.timestampOf(frame.ctsTicks), frame.index)
    this.frameOfSample = new Int32Array(probe.video.samples.length).fill(-1)
    for (const frame of probe.frames) if (frame.sampleIndex >= 0 && frame.sampleIndex < this.frameOfSample.length) this.frameOfSample[frame.sampleIndex] = frame.index
    this.nal = options.skipDisposable === false ? null : nalFormatFor(probe.video.decoderCodec, probe.video.description)
  }

  private readonly support = new Map<HardwareAcceleration, Promise<boolean>>()

  /** Whether this clip's codec decodes with the given preference (cached per preference). */
  canDecodeWith(hardwareAcceleration: HardwareAcceleration): Promise<boolean> {
    let known = this.support.get(hardwareAcceleration)
    if (!known) {
      known =
        hardwareAcceleration === this.config.hardwareAcceleration
          ? Promise.resolve(true)
          : VideoDecoder.isConfigSupported({ ...this.config, hardwareAcceleration }).then(
              (r) => r.supported === true,
              () => false,
            )
      this.support.set(hardwareAcceleration, known)
    }
    return known
  }

  private timestampOf(ctsTicks: number): number {
    return Math.round((ctsTicks * MICROS) / this.probe.video.timescale)
  }

  private chunkFor(sample: SampleInfo, data: Uint8Array): EncodedVideoChunk {
    return new EncodedVideoChunk({
      type: sample.isSync ? 'key' : 'delta',
      timestamp: this.timestampOf(sample.ctsTicks),
      duration: Math.round((sample.durationTicks * MICROS) / this.probe.video.timescale),
      data,
    })
  }

  async *produce(indices: readonly number[], options: DecodeOptions = {}): AsyncGenerator<ProducedFrame> {
    if (this.closed) throw new Error('Decoder is closed.')
    const startedMs = performance.now()
    const stats: DecodeStats = {
      path: 'webcodecs',
      requested: indices.length,
      yielded: 0,
      missingIndices: [],
      samplesFed: 0,
      samplesSkipped: 0,
      elapsedMs: 0,
      notes: [],
    }
    const plan = planDecodeSegments(this.probe.video.samples, this.probe.frames, indices)
    if (!plan) {
      options.onStats?.(stats)
      return
    }

    const pending: VideoFrame[] = []
    const emitted = new Set<number>()
    let failure: unknown = null
    let flushed = false
    let flushStarted = false
    let wake: (() => void) | null = null
    const notify = () => {
      const resolve = wake
      wake = null
      resolve?.()
    }
    const onAbort = () => {
      failure ??= abortError()
      notify()
    }

    const decoder = new VideoDecoder({
      output: (frame) => {
        pending.push(frame)
        notify()
      },
      error: (error) => {
        failure ??= error
        notify()
      },
    })
    decoder.addEventListener('dequeue', notify)
    options.signal?.addEventListener('abort', onAbort)
    const config = options.hardwareAcceleration ? { ...this.config, hardwareAcceleration: options.hardwareAcceleration } : this.config
    const rotation = this.probe.meta.rotationDeg // VideoFrames come out in coded orientation
    // Runs of samples (planDecodeSegments): each run starts at a keyframe and ends with a flush,
    // so the samples between far-apart wanted frames are never decoded.
    let segment = 0
    let reader = new SampleReader(this.source, this.probe.video.samples, plan.segments[0].lastSample)
    let nextSample = plan.segments[0].firstSample
    let lastSample = plan.segments[0].lastSample
    if (plan.segments.length > 1) stats.notes.push(`${plan.segments.length} decode runs.`)

    try {
      if (options.signal?.aborted) throw abortError()
      decoder.configure(config)
      for (;;) {
        if (failure) throw failure
        // Feed while the decoder and the output buffer have room.
        while (
          nextSample <= lastSample &&
          decoder.decodeQueueSize < this.maxDecodeQueue &&
          pending.length < this.maxPendingFrames &&
          !failure
        ) {
          const sample = this.probe.video.samples[nextSample]
          const data = await reader.read(nextSample)
          if (decoder.state !== 'configured') break
          // A picture nobody wants and nobody references is left out (no other frame changes).
          if (this.nal && !sample.isSync && !plan.wanted.has(this.frameOfSample[nextSample]) && isDisposable(data, this.nal)) {
            stats.samplesSkipped++
            nextSample++
            continue
          }
          decoder.decode(this.chunkFor(sample, data))
          stats.samplesFed++
          nextSample++
        }
        if (failure) throw failure
        if (nextSample > lastSample && !flushStarted) {
          flushStarted = true
          decoder.flush().then(
            () => {
              flushed = true
              notify()
            },
            (error: unknown) => {
              failure ??= error
              notify()
            },
          )
        }
        // Drain outputs in presentation order; close anything not requested.
        while (pending.length > 0) {
          const frame = pending.shift() as VideoFrame
          const index = this.indexByTimestamp.get(frame.timestamp)
          if (index === undefined || !plan.wanted.has(index) || emitted.has(index)) {
            frame.close()
            continue
          }
          emitted.add(index)
          stats.yielded++
          yield {
            index,
            image: frame,
            width: frame.displayWidth,
            height: frame.displayHeight,
            pendingRotationDeg: rotation,
            close: () => frame.close(),
          }
          if (failure) throw failure
        }
        if (flushed && pending.length === 0) {
          if (++segment >= plan.segments.length) break
          // Next run: the decoder needs a keyframe after a flush, which is where every run starts.
          const next = plan.segments[segment]
          reader = new SampleReader(this.source, this.probe.video.samples, next.lastSample)
          nextSample = next.firstSample
          lastSample = next.lastSample
          flushStarted = false
          flushed = false
          continue
        }
        const canFeed =
          nextSample <= lastSample &&
          decoder.decodeQueueSize < this.maxDecodeQueue &&
          pending.length < this.maxPendingFrames
        if (!canFeed && pending.length === 0 && !failure) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
      }
    } finally {
      options.signal?.removeEventListener('abort', onAbort)
      decoder.removeEventListener('dequeue', notify)
      for (const frame of pending) frame.close()
      pending.length = 0
      if (decoder.state !== 'closed') decoder.close()
      stats.missingIndices = indices.filter((i) => !emitted.has(i))
      if (stats.missingIndices.length > 0) {
        stats.notes.push(`${stats.missingIndices.length} requested frame(s) never came out of the decoder.`)
      }
      stats.elapsedMs = performance.now() - startedMs
      options.onStats?.(stats)
    }
  }

  close(): void {
    this.closed = true
  }
}
