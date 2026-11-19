/**
 * Two serves played together, phase for phase (N4.1).
 *
 * Two serves never take the same time: a club player's trophy-to-contact can be
 * twice a model's. Played on one clock, the bodies drift apart and the picture
 * stops being a comparison by the trophy. So each serve's own phases are pinned
 * to the same places on one shared timeline, and between two phases each serve
 * runs at its own pace: both reach the trophy together, both reach contact
 * together, and whatever differs at those moments is the serve, not the timing.
 *
 * Pure, so `syncPhases.test.ts` holds it in Node.
 */
import type { PhaseId } from '../analysis/types'

/** The phases in the order a serve passes them. */
export const PHASE_ORDER: readonly PhaseId[] = ['ready', 'toss', 'trophy', 'drop', 'contact', 'finish']

/**
 * Where each phase sits on the shared timeline, 0 to 1. Even steps: the point
 * is that both serves arrive together, not that either keeps its own tempo.
 */
export function phaseMarks(phases: readonly PhaseId[] = PHASE_ORDER): Record<string, number> {
  const out: Record<string, number> = {}
  phases.forEach((p, i) => (out[p] = phases.length > 1 ? i / (phases.length - 1) : 0))
  return out
}

/**
 * The frame of one serve at `u` on the shared timeline: linear between the two
 * phases either side, by that serve's own frame indices. Phases the serve does
 * not have are skipped; a serve with none returns its first frame. The answer
 * is a fractional frame index, rounded by the caller to draw.
 */
export function syncedFrame(moments: Partial<Record<PhaseId, number>>, u: number): number {
  const marks = phaseMarks()
  const known = PHASE_ORDER.filter((p) => Number.isFinite(moments[p]))
  if (!known.length) return 0
  const t = Math.min(1, Math.max(0, u))
  if (t <= marks[known[0]]) return moments[known[0]]!
  for (let i = 1; i < known.length; i++) {
    const a = known[i - 1]
    const b = known[i]
    if (t <= marks[b]) {
      const span = marks[b] - marks[a]
      const k = span > 0 ? (t - marks[a]) / span : 1
      return moments[a]! + (moments[b]! - moments[a]!) * k
    }
  }
  return moments[known[known.length - 1]]!
}
