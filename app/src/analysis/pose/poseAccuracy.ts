/**
 * Scores pose output against 2D ground truth (synthetic renders with known skeletons).
 *
 * Unit: the player's standing stature in pixels (BH). Errors are pixel distances divided
 * by it, so a portrait frame's anisotropic normalised units never enter the metric.
 * Joints default to the 12 core joints (shoulders, elbows, wrists, hips, knees, ankles).
 *
 * Errors are scored with MediaPipe's left/right labels as given ("strict"); a whole-body
 * mirror that fits better is counted separately (mirroredRate) and a mirror-tolerant error
 * is reported for comparison with the feasibility study, which forgave mirrors.
 */
import type { LM, Landmark, PoseFrame } from '../types.ts'
import { CORE_LANDMARKS, MIRROR_INDEX } from './landmarks.ts'

export interface TruthLandmarks {
  frameIndex: number
  tReal: number
  landmarks: ReadonlyArray<Pick<Landmark, 'x' | 'y'>> | null
}

export interface AccuracyOptions {
  frameWidth: number
  frameHeight: number
  /** Standing stature in pixels: the body-height unit. */
  staturePx: number
  joints?: readonly LM[]
  /** PCK distance threshold in statures (default 0.1). */
  pckThresholdBH?: number
  /** A detected frame is "on target" when at least this fraction of joints is within the threshold. */
  onTargetMinPck?: number
  /** Optional hitting-wrist window, e.g. contact +/- 0.1 s. */
  wristWindow?: { wrist: LM; startS: number; endS: number }
}

export interface AccuracySummary {
  frames: number
  detected: number
  detectionRate: number
  /** Frames whose pose is on the server (>= onTargetMinPck of joints within the threshold), over all frames. */
  onTargetRate: number
  /** Joint error over detected frames, strict labels, in statures. */
  meanErrorBH: number
  medianErrorBH: number
  p90ErrorBH: number
  /** Fraction of joints within the threshold, over detected frames. */
  pck: number
  /** Same, counting every joint of an undetected frame as a miss (end-to-end). */
  pckAllFrames: number
  /** Detected frames where the fully mirrored labelling fits better. */
  mirroredRate: number
  /** Per-frame min(strict, mirrored) mean error, averaged over detected frames. */
  meanErrorBHMirrorTolerant: number
  /** Mean strict error of the hitting wrist inside wristWindow (null without a window or detections). */
  wristWindowErrorBH: number | null
  wristWindowDetected: number
  wristWindowFrames: number
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

const mean = (values: readonly number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : Number.NaN)

export function scorePoseAccuracy(
  predicted: readonly Pick<PoseFrame, 'frameIndex' | 'landmarks'>[],
  truth: readonly TruthLandmarks[],
  options: AccuracyOptions,
): AccuracySummary {
  const joints = options.joints ?? CORE_LANDMARKS
  const threshold = options.pckThresholdBH ?? 0.1
  const onTargetMin = options.onTargetMinPck ?? 0.5
  const byIndex = new Map(predicted.map((p) => [p.frameIndex, p.landmarks]))
  const errorBH = (p: Pick<Landmark, 'x' | 'y'>, t: Pick<Landmark, 'x' | 'y'>) =>
    Math.hypot((p.x - t.x) * options.frameWidth, (p.y - t.y) * options.frameHeight) / options.staturePx

  const allErrors: number[] = []
  const tolerant: number[] = []
  const wristErrors: number[] = []
  let frames = 0
  let detected = 0
  let onTarget = 0
  let mirrored = 0
  let within = 0
  let wristFrames = 0
  for (const t of truth) {
    if (!t.landmarks) continue
    frames++
    const window = options.wristWindow
    const inWindow = window !== undefined && t.tReal >= window.startS - 1e-9 && t.tReal <= window.endS + 1e-9
    if (inWindow) wristFrames++
    const pred = byIndex.get(t.frameIndex)
    if (!pred) continue
    detected++
    const strict = joints.map((j) => errorBH(pred[j], t.landmarks![j]))
    const flipped = joints.map((j) => errorBH(pred[MIRROR_INDEX[j]], t.landmarks![j]))
    const hits = strict.filter((e) => e <= threshold).length
    within += hits
    if (hits / joints.length >= onTargetMin) onTarget++
    if (mean(flipped) < mean(strict)) mirrored++
    tolerant.push(Math.min(mean(strict), mean(flipped)))
    allErrors.push(...strict)
    if (inWindow) wristErrors.push(errorBH(pred[window.wrist], t.landmarks[window.wrist]))
  }
  const sorted = [...allErrors].sort((a, b) => a - b)
  return {
    frames,
    detected,
    detectionRate: frames ? detected / frames : Number.NaN,
    onTargetRate: frames ? onTarget / frames : Number.NaN,
    meanErrorBH: mean(allErrors),
    medianErrorBH: quantile(sorted, 0.5),
    p90ErrorBH: quantile(sorted, 0.9),
    pck: allErrors.length ? within / allErrors.length : Number.NaN,
    pckAllFrames: frames ? within / (frames * joints.length) : Number.NaN,
    mirroredRate: detected ? mirrored / detected : Number.NaN,
    meanErrorBHMirrorTolerant: mean(tolerant),
    wristWindowErrorBH: wristErrors.length ? mean(wristErrors) : null,
    wristWindowDetected: wristErrors.length,
    wristWindowFrames: wristFrames,
  }
}
