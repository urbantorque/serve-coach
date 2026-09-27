/**
 * Beta instrumentation helpers (docs/MONETISATION.md §8; PRODUCT §9.1, §9.3, §9.4). Each turns app state
 * into one local event with buckets only (data/repos/events.ts): never a sample session, never an id,
 * never free text. The observers in platform/ui/PlatformLayer.tsx and a few screens call them.
 */
import {
  daysBucket,
  getExperiment,
  getSession,
  hasEvent,
  listSessions,
  minutesBucket,
  recordEvent,
  servesBucket,
  VERDICT_EVENT_IDS,
  type EventProps,
} from '../data/index.ts'
import type { ExperimentRecord, PracticeLogRecord, SessionRecord } from '../data/records.ts'

const DAY_MS = 24 * 60 * 60 * 1000
/** PRODUCT §9.1: a session is valid for activation with 10 or more serves and capture Fair or Good. */
export const VALID_SESSION_SERVES = 10
/** PRODUCT §9.1: loop completion needs the re-test within 14 days of the baseline. */
export const LOOP_WINDOW_DAYS = 14

/** The player has at least one session of their own (so a sample-only phone records no focus events). */
export async function hasOwnSession(): Promise<boolean> {
  try {
    return (await listSessions({ includeDemo: false })).length > 0
  } catch {
    return false
  }
}

async function sessionTimes(ids: readonly string[]): Promise<number[]> {
  const out: number[] = []
  for (const id of ids) {
    const s = await getSession(id)
    if (s) out.push(new Date(s.startedAt).getTime())
  }
  return out
}

/** Days from the experiment's last baseline session (or its start) to a re-test at `retestAt`. */
async function daysSinceBaseline(exp: ExperimentRecord, retestAt: number): Promise<number> {
  const baseline = await sessionTimes(exp.baselineSessionIds)
  const from = baseline.length ? Math.max(...baseline) : new Date(exp.createdAt).getTime()
  return Math.max(0, (retestAt - from) / DAY_MS)
}

/** The props of `analysis_completed` for a finished, non-sample session (pure; exported for tests). */
export function analysisProps(s: SessionRecord, sinceBaselineDays: number | null): EventProps | null {
  const a = s.analysis
  if (!a || s.isDemo === 1) return null
  const overall = a.capture.quality.overall
  const serves = a.counts.analysed
  return {
    serves: servesBucket(serves),
    capture: overall === 'good' ? 'good' : overall === 'usable' ? 'fair' : 'limited',
    valid: serves >= VALID_SESSION_SERVES && overall !== 'poor',
    view: s.view === 'side' ? 'side' : s.view === 'rear' ? 'rear' : 'other',
    source: s.template === 'import' ? 'imported' : 'recorded',
    retest: s.isRetest === 1,
    sinceBaseline: sinceBaselineDays === null ? 'none' : daysBucket(sinceBaselineDays),
  }
}

/** A session finished analysing. Once per session; waits briefly if the result is still being written. */
export async function noteAnalysisDone(sessionId: string, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  try {
    let s = await getSession(sessionId)
    for (let i = 0; i < 3 && s && !s.analysis; i++) {
      await wait(1000)
      s = await getSession(sessionId)
    }
    if (!s || !s.analysis || s.isDemo === 1) return false
    let since: number | null = null
    if (s.isRetest === 1 && s.experimentId) {
      const exp = await getExperiment(s.experimentId)
      if (exp) since = await daysSinceBaseline(exp, new Date(s.startedAt).getTime())
    }
    const props = analysisProps(s, since)
    return props ? recordEvent('analysis_completed', props, { once: s.id }) : false
  } catch {
    return false
  }
}

/** "Did it work?" was shown with a verdict. Once per experiment and verdict; never for the sample. */
export async function noteVerdictViewed(exp: ExperimentRecord, verdict: string, sameSession: boolean): Promise<boolean> {
  if (exp.isDemo === 1 || !(VERDICT_EVENT_IDS as readonly string[]).includes(verdict)) return false
  try {
    const retests = await sessionTimes(exp.retestSessionIds)
    const firstRetest = retests.length ? Math.min(...retests) : null
    const within = firstRetest !== null && (await daysSinceBaseline(exp, firstRetest)) <= LOOP_WINDOW_DAYS
    return recordEvent('verdict_viewed', { verdict, retestWithin14d: within, sameSession }, { once: `${exp.id}:${verdict}` })
  } catch {
    return false
  }
}

/** A practice was logged (never the sample): minutes as a bucket, the three answers, no note, no body detail. */
export function notePracticeLogged(log: Pick<PracticeLogRecord, 'minutes' | 'successCriterionMet' | 'feel' | 'cueHelpful' | 'isDemo'>): Promise<boolean> {
  if (log.isDemo === 1) return Promise.resolve(false)
  return recordEvent('practice_logged', {
    minutes: minutesBucket(log.minutes),
    success: log.successCriterionMet ?? 'unset',
    feel: log.feel ?? 'unset',
    cueHelpful: log.cueHelpful ?? 'unset',
  })
}

/** The usefulness question was answered or skipped for this experiment's decision. */
export async function usefulnessAnswered(experimentId: string): Promise<boolean> {
  return (await hasEvent('usefulness_rated', experimentId)) || (await hasEvent('usefulness_skipped', experimentId))
}

export function rateUsefulness(experimentId: string, rating: 1 | 2 | 3 | 4 | 5): Promise<boolean> {
  return recordEvent('usefulness_rated', { rating }, { once: experimentId })
}

export function skipUsefulness(experimentId: string): Promise<boolean> {
  return recordEvent('usefulness_skipped', {}, { once: experimentId })
}
