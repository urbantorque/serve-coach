import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { getSession, getSetting, hasEvent, minutesBucket, recordEvent, sweepRecordings } from '../../data/index.ts'
import { useJobs } from '../../ui/screens/record/flow/jobs.ts'
import { activeRecordings } from '../../ui/screens/record/live/recorder.ts'
import { RecordingRecovery } from '../../ui/screens/record/live/RecordingRecovery.tsx'
import { paths } from '../../ui/shell/paths.ts'
import { hasOwnSession, noteAnalysisDone } from '../beta.ts'
import { displayMode, isNativeShell, registerWhenLoaded } from '../pwa/register.ts'
import { persistAtFirstSession } from '../storage.ts'
import { UpdatePrompt } from './UpdatePrompt.tsx'

/** After a job is done, its recording chunks are removed once the session holds the video. */
const CHUNK_CLEANUP_DELAY_MS = 60_000

/**
 * Platform services, mounted once by the app shell (inside the router and ShellContext):
 * - the service worker registration and the calm update prompt (PWA);
 * - the interrupted-recording offer on launch, and chunk clean-up after an analysis;
 * - navigator.storage.persist() at the first saved session;
 * - the local beta usage counts that screens do not record themselves (route-level events and
 *   analysis results; never anything about pain or a referral). Nothing leaves the phone.
 */
export function PlatformLayer() {
  useEffect(() => registerWhenLoaded(), [])
  useFirstOpen()
  useRouteEvents()
  useStoreEvents()
  usePaywallShowings()
  return (
    <>
      <UpdatePrompt />
      <RecordingRecovery />
    </>
  )
}

function useFirstOpen() {
  useEffect(() => {
    void (async () => {
      if (await hasEvent('app_first_opened')) return
      await recordEvent(
        'app_first_opened',
        { display: displayMode() === 'standalone' ? 'standalone' : 'browser', platform: isNativeShell() ? 'ios' : 'pwa' },
        { once: 'first' },
      )
    })()
  }, [])
}

/** Screens reached are counted here, once per navigation (so every way in is counted the same). */
function useRouteEvents() {
  const location = useLocation()
  const seen = useRef<string | null>(null)
  useEffect(() => {
    if (seen.current === location.key) return
    seen.current = location.key
    const p = location.pathname
    const own = (record: () => Promise<boolean>) => void hasOwnSession().then((yes) => (yes ? record() : false))
    if (p === paths.plan()) void recordEvent('paywall_viewed', { trigger: 'plan' })
    else if (p === paths.focus()) own(() => recordEvent('focus_opened'))
    else if (p === paths.drill()) own(() => recordEvent('drill_started'))
    else if (p === paths.practiceLog()) {
      // The drill player hands its result to the practice log (DrillPlayerScreen `DrillResult`).
      const state = location.state as { from?: string; minutes?: number } | null
      if (state?.from === 'drill') own(() => recordEvent('drill_completed', { minutes: minutesBucket(state.minutes ?? 0) }))
    }
  }, [location])
}

/**
 * Plus sheets and cards (PRODUCT §6.15 T1 to T3) log each showing in the `paywall` setting
 * (entitlement/store.ts). Showings added while the app runs are counted once each; entries already
 * there at launch are not (they were counted then, or pre-date this build).
 */
function usePaywallShowings() {
  const state = useLiveQuery(() => getSetting('paywall').catch(() => undefined), [])
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (state === undefined) return
    const log = state?.log ?? []
    if (known.current === null) {
      known.current = new Set(log.map((e) => `${e.trigger}:${e.at}`))
      return
    }
    for (const e of log) {
      const key = `${e.trigger}:${e.at}`
      if (known.current.has(key)) continue
      known.current.add(key)
      void recordEvent('paywall_viewed', { trigger: e.trigger }, { once: key, now: new Date(e.at) })
    }
  }, [state])
}

function useStoreEvents() {
  useEffect(() => {
    // Nothing about pain, a referral or the body check is ever recorded, not even a count: that is
    // health information and stays out of analytics (PRODUCT §9.4; COACHING §10).
    const timers: number[] = []
    const offJobs = useJobs.subscribe((s, prev) => {
      for (const [sessionId, job] of Object.entries(s.jobs)) {
        const before = prev.jobs[sessionId]
        if (!before) {
          // A session was just saved and handed to analysis: the first real one asks for persistence.
          void getSession(sessionId)
            .then((session) => (session && session.isDemo !== 1 ? persistAtFirstSession() : undefined))
            .catch(() => undefined)
        }
        if (job.phase === 'done' && before?.phase !== 'done') {
          void noteAnalysisDone(sessionId)
          timers.push(window.setTimeout(() => void sweepRecordings({ activeIds: activeRecordings }).catch(() => undefined), CHUNK_CLEANUP_DELAY_MS))
        }
      }
    })
    return () => {
      offJobs()
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [])
}
