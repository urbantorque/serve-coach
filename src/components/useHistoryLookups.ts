/**
 * What a report, a glance or a session is set against, read off the history:
 * records, strain, deltas and the serve before. Out of `App.tsx` (L6.11),
 * bodies unchanged.
 */
import { useCallback } from 'react'
import type { InjuryFlag } from '../lib/analysis/triage'
import { strainBehindLine, strainGlanceLine } from '../lib/analysis/verdict'
import {
  bestConsistencyGap,
  bestTrip,
  buildConsistencyTrend,
  gapDeltaFor,
  glanceStrain,
  strainBehindOf,
  typeOf,
} from '../lib/progress'
import type { Session } from '../lib/storage/db'
import type { TripRecord } from '../lib/storage/ledger'
import type { ServeType } from '../lib/storage/prefs'

export function useHistoryLookups(deps: { sessions: Session[]; tripLedger: TripRecord[] }) {
  const { sessions, tripLedger } = deps
  /**
   * The tightest best-vs-worst gap swept, for whichever serve type is on
   * screen — see `bestConsistencyGap`.
   *
   * Deliberately not read off `spread` above, which is pinned to the
   * dominant type for the progress screen's own two blocks. A report open on
   * a kick serve while the player mostly films flat ones would otherwise show
   * a flat-serve record under a kick-serve basket with nothing on screen
   * saying so — the same confidently-wrong-type mismatch `priorTo` below
   * already guards against for a score delta.
   */
  const bestGapFor = useCallback(
    (serveType: ServeType) => bestConsistencyGap(buildConsistencyTrend(sessions, serveType)),
    [sessions],
  )
  /**
   * The best trip of this serve type so far, by its median — see
   * `bestTrip` (L3.2). Same reasoning as `bestGapFor`: recomputed per
   * viewed type rather than pinned to the sheet's dominant one, so a report
   * open on a type the player rarely films still shows its own record and
   * not a mismatched one.
   */
  /**
   * What each joint warning did on the trips before the report being read —
   * see `strainBehindOf`. Keyed to the viewed report's own date rather than to
   * today, and turned into sentences here so `Report.tsx` never has to know
   * what a trip is, matching how `streak` is already handed down.
   */
  /**
   * The glance's own one-line form of the same warning — see `glanceStrain`.
   * Worded here rather than in the screen for the same reason `streak` is:
   * `Glance.tsx` takes sentences, never records.
   */
  const glanceStrainLine = useCallback(
    (current: Pick<Session, 'triage'>) => {
      const record = glanceStrain(sessions, current)
      return record && strainGlanceLine(record)
    },
    [sessions],
  )
  const strainBehindFor = useCallback(
    (at: number) => {
      const out: Partial<Record<InjuryFlag, string>> = {}
      for (const [flag, record] of Object.entries(strainBehindOf(sessions, at))) {
        const line = record && strainBehindLine(record)
        if (line) out[flag as InjuryFlag] = line
      }
      return out
    },
    [sessions],
  )
  const bestScoreFor = useCallback(
    (serveType: ServeType) => bestTrip(sessions, serveType, tripLedger),
    [sessions, tripLedger],
  )
  // Same reasoning as bestGapFor: recomputed for whichever type is actually
  // on screen rather than read off `spread`, which is pinned to the
  // dominant type for the progress screen's own purposes.
  const gapDeltaForView = useCallback(
    (id: string, serveType: ServeType) => gapDeltaFor(buildConsistencyTrend(sessions, serveType), id),
    [sessions],
  )

  /**
   * The most recent report filed before this one — what a delta is measured against.
   *
   * Restricted to the same serve type. A kick serve and a flat one are scored
   * against different target bands, so "+11 vs your last serve" across a switch
   * measures the switch rather than the player, and points at a change they did
   * not make.
   */
  const priorTo = useCallback(
    (createdAt: number, serveType: ServeType) =>
      sessions
        .filter((s) => s.createdAt < createdAt && typeOf(s) === serveType)
        .sort((a, b) => b.createdAt - a.createdAt)[0],
    [sessions],
  )
  return { bestGapFor, glanceStrainLine, strainBehindFor, bestScoreFor, gapDeltaForView, priorTo }
}
