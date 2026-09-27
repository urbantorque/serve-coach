/**
 * Coaching library loader (ARCHITECTURE §3 coaching/library.ts; COACHING §5.4 schema).
 *
 * `library.json` is a byte-for-byte copy of `docs/specs/coaching-library.json` (the single source of
 * truth); `library.test.ts` fails if the two drift. The loader validates the shape once at import
 * and exposes typed lookups. Content rules live in `lint.ts`.
 */
import type { MetricId, ServePhase } from '../analysis/types.ts'
import raw from './library.json'
import type { BodyRegion, CoachLevel, EvidenceTier, Goal } from './types.ts'

export type ItemType = 'focus' | 'keep-going' | 'routine'
export type RuleKind = 'spread' | 'per-serve' | 'composite' | 'relative' | 'band' | 'outcome' | 'none' | 'routine'
export type Overlay =
  | 'apex-scatter'
  | 'apex-vs-toe'
  | 'toss-arc'
  | 'contact-height-line'
  | 'contact-vs-toe'
  | 'hip-rise'
  | 'shoulder-line'
  | 'timing-strip'
  | 'outcome-tally'
  | 'none'
export type CompareTo = 'best-serve' | 'previous-session' | 'none'
export type LinkedOutcome = 'net' | 'long' | 'double-fault'

export interface ProgressionGate {
  levels: CoachLevel[]
  excludeIfComfort: BodyRegion[]
  label: 'coaches-differ' | null
}

export interface LibraryDrill {
  name: string
  minutes: number
  tossOnlyReps: number
  setup: string
  steps: string[]
  successCriterion: string
  note?: string
  optionalAid?: { text: string; basis: string }
  progression: string
  progressionGate: ProgressionGate
  progressionAlt?: string
  regression: string
}

/** Thresholds are item-specific (COACHING §5.2); the detectors read the fields they need. */
export interface LibraryThresholds {
  unit?: string
  direction?: 'above' | 'below'
  measurementErrorDefault?: number
  measurementErrorDefaultFrames?: number
  boundLevel?: number
  minDetectedShare?: number
  byLevel?: Record<CoachLevel, { fireLowerBound: number; possibleAbove: number; resolved: number; resolvedRelativeReduction: number }>
  relative?: {
    ratioToBest?: number
    minServesBothSessions?: number
    dropBelowBestPct?: number
    fallBelowBest?: number
    probability?: number
    minPriorMatchedSessions?: number
    resolvedWithinBestPct?: number
    resolvedWithinBest?: number
  }
  byServeType?: Record<string, { fire?: number; resolved: number; fireFractionOfStandingHeight?: number }>
  corroboration?: string
  bySex?: Record<'male' | 'female' | 'not-given', { highEdge: number; likelyAbove: number }>
  coSignals?: { releaseToContactAboveMs: number; trophyPauseAboveMs: number; trophyToContactAboveMs: number; contactRatioBelowOwnBest: number }
  possibleNeedsCoSignals?: number
  likelyNeedsCoSignals?: number
  population?: { fireUpperBoundPct: number; resolvedMedianPct: number; note?: string }
  coSignal?: { metricId: MetricId; longerThanBestMs: number; effect: string }
  absoluteRuleOffIf?: { comfort: BodyRegion[]; ageBands: string[] }
  reading?: string
  target?: string
  clearBandConfidence?: number
  resolvedMaxShare?: number
  serveNumber?: number
  fireBelowRate?: number
  posteriorProb?: number
  resolvedRate?: number
  resolvedMinServes?: number
  missType?: 'net' | 'long'
  fireShareAbove?: number
  minMisses?: number
  realProblem?: { missTypeShareOfServesAtLeast: number; orFirstServeInRateBelow: number; inRateProbability: number }
  resolvedShare?: number
  resolvedMinMisses?: number
  note?: string
}

export interface LibraryItem {
  id: string
  faultId: string | null
  itemType: ItemType
  title: string
  whyItMatters: string
  whyItMattersVariants?: { id: string; when: string; text: string }[]
  evidenceTier: EvidenceTier
  tierByPath?: Record<string, EvidenceTier>
  view: 'side' | 'rear' | 'any'
  detection: {
    metricIds: MetricId[]
    kind: RuleKind
    chainStage: number | null
    minUsableServes: number
    minFps: number
    thresholds: LibraryThresholds
    rule?: string
    resolvedWhen: string
    linkedOutcomes: LinkedOutcome[]
  }
  evidence: {
    keyFramePhase: ServePhase | null
    compareTo: CompareTo
    statIds: MetricId[]
    overlay: Overlay
    viewNote?: string
  }
  cues: { analogy: string; outcome: string; outcomeSecondServe?: string }
  drill: LibraryDrill
  contraindications: BodyRegion[]
  comfortNotes: Partial<Record<BodyRegion, string>>
  goalsServed: Goal[]
  levels: CoachLevel[]
  sources: string[]
}

const RULE_KINDS: readonly RuleKind[] = ['spread', 'per-serve', 'composite', 'relative', 'band', 'outcome', 'none', 'routine']
const ITEM_TYPES: readonly ItemType[] = ['focus', 'keep-going', 'routine']
const TIERS: readonly EvidenceTier[] = ['research-backed', 'coach-recommended', 'experimental']

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

/** Shape errors in one library item (type guard for the JSON). Content rules are in lint.ts. */
export function shapeErrors(item: unknown): string[] {
  const errs: string[] = []
  if (!isObj(item)) return ['item is not an object']
  const id = isStr(item.id) ? item.id : '(no id)'
  const need = (cond: boolean, msg: string) => {
    if (!cond) errs.push(`${id}: ${msg}`)
  }
  need(isStr(item.id), 'id must be a string')
  need(item.faultId === null || isStr(item.faultId), 'faultId must be a string or null')
  need(ITEM_TYPES.includes(item.itemType as ItemType), 'itemType')
  need(isStr(item.title) && item.title.length > 0, 'title')
  need(isStr(item.whyItMatters), 'whyItMatters')
  need(TIERS.includes(item.evidenceTier as EvidenceTier), 'evidenceTier')
  need(item.view === 'side' || item.view === 'rear' || item.view === 'any', 'view')
  const det = item.detection
  need(isObj(det), 'detection')
  if (isObj(det)) {
    need(isStrArr(det.metricIds), 'detection.metricIds')
    need(RULE_KINDS.includes(det.kind as RuleKind), 'detection.kind')
    need(det.chainStage === null || typeof det.chainStage === 'number', 'detection.chainStage')
    need(typeof det.minUsableServes === 'number', 'detection.minUsableServes')
    need(typeof det.minFps === 'number', 'detection.minFps')
    need(isObj(det.thresholds), 'detection.thresholds')
    need(isStrArr(det.linkedOutcomes), 'detection.linkedOutcomes')
  }
  const ev = item.evidence
  need(isObj(ev) && isStrArr(ev.statIds) && isStr(ev.overlay) && isStr(ev.compareTo), 'evidence')
  const cues = item.cues
  need(isObj(cues) && isStr(cues.analogy) && isStr(cues.outcome), 'cues')
  const drill = item.drill
  need(isObj(drill), 'drill')
  if (isObj(drill)) {
    need(isStr(drill.name) && typeof drill.minutes === 'number', 'drill.name/minutes')
    need(typeof drill.tossOnlyReps === 'number', 'drill.tossOnlyReps')
    need(isStr(drill.setup) && isStrArr(drill.steps) && isStr(drill.successCriterion), 'drill.setup/steps/successCriterion')
    need(isStr(drill.progression) && isStr(drill.regression), 'drill.progression/regression')
    need(isObj(drill.progressionGate) && isStrArr((drill.progressionGate as Record<string, unknown>).levels), 'drill.progressionGate')
  }
  need(isStrArr(item.contraindications), 'contraindications')
  need(isObj(item.comfortNotes), 'comfortNotes')
  need(isStrArr(item.goalsServed), 'goalsServed')
  need(isStrArr(item.levels), 'levels')
  need(isStrArr(item.sources), 'sources')
  return errs
}

function load(json: unknown): LibraryItem[] {
  if (!Array.isArray(json)) throw new Error('coaching library: expected an array')
  const errs = json.flatMap(shapeErrors)
  if (errs.length) throw new Error(`coaching library is malformed:\n${errs.join('\n')}`)
  return json as LibraryItem[]
}

/** All items in JSON order (library order is the last ranking tie-break, COACHING §7.2 f). */
export const LIBRARY: readonly LibraryItem[] = load(raw)

/** Fault items the detector runs over (routines and keep-going are never chosen by detection). */
export const FOCUS_ITEMS: readonly LibraryItem[] = LIBRARY.filter((i) => i.itemType === 'focus')

const BY_ID = new Map(LIBRARY.map((i) => [i.id, i]))
const BY_FAULT = new Map(LIBRARY.filter((i) => i.faultId).map((i) => [i.faultId as string, i]))

export function getItem(id: string): LibraryItem | undefined {
  return BY_ID.get(id)
}

/** Required lookup (throws on an unknown id; library ids are fixed at build time). */
export function item(id: string): LibraryItem {
  const it = BY_ID.get(id)
  if (!it) throw new Error(`Unknown coaching item: ${id}`)
  return it
}

export function itemByFaultId(faultId: string): LibraryItem | undefined {
  return BY_FAULT.get(faultId) ?? BY_ID.get(faultId)
}

/** Library order index (tie-break f). */
export function libraryOrder(id: string): number {
  return LIBRARY.findIndex((i) => i.id === id)
}

/**
 * Library version: a short, stable content hash, stored with each decision so an old decision can
 * be traced to the content that produced it.
 */
export const LIBRARY_VERSION = (() => {
  const text = JSON.stringify(raw)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `lib-${h.toString(16).padStart(8, '0')}`
})()

export const ENGINE_VERSION = 'coaching@1.0.0'
