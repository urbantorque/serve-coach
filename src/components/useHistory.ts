import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listPracticeLogs,
  listPracticeSessions,
  listServeTags,
  getSession,
  listSummaries,
  listTripRecords,
  safely,
  saveSession,
  tagServe,
  untagServe,
  withServeTag,
  type PracticeLog,
  type ServeTag,
  type Session,
} from '../lib/storage/db'
import type { PracticeSession } from '../lib/session/session'
import type { TripRecord } from '../lib/storage/ledger'
import { rescorable } from '../lib/analysis/types'
import { scoringVersionOf } from '../lib/progress'

/**
 * The player's history, as the app holds it: the saved reports, the practice
 * log and the serve tags, loaded together and refreshed together (W5.2).
 *
 * Out of `App.tsx`, where it was a dozen pieces of state and three callbacks
 * threaded through a 1,700-line component. Held at the top rather than fetched
 * by each screen, for the reason the glance gave: a component that fetches on
 * mount refetches on every remount, and the glance remounts on every serve of a
 * basket.
 */
export function useHistory() {
  const [sessions, setSessions] = useState<Session[]>([])
  /**
   * Whether storage has answered yet.
   *
   * `sessions` starts empty and a returning player's list arrives a beat later,
   * so without this the home screen spent that beat telling somebody with sixty
   * serves that they had none — an example-report invitation that flashed and
   * vanished on every cold open. Home holds its first-run straps until this is
   * true.
   */
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  /**
   * Logged practice, or `undefined` when storage could not be read.
   *
   * The two are different answers and stay different all the way to the card:
   * empty means nothing has been logged, missing means this app cannot say. A
   * player on a browser with no IndexedDB must not be told they have not been
   * practising.
   */
  const [drillLogs, setDrillLogs] = useState<PracticeLog[]>()
  /** What the player has said about their own serves, by report id. */
  const [serveTags, setServeTags] = useState<ServeTag[]>([])
  /** Practice sessions (L2.4), newest first: long clips read a serve at a time. */
  const [practiceSessions, setPracticeSessions] = useState<PracticeSession[]>([])
  /** The season ledger (L3.3): a row per trip, kept after its reports are pruned. */
  const [tripLedger, setTripLedger] = useState<TripRecord[]>([])

  /**
   * A seeded history, held in place of the real one. `?demo=history`, dev only.
   *
   * A ref rather than a branch at every read site: `refresh` is the one door
   * into `sessions` and `drillLogs`, and it is called again on every save,
   * every delete and every trip back to the home screen — so a seed that only
   * set state once would survive until the first navigation and then vanish,
   * which is worse than not having it. Nothing writes to storage, deliberately:
   * a dev's own history is real data and fifteen fabricated reports in it is a
   * mess somebody has to clean up by hand.
   */
  const seededHistory = useRef<{ sessions: Session[]; practice: PracticeLog[]; practiceSessions?: PracticeSession[] }>()

  /*
   * Reports brought onto the current rubric in place (L3.11): those saved
   * before bumps that only moved the card's bands. Tried once per report per
   * load, so a save that fails cannot loop, and loaded only when one qualifies.
   */
  const tried = useRef(new Set<string>())
  const restamp = useCallback(async (list: Session[]) => {
    const due = list.filter((s) => !tried.current.has(s.id) && rescorable(scoringVersionOf(s)))
    if (!due.length) return false
    due.forEach((s) => tried.current.add(s.id))
    const { rescoreStoredSession } = await import('../lib/analysis/rescoreStored')
    for (const summary of due) {
      // The whole row, stills and all, so the rewrite keeps them.
      const full = await safely(() => getSession(summary.id), undefined)
      const rescored = full && rescoreStoredSession(full)
      if (rescored) await safely(() => saveSession(rescored as Parameters<typeof saveSession>[0], false), undefined)
    }
    return true
  }, [])

  const refresh = useCallback(() => {
    if (seededHistory.current) {
      setSessions(seededHistory.current.sessions)
      setDrillLogs(seededHistory.current.practice)
      setPracticeSessions(seededHistory.current.practiceSessions ?? [])
      setTripLedger([])
      setSessionsLoaded(true)
      return
    }
    void safely(listTripRecords, []).then((list) => {
      if (!seededHistory.current) setTripLedger(list)
    })
    void safely(listSummaries, []).then((list) => {
      // A read started before `?demo=history` seeded itself can land after
      // it, and used to replace the season with the empty real store.
      if (seededHistory.current) return
      setSessions(list)
      setSessionsLoaded(true)
      // Re-read once if anything was brought onto the current rubric.
      void restamp(list).then((changed) => {
        if (changed && !seededHistory.current) void safely(listSummaries, []).then(setSessions)
      })
    })
    void safely(listServeTags, []).then(setServeTags)
    void safely(listPracticeSessions, []).then((list) => {
      if (!seededHistory.current) setPracticeSessions(list)
    })
    // `undefined` on failure rather than `[]` — see `drillLogs`.
    void safely<PracticeLog[] | undefined>(listPracticeLogs, undefined).then(setDrillLogs)
  }, [restamp])

  useEffect(() => refresh(), [refresh])

  /*
   * One tap, applied to the row that holds both of them.
   *
   * Optimistic in the same shape the rest of the app is: the merge is pure and
   * the local list is updated from its result, so the screen answers the tap
   * immediately and a failed write leaves the list and the store agreeing on
   * the next refresh rather than the screen showing a tag that was never
   * stored.
   */
  const applyServeTag = useCallback(
    async (id: string, patch: Partial<Pick<ServeTag, 'serveNumber' | 'outcome'>>) => {
      let next: ServeTag | undefined
      setServeTags((tags) => {
        next = withServeTag(tags.find((t) => t.id === id), id, patch, Date.now())
        const rest = tags.filter((t) => t.id !== id)
        return next ? [...rest, next] : rest
      })
      await safely(() => (next ? tagServe(next) : untagServe(id)), undefined)
    },
    [],
  )

  /** Hold a seeded history in place of storage, and show it now. */
  const seed = useCallback(
    (history: { sessions: Session[]; practice: PracticeLog[]; practiceSessions?: PracticeSession[] }) => {
      seededHistory.current = history
      refresh()
    },
    [refresh],
  )

  return {
    sessions,
    sessionsLoaded,
    drillLogs,
    serveTags,
    practiceSessions,
    tripLedger,
    refresh,
    applyServeTag,
    seed,
    /** Whether the history on screen is a dev seed rather than storage. */
    seeded: seededHistory.current !== undefined,
  }
}
