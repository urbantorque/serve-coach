/**
 * MP4/MOV probe: parses the container with mp4box.js (reading only the boxes it needs,
 * skipping mdat), then derives VideoMeta, the presentation-order frame table, decoder
 * configuration inputs, audio track info and the time-base assessment.
 */
import { createFile, MP4BoxBuffer, type Box, type Movie, type Sample, type Track } from 'mp4box'
import type { VideoMeta } from '../types.ts'
import { sniffContainer, toByteSource, toOwnedArrayBuffer, type ByteInput, type ContainerKind } from './byteSource.ts'
import { codecFamily, hevcCodecString, type HevcProfileFields } from './codecs.ts'
import { parseMoovMetadata, type ContainerMetadata } from './qtMetadata.ts'
import { displaySize, rotationFromMatrix, type MatrixRotation } from './rotation.ts'
import { assessTimeBase, type TimeBaseAssessment } from './timeBase.ts'
import {
  analyzeFrameTiming,
  buildFrameTable,
  editMapping,
  type EditEntry,
  type EditMapping,
  type FrameTiming,
  type FrameTimingStats,
  type SampleInfo,
} from './timing.ts'

export interface VideoTrackInfo {
  trackId: number
  /** Codec string as signalled by the container (mp4box). */
  codec: string
  /** Codec string to give VideoDecoder (differs for Dolby Vision: its HEVC base layer). */
  decoderCodec: string
  sampleEntryType: string
  codedWidth: number
  codedHeight: number
  timescale: number
  /** avcC / hvcC / vpcC / av1C payload for VideoDecoderConfig.description. */
  description?: Uint8Array<ArrayBuffer>
  matrix: number[]
  rotation: MatrixRotation
  edits: EditEntry[]
  editMapping: EditMapping
  /** Decode order. */
  samples: SampleInfo[]
  bitrate: number
}

export interface AudioTrackInfo {
  trackId: number
  codec: string
  sampleRate: number
  channelCount: number
  timescale: number
  edits: EditEntry[]
  /** Media time skipped by the edit list (AAC encoder priming), seconds. */
  primingS: number
  /** Movie time at which audio starts (leading empty edits), seconds. */
  presentationOffsetS: number
  /** AudioSpecificConfig for AAC (AudioDecoderConfig.description). */
  description?: Uint8Array<ArrayBuffer>
  samples: SampleInfo[]
  durationS: number
}

export interface ProbeResult {
  container: ContainerKind
  brands: string[]
  meta: VideoMeta
  video: VideoTrackInfo
  audio?: AudioTrackInfo
  /** Presented frames in presentation order; frames[i].index === i. */
  frames: FrameTiming[]
  timing: FrameTimingStats
  timeBase: TimeBaseAssessment
  metadata: ContainerMetadata
  isFragmented: boolean
  warnings: string[]
}

export type ProbeErrorCode = 'empty-file' | 'unsupported-container' | 'parse-failed' | 'no-video-track' | 'no-frames'

export class ProbeError extends Error {
  readonly code: ProbeErrorCode
  readonly container: ContainerKind
  constructor(code: ProbeErrorCode, message: string, container: ContainerKind) {
    super(message)
    this.name = 'ProbeError'
    this.code = code
    this.container = container
  }
}

export interface ProbeOptions {
  fileName?: string
  mimeType?: string
  /** Read size while scanning for the moov box. */
  chunkBytes?: number
}

const DEFAULT_CHUNK_BYTES = 1 << 20

interface ParsedFile {
  info: Movie
  file: ReturnType<typeof createFile>
  moovBytes: Uint8Array<ArrayBuffer>
  moovStart: number
}

async function parseContainer(
  source: ReturnType<typeof toByteSource>,
  chunkBytes: number,
  container: ContainerKind,
): Promise<ParsedFile> {
  const file = createFile(false)
  let info: Movie | null = null
  let parseError: string | null = null
  file.onReady = (movie) => {
    info = movie
  }
  file.onError = (module, message) => {
    parseError = `${module}: ${message}`
  }

  let position = 0
  let fragmentedTail = false
  while (position < source.size) {
    const chunk = await source.read(position, chunkBytes)
    if (chunk.byteLength === 0) break
    const next = file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(toOwnedArrayBuffer(chunk), position))
    const readyInfo = info as Movie | null
    if (readyInfo && !readyInfo.isFragmented) break
    if (readyInfo?.isFragmented) fragmentedTail = true // keep reading moofs for the full sample table
    position = typeof next === 'number' && next > position ? next : position + chunk.byteLength
  }
  file.flush()

  const ready = info as Movie | null
  if (!ready) {
    throw new ProbeError('parse-failed', parseError ?? 'No moov box found (file truncated or not MP4/MOV).', container)
  }
  const finalInfo = fragmentedTail ? file.getInfo() : ready
  const moov = file.moov as (Box & { start?: number; size: number }) | undefined
  if (!moov || moov.start === undefined) throw new ProbeError('parse-failed', 'moov box position unknown.', container)
  const moovBytes = await source.read(moov.start, moov.size)
  return { info: finalInfo, file, moovBytes, moovStart: moov.start }
}

function toSampleInfo(sample: Sample): SampleInfo {
  return {
    index: sample.number,
    dtsTicks: sample.dts,
    ctsTicks: sample.cts,
    durationTicks: sample.duration,
    isSync: sample.is_sync,
    offset: sample.offset,
    size: sample.size,
  }
}

function toEdits(track: Track, movieTimescale: number): EditEntry[] {
  return (track.edits ?? []).map((edit) => ({
    segmentDurationS: edit.segment_duration / movieTimescale,
    mediaTimeTicks: edit.media_time,
    // 16.16 fixed rate; mp4box reads the fraction as signed int16, so reinterpret it.
    mediaRate: edit.media_rate_integer + (edit.media_rate_fraction & 0xffff) / 65536,
  }))
}

/** Raw payload of a child box, sliced from the moov bytes (byte-exact, no re-serialisation). */
function boxPayload(box: Box | undefined, parsed: ParsedFile): Uint8Array<ArrayBuffer> | undefined {
  if (!box || box.start === undefined || box.hdr_size === undefined) return undefined
  const from = box.start - parsed.moovStart + box.hdr_size
  const to = box.start - parsed.moovStart + box.size
  if (from < 0 || to > parsed.moovBytes.byteLength || to <= from) return undefined
  return parsed.moovBytes.slice(from, to)
}

interface SampleEntryLike extends Box {
  type: string
  avcC?: Box
  hvcC?: Box & HevcProfileFields
  vpcC?: Box
  av1C?: Box
  esds?: { esd?: { findDescriptor(tag: number): { findDescriptor(tag: number): { data?: Uint8Array } | undefined } | undefined } }
}

function firstSampleEntry(parsed: ParsedFile, trackId: number): SampleEntryLike | undefined {
  const trak = parsed.file.getTrackById(trackId)
  return trak?.mdia?.minf?.stbl?.stsd?.entries?.[0] as unknown as SampleEntryLike | undefined
}

function videoDecoderInputs(parsed: ParsedFile, track: Track): { decoderCodec: string; description?: Uint8Array<ArrayBuffer>; entryType: string } {
  const entry = firstSampleEntry(parsed, track.id)
  const entryType = entry?.type ?? track.codec.slice(0, 4)
  const configBox = entry?.avcC ?? entry?.hvcC ?? entry?.vpcC ?? entry?.av1C
  const description = boxPayload(configBox, parsed)
  let decoderCodec = track.codec
  if (codecFamily(track.codec) === 'dolby-vision' && entry?.hvcC) {
    decoderCodec = hevcCodecString(entryType === 'dvhe' ? 'hev1' : 'hvc1', entry.hvcC)
  }
  return { decoderCodec, description, entryType }
}

function aacDescription(parsed: ParsedFile, trackId: number): Uint8Array<ArrayBuffer> | undefined {
  try {
    const entry = firstSampleEntry(parsed, trackId)
    const data = entry?.esds?.esd?.findDescriptor(4)?.findDescriptor(5)?.data
    return data ? new Uint8Array(data) : undefined
  } catch {
    return undefined
  }
}

function buildAudioInfo(parsed: ParsedFile, track: Track): AudioTrackInfo {
  const edits = toEdits(track, parsed.info.timescale)
  const samples = parsed.file.getTrackSamplesInfo(track.id).map(toSampleInfo)
  const mapping = editMapping(edits, track.timescale, samples[0]?.ctsTicks ?? 0)
  return {
    trackId: track.id,
    codec: track.codec,
    sampleRate: track.audio?.sample_rate ?? track.timescale,
    channelCount: track.audio?.channel_count ?? 0,
    timescale: track.timescale,
    edits,
    primingS: mapping.mediaStartTicks / track.timescale,
    presentationOffsetS: mapping.presentationOffsetS,
    description: track.codec.startsWith('mp4a') ? aacDescription(parsed, track.id) : undefined,
    samples,
    durationS: track.duration / track.timescale,
  }
}

function presentedDurationS(frames: readonly FrameTiming[], mapping: EditMapping, edits: readonly EditEntry[]): number {
  const mediaEdit = edits.find((e) => e.mediaTimeTicks >= 0)
  if (mediaEdit && mediaEdit.segmentDurationS > 0) return mapping.presentationOffsetS + mediaEdit.segmentDurationS
  const last = frames[frames.length - 1]
  return last ? last.tMedia + last.durationS : 0
}

function baseName(fileName: string | undefined): string {
  return fileName ?? 'video'
}

/**
 * Probes an MP4/MOV file. Throws ProbeError('unsupported-container') for WebM and
 * other non-ISO files so callers can fall back to the media-element path.
 */
export async function probeVideo(input: ByteInput, options: ProbeOptions = {}): Promise<ProbeResult> {
  const source = toByteSource(input)
  if (source.size === 0) throw new ProbeError('empty-file', 'File is empty.', 'unknown')
  const container = sniffContainer(await source.read(0, 16))
  if (container === 'webm' || container === 'unknown') {
    throw new ProbeError('unsupported-container', `Container '${container}' is not MP4/MOV.`, container)
  }

  const parsed = await parseContainer(source, options.chunkBytes ?? DEFAULT_CHUNK_BYTES, container)
  const { info } = parsed
  const videoTrack = info.videoTracks[0]
  if (!videoTrack) throw new ProbeError('no-video-track', 'No video track in file.', container)

  const warnings: string[] = []
  const samples = parsed.file.getTrackSamplesInfo(videoTrack.id).map(toSampleInfo)
  const edits = toEdits(videoTrack, info.timescale)
  const firstCts = samples.reduce((min, s) => Math.min(min, s.ctsTicks), Number.POSITIVE_INFINITY)
  const mapping = editMapping(edits, videoTrack.timescale, Number.isFinite(firstCts) ? firstCts : 0)
  warnings.push(...mapping.warnings)

  const frames = buildFrameTable(samples, videoTrack.timescale, mapping)
  if (frames.length === 0) throw new ProbeError('no-frames', 'Video track has no presented frames.', container)
  if (!samples[0]?.isSync) warnings.push('First sample is not a keyframe; frames before the first keyframe cannot be decoded.')

  const timing = analyzeFrameTiming(
    frames.map((f) => f.tMedia),
    1 / videoTrack.timescale,
  )
  const matrix = Array.from(videoTrack.matrix ?? [])
  const rotation = rotationFromMatrix(matrix)
  if (!rotation.exact) warnings.push(`Track matrix rotates by ${rotation.rawAngleDeg.toFixed(1)} deg; snapped to ${rotation.rotationDeg}.`)
  if (rotation.mirrored) warnings.push('Track matrix mirrors the image; mirroring is not applied by this decoder.')

  const metadata = parseMoovMetadata(parsed.moovBytes)
  const timeBase = assessTimeBase({
    nominalFps: frames.length > 1 ? timing.nominalFps : Number.NaN,
    segments: timing.segments,
    metadata,
    editRate: mapping.rate,
  })
  warnings.push(...timeBase.warnings)

  const codedWidth = videoTrack.video?.width ?? videoTrack.track_width
  const codedHeight = videoTrack.video?.height ?? videoTrack.track_height
  const display = displaySize(codedWidth, codedHeight, rotation.rotationDeg)
  const decoderInputs = videoDecoderInputs(parsed, videoTrack)
  const audioTrack = info.audioTracks[0]
  const audio = audioTrack ? buildAudioInfo(parsed, audioTrack) : undefined

  const nominalFps = frames.length > 1 ? timing.nominalFps : 0
  const meta: VideoMeta = {
    fileName: baseName(options.fileName),
    mimeType: options.mimeType ?? (container === 'mov' ? 'video/quicktime' : 'video/mp4'),
    codec: videoTrack.codec,
    durationMediaS: presentedDurationS(frames, mapping, edits),
    width: display.width,
    height: display.height,
    rotationDeg: rotation.rotationDeg,
    hasAudio: audio !== undefined,
    nominalFps,
    captureFps: timeBase.captureFps || nominalFps,
    timeScale: timeBase.timeScale,
    fpsSource: timeBase.fpsSource,
    isVariableFrameRate: timing.isVariableFrameRate,
    frameCount: frames.length,
  }

  return {
    container,
    brands: info.brands,
    meta,
    video: {
      trackId: videoTrack.id,
      codec: videoTrack.codec,
      decoderCodec: decoderInputs.decoderCodec,
      sampleEntryType: decoderInputs.entryType,
      codedWidth,
      codedHeight,
      timescale: videoTrack.timescale,
      description: decoderInputs.description,
      matrix,
      rotation,
      edits,
      editMapping: mapping,
      samples,
      bitrate: videoTrack.bitrate,
    },
    audio,
    frames,
    timing,
    timeBase,
    metadata,
    isFragmented: info.isFragmented,
    warnings,
  }
}

/** Minimal VideoDecoderConfig inputs derived from a probe (no DOM types needed). */
export function videoDecoderConfigOf(probe: ProbeResult) {
  return {
    codec: probe.video.decoderCodec,
    codedWidth: probe.video.codedWidth,
    codedHeight: probe.video.codedHeight,
    description: probe.video.description,
  }
}
