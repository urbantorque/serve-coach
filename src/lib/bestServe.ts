/**
 * The player's best serve so far, as the model to set this one against (D4.5).
 *
 * The ghost used to be the last serve, which is the right comparison for "did
 * anything change" and the wrong one for "what does good look like for me". A
 * player's own best is the model they can actually reach: same body, same
 * racket, same camera habits — the one serve of theirs the report would have
 * nothing to fix in first.
 */
import type { FlawId } from './analysis/flaws'
import type { Metric } from './analysis/types'
import { cue } from './analysis/voice'
import { scoringVersionOf, typeOf } from './progress'
import type { Session } from './storage/db'
import type { ServeType } from './storage/prefs'

/**
 * The best earlier serve of the same type, scored by the same rubric.
 *
 * Best by overall score; between equals, the steadier basket (`consistency`),
 * then the newer. Never a different serve type — a kick is not a flat serve
 * done badly — and never a refused clip, whose score nobody believed. Never
 * across a change in how serves are scored either, because a best set under
 * the old rubric is a number this report cannot be compared with.
 */
export function bestPriorTo(
  sessions: Session[],
  createdAt: number,
  serveType: ServeType,
  rubric: number,
): Session | undefined {
  return sessions
    .filter(
      (s) =>
        s.createdAt < createdAt &&
        typeOf(s) === serveType &&
        scoringVersionOf(s) === rubric &&
        s.triage?.status !== 'rejected' &&
        Number.isFinite(s.overall),
    )
    .sort(
      (a, b) =>
        b.overall - a.overall ||
        (b.consistency?.score ?? -1) - (a.consistency?.score ?? -1) ||
        b.createdAt - a.createdAt,
    )[0]
}

/**
 * The card reading each named fault is visible on, where there is one.
 *
 * The faults read from depth or from a hand landmark the card does not show —
 * the grip, the spine, the forearm, the arm order, and the open chest, whose
 * coil the card shows ungraded — have no row of their own,
 * and the line below says nothing for them rather than borrowing a neighbour.
 */
const FLAW_READING: Partial<Record<FlawId, string[]>> = {
  toss_drift: ['tossPathWobble'],
  toss_height: ['tossPeakHeight'],
  // The ball's height when the report had it, the hand's otherwise (D2.2).
  low_contact: ['ballContactHeight', 'contactHeight'],
  shallow_drop: ['dropDepth'],
  no_leg_drive: ['legDrive'],
}

const metricOf = (s: Pick<Session, 'fundamentals'>, id: string): Metric | undefined =>
  s.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === id)

/**
 * One line setting the focus fault's reading against the best serve's.
 *
 * Said only when both serves read the same row, and in the row's own printed
 * form, so the numbers are the ones on the cards. "Closer" and "further" are
 * against the last serve, which is the question a player filming the same
 * drill again is asking.
 */
export function focusAgainstBest(
  flaw: FlawId | undefined,
  now: Pick<Session, 'fundamentals' | 'id'>,
  best: Pick<Session, 'fundamentals' | 'id'> | undefined,
  last?: Pick<Session, 'fundamentals'>,
): string | undefined {
  if (!flaw || !best || best.id === now.id) return undefined
  for (const id of FLAW_READING[flaw] ?? []) {
    const here = metricOf(now, id)
    const there = metricOf(best, id)
    if (!here || !there) continue
    if (here.score >= there.score) return cue('This reading is as good as your best serve.')
    const before = last ? metricOf(last, id) : undefined
    const gap = (m: Metric) => Math.abs(m.value - there.value)
    const trend =
      before && gap(here) < gap(before) - 1e-9
        ? ' Closer than last time.'
        : before && gap(here) > gap(before) + 1e-9
          ? ' Further than last time.'
          : ''
    // In body positions, the card's own readouts (L1.5). `display` is the
    // engine's figure ("0.050×", "2.1%") and was never meant to reach a player.
    const say = (m: Metric) => `**${m.readout.charAt(0).toLowerCase()}${m.readout.slice(1)}**`
    if (here.readout === there.readout) {
      return cue(`Your best serve read the same here: ${say(here)}.${trend}`)
    }
    return cue(`Your best serve read ${say(there)} here, this one ${say(here)}.${trend}`)
  }
  return undefined
}
