/**
 * Sets of ten from the player's own taps (L3.7): starting one, finishing it
 * when its tenth landing is tapped, and the glance's line about it. Out of
 * `App.tsx` (L6.11), bodies unchanged.
 */
import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { Analysis } from '../lib/analysis/types'
import type { ServeTag, Session } from '../lib/storage/db'
import { writePrefs, type Prefs } from '../lib/storage/prefs'
import {
  SETS_KEPT,
  finishedSet,
  inRateFor,
  setDoneLine,
  setRunningLine,
  setServes,
  setTarget,
} from '../lib/sets'

export function useSets(deps: { prefs: Prefs; setPrefs: Dispatch<SetStateAction<Prefs>>; sessions: Session[]; serveTags: ServeTag[] }) {
  const { prefs, setPrefs, sessions, serveTags } = deps
  /*
   * Sets from the player's own taps (L3.7). A set finishes the moment its
   * tenth landing is tapped: the result moves into the records and the glance
   * that took it says so.
   */
  const startSet = useCallback(
    (serveNumber: 1 | 2) =>
      setPrefs(
        writePrefs({
          activeSet: { startedAt: Date.now(), serveNumber, target: setTarget(inRateFor(sessions, serveTags, serveNumber)) },
        }),
      ),
    [sessions, serveTags, setPrefs],
  )
  useEffect(() => {
    const active = prefs.activeSet
    if (!active) return
    const done = finishedSet(active, sessions, serveTags)
    if (done) setPrefs(writePrefs({ activeSet: undefined, sets: [...(prefs.sets ?? []), done].slice(-SETS_KEPT) }))
  }, [prefs.activeSet, prefs.sets, sessions, serveTags, setPrefs])
  const glanceSet = (analysis: Pick<Analysis, 'createdAt'>): { line: string; running: boolean } | undefined => {
    const active = prefs.activeSet
    if (active) {
      const counted = setServes(active, sessions, serveTags)
      return { line: setRunningLine(active, counted.length, counted.filter((c) => c.isIn).length), running: true }
    }
    const just = (prefs.sets ?? []).find((r) => r.endedAt === analysis.createdAt)
    return just ? { line: setDoneLine(just, prefs.sets ?? []), running: false } : undefined
  }
  return { startSet, glanceSet }
}
