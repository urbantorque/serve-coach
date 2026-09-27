/**
 * Serve playback building blocks (DESIGN §8.9 to §8.12, §13.8): the video box with its overlay canvas
 * and labels, the phase timeline, transport row, overlay chips and key-frame strip, plus the pure
 * geometry, time-sync, track and scene helpers they use. Screens compose these.
 */
export * from './geometry.ts'
export * from './phaseSync.ts'
export * from './skeleton.ts'
export * from './tracks.ts'
export * from './overlayScene.ts'
export { paintScene, readPalette, type OverlayPalette } from './overlayPaint.ts'
export * from './playhead.ts'
export { useFollowerVideo, useVideoController, type VideoController } from './useVideoController.ts'
export { VideoStage, type VideoStageProps } from './VideoStage.tsx'
export { OverlayLabels } from './OverlayLabels.tsx'
export { PhaseTimeline, type PhaseTimelineProps } from './PhaseTimeline.tsx'
export { sliderText, TICK_EVENTS } from './timeline.ts'
export { TransportRow, type TransportRowProps } from './TransportRow.tsx'
export { OverlayChips, type OverlayChipsProps } from './OverlayChips.tsx'
export { OVERLAY_META } from './overlayMeta.ts'
export { KeyFrameStrip, type KeyFrameStripProps } from './KeyFrameStrip.tsx'
export { currentItem, EVENT_KEY, stripItems, type StripItem } from './keyFrames.ts'
export { urlFor, useObjectUrl, useObjectUrls } from './objectUrls.ts'
