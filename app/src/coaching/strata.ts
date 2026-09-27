/**
 * Strata and matching (COACHING §6.1; METRICS §1.6, §4.4). A stratum is view x camera side x court
 * side x serve number x intended type (x handedness), within one set-up (orientation, distance class
 * and serving spot: analysis/metrics/setup.ts). Statistics are never mixed across views or set-ups,
 * so a baseline at 6 m never pools with a re-test at 7.5 m.
 */
import { sameSetup } from '../analysis/metrics/setup.ts'
import type { CoachingServe, CoachingSession, CoachingStratum } from './types.ts'

/** The session's set-up key: its own, else the one the engine wrote on its strata keys. */
export function sessionSetupKey(session: CoachingSession): string | undefined {
  return session.setupKey ?? session.strata?.find((s) => s.key.setup)?.key.setup
}

export interface StratumGroup {
  key: CoachingStratum
  /** Every recorded serve in the stratum (included or not). */
  serves: CoachingServe[]
}

export function serveStratum(session: CoachingSession, serve: CoachingServe): CoachingStratum {
  const setup = sessionSetupKey(session)
  return {
    view: session.view,
    cameraSide: session.cameraSide ?? 'unknown',
    courtSide: serve.courtSide ?? session.defaults?.courtSide ?? 'unknown',
    serveNumber: serve.serveNumber ?? session.defaults?.serveNumber ?? 'unknown',
    intendedType: serve.intendedType ?? session.defaults?.intendedType ?? 'unknown',
    handedness: session.handedness ?? 'right',
    ...(setup ? { setup } : {}),
  }
}

export function stratumId(k: CoachingStratum): string {
  return [k.view, k.cameraSide, k.courtSide, k.serveNumber, k.intendedType, k.handedness].join('|')
}

/**
 * Hard matching (METRICS §4.4): every key field equal ("unknown" intended type matches only
 * "unknown") and the same set-up (a missing set-up key, from an older session, matches any).
 */
export function sameStratum(a: CoachingStratum, b: CoachingStratum): boolean {
  return stratumId(a) === stratumId(b) && sameSetup(a.setup, b.setup)
}

export function groupStrata(session: CoachingSession): StratumGroup[] {
  const map = new Map<string, StratumGroup>()
  for (const s of session.serves) {
    const key = serveStratum(session, s)
    const id = stratumId(key)
    const g = map.get(id) ?? { key, serves: [] }
    g.serves.push(s)
    map.set(id, g)
  }
  return [...map.values()]
}

/** The stratum with the most included serves (headline and keep-going stratum). */
export function largestStratum(session: CoachingSession): StratumGroup | undefined {
  return groupStrata(session).sort((a, b) => b.serves.filter((s) => s.included).length - a.serves.filter((s) => s.included).length)[0]
}

/** Serves of an earlier session in a given stratum (empty when the view differs). */
export function servesInStratum(session: CoachingSession, key: CoachingStratum): CoachingServe[] {
  if (session.view !== key.view) return []
  return session.serves.filter((s) => sameStratum(serveStratum(session, s), key))
}

/** Earlier sessions (strictly before `before`), newest first, that have serves in the stratum. */
export function matchedHistory(history: readonly CoachingSession[], key: CoachingStratum, before: string): CoachingSession[] {
  return history
    .filter((h) => h.startedAt < before && h.captureQuality !== 'poor' && servesInStratum(h, key).length > 0)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
}

const SIDE_WORDS = { deuce: 'deuce', ad: 'ad', unknown: '' } as const
const NUMBER_WORDS = { 1: 'first serves', 2: 'second serves', unknown: 'serves' } as const
const TYPE_WORDS = { flat: 'flat', slice: 'slice', kick: 'kick', unknown: '' } as const
const VIEW_WORDS: Record<string, string> = { side: 'side view', rear: 'view from behind', front45: 'front view', unknown: 'same view' }

/** Player words for a stratum: "deuce first serves, side view" (DESIGN §11 glossary: "same set-up"). */
export function stratumWords(k: CoachingStratum): string {
  const serves = [SIDE_WORDS[k.courtSide], TYPE_WORDS[k.intendedType], NUMBER_WORDS[k.serveNumber]].filter(Boolean).join(' ')
  return `${serves}, ${VIEW_WORDS[k.view] ?? 'same view'}`
}
