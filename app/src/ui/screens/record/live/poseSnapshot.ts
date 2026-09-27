/**
 * Turns light-pass PoseFrames into the PoseSnapshot the framing checks read (CAPTURE §9.4
 * "stand tall": median over about 10 frames of an upright player). Pure; unit-tested.
 */
import { estimateFloorY, estimateHeadTopY, frontFootToe, kneeFlexionDeg, trunkInclinationDeg } from '../../../../analysis/pose/body.ts'
import { LM, type Handedness, type Landmark, type PoseFrame } from '../../../../analysis/types.ts'
import type { PoseSnapshot } from './framing.ts'

export interface PoseReading {
  tS: number
  headTopY: number
  floorY: number
  frontToeX: number | null
  inFrame: boolean
  upright: boolean
  others: number
}

const MIN_VIS = 0.5
const MARGIN = 0.03
const CORE = [
  LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST,
  LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.LEFT_HEEL, LM.RIGHT_HEEL,
]

const seen = (lm: Landmark | undefined): lm is Landmark => Boolean(lm) && (lm!.visibility ?? 0) >= MIN_VIS && !lm!.interpolated
const inside = (lm: Landmark) => lm.x >= MARGIN && lm.x <= 1 - MARGIN && lm.y >= MARGIN && lm.y <= 1 - MARGIN

/** One frame's reading, or null when there is no usable pose (nobody found, or no head or feet). */
export function readPoseFrame(frame: PoseFrame, aspect: number, handedness: Handedness): PoseReading | null {
  const lms = frame.landmarks
  if (!lms || lms.length < 33) return null
  const head = estimateHeadTopY(lms, aspect, MIN_VIS)
  const floorY = estimateFloorY(lms, aspect, MIN_VIS)
  if (!head || floorY === null || !(floorY > head.y)) return null

  const visible = CORE.map((i) => lms[i]).filter(seen)
  const feet = [LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.LEFT_HEEL, LM.RIGHT_HEEL].map((i) => lms[i]).filter(seen)
  const inFrame =
    seen(lms[LM.NOSE]) &&
    feet.length > 0 &&
    visible.length >= 10 &&
    visible.every(inside) &&
    head.y >= MARGIN &&
    floorY <= 1 - MARGIN

  let upright = true
  for (const side of ['left', 'right'] as const) {
    const knee = kneeFlexionDeg(lms, side, aspect, MIN_VIS)
    if (knee !== null && knee > 25) upright = false
  }
  const trunk = trunkInclinationDeg(lms, aspect, MIN_VIS)
  if (trunk && trunk.deg > 25) upright = false

  const toe = frontFootToe(lms, handedness, MIN_VIS)
  return {
    tS: frame.tReal,
    headTopY: head.y,
    floorY,
    frontToeX: toe ? toe.x : null,
    inFrame,
    upright,
    others: Math.max(0, (frame.track?.candidates ?? 1) - 1),
  }
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Median snapshot over the last `windowS` seconds of upright readings. Needs `minReadings`
 * (about 2 s at the pose rate) so a single frame never moves the headroom figure.
 */
export function snapshotFromReadings(readings: PoseReading[], nowS: number, windowS = 2.5, minReadings = 4): PoseSnapshot | null {
  const recent = readings.filter((r) => nowS - r.tS <= windowS)
  const upright = recent.filter((r) => r.upright)
  if (upright.length < minReadings) return null
  const toes = upright.map((r) => r.frontToeX).filter((x): x is number => x !== null)
  const inFrameShare = recent.filter((r) => r.inFrame).length / recent.length
  return {
    headTopY: median(upright.map((r) => r.headTopY)),
    floorY: median(upright.map((r) => r.floorY)),
    frontToeX: toes.length >= Math.ceil(upright.length / 2) ? median(toes) : null,
    inFrame: inFrameShare >= 0.8,
    others: Math.max(...recent.map((r) => r.others)),
  }
}

/** The player has been found and standing still at the spot (for the serving-spot state, CAPTURE §9.7). */
export function standingAtSpot(readings: PoseReading[], nowS: number, holdS = 1): boolean {
  const recent = readings.filter((r) => nowS - r.tS <= holdS)
  if (recent.length < 3 || nowS - recent[0].tS < holdS * 0.6) return false
  if (!recent.every((r) => r.upright && r.inFrame)) return false
  const floors = recent.map((r) => r.floorY)
  const heights = recent.map((r) => r.floorY - r.headTopY)
  const h = median(heights)
  return Math.max(...floors) - Math.min(...floors) < 0.05 * h
}
