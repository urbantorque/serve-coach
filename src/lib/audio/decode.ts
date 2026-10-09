/**
 * The impacts in a video's sound, read a stretch at a time (L2.9).
 *
 * Decoding a whole session's sound at once is out of reach: a phone's thirty
 * minutes is a gigabyte or more of file and most of a gigabyte of samples. So
 * the AAC frames are found in the `moov` (`mp4Audio.ts`), read with
 * `file.slice` a chunk at a time, decoded `STRETCH_SECONDS` at a time, and only
 * the impacts are kept. WebCodecs decodes the frames as they are; without it,
 * each stretch is wrapped as an ADTS stream for `decodeAudioData`. A file that
 * is not an MP4 or MOV with AAC (a WebM from a screen recorder, a bench clip
 * from Wikimedia) is decoded whole when it is small enough to, and otherwise
 * not heard at all; the scan then stands on the picture alone, as it always did.
 */
import { readMoov } from '../pose/container'
import { aacTrackOf, adtsHeader, type AacFrame, type AacTrack } from './mp4Audio'
import { findOnsets } from './onsets'

/** Seconds of sound decoded at once. */
const STRETCH_SECONDS = 20

/** Seconds of the stretch before carried into the next, so an impact on the seam is heard. */
const CARRY_SECONDS = 1

/** A file no larger than this may be decoded whole when its sound cannot be read in stretches. */
export const WHOLE_LIMIT = 200 * 1024 * 1024

export interface Heard {
  /** Impact times, seconds into the sound. */
  onsets: number[]
  /** Seconds of sound read. */
  seconds: number
  via: 'webcodecs' | 'adts' | 'whole'
}

/** Every impact in the file's sound, or nothing when it has none this can read. */
export async function hearImpacts(
  file: Blob,
  signal?: AbortSignal,
  /** 'adts' to decode as a stream even where WebCodecs could, for proving both. */
  prefer?: 'adts',
): Promise<Heard | undefined> {
  const moov = await readMoov(file)
  const track = moov ? aacTrackOf(moov) : undefined
  if (track) {
    const viaCodecs = prefer !== 'adts' && (await webCodecsFits(track))
    try {
      return await hearTrack(file, track, viaCodecs ? 'webcodecs' : 'adts', signal)
    } catch (err) {
      if (signal?.aborted) throw err
      // A decoder that failed on this file: the picture still has the serves.
      return undefined
    }
  }
  if (file.size > WHOLE_LIMIT) return undefined
  try {
    const context = new OfflineAudioContext(1, 1, 44100)
    const buffer = await context.decodeAudioData(await file.arrayBuffer())
    return { onsets: onsetsOf(mono(buffer), buffer.sampleRate, 0), seconds: buffer.duration, via: 'whole' }
  } catch {
    return undefined
  }
}

async function webCodecsFits(track: AacTrack): Promise<boolean> {
  if (typeof AudioDecoder === 'undefined') return false
  try {
    const { supported } = await AudioDecoder.isConfigSupported({
      codec: track.codec,
      sampleRate: track.sampleRate,
      numberOfChannels: track.channels,
      description: track.config,
    })
    return supported === true
  } catch {
    return false
  }
}

/** The track's frames, a stretch at a time, decoded and listened to. */
async function hearTrack(
  file: Blob,
  track: AacTrack,
  via: 'webcodecs' | 'adts',
  signal?: AbortSignal,
): Promise<Heard> {
  const onsets: number[] = []
  let carry: { samples: Float32Array; from: number } | undefined
  const frames = track.frames
  const last = frames[frames.length - 1]
  const total = last.t + 1024 / track.sampleRate

  for (let start = 0; start < frames.length; ) {
    if (signal?.aborted) throw new DOMException('stopped', 'AbortError')
    const until = frames[start].t + STRETCH_SECONDS
    let end = start
    while (end < frames.length && frames[end].t < until) end++
    const stretch = frames.slice(start, end)
    const pcm = via === 'webcodecs' ? await decodeWithCodecs(file, track, stretch) : await decodeAsAdts(file, track, stretch)

    // The last second of the stretch before goes in front, so the level around
    // an impact on the seam is read whole and the impact is heard once.
    const from = carry ? carry.from : stretch[0].t
    const joined = carry ? concat(carry.samples, pcm.samples) : pcm.samples
    const seam = carry ? carry.from + carry.samples.length / pcm.rate : -Infinity
    // From just before the seam: an impact in the last frames of the stretch
    // before was too close to its end to be read there. `dedupe` drops doubles.
    for (const t of onsetsOf(joined, pcm.rate, from)) if (t >= seam - 0.05) onsets.push(t)
    const keep = Math.min(pcm.samples.length, Math.round(CARRY_SECONDS * pcm.rate))
    carry = { samples: pcm.samples.slice(pcm.samples.length - keep), from: stretch[0].t + (pcm.samples.length - keep) / pcm.rate }
    start = end
  }
  return { onsets: dedupe(onsets), seconds: total, via }
}

/** The bytes of a run of frames, read in as few slices as their layout allows. */
async function bytesOf(file: Blob, frames: AacFrame[]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = []
  for (let i = 0; i < frames.length; ) {
    let j = i
    while (j + 1 < frames.length && frames[j + 1].offset === frames[j].offset + frames[j].size) j++
    const run = new Uint8Array(await file.slice(frames[i].offset, frames[j].offset + frames[j].size).arrayBuffer())
    for (let k = i, at = 0; k <= j; at += frames[k].size, k++) out.push(run.subarray(at, at + frames[k].size))
    i = j + 1
  }
  return out
}

async function decodeWithCodecs(
  file: Blob,
  track: AacTrack,
  frames: AacFrame[],
): Promise<{ samples: Float32Array; rate: number }> {
  const bytes = await bytesOf(file, frames)
  const parts: Float32Array[] = []
  let rate = track.sampleRate
  let failure: unknown
  const decoder = new AudioDecoder({
    output: (data) => {
      rate = data.sampleRate
      const channels = data.numberOfChannels
      const length = data.numberOfFrames
      const sum = new Float32Array(length)
      const plane = new Float32Array(length)
      for (let c = 0; c < channels; c++) {
        data.copyTo(plane, { planeIndex: c, format: 'f32-planar' })
        for (let i = 0; i < length; i++) sum[i] += plane[i] / channels
      }
      parts.push(sum)
      data.close()
    },
    error: (e) => {
      failure = e
    },
  })
  decoder.configure({
    codec: track.codec,
    sampleRate: track.sampleRate,
    numberOfChannels: track.channels,
    description: track.config,
  })
  frames.forEach((f, i) =>
    decoder.decode(
      new EncodedAudioChunk({ type: 'key', timestamp: Math.round(f.t * 1e6), data: bytes[i] }),
    ),
  )
  await decoder.flush()
  decoder.close()
  if (failure) throw failure
  return { samples: concat(...parts), rate }
}

async function decodeAsAdts(
  file: Blob,
  track: AacTrack,
  frames: AacFrame[],
): Promise<{ samples: Float32Array; rate: number }> {
  const bytes = await bytesOf(file, frames)
  const stream = concat8(...bytes.flatMap((b) => [adtsHeader(track, b.length), b]))
  const context = new OfflineAudioContext(1, 1, track.sampleRate)
  const buffer = await context.decodeAudioData(stream.buffer as ArrayBuffer)
  return { samples: mono(buffer), rate: buffer.sampleRate }
}

/** Impacts in a run of samples, as times. */
const onsetsOf = (samples: Float32Array, rate: number, from: number): number[] =>
  findOnsets(samples, rate, from).map((o) => o.t)

function mono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < out.length; i++) out[i] += ch[i] / buffer.numberOfChannels
  }
  return out
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function concat8(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** One time per impact, where a seam heard it twice. */
function dedupe(times: number[]): number[] {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted.filter((t, i) => i === 0 || t - sorted[i - 1] > 0.04)
}
