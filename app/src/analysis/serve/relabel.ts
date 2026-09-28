/**
 * Left/right relabelling (the MediaPipe mirror fix). In side views a whole-body mirror fits better
 * than MediaPipe's own labels in a large share of frames, typically as a persistent mirrored
 * stretch that cleanPoseFrames cannot see (the two arms and the two legs overlap in the picture,
 * so continuity alone cannot tell them apart). This step assigns each frame a state per limb group
 * (upper body: face and arms; lower body: legs) with a two-state Viterbi pass:
 *
 * - transition cost: the continuity of the TRUE limbs, i.e. staying costs the displacement of the
 *   labels as given, switching costs the displacement with the labels swapped;
 * - evidence cost, from the entered handedness and geometry only: the wrist nearest the ball (or
 *   the higher wrist) around toss release is the tossing hand, the highest wrist at contact is the
 *   hitting hand, and in stance the front foot (towards the net) is the foot on the tossing side.
 *
 * Output landmarks carry anatomical labels (left = the player's left). Metrics still assign roles
 * geometrically (§1.1); this keeps each limb's chain and identity continuous for per-side series.
 */
import { LM, type Handedness } from '../types.ts'
import { LANDMARKS, pt, type PoseTrack } from './track.ts'

const UPPER_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [LM.LEFT_EYE_INNER, LM.RIGHT_EYE_INNER],
  [LM.LEFT_EYE, LM.RIGHT_EYE],
  [LM.LEFT_EYE_OUTER, LM.RIGHT_EYE_OUTER],
  [LM.LEFT_EAR, LM.RIGHT_EAR],
  [LM.MOUTH_LEFT, LM.MOUTH_RIGHT],
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_ELBOW, LM.RIGHT_ELBOW],
  [LM.LEFT_WRIST, LM.RIGHT_WRIST],
  [LM.LEFT_PINKY, LM.RIGHT_PINKY],
  [LM.LEFT_INDEX, LM.RIGHT_INDEX],
  [LM.LEFT_THUMB, LM.RIGHT_THUMB],
]
const LOWER_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_KNEE, LM.RIGHT_KNEE],
  [LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
  [LM.LEFT_HEEL, LM.RIGHT_HEEL],
  [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX],
]
/** Pairs that drive the continuity cost (the face moves with the shoulders; hands with wrists). */
const UPPER_CONTINUITY: ReadonlyArray<readonly [number, number]> = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_ELBOW, LM.RIGHT_ELBOW],
  [LM.LEFT_WRIST, LM.RIGHT_WRIST],
]
const LOWER_CONTINUITY: ReadonlyArray<readonly [number, number]> = [
  [LM.LEFT_KNEE, LM.RIGHT_KNEE],
  [LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
  [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX],
]

/** Per-point continuity σ (BH) and the evidence weight per frame. */
const CONTINUITY_SIGMA_BH = 0.04
const EVIDENCE_WEIGHT = 3

export interface RelabelEvidenceInput {
  handedness: Handedness
  /** +1 when the net is to the right in the image (side view); undefined in other views. */
  netDir?: 1 | -1
  view: 'side' | 'rear' | 'front45' | 'unknown'
  bodyHeightHU: number
  /** Toss window (release − 0.35 s … release + 0.15 s) and the ball position at a time, if tracked. */
  toss?: { tStart: number; tEnd: number; ballAt?: (t: number) => { x: number; y: number } | null }
  /** Contact time (the highest wrist within ±0.05 s is the hitting hand). */
  contactT?: number
  /** Stance window (feet planted): the front foot is on the tossing side. */
  stance?: { tStart: number; tEnd: number }
  /** Frame range to process (indices into the track, inclusive). */
  from: number
  to: number
  /**
   * Compute the states only (RelabelReport.upperStates) and leave the track as it is: the swing test
   * of the classification (§2.3.4) follows the arms from the toss alone, without the contact cue.
   */
  dryRun?: boolean
}

export interface RelabelReport {
  upperMirroredFrames: number
  lowerMirroredFrames: number
  frames: number
  upperEvidenceFrames: number
  lowerEvidenceFrames: number
  /** Frames where the chosen state disagrees with that frame's own evidence (conflicts). */
  conflicts: number
  /** Dry runs: the upper-body state per frame from `from` (1 = the labels are mirrored). */
  upperStates?: Uint8Array
}

function d2(track: PoseTrack, i: number, a: number, j: number, b: number): number | null {
  const p = pt(track, i, a, 0.3)
  const q = pt(track, j, b, 0.3)
  if (!p || !q) return null
  return ((p.x - q.x) * track.aspect) ** 2 + (p.y - q.y) ** 2
}

/** Stay / switch costs between frames i−1 and i for a group. */
function transitionCosts(track: PoseTrack, i: number, pairs: ReadonlyArray<readonly [number, number]>, bh: number): [number, number] {
  let sid = 0
  let ssw = 0
  let m = 0
  for (const [a, b] of pairs) {
    const aa = d2(track, i, a, i - 1, a)
    const bb = d2(track, i, b, i - 1, b)
    const ab = d2(track, i, a, i - 1, b)
    const ba = d2(track, i, b, i - 1, a)
    if (aa === null || bb === null || ab === null || ba === null) continue
    sid += aa + bb
    ssw += ab + ba
    m += 2
  }
  if (m < 2) return [0, 0]
  const norm = 2 * (CONTINUITY_SIGMA_BH * bh) ** 2 * m
  const stay = sid / norm
  const sw = ssw / norm
  const lo = Math.min(stay, sw)
  return [stay - lo, sw - lo]
}

/** Viterbi over two states (0 = labels as given, 1 = mirrored). evidence[i] > 0 favours mirrored. */
function viterbi(n: number, evidence: Float64Array, trans: (i: number) => [number, number]): Uint8Array {
  const back = new Uint8Array(n * 2)
  let c0 = evidence[0] > 0 ? EVIDENCE_WEIGHT * evidence[0] : 0
  let c1 = evidence[0] < 0 ? -EVIDENCE_WEIGHT * evidence[0] : 0
  for (let i = 1; i < n; i++) {
    const [stay, sw] = trans(i)
    const e0 = evidence[i] > 0 ? EVIDENCE_WEIGHT * evidence[i] : 0
    const e1 = evidence[i] < 0 ? -EVIDENCE_WEIGHT * evidence[i] : 0
    const from0to0 = c0 + stay
    const from1to0 = c1 + sw
    const from1to1 = c1 + stay
    const from0to1 = c0 + sw
    back[i * 2] = from0to0 <= from1to0 ? 0 : 1
    back[i * 2 + 1] = from1to1 <= from0to1 ? 1 : 0
    const n0 = Math.min(from0to0, from1to0) + e0
    const n1 = Math.min(from1to1, from0to1) + e1
    const base = Math.min(n0, n1)
    c0 = n0 - base
    c1 = n1 - base
  }
  const states = new Uint8Array(n)
  let s: 0 | 1 = c0 <= c1 ? 0 : 1
  for (let i = n - 1; i >= 0; i--) {
    states[i] = s
    if (i > 0) s = back[i * 2 + s] as 0 | 1
  }
  return states
}

function swapPairs(track: PoseTrack, i: number, pairs: ReadonlyArray<readonly [number, number]>): void {
  for (const [a, b] of pairs) {
    const ja = i * LANDMARKS + a
    const jb = i * LANDMARKS + b
    for (const arr of [track.x, track.y, track.vis] as Float64Array[]) {
      const tmp = arr[ja]
      arr[ja] = arr[jb]
      arr[jb] = tmp
    }
    const tmp = track.interpolated[ja]
    track.interpolated[ja] = track.interpolated[jb]
    track.interpolated[jb] = tmp
  }
}

/**
 * Relabels frames [from, to] of the track IN PLACE so that left/right are anatomical, and returns
 * a report. Without any evidence frames nothing changes.
 */
export function relabelSides(track: PoseTrack, input: RelabelEvidenceInput): RelabelReport {
  const { from, to, bodyHeightHU: bh } = input
  const n = to - from + 1
  const report: RelabelReport = { upperMirroredFrames: 0, lowerMirroredFrames: 0, frames: Math.max(0, n), upperEvidenceFrames: 0, lowerEvidenceFrames: 0, conflicts: 0 }
  if (n < 2 || !(bh > 0)) return report
  // Anatomical tossing side: left for a right-hander.
  const tossLeft = input.handedness === 'right'
  const tossWrist = tossLeft ? LM.LEFT_WRIST : LM.RIGHT_WRIST
  const hitWrist = tossLeft ? LM.RIGHT_WRIST : LM.LEFT_WRIST
  const upperEv = new Float64Array(n)
  const lowerEv = new Float64Array(n)

  for (let k = 0; k < n; k++) {
    const i = from + k
    const t = track.t[i]
    const wt = pt(track, i, tossWrist, 0.3)
    const wh = pt(track, i, hitWrist, 0.3)
    if (input.toss && t >= input.toss.tStart && t <= input.toss.tEnd && wt && wh) {
      const ball = input.toss.ballAt?.(t) ?? null
      if (ball) {
        const dt = Math.hypot((wt.x - ball.x) * track.aspect, wt.y - ball.y)
        const dh = Math.hypot((wh.x - ball.x) * track.aspect, wh.y - ball.y)
        // Labelled tossing wrist nearer the ball → labels as given.
        upperEv[k] += Math.max(-1, Math.min(1, (dt - dh) / (0.08 * bh)))
      } else {
        // The higher wrist around release is the tossing hand.
        upperEv[k] += Math.max(-1, Math.min(1, (wt.y - wh.y) / (0.15 * bh))) * 0.6
      }
    }
    if (input.contactT !== undefined && Math.abs(t - input.contactT) <= 0.05 + track.dt / 2 && wt && wh) {
      // The highest wrist at contact is the hitting hand: labelled hitting wrist lower → mirrored.
      upperEv[k] += Math.max(-1, Math.min(1, (wh.y - wt.y) / (0.1 * bh)))
    }
    if (input.stance && t >= input.stance.tStart && t <= input.stance.tEnd) {
      const lt = pt(track, i, tossLeft ? LM.LEFT_FOOT_INDEX : LM.RIGHT_FOOT_INDEX, 0.3)
      const rt = pt(track, i, tossLeft ? LM.RIGHT_FOOT_INDEX : LM.LEFT_FOOT_INDEX, 0.3)
      if (lt && rt) {
        if (input.view === 'side' && input.netDir) {
          // Tossing-side foot should be nearer the net (larger netDir·x).
          const sep = input.netDir * (rt.x - lt.x) * track.aspect
          lowerEv[k] += Math.max(-1, Math.min(1, sep / (0.06 * bh)))
        } else if (input.view === 'rear') {
          // From behind, the front (tossing-side) foot is further away: higher in the picture.
          const sep = lt.y - rt.y
          lowerEv[k] += Math.max(-1, Math.min(1, sep / (0.03 * bh)))
        }
      }
    }
    if (upperEv[k] !== 0) report.upperEvidenceFrames++
    if (lowerEv[k] !== 0) report.lowerEvidenceFrames++
  }

  const upper = report.upperEvidenceFrames > 0 ? viterbi(n, upperEv, (k) => transitionCosts(track, from + k, UPPER_CONTINUITY, bh)) : new Uint8Array(n)
  if (input.dryRun) return { ...report, upperStates: upper }
  const lower = report.lowerEvidenceFrames > 0 ? viterbi(n, lowerEv, (k) => transitionCosts(track, from + k, LOWER_CONTINUITY, bh)) : new Uint8Array(n)
  for (let k = 0; k < n; k++) {
    if ((upper[k] === 1 && upperEv[k] < 0) || (upper[k] === 0 && upperEv[k] > 0)) report.conflicts++
    if ((lower[k] === 1 && lowerEv[k] < 0) || (lower[k] === 0 && lowerEv[k] > 0)) report.conflicts++
    if (upper[k]) {
      swapPairs(track, from + k, UPPER_PAIRS)
      report.upperMirroredFrames++
    }
    if (lower[k]) {
      swapPairs(track, from + k, LOWER_PAIRS)
      report.lowerMirroredFrames++
    }
  }
  return report
}
