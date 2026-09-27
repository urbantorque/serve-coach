/**
 * Reads what the coaching engine needs from the data layer and runs decideFocus (pure, fast) for the
 * newest analysed session. Real sessions win; demo sessions are used only when there are no real
 * ones, and they never mix (PRODUCT §4.4 rule 11). The input is built by focusInput.ts, the same
 * code that stores the session's decision for Today (integration/coachingSync.ts); this hook adds
 * today's body check, a referral and match day on top.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { decideFocus, type CoachingDecision, type CoachingExperiment, type CoachingSession, type ReferralLevel } from '../../../coaching/index.ts'
import { useSettingsStore } from '../../../data/index.ts'
import type { ExperimentRecord, PracticeLogRecord, ProfileRecord, SessionRecord } from '../../../data/records.ts'
import { buildFocusInput, coachingProfileRecord, readFocusData } from './focusInput.ts'
import { todayYmd, useFocusStore, useTodayBodyCheck } from './focusStore.ts'

export interface FocusModel {
  status: 'loading' | 'empty' | 'ready'
  decision?: CoachingDecision
  /** The session the decision is about, and its record. */
  session?: CoachingSession
  record?: SessionRecord
  sessions: CoachingSession[]
  isDemo: boolean
  profile: ProfileRecord | null
  experimentRecord?: ExperimentRecord
  experiment?: CoachingExperiment
  logs: PracticeLogRecord[]
  orientation: 'portrait' | 'landscape'
  matchDay: boolean
  referral?: ReferralLevel
  heightM: number
}

const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function isMatchDay(profile: ProfileRecord | null, playingTonight: string | undefined, now: Date): boolean {
  if (playingTonight === todayYmd(now)) return true
  const nights = profile?.matchNights ?? []
  return nights.includes(WEEKDAY[now.getDay()]) && now.getHours() >= 12
}


export function useFocusModel(now: Date = new Date()): FocusModel {
  const raw = useLiveQuery(readFocusData, [])
  const experimental = useSettingsStore((s) => s.experimentalMetrics)
  const bodyCheck = useTodayBodyCheck()
  const referralLocal = useFocusStore((s) => s.referral)
  const playingTonight = useFocusStore((s) => s.playingTonight)
  const cueOverride = useFocusStore((s) => s.cueOverride)
  const nowKey = todayYmd(now)

  return useMemo<FocusModel>(() => {
    const empty = { sessions: [], isDemo: false, profile: null, logs: [], orientation: 'portrait' as const, matchDay: false, heightM: 1.75 }
    if (!raw) return { status: 'loading', ...empty }
    const painFlag = raw.profile?.comfort.painFlag === 1
    const referral: ReferralLevel | undefined = referralLocal ?? (painFlag ? 'stop-and-book' : undefined)
    const base = {
      sessions: raw.sessions.map((s) => s.session),
      isDemo: raw.isDemo,
      profile: raw.profile,
      logs: raw.logs,
      matchDay: isMatchDay(raw.profile, playingTonight, now),
      ...(referral ? { referral } : {}),
    }
    const built = buildFocusInput(raw, {
      experimental,
      now,
      ...(referral ? {} : bodyCheck ? { bodyCheck } : {}),
      ...(painFlag ? { painFlag: true } : {}),
      ...(referral ? { referral } : {}),
      matchDay: base.matchDay,
      cueOverride,
    })
    if (!built) return { status: 'empty', ...base, orientation: 'portrait', heightM: coachingProfileRecord(raw)?.heightM ?? 1.75, profile: raw.profile }
    const decision = decideFocus(built.input)
    return {
      status: 'ready',
      ...base,
      decision,
      session: built.latest.session,
      record: built.latest.record,
      ...(raw.experiment ? { experimentRecord: raw.experiment } : {}),
      ...(built.experiment ? { experiment: built.experiment } : {}),
      orientation: built.latest.record.orientation ?? 'portrait',
      heightM: built.heightM,
    }
    // `now` is a render-time clock; the day key keeps the memo stable within a day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, experimental, bodyCheck, referralLocal, playingTonight, cueOverride, nowKey])
}
