/**
 * The graduation card (L3.12): a retired fault's then and now, as one image a
 * player can choose to send.
 *
 * Drawn from the keyframe poses every report keeps (`filmstripPoses`) rather
 * than the photographs, which survive on the newest reports only: the "then"
 * is usually weeks old. The figures are the tracked body at the moment the
 * fault is judged, a serve that was named for it beside the newest serve
 * that was clean on it. Nothing here leaves the phone; the share button is
 * the only door, and the player opens it.
 */
import { judgeServe } from './analysis/progressions'
import { STILL_EVIDENCE } from './analysis/stillEvidence'
import { FAULT_NAME, graduationLine, type Graduation } from './graduation'
import { filmstripPoses, poseFrameAt } from './storage/poseTrack'
import type { FlawId } from './analysis/flaws'
import type { Side } from './analysis/geometry'
import type { Frame, PhaseId } from './analysis/types'
import type { Session } from './storage/db'

/** The keyframe a fault with no still of its own is shown at. */
const MOMENT: Record<FlawId, PhaseId> = {
  waiters_tray: 'trophy',
  toss_height: 'toss',
  toss_drift: 'toss',
  no_leg_drive: 'contact',
  posture_collapse: 'contact',
  shallow_drop: 'drop',
  collapsed_elbow: 'drop',
  early_shoulder_rotation: 'trophy',
  arming_the_ball: 'contact',
  pancake_contact: 'contact',
  low_contact: 'contact',
}

/** The moment a fault is judged at: its still's, where it has one. */
export const momentOf = (flaw: FlawId): PhaseId => {
  const still = STILL_EVIDENCE[flaw]
  return 'phase' in still ? still.phase : MOMENT[flaw]
}

export interface CardPose {
  at: number
  frame: Frame
  aspect: number
  racket: Side
}

export interface GraduationCard {
  flaw: FlawId
  name: string
  line: string
  moment: PhaseId
  then: CardPose
  now: CardPose
}

/** A report's pose at a keyframe, or nothing when it kept none. */
function poseAt(s: Session, moment: PhaseId): CardPose | undefined {
  const poses = filmstripPoses(s)
  const i = s.phases.findIndex((p) => p.id === moment)
  const frame = i >= 0 ? poseFrameAt(poses, i) : undefined
  return frame && poses ? { at: s.createdAt, frame, aspect: poses.aspect, racket: s.handedness ?? 'right' } : undefined
}

/**
 * The card for one graduation, or nothing when the history cannot draw both
 * halves: a serve named for the fault before it graduated, and a clean one
 * since, each with its keyframe pose.
 */
export function graduationCard(
  sessions: readonly Session[],
  g: Graduation,
  next?: FlawId,
): GraduationCard | undefined {
  const moment = momentOf(g.flaw)
  const newestFirst = [...sessions].sort((a, b) => b.createdAt - a.createdAt)
  const pick = (when: (s: Session) => boolean, verdict: 'named' | 'clean') => {
    for (const s of newestFirst) {
      if (!when(s) || judgeServe(s, g.flaw) !== verdict) continue
      const pose = poseAt(s, moment)
      if (pose) return pose
    }
    return undefined
  }
  const then = pick((s) => s.createdAt < g.since, 'named')
  const now = pick((s) => s.createdAt >= g.since, 'clean')
  if (!then || !now) return undefined
  return { flaw: g.flaw, name: FAULT_NAME[g.flaw], line: graduationLine(g, next), moment, then, now }
}
