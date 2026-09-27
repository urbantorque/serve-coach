/**
 * Optional coaching step (D6). The coaching engine is owned by the coaching builder; this looks
 * for `decideFocus` in src/coaching (index.ts or decide.ts) at run time and skips gracefully when
 * it is not there, fails, or returns nothing. The input is structural (COACHING §7.1
 * CoachingInput: profile + the session's per-serve metrics), built only from engine output, so
 * coaching sees exactly the statuses the engine assigned (it may cite measured/estimated values
 * only; that rule lives in the coaching engine).
 *
 * Pain always routes to a qualified professional, never a diagnosis: the pain flag is passed
 * through from the profile so the coaching engine's safety gate runs first.
 */
import type { CoachingDecision as DataDecision, SessionStats, ServeAnalysis } from '../../data/domain.ts'
import type { CoachingRecord, ProfileRecord } from '../../data/records.ts'
import type { CameraView, CaptureContext, FpsClass, QualityReport } from '../types.ts'

type DecideFocus = (input: unknown) => unknown
type ToRecord = (decision: unknown, context: { sessionId: string }) => CoachingRecord | undefined

interface CoachingModule {
  decideFocus?: DecideFocus
  toCoachingRecord?: ToRecord
}

const modules = import.meta.glob<CoachingModule>(['/src/coaching/index.ts', '/src/coaching/decide.ts'])

export interface CoachingStepInput {
  sessionId: string
  startedAt: string
  view: CameraView
  capture: CaptureContext
  fpsClass: FpsClass
  quality: QualityReport
  serves: readonly ServeAnalysis[]
  stats: SessionStats
  profile: ProfileRecord | undefined
  heightM: number
  showExperimental: boolean
}

export interface CoachingStepResult {
  status: 'decided' | 'skipped' | 'failed'
  reason?: string
  decision?: unknown
  record?: CoachingRecord
}

async function findCoaching(loaders: Record<string, () => Promise<CoachingModule>>): Promise<CoachingModule | null> {
  for (const load of Object.values(loaders)) {
    try {
      const mod = await load()
      if (typeof mod.decideFocus === 'function') return mod
    } catch {
      // A module that fails to load is treated as missing.
    }
  }
  return null
}

/** COACHING §7.1 CoachingInput, from engine output and the stored profile. */
export function buildCoachingInput(input: CoachingStepInput): Record<string, unknown> {
  const p = input.profile
  const c = input.capture
  return {
    profile: {
      level: p?.level ?? 'unknown',
      utr: p?.utr,
      goal: p?.goal ?? 'first-serves-in',
      comfortRegions: p?.comfortRegions ?? [],
      heightM: input.heightM,
      ageBand: p?.ageBand,
      handedness: c.handedness,
      showExperimental: input.showExperimental,
      ...(p?.pinnedFocusItemId ? { pinnedFocusItemId: p.pinnedFocusItemId } : {}),
    },
    session: {
      id: input.sessionId,
      startedAt: input.startedAt,
      view: input.view,
      cameraSide: c.cameraSide,
      handedness: c.handedness,
      fpsClass: input.fpsClass,
      setup: c.setup,
      captureQuality: input.quality.overall,
      qualityChecks: input.quality.checks,
      serves: input.serves.map((s) => ({ id: s.id, index: s.index, included: s.included, metrics: s.metrics })),
      defaults: {
        courtSide: c.serveSide === 'both' ? undefined : c.serveSide,
        serveNumber: c.serveNumber === 'mixed' ? undefined : c.serveNumber,
        intendedType: c.intendedType,
      },
      strata: input.stats.strata.map((s) => ({ key: s.key, metrics: s.metrics })),
      metrics: input.stats.metrics,
      bestServeId: input.stats.bestServeId,
      representativeServeId: input.stats.representativeServeId,
    },
    painFlag: p?.comfort.painFlag === 1,
    now: new Date().toISOString(),
  }
}

/** Looks like the data layer's CoachingDecision (so it can be stored as a CoachingRecord). */
function isDataDecision(v: unknown, sessionId: string): v is DataDecision {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Partial<DataDecision>
  return typeof d.id === 'string' && d.sessionId === sessionId && typeof d.gate === 'string' && Array.isArray(d.trace)
}

export async function runCoachingStep(
  input: CoachingStepInput,
  loaders: Record<string, () => Promise<CoachingModule>> = modules,
): Promise<CoachingStepResult> {
  const mod = await findCoaching(loaders)
  if (!mod?.decideFocus) return { status: 'skipped', reason: 'coaching engine (decideFocus) not available in this build' }
  try {
    const decision = await mod.decideFocus(buildCoachingInput(input))
    if (decision === undefined || decision === null) return { status: 'skipped', reason: 'coaching engine returned no decision' }
    let record: CoachingRecord | undefined
    if (mod.toCoachingRecord) record = mod.toCoachingRecord(decision, { sessionId: input.sessionId })
    else if (isDataDecision(decision, input.sessionId)) record = decision
    return { status: 'decided', decision, record }
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}
