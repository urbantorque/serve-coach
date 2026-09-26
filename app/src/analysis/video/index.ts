// Public API of the video + audio input layer. See README.md in this folder.
export { blobSource, bytesSource, sniffContainer, toByteSource, type ByteInput, type ByteSource, type ContainerKind } from './byteSource.ts'
export { probeVideo, ProbeError, videoDecoderConfigOf, type AudioTrackInfo, type ProbeResult, type VideoTrackInfo } from './probe.ts'
export {
  analyzeFrameTiming,
  buildFrameTable,
  editMapping,
  nearestStandardFps,
  rateSegments,
  type EditEntry,
  type FrameTiming,
  type FrameTimingStats,
  type RateSegment,
  type SampleInfo,
} from './timing.ts'
export {
  applyTimeScale,
  assessTimeBase,
  mediaToReal,
  realToMedia,
  timeScaleFromCaptureFps,
  HIGH_FPS_THRESHOLD,
  type TimeBaseAssessment,
  type TimeBaseKind,
} from './timeBase.ts'
export {
  codedToDisplay,
  displaySize,
  displayToCoded,
  rotationFromMatrix,
  type MatrixRotation,
  type RotationDeg,
} from './rotation.ts'
export { parseMoovMetadata, metadataNumber, metadataString, QT_KEYS, type ContainerMetadata, type MetadataValue } from './qtMetadata.ts'
export { codecFamily, hevcCodecString, type CodecFamily } from './codecs.ts'
export { selectFrameIndices, planDecode, nearestFrameIndex, estimateTimeline } from './decodePlan.ts'
export { analysisSize, FrameRenderer } from './render.ts'
export { checkWebCodecsSupport, decoderConfigFor, hasWebCodecs, WebCodecsFrameProducer } from './decoder.ts'
export { MediaElementFrameProducer } from './seekDecoder.ts'
export { openFrameSource, type OpenFrameSourceOptions } from './frameSource.ts'
export type {
  AnalysisSizeOptions,
  BitmapFrame,
  DecodeOptions,
  DecodePath,
  DecodeStats,
  FrameSelection,
  FrameSource,
  FrameTime,
  RawFrame,
  RenderOptions,
} from './frameTypes.ts'
export {
  assessAudioTiming,
  classifyTransient,
  decodeAudioFileData,
  decodeAudioTrack,
  detectOnsets,
  hasAudioDecoder,
  highPass,
  onsetEnvelope,
  pickPeaks,
  refineOnset,
  sharpnessScore,
  toAudioOnsets,
  transientFeatures,
  type DecodedAudio,
  type OnsetDetail,
} from './audio.ts'
