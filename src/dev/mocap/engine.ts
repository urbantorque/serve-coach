/**
 * The engine's frames-in, verdict-out path, without a video element.
 *
 * `runAnalysis` in `analyze.ts` interleaves this with decoding, pose models,
 * the ball and the racket boxes, all of which need a browser. The steps that
 * turn landmarks into a report are pure and are called here in the same order
 * with the same arguments: detect, level if the phone was rolled, detect
 * again, resilience, quality, measure, diagnose, triage. The ball and the
 * racket detector are absent, as they are on any clip where neither is found.
 *
 * Kept in step with `runAnalysis` by hand. If that function gains a pure step,
 * this should gain it too, or the mocap bench measures an engine the player
 * never runs.
 */
import { assessQuality } from '../../lib/analysis/analyze'
import { diagnose, type Diagnosis } from '../../lib/analysis/diagnose'
import { measure } from '../../lib/analysis/metrics'
import { detectServe, type Skeleton } from '../../lib/analysis/phases'
import { NOTABLE_ROLL, assessSpatial, levelFrames, levelPivot } from '../../lib/analysis/spatial'
import { assessResilience, triage, type Resilience, type Triage } from '../../lib/analysis/triage'
import { NotAServeError, type Frame, type Fundamental, type Quality } from '../../lib/analysis/types'
import type { ServeType } from '../../lib/storage/prefs'

export interface EngineRun {
  frames: Frame[]
  skel: Skeleton
  resilience: Resilience
  quality: Quality
  fundamentals: Fundamental[]
  diagnosis: Diagnosis
  verdict: Triage
}

export type EngineResult = { ok: true; run: EngineRun } | { ok: false; refusal: string }

/**
 * `detect` in `runAnalysis`: a refusal that names the other hand is answered by
 * reading the clip again against that hand, once.
 */
function detect(frames: Frame[], fps: number): Skeleton {
  try {
    return detectServe(frames, fps)
  } catch (err) {
    if (err instanceof NotAServeError && err.suggestedHand) return detectServe(frames, fps, err.suggestedHand)
    throw err
  }
}

export function runEngine(input: Frame[], fps: number, serveType: ServeType = 'flat'): EngineResult {
  let frames = input
  let skel: Skeleton
  try {
    skel = detect(frames, fps)
    const tilt = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
    if (Math.abs(tilt.roll_deg) >= NOTABLE_ROLL) {
      const pivot = levelPivot(frames)
      frames = levelFrames(frames, tilt.roll_deg, pivot)
      skel = detect(frames, fps)
    }
  } catch (err) {
    if (err instanceof NotAServeError) return { ok: false, refusal: err.message }
    throw err
  }

  const resilience = assessResilience(frames, skel)
  const quality = assessQuality(frames, skel, fps, resilience.blur)
  const fundamentals = measure(frames, skel, quality.view === 'side', {
    serveType,
    confidence: {
      frames,
      skel,
      swingSamples: quality.swingSamples,
      view: quality.view,
      depthUnreliable: resilience.spatial.depth_unreliable,
      blur: resilience.blur,
    },
  })
  const diagnosis = diagnose(frames, skel, {})
  const verdict = triage(diagnosis, resilience)
  return { ok: true, run: { frames, skel, resilience, quality, fundamentals, diagnosis, verdict } }
}

