/**
 * Keeps the stored coaching decision and the experiment in step with the data (D6 loop):
 *
 *   analysis done ─┐
 *   tags changed  ─┼─▶ syncCoaching() ─▶ re-test attached ─▶ decideFocus ─▶ CoachingRecord stored
 *   practice log  ─┘                                        └─▶ "Did it work?" result stored
 *
 * Today reads the stored decision (useLatestDecision), Compare reads experiment.result first, and
 * /focus runs the same input live (focusInput.ts), so all three agree. The stored decision is the
 * session's coaching decision; today's body check, a referral and match day are applied on screen
 * on top of it (they are never stored as the session's decision).
 */
import { buildVerdictRequest, decideFocus, normaliseProfile, toCoachingRecord, type CoachingDecision } from '../coaching/index.ts'
import { attachRetest, createExperiment, putDecision, useSettingsStore } from '../data/index.ts'
import type { CoachingRecord, ExperimentRecord } from '../data/records.ts'
import { buildFocusInput, readFocusData } from '../ui/screens/focus/focusInput.ts'
import { useFocusStore } from '../ui/screens/focus/focusStore.ts'
import { experimentResult } from './verdict.ts'

export interface SyncOptions {
  /** Clock for the decision (the sample builder passes the session's day). */
  now?: Date
  /** Show-experimental setting; defaults to the player's. */
  experimental?: boolean
  /** Decide for this session instead of the newest one. */
  sessionId?: string
}

export interface SyncResult {
  decision?: CoachingDecision
  record?: CoachingRecord
  experiment?: ExperimentRecord
  attachedRetest?: string
}

/**
 * A session recorded with the re-test plan (Record locks it to the experiment's stratum) joins the
 * experiment once it is analysed. Only a later session can be a re-test.
 */
function retestToAttach(exp: ExperimentRecord | undefined, s: { id: string; isRetest: 0 | 1; experimentId?: string; startedAt: string }): boolean {
  if (!exp || exp.status !== 'active') return false
  if (s.isRetest !== 1 || s.experimentId !== exp.id) return false
  if (exp.retestSessionIds.includes(s.id) || exp.baselineSessionIds.includes(s.id)) return false
  return true
}

async function run(opts: SyncOptions): Promise<SyncResult> {
  const now = opts.now ?? new Date()
  let raw = await readFocusData()
  const pick = () => (opts.sessionId ? raw.sessions.find((s) => s.record.id === opts.sessionId) : raw.sessions[0])
  let latest = pick()
  if (!latest) return {}
  let attachedRetest: string | undefined
  if (retestToAttach(raw.experiment, latest.record)) {
    await attachRetest(raw.experiment!.id, latest.record.id)
    attachedRetest = latest.record.id
    raw = await readFocusData()
    latest = pick()
    if (!latest) return {}
  }
  const experimental = opts.experimental ?? useSettingsStore.getState().experimentalMetrics
  const built = buildFocusInput(raw, { experimental, now, sessionId: latest.record.id, cueOverride: useFocusStore.getState().cueOverride })
  if (!built) return {}
  const decision = decideFocus(built.input)
  const record = toCoachingRecord(decision, {
    sessionId: latest.record.id,
    ...(raw.isDemo ? { isDemo: true } : {}),
    ...(raw.experiment ? { experimentId: raw.experiment.id } : {}),
  })
  await putDecision(record)

  let experiment = raw.experiment
  if (experiment && built.experiment && experiment.retestSessionIds.includes(latest.record.id)) {
    const request = buildVerdictRequest({
      exp: built.experiment,
      session: built.latest.session,
      history: built.input.history ?? [],
      profile: normaliseProfile(built.profile),
    })
    experiment = { ...experiment, result: experimentResult(request, built.experiment.stratum, now) }
    await createExperiment(experiment)
  }
  return { decision, record, ...(experiment ? { experiment } : {}), ...(attachedRetest ? { attachedRetest } : {}) }
}

let chain: Promise<unknown> = Promise.resolve()
let pending: Promise<SyncResult> | null = null

/**
 * Recomputes and stores the coaching decision for the newest analysed session (or `sessionId`).
 * Calls are serialised; bursts (a tag per second while tagging) coalesce into one run.
 * Never throws: coaching is advice on top of the data, not part of saving it.
 */
export function syncCoaching(opts: SyncOptions = {}): Promise<SyncResult> {
  const coalesce = !opts.now && !opts.sessionId && opts.experimental === undefined
  if (coalesce && pending) return pending
  const next = chain.then(
    () => {
      if (coalesce) pending = null
      return run(opts)
    },
    () => run(opts),
  )
  const safe = next.catch((error: unknown) => {
    console.warn('Coaching sync skipped:', error)
    return {} as SyncResult
  })
  chain = safe
  if (coalesce) pending = safe
  return safe
}
