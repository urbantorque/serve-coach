/**
 * Writes for the focus screens: start (or keep) the experiment for a focus, persist a cue swap, and
 * log a practice. Demo data never creates experiments (PRODUCT §4.4 rule 11).
 */
import { getItem, itemByFaultId, toCoachingRecord, type BodyCheck, type CueRegister, type FocusDecision, type ReferralLevel } from '../../../coaching/index.ts'
import { createExperiment, getProfile, logPractice, putDecision, saveProfile } from '../../../data/index.ts'
import type { ExperimentRecord, PracticeLogRecord } from '../../../data/records.ts'
import { scheduleCoachingSync } from '../../../integration/schedule.ts'
import { notePracticeLogged } from '../../../platform/beta.ts'
import { toExperimentRecord } from './adapter.ts'
import { useFocusStore } from './focusStore.ts'
import type { FocusModel } from './useFocus.ts'

/**
 * A body check answered on Record or live framing: the same in-memory answer /focus and Today read,
 * and a referral also switches coaching to the pause (COACHING §10.3). The profile's pain flag is
 * set only when the player agreed to keep body-check answers on this phone (D8), as on /focus.
 */
export async function noteBodyCheck(check: BodyCheck): Promise<void> {
  const store = useFocusStore.getState()
  store.setBodyCheck(check)
  const level: ReferralLevel | undefined = check.answer === 'pain' ? 'stop-and-book' : check.answer === 'red-flag' ? check.level : undefined
  if (!level) return
  store.setReferral(level)
  try {
    const profile = await getProfile()
    if (profile?.comfort.consentAt) await saveProfile({ comfort: { ...profile.comfort, painFlag: 1, updatedAt: new Date().toISOString() } })
  } catch {
    // The in-memory referral still applies for this session.
  }
}

/** The body check a referral level stands for (Record's sheet reports only the level). */
export const bodyCheckForReferral = (level: ReferralLevel): BodyCheck => (level === 'stop-and-book' ? { answer: 'pain' } : { answer: 'red-flag', level })

const matchesItem = (rec: ExperimentRecord | undefined, itemId: string) => !!rec && (itemByFaultId(rec.faultId)?.id ?? rec.cueId.split(':')[0]) === itemId

const ENDING = new Set(['worked', 'parked', 'superseded'])

/**
 * The active experiment for this focus, creating it (and storing the decision) the first time. The
 * previous experiment ends only when the decision itself ended it (worked, parked or superseded), a
 * coach's focus replaced it, or its item left the library. A focus shown for today only (for example
 * while an experiment is held by soreness) never ends it: the experiment stays active and the practice
 * is logged without one (COACHING §7.4, §9.3, §12.5).
 */
export async function ensureExperiment(model: FocusModel): Promise<ExperimentRecord | undefined> {
  const d = model.decision
  if (!d || d.kind !== 'focus' || !model.session) return model.experimentRecord
  if (matchesItem(model.experimentRecord, d.itemId)) return model.experimentRecord
  if (model.isDemo) return undefined
  const prev = model.experimentRecord
  if (prev) {
    const prevItem = itemByFaultId(prev.faultId)?.id ?? getItem(prev.cueId.split(':')[0])?.id
    const concluded = d.experiment?.id === prev.id && ENDING.has(d.experiment.status)
    if (!concluded && !d.pinnedByCoach && prevItem) return undefined
    // A worked item completes; parked or superseded ones are abandoned with the reason kept (COACHING §7.8).
    const status = concluded && d.experiment?.status === 'worked' ? 'completed' : 'abandoned'
    await createExperiment({ ...prev, status, endedAt: new Date().toISOString(), endedSessionId: model.session.id })
  }
  const decisionId = `dec-${d.sessionId}-${d.itemId}`
  await putDecision(toCoachingRecord(d, { id: decisionId }))
  return createExperiment(toExperimentRecord(d as FocusDecision, decisionId, [model.session.id]))
}

/** "Try the other cue": remembered on this phone, and on the experiment when there is one. */
export async function persistCueSwap(model: FocusModel, itemId: string, register: CueRegister): Promise<void> {
  const rec = model.experimentRecord
  if (rec && matchesItem(rec, itemId) && !model.isDemo) {
    await createExperiment({ ...rec, cueId: `${itemId}:${register}` })
  }
}

export type LogInput = Omit<PracticeLogRecord, 'id' | 'createdAt'>

export async function savePracticeLog(model: FocusModel, input: Omit<LogInput, 'experimentId'>): Promise<PracticeLogRecord> {
  const exp = await ensureExperiment(model)
  // Only a practice of the experiment's own drill belongs to it (a keep-going drill never counts
  // towards its re-test or its harder version).
  const belongs = !!exp && (!input.itemId || matchesItem(exp, input.itemId))
  const log = await logPractice({
    ...input,
    ...(exp && belongs ? { experimentId: exp.id } : {}),
    ...(model.isDemo ? { isDemo: 1 as const } : {}),
  })
  // "It hurts" is a referral even when the red-flag questions were closed unanswered (COACHING §10.2,
  // §10.3): Stop and book, with the pain flag kept only with consent. A red-flag answer already set a
  // stronger level, which stays.
  if (input.body === 'pain' && !useFocusStore.getState().referral) await noteBodyCheck({ answer: 'pain' })
  // A logged practice moves the experiment on (re-test due): refresh the stored decision for Today.
  if (!model.isDemo) scheduleCoachingSync(0)
  // Beta usage count (platform addition): buckets and answers only, never the note or body detail.
  void notePracticeLogged(log)
  return log
}
