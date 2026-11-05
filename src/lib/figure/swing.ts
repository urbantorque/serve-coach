/**
 * A serve as something to draw, from whichever form this report carries it in:
 * the live frames, a stored swing, or the six keyframes an old report is left
 * with. One shape, so a screen never has to ask which it has.
 */
import type { FlawId } from '../analysis/flaws'
import type { Side } from '../analysis/geometry'
import type { Analysis, Frame, PhaseId } from '../analysis/types'
import type { Session } from '../storage/db'
import { filmstripPoses, poseFrameAt, replayFrom, trackFrameAt } from '../storage/poseTrack'

export interface Swing {
  frames: Frame[]
  /** Each moment's place in `frames`, where the serve reached it. */
  moments: Partial<Record<PhaseId, number>>
  bodyHeight?: number
  racket: Side
}

/** The frame in a list nearest a time, in seconds. */
function nearest(frames: readonly Frame[], t: number): number {
  let best = 0
  for (let i = 1; i < frames.length; i++) if (Math.abs(frames[i].t - t) < Math.abs(frames[best].t - t)) best = i
  return best
}

export function swingOf(a: Analysis | Session): Swing | undefined {
  const racket = a.handedness
  const bodyHeight = a.scale?.bodyHeight
  const live = (a as Analysis).frames
  if (Array.isArray(live) && live.length > 1) {
    const first = a.phases[0]?.frame ?? 0
    const last = a.phases[a.phases.length - 1]?.frame ?? live.length - 1
    return {
      frames: live.slice(first, last + 1),
      moments: Object.fromEntries(a.phases.map((p) => [p.id, p.frame - first])),
      bodyHeight,
      racket,
    }
  }
  const replay = replayFrom(a.track)
  if (replay && a.track) {
    const frames = replay.samples.map((s) => trackFrameAt(a.track, s.row)).filter((f): f is Frame => f !== undefined)
    if (frames.length > 1) {
      return {
        frames,
        moments: Object.fromEntries(a.phases.map((p) => [p.id, nearest(frames, p.t)])),
        bodyHeight,
        racket,
      }
    }
  }
  const poses = filmstripPoses(a as Analysis)
  if (!poses) return undefined
  const frames = a.phases.map((_, i) => poseFrameAt(poses, i))
  if (frames.some((f) => !f)) return undefined
  return {
    frames: frames as Frame[],
    moments: Object.fromEntries(a.phases.map((p, i) => [p.id, i])),
    bodyHeight,
    racket,
  }
}

/** The solids that carry a fault, by a fragment of their id: what to paint. */
export function workParts(flaw: FlawId | undefined, racket: Side): string[] {
  if (!flaw) return []
  const toss: Side = racket === 'left' ? 'right' : 'left'
  const arm = (side: Side, ...parts: string[]) => parts.map((p) => `${side}-${p}`)
  switch (flaw) {
    case 'toss_arm_drops':
    case 'toss_height':
      return arm(toss, 'upper', 'fore', 'hand')
    case 'toss_drift':
      return arm(toss, 'fore', 'hand')
    case 'no_leg_drive':
      return ['-thigh', '-shin']
    case 'early_shoulder_rotation':
    case 'posture_collapse':
      return ['torso']
    case 'collapsed_elbow':
      return arm(racket, 'upper')
    case 'waiters_tray':
    case 'shallow_drop':
    case 'pancake_contact':
      return arm(racket, 'fore', 'hand')
    case 'arming_the_ball':
    case 'low_contact':
    case 'contact_behind':
      return arm(racket, 'upper', 'fore', 'hand')
  }
}
