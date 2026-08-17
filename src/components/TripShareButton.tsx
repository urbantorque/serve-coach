import { useMemo } from 'react'
import { Icon } from './primitives'
import { useShareState } from './useShareState'
import { shareTripCard } from '../lib/share/reportCard'
import { tripsOf, tripSummary } from '../lib/progress'
import type { Session } from '../lib/storage/db'

interface Props {
  /** The whole history. The trip is the most recent run of it — see `tripsOf`. */
  sessions: Session[]
  /** The recurring joint warning, if there is one. Drawn under the figures. */
  strainLine?: string
}

/**
 * Share the last trip to the court, in one image — see `renderTripCard`.
 *
 * WHY THIS FILE EXISTS AT ALL, WHICH IS THE UNCOMFORTABLE PART. `renderTripCard`
 * and `shareTripCard` were built in R58·2 and **nothing has ever called them**.
 * The card was designed, drawn, and checked — including that a trip nobody swept
 * draws no repeatability row — and no control anywhere in the app could produce
 * one. Found in round 51 by grepping for share entry points with no caller,
 * after the same shape turned up twice already: a tap prop nothing passed, and a
 * history filter nothing filtered with.
 *
 * A tiny self-contained button rather than more `App.tsx`, which is
 * `SeasonShareButton`'s argument and this file mirrors it deliberately — the
 * sharing state and one handler are the whole thing.
 *
 * RENDERS NOTHING ON A TRIP OF ONE, and that is not a tidiness rule. A trip card
 * is a spread, a best and a worst, and a repeatability line; with one serve the
 * best and the worst are the same report and the spread is zero. That is a card
 * that looks like a summary and is a single serve wearing one — the same
 * judgement `SeasonShareButton` makes at two records, for the same reason.
 */
export default function TripShareButton({ sessions, strainLine }: Props) {
  /*
   * The most recent trip, which is the only one worth offering.
   *
   * MEMOISED, AND IT WAS NOT WHEN THIS SHIPPED SIX ROUNDS AGO. `tripsOf` copies
   * the whole history and sorts it; `tripSummary` walks it again. Both ran on
   * every render of a sheet that also draws a chart — and worse, both allocate,
   * so `summary` was a fresh identity on every render and nothing downstream
   * could have memoised against it. Measured at the sixty-report cap.
   *
   * `tripsOf` returns them oldest-first, so the last is the one the player has
   * just come home from — and a button offering to share a trip from three weeks
   * ago is a button nobody meant to press.
   */
  const summary = useMemo(() => {
    const trips = tripsOf(sessions)
    const trip = trips[trips.length - 1]
    return trip ? tripSummary(trip, sessions) : undefined
  }, [sessions])

  const { sharing, trigger: share } = useShareState(() =>
    summary ? shareTripCard(summary, strainLine) : Promise.resolve('failed' as const),
  )

  if (!summary || summary.serves < 2) return null

  return (
    // `aria-live` so "Preparing…"/"Saved" reaches a screen reader as the
    // button's own text changes under it, which is the gap R21 closed and the
    // two share buttons beside this one already honour.
    <button
      className="btn btn--ghost btn--full"
      onClick={() => void share()}
      disabled={sharing === 'working'}
      aria-live="polite"
    >
      <Icon name={sharing === 'done' ? 'check' : 'share'} size={17} />
      {sharing === 'working' ? 'Preparing…' : sharing === 'done' ? 'Saved' : 'Share this trip'}
    </button>
  )
}
