/**
 * Server selection and tracking when the detector returns more than one person
 * (numPoses = 2), so a bystander, coach or player on the next court cannot hijack
 * the track.
 *
 * Acquisition (first frame, or after the track has been lost for a while): ignore
 * people much smaller than the largest (far away), then take the one whose feet are
 * nearest the baseline-centre hint (default: horizontal centre of the frame, which is
 * where the recording guide asks the player to stand).
 * Continuation: gate candidates by plausible torso-centre speed and size change, then
 * pick the lowest cost of centroid jump + (1 - IoU) of the arm-free body box + size
 * change. Arms are excluded from the box because the serve's arm swing changes the full
 * bounding box far more than the person moves.
 * If nobody passes the gate the frame is reported lost (null), never switched.
 * Re-acquisition after reacquireAfterS only accepts someone near the last known
 * position; only after forgetAfterS does the tracker start over from the baseline hint.
 */
import { LM, type Landmark } from '../types.ts'
import { type Point2, isFiniteLandmark, midpoint } from './landmarks.ts'

export interface PoseCandidate {
  landmarks: Landmark[]
  worldLandmarks?: Array<{ x: number; y: number; z: number }> | null
}

export interface TrackerOptions {
  frameAspect: number
  /** Normalised image position of the baseline centre; y may be omitted (x-only prior). */
  baselineCentre?: { x: number; y?: number }
  /** At acquisition, people smaller than this fraction of the largest are ignored. */
  minRelativeSize?: number
  /** Largest plausible torso-centre speed, in body-box heights per second. */
  maxCentroidSpeedBoxHeightsPerS?: number
  /** Always-allowed centroid jump, in box heights (detector jitter, box changes). */
  centroidSlackBoxHeights?: number
  /** Allowed size ratio between frames (and its inverse). */
  maxSizeRatio?: number
  /** After this long without a match, re-acquire near the last known position. */
  reacquireAfterS?: number
  /** Re-acquisition only accepts people within this many box heights of the last position. */
  reacquireRadiusBoxHeights?: number
  /** After this long lost, forget the track and acquire from scratch (baseline hint). */
  forgetAfterS?: number
  /** Landmarks below this visibility are ignored for boxes. */
  minVisibility?: number
}

const BODY_BOX_LANDMARKS: readonly LM[] = [
  LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
  LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX,
]

/** Axis-aligned box in frame-height units. */
export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function bodyBoxHU(landmarks: readonly Landmark[], frameAspect: number, minVisibility = 0.2): Box | null {
  let box: Box | null = null
  for (const i of BODY_BOX_LANDMARKS) {
    const lm = landmarks[i]
    if (!isFiniteLandmark(lm) || lm.visibility < minVisibility) continue
    const x = lm.x * frameAspect
    if (!box) box = { minX: x, minY: lm.y, maxX: x, maxY: lm.y }
    else {
      box.minX = Math.min(box.minX, x)
      box.maxX = Math.max(box.maxX, x)
      box.minY = Math.min(box.minY, lm.y)
      box.maxY = Math.max(box.maxY, lm.y)
    }
  }
  return box && box.maxY - box.minY > 0 ? box : null
}

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX))
  const iy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY))
  const inter = ix * iy
  const area = (r: Box) => (r.maxX - r.minX) * (r.maxY - r.minY)
  const union = area(a) + area(b) - inter
  return union > 0 ? inter / union : 0
}

/** Torso centre (mean of shoulders and hips) in HU, or the box centre as a fallback. */
function torsoCentreHU(landmarks: readonly Landmark[], frameAspect: number, box: Box): Point2 {
  const pts = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP]
    .map((i) => landmarks[i])
    .filter((lm) => isFiniteLandmark(lm) && lm.visibility >= 0.2)
  if (pts.length === 0) return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const sum = pts.reduce((acc, lm) => ({ x: acc.x + lm.x * frameAspect, y: acc.y + lm.y }), { x: 0, y: 0 })
  return { x: sum.x / pts.length, y: sum.y / pts.length }
}

/** Feet midpoint in HU (bottom centre of the box when feet are not visible). */
function feetHU(landmarks: readonly Landmark[], frameAspect: number, box: Box): Point2 {
  const la = landmarks[LM.LEFT_ANKLE]
  const ra = landmarks[LM.RIGHT_ANKLE]
  if (isFiniteLandmark(la) && isFiniteLandmark(ra) && la.visibility >= 0.2 && ra.visibility >= 0.2) {
    const m = midpoint(la, ra)
    return { x: m.x * frameAspect, y: m.y }
  }
  return { x: (box.minX + box.maxX) / 2, y: box.maxY }
}

interface Described {
  index: number
  box: Box
  centre: Point2
  feet: Point2
  size: number
}

function describe(candidates: readonly PoseCandidate[], frameAspect: number, minVisibility: number): Described[] {
  const out: Described[] = []
  candidates.forEach((c, index) => {
    const box = bodyBoxHU(c.landmarks, frameAspect, minVisibility)
    if (!box) return
    out.push({
      index,
      box,
      centre: torsoCentreHU(c.landmarks, frameAspect, box),
      feet: feetHU(c.landmarks, frameAspect, box),
      size: box.maxY - box.minY,
    })
  })
  return out
}

export type TrackReason = 'acquired' | 'continued' | 'reacquired' | 'lost' | 'no-candidates'

export interface TrackDecision {
  /** Index into this frame's candidates, or null when no candidate is the server. */
  index: number | null
  reason: TrackReason
  /** 0..1 confidence that the chosen candidate is the server. */
  confidence: number
  candidates: number
}

export class ServerTracker {
  private readonly opts: Required<Omit<TrackerOptions, 'baselineCentre'>> & Pick<TrackerOptions, 'baselineCentre'>
  private last: { box: Box; centre: Point2; size: number; tReal: number } | null = null
  private everAcquired = false

  constructor(options: TrackerOptions) {
    this.opts = {
      minRelativeSize: 0.5,
      maxCentroidSpeedBoxHeightsPerS: 3,
      centroidSlackBoxHeights: 0.15,
      maxSizeRatio: 1.6,
      reacquireAfterS: 0.5,
      reacquireRadiusBoxHeights: 0.75,
      forgetAfterS: 3,
      minVisibility: 0.2,
      ...options,
    }
  }

  reset(): void {
    this.last = null
    this.everAcquired = false
  }

  update(candidates: readonly PoseCandidate[], tReal: number): TrackDecision {
    const { decision, chosen } = this.decide(candidates, tReal)
    if (chosen) {
      this.remember(chosen, tReal)
      this.everAcquired = true
    }
    return decision
  }

  /**
   * The decision update() would make, without changing the tracker. Used to pick the server
   * among localisation candidates (full frame / tiles) before the ROI inference that follows.
   */
  peek(candidates: readonly PoseCandidate[], tReal: number): TrackDecision {
    return this.decide(candidates, tReal).decision
  }

  private decide(candidates: readonly PoseCandidate[], tReal: number): { decision: TrackDecision; chosen: Described | null } {
    const n = candidates.length
    const none = (reason: 'lost' | 'no-candidates') => ({ decision: { index: null, reason, confidence: 0, candidates: n }, chosen: null })
    const described = describe(candidates, this.opts.frameAspect, this.opts.minVisibility)
    if (described.length === 0) return none('no-candidates')

    const last = this.last && tReal - this.last.tReal <= this.opts.forgetAfterS ? this.last : null
    if (last && tReal - last.tReal <= this.opts.reacquireAfterS) {
      const match = this.continueTrack(described, tReal, last)
      if (!match) return none('lost')
      return { decision: { index: match.chosen.index, reason: 'continued', confidence: match.confidence, candidates: n }, chosen: match.chosen }
    }

    // Re-acquire only near where the server was last seen; a bystander elsewhere in the
    // frame must not inherit the track just because the server was missed for a while.
    const nearLast = last
      ? described.filter(
          (d) => Math.hypot(d.centre.x - last.centre.x, d.centre.y - last.centre.y) <= this.opts.reacquireRadiusBoxHeights * last.size,
        )
      : described
    if (nearLast.length === 0) return none('lost')
    const hint = last ? { x: last.centre.x, y: last.centre.y, fromTrack: true } : this.baselineHint()
    const acquired = this.acquire(nearLast, hint)
    const reason: TrackReason = this.everAcquired ? 'reacquired' : 'acquired'
    return { decision: { index: acquired.chosen.index, reason, confidence: acquired.confidence, candidates: n }, chosen: acquired.chosen }
  }

  private baselineHint(): { x: number; y?: number; fromTrack: boolean } {
    const b = this.opts.baselineCentre
    return { x: (b?.x ?? 0.5) * this.opts.frameAspect, y: b?.y, fromTrack: false }
  }

  private remember(d: Described, tReal: number): void {
    this.last = { box: d.box, centre: d.centre, size: d.size, tReal }
  }

  private acquire(
    described: readonly Described[],
    hint: { x: number; y?: number; fromTrack: boolean },
  ): { chosen: Described; confidence: number } {
    const largest = Math.max(...described.map((d) => d.size))
    const eligible = described.filter((d) => d.size >= this.opts.minRelativeSize * largest)
    const point = (d: Described) => (hint.fromTrack ? d.centre : d.feet)
    const distance = (d: Described) => {
      const p = point(d)
      return hint.y === undefined ? Math.abs(p.x - hint.x) : Math.hypot(p.x - hint.x, p.y - hint.y)
    }
    const ranked = [...eligible].sort((a, b) => distance(a) - distance(b))
    const chosen = ranked[0]
    if (ranked.length === 1) return { chosen, confidence: described.length === 1 ? 1 : 0.8 }
    // Confidence from how much nearer the chosen person is than the runner-up, in body sizes.
    const gap = (distance(ranked[1]) - distance(chosen)) / chosen.size
    return { chosen, confidence: Math.min(1, 0.4 + gap) }
  }

  private continueTrack(
    described: readonly Described[],
    tReal: number,
    last: { box: Box; centre: Point2; size: number; tReal: number },
  ): { chosen: Described; confidence: number } | null {
    const dt = Math.max(0, tReal - last.tReal)
    const allowed = (this.opts.maxCentroidSpeedBoxHeightsPerS * dt + this.opts.centroidSlackBoxHeights) * last.size
    let best: { chosen: Described; cost: number } | null = null
    for (const d of described) {
      const jump = Math.hypot(d.centre.x - last.centre.x, d.centre.y - last.centre.y)
      const sizeRatio = d.size / last.size
      if (jump > allowed || sizeRatio > this.opts.maxSizeRatio || sizeRatio < 1 / this.opts.maxSizeRatio) continue
      const cost = jump / allowed + (1 - iou(d.box, last.box)) + Math.abs(Math.log(sizeRatio))
      if (!best || cost < best.cost) best = { chosen: d, cost }
    }
    return best ? { chosen: best.chosen, confidence: Math.exp(-best.cost / 2) } : null
  }
}

/** Offline convenience: runs the tracker over a whole clip. */
export function trackServer(
  frames: ReadonlyArray<{ tReal: number; candidates: readonly PoseCandidate[] }>,
  options: TrackerOptions,
): TrackDecision[] {
  const tracker = new ServerTracker(options)
  return frames.map((f) => tracker.update(f.candidates, f.tReal))
}
