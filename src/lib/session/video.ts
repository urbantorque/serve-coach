/**
 * A practice session's video work: timing the file, finding the serves, reading
 * one (L2.4, L2.5).
 *
 * The runner (`runner.ts`) takes this as two functions so it can be tested in
 * Node; this is those functions against a real decoder. One video element for
 * the whole session, for the reason `analyzeAllServes` keeps one for a basket:
 * the file is demuxed and a decoder set up once, not once per serve.
 *
 * Nothing here keeps the file. It is read through an object URL the caller
 * owns, and a session never copies it into the clip store (`clipStore.ts`),
 * which is why a long clip is not refused for its size the way a basket is.
 */
import { SWEEP_SKIPS, analyzeServe, captureServeStills, locateServes, type AnalyzeProgress } from '../analysis/analyze'
import { isNotAServeError, type Analysis } from '../analysis/types'
import type { Stretch } from '../analysis/slowMotion'
import { readContainerTiming, stretchFromContainer } from '../pose/container'
import { hearImpacts } from '../audio/decode'
import { loadVideo, timeScanSamples } from '../pose/extract'
import { loadEngine } from '../pose/poseEngine'
import type { ServeType } from '../storage/prefs'

/** Seeks timed to price the session: the first is dropped, so seven count. */
export const CALIBRATION_SAMPLES = 8

export interface ReadOptions {
  handedness: 'right' | 'left'
  serveType: ServeType
  tier?: number
  signal?: AbortSignal
  onProgress?: (p: AnalyzeProgress) => void
  /** Read the ball too: a full read, for a picture (L5.10). */
  withBall?: boolean
}

export interface SessionVideo {
  /** Milliseconds per seek-and-detect on this file, `CALIBRATION_SAMPLES` of them. */
  calibrate: (signal?: AbortSignal) => Promise<number[]>
  /**
   * Where every serve in the file is, seconds, and the overheads that reached
   * like one without being served (L2.10). Throws when the scan could not run.
   */
  locate: (signal?: AbortSignal, onProgress?: (ratio: number) => void) => Promise<{ found: number[]; unsure: number[] }>
  /**
   * One serve, light: no ball, no racket boxes, no stills, no second pose
   * model. With `withBall`, the full read the plan prices for a picture
   * (L5.10): the ball pass as well.
   */
  read: (index: number, found: number[], opts: ReadOptions) => Promise<Analysis>
  /**
   * A still of one serve's contact moment, skeleton drawn as the report draws
   * it (L2.8): from the analysis already in hand, or from a fresh read. Empty
   * when the seek did not land.
   */
  still: (index: number, found: number[], opts: ReadOptions, kept?: Analysis) => Promise<string>
  /** Let the decoder go. */
  close: () => void
}

export function openSessionVideo(videoUrl: string, file: Blob): SessionVideo {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  /*
   * The file's own slow-motion stretch, read once. Each serve would otherwise
   * read the container again, which on a long clip is a walk past a gigabyte of
   * media boxes per serve for an answer that cannot change.
   */
  let stretch: Promise<Stretch> | undefined
  const stretchOf = () =>
    (stretch ??= readContainerTiming(file).then((timing): Stretch => {
      const factor = stretchFromContainer(timing)
      return factor ? { factor, source: 'file' } : { factor: 1, source: 'none' }
    }))

  const reader: SessionVideo = {
    calibrate: async (signal) => {
      const landmarker = await loadEngine()
      await loadVideo(video, videoUrl)
      return timeScanSamples(video, landmarker, CALIBRATION_SAMPLES, signal)
    },

    locate: async (signal, onProgress) => {
      let unsure: number[] = []
      /*
       * The sound first (L2.9): seconds against the scan's minutes. Where it
       * can be read, its impacts are the fourth thing a serve agrees with;
       * where it cannot, the scan stands on the picture.
       */
      const heard = await hearImpacts(file, signal).catch((err) => {
        if (signal?.aborted) throw err
        return undefined
      })
      const found = await locateServes(
        {
          videoUrl,
          fileName: 'session',
          signal,
          onProgress: (p) => {
            if (p.step === 'scanning') onProgress?.(p.ratio)
          },
          onUnsureServes: (times) => {
            unsure = times
          },
          onsets: heard?.onsets,
        },
        video,
      )
      // `locateServes` hands back nothing when the scan failed, so that a single
      // serve can fall back to scanning for itself. A session has no such
      // fallback: every serve it reads is one this scan found.
      if (!found) throw new Error('I could not look through that video for serves.')
      return { found, unsure }
    },

    read: async (index, found, opts) => {
      const knownStretch = await stretchOf()
      const once = (handedness: 'right' | 'left') =>
        analyzeServe(
          {
            videoUrl,
            fileName: 'session',
            handedness,
            serveType: opts.serveType,
            serveIndex: index,
            knownServeTimes: found,
            tier: opts.tier,
            signal: opts.signal,
            onProgress: opts.onProgress,
            // The sweep's light read, and for the sweep's reasons: the framing
            // was passed when the session was planned, and the ball, the boxes,
            // the stills and the second pose model are not what a session line
            // keeps (`lineOf`).
            ...SWEEP_SKIPS,
            skipBall: !opts.withBall,
            knownStretch,
          },
          video,
        )
      try {
        return await once(opts.handedness)
      } catch (err) {
        // The swing was found on the other arm: read it again on that arm
        // rather than file a serve that is there as unclear.
        if (isNotAServeError(err) && err.suggestedHand && err.suggestedHand !== opts.handedness) {
          return once(err.suggestedHand)
        }
        throw err
      }
    },

    still: async (index, found, opts, kept) => {
      // A full read, as the plan prices it (L5.10): the ball's pass too, so
      // the picture shows it. The light read kept from the session's pass has
      // none, so it is read again rather than drawn without it.
      const analysis = kept?.ball ? kept : await reader.read(index, found, { ...opts, withBall: true })
      await captureServeStills(video, analysis, video.videoWidth / Math.max(1, video.videoHeight), opts.signal)
      return analysis.phases.find((p) => p.id === 'contact')?.thumbnail ?? ''
    },

    close: () => {
      video.removeAttribute('src')
      video.load()
    },
  }
  return reader
}
