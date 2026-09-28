/**
 * The experiment loop (COACHING §12): create an experiment from a focus decision, decide when a
 * re-test is due, run the matched comparison ("Did it work?") with the METRICS §4.5 verdict, show a
 * same-session before-and-after only as "Straight after practice", and move the experiment on (§12.5).
 *
 * Only a later matched session counts. A same-session comparison never drives a transition, never
 * meets a resolved threshold, never starts a cooldown and never marks an experiment "worked" (§12.3).
 */
import type { MetricId, MetricValue } from '../analysis/types.ts'
import { soreLoggedOn, successesSincePain } from './deliver.ts'
import { detectItem, subjectOf } from './detect.ts'
import type { LibraryItem } from './library.ts'
import { getItem } from './library.ts'
import type { NormalisedProfile } from './profile.ts'
import { outcomeCounts, seriesFor, stratumSeries, type Sample } from './series.ts'
import { mean, median, sd, mad } from './stats.ts'
import { largestStratum, sameStratum, servesInStratum, stratumWords } from './strata.ts'
import type {
  CoachingExperiment,
  CoachingSession,
  CoachingStratum,
  DrillVariant,
  FocusDecision,
  PainLogMark,
  PracticeLogSummary,
  VerdictFn,
  VerdictId,
  VerdictRequest,
  VerdictResult,
} from './types.ts'
import { metricsVerdict, verdictSentence } from './verdict.ts'

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

export function experimentFromDecision(decision: FocusDecision, session: CoachingSession, opts: { id?: string } = {}): CoachingExperiment {
  return {
    id: opts.id ?? `exp-${decision.itemId}-${session.id}`,
    itemId: decision.itemId,
    faultId: decision.faultId,
    startedSessionId: session.id,
    startedAt: session.startedAt,
    stratum: decision.stratum,
    fpsClass: session.fpsClass,
    cueRegister: decision.cue.register,
    drillVariant: decision.drill.variant,
    pinnedByCoach: decision.pinnedByCoach,
    retests: [],
    status: 'active',
  }
}

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------

export type RetestKind = 'same-session' | 'earlier' | 'matched' | 'unmatched'

export function retestKind(exp: CoachingExperiment, session: CoachingSession): RetestKind {
  if (session.id === exp.startedSessionId) return 'same-session'
  if (session.startedAt <= exp.startedAt) return 'earlier'
  // Block B of an "Experiment" visit, or any recording later on the day the experiment started, shows
  // the drill's immediate effect: never a re-test (§12.3). Only a later visit can be one.
  if (exp.startedVisitId && session.visitId && session.visitId === exp.startedVisitId) return 'same-session'
  // Block B of an "Experiment" visit recorded on its own was recorded after the drill, whatever else
  // the visit holds (real block numbers, CAPTURE §5.5): never a re-test.
  if (isBlockB(session)) return 'same-session'
  // On a later visit only its first recording in the stratum is the re-test (recorded before the
  // drill); Block B, or anything else recorded after it that day, is same-session too.
  const first = session.visitId ? exp.retestVisits?.[session.visitId] : undefined
  if (first && first !== session.id) return 'same-session'
  if (session.captureQuality === 'poor') return 'unmatched'
  return servesInStratum(session, exp.stratum).length > 0 ? 'matched' : 'unmatched'
}

/** Start time, then the recording's block in its visit (real block numbers), then id. */
const byStart = (a: CoachingSession, b: CoachingSession) =>
  a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : (a.blockIndex ?? 0) - (b.blockIndex ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * The re-test of each later visit (§12.3; `CoachingExperiment.retestVisits`): visitId -> the first
 * session that day, by start time, with serves in the experiment's stratum, whatever its capture
 * quality. It was recorded before the drill; anything after it that day may not have been, so it never
 * counts as a re-test. Sessions without a visit are left to the other rules.
 */
export function retestVisitsOf(exp: CoachingExperiment, sessions: readonly CoachingSession[]): Record<string, string> {
  const out: Record<string, string> = {}
  const later = sessions
    .filter((s) => s.visitId && s.id !== exp.startedSessionId && s.startedAt > exp.startedAt && s.visitId !== exp.startedVisitId)
    .filter((s) => servesInStratum(s, exp.stratum).length > 0)
    .sort(byStart)
  for (const s of later) if (!out[s.visitId!]) out[s.visitId!] = s.id
  return out
}

/** The experiment with its later visits' re-tests worked out from these sessions (kept when already set). */
export function withRetestVisits(exp: CoachingExperiment, sessions: readonly CoachingSession[]): CoachingExperiment {
  return exp.retestVisits ? exp : { ...exp, retestVisits: retestVisitsOf(exp, sessions) }
}

/** A pause this long between two serves of one "Experiment" recording is the drill (CAPTURE §5.5: 10 min). */
export const DRILL_BREAK_S = 300
/** CAPTURE §5.5 "Experiment": Block A is 15 serves. */
export const BLOCK_A_SERVES = 15

/**
 * Blocks of an "Experiment" recording that holds both blocks (CAPTURE §5.5: Block A, drill, Block B):
 * the serves before its longest pause of at least DRILL_BREAK_S are block 1, the rest block 2.
 * Undefined when there is no such pause or a serve's time is unknown (one block as far as we can tell).
 * `times` are the serves' start times in seconds, in serve order.
 */
export function experimentBlocks(times: readonly (number | undefined)[]): number[] | undefined {
  if (times.length < 2 || times.some((t) => typeof t !== 'number' || !Number.isFinite(t))) return undefined
  let at = -1
  let longest = 0
  for (let i = 1; i < times.length; i++) {
    const gap = (times[i] as number) - (times[i - 1] as number)
    if (gap >= DRILL_BREAK_S && gap > longest) {
      longest = gap
      at = i
    }
  }
  return at < 0 ? undefined : times.map((_, i) => (i < at ? 1 : 2))
}

const SIDE = { deuce: 'deuce court', ad: 'ad court', unknown: 'untagged court side' } as const
const NUMBER = { 1: 'first serves', 2: 'second serves', unknown: 'untagged serves' } as const
const TYPE = { flat: 'flat serves', slice: 'slice serves', kick: 'kick serves', unknown: 'untagged serve type' } as const
const VIEW: Record<string, string> = { side: 'the side view', rear: 'the view from behind', front45: 'a front view', unknown: 'an unknown view' }

/** Why a session does not match the experiment (METRICS §4.4), in the COACHING §12.4 form. */
export function unmatchedReason(exp: CoachingExperiment, session: CoachingSession): string {
  if (session.captureQuality === 'poor') return 'The capture of this session was limited.'
  const k = largestStratum(session)?.key
  const e = exp.stratum
  if (!k || session.view !== e.view) return `This session used ${VIEW[session.view] ?? 'another view'}; your experiment is on ${VIEW[e.view] ?? 'another view'}.`
  if (k.courtSide !== e.courtSide) return `This session was ${SIDE[k.courtSide]}; your experiment is on the ${SIDE[e.courtSide]}.`
  if (k.serveNumber !== e.serveNumber) return `This session was ${NUMBER[k.serveNumber]}; your experiment is on ${NUMBER[e.serveNumber]}.`
  if (k.intendedType !== e.intendedType) return `This session was ${TYPE[k.intendedType]}; your experiment is on ${TYPE[e.intendedType]}.`
  if (k.cameraSide !== e.cameraSide) return 'The phone was on the other side of the court this time.'
  return 'This session was a different set-up from your experiment.'
}

// ---------------------------------------------------------------------------------------------
// Verdict request (primary metric first: process metrics lead, D7)
// ---------------------------------------------------------------------------------------------

interface PrimarySpec {
  seriesId: MetricId
  displayId: MetricId
  kind: 'centre' | 'spread' | 'rate'
  direction: VerdictRequest['direction']
  band?: [number, number]
  sigmaR?: number
  /** No verdict for this item (bands; experimental metrics). */
  noVerdict?: string
}

export function primarySpec(item: LibraryItem, profile: NormalisedProfile, fps = 60): PrimarySpec {
  switch (item.id) {
    case 'toss-height-steady':
      return { seriesId: 'toss-apex-height', displayId: 'toss-height-spread', kind: 'spread', direction: 'decrease', sigmaR: item.detection.thresholds.measurementErrorDefault ?? 4 }
    case 'toss-spot-steady':
      return { seriesId: 'toss-forward', displayId: 'toss-forward-spread', kind: 'spread', direction: 'decrease', sigmaR: item.detection.thresholds.measurementErrorDefault ?? 7 }
    case 'steady-rhythm':
      return { seriesId: 'rhythm-release-to-contact', displayId: 'rhythm-spread', kind: 'spread', direction: 'decrease', sigmaR: 1.2 * (1000 / fps) }
    case 'toss-in-front':
      return { seriesId: 'toss-forward', displayId: 'toss-forward', kind: 'centre', direction: 'increase' }
    case 'toss-within-reach':
      return { seriesId: 'toss-forward', displayId: 'toss-forward', kind: 'centre', direction: 'decrease' }
    case 'toss-to-reach-height': {
      const b = item.detection.thresholds.bySex?.[profile.sex] ?? { highEdge: 125 }
      return { seriesId: 'toss-drop', displayId: 'toss-drop', kind: 'centre', direction: 'target-band', band: [0, b.highEdge] }
    }
    case 'legs-spring':
      return { seriesId: 'leg-drive', displayId: 'leg-drive', kind: 'centre', direction: 'increase' }
    case 'reach-up':
      return { seriesId: 'contact-height-ratio', displayId: 'contact-height-ratio', kind: 'centre', direction: 'increase' }
    case 'contact-in-front':
      return { seriesId: 'contact-forward', displayId: 'contact-forward', kind: 'centre', direction: 'increase' }
    case 'flowing-motion':
      return { seriesId: 'trophy-pause', displayId: 'trophy-pause', kind: 'centre', direction: 'decrease', noVerdict: 'The pause at the top is experimental, so it gets no verdict yet.' }
    case 'shoulder-tilt':
      return { seriesId: 'shoulder-tilt-trophy', displayId: 'shoulder-tilt-trophy', kind: 'rate', direction: 'decrease', noVerdict: 'Shoulder tilt is a band, so it gets no before-and-after verdict.' }
    default:
      return { seriesId: 'serve-in-rate', displayId: 'serve-in-rate', kind: 'rate', direction: 'increase' }
  }
}

/**
 * A session's serves in the stratum that were recorded before any drill (§12.3). For an "Experiment"
 * recording only Block A counts: its first block when the recording holds both (`experimentBlocks`),
 * else its first 15 serves, the template's Block A (CAPTURE §5.5), so serves after the drill in one
 * long recording never reach a baseline or a re-test.
 */
function preDrillServes(session: CoachingSession, key: CoachingStratum) {
  const serves = servesInStratum(session, key)
  if (session.template !== 'experiment') return serves
  // Block B recorded as its own recording (the visit's second Experiment block): after the drill.
  if (isBlockB(session)) return []
  const blocks = [...new Set(serves.map((s) => s.block ?? 0))]
  if (blocks.length > 1) {
    const first = Math.min(...blocks)
    return serves.filter((s) => (s.block ?? 0) === first)
  }
  // Block A recorded on its own (the visit has a later Experiment block): every serve came before the drill.
  if (session.blockIndex === 1 && (session.blocksInVisit ?? 1) >= 2) return serves
  return [...serves].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).slice(0, BLOCK_A_SERVES)
}

/**
 * An "Experiment" recording that is the visit's second (or later) block of that template: Block B,
 * recorded after the drill (CAPTURE §5.5). Known only from real block numbers (SessionRecord.blockIndex).
 */
export function isBlockB(session: Pick<CoachingSession, 'template' | 'blockIndex'>): boolean {
  return session.template === 'experiment' && (session.blockIndex ?? 0) >= 2
}

/** The session as the verdict pools see it: an "Experiment" recording keeps only Block A. */
function beforeDrill(session: CoachingSession, key: CoachingStratum): CoachingSession {
  return session.template === 'experiment' ? restrictTo(session, key) : session
}

export interface ComparisonInput {
  exp: CoachingExperiment
  /** The re-test session being judged. */
  session: CoachingSession
  /** Every other session (any order); baseline and earlier re-tests are picked from it. */
  history: readonly CoachingSession[]
  profile: NormalisedProfile
  verdict?: VerdictFn
}

export function buildVerdictRequest(input: ComparisonInput): VerdictRequest {
  const { exp, session, history, profile } = input
  const item = getItem(exp.itemId)
  if (!item) return emptyRequest('serve-in-rate', 'rate', 'This focus is no longer in the library.')
  const fps = session.fpsClass === 'fps120plus' ? 120 : session.fpsClass === 'fps30' ? 30 : 60
  const spec = primarySpec(item, profile, fps)
  if (spec.noVerdict) return emptyRequest(spec.displayId, spec.kind, spec.noVerdict)
  const kind = retestKind(exp, session)
  if (kind !== 'matched') {
    return emptyRequest(spec.displayId, spec.kind, kind === 'unmatched' ? unmatchedReason(exp, session) : 'A same-session comparison never decides a verdict.')
  }
  const all = [...history.filter((h) => h.id !== session.id), session]
  // Baseline: up to 3 matched sessions at or before the start, most recent first, at most 60 serves.
  const baselineSessions = all
    .filter((h) => h.startedAt <= exp.startedAt && h.captureQuality !== 'poor' && servesInStratum(h, exp.stratum).length > 0)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 3)
    .map((h) => beforeDrill(h, exp.stratum))
  // Follow-up: later matched re-tests up to and including this one, at most 3. A block recorded after
  // the drill (same visit as the start or as a re-test) is same-session and never pools in (§12.3).
  const followSessions = all
    .filter((h) => h.startedAt <= session.startedAt && retestKind(exp, h) === 'matched')
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
    .slice(-3)
    .map((h) => beforeDrill(h, exp.stratum))
  const opts = { heightM: profile.heightM, showExperimental: false, forSpread: spec.kind === 'spread' }
  if (spec.kind === 'rate') {
    const sum = (ss: CoachingSession[]) =>
      ss.reduce(
        (acc, s) => {
          const o = outcomeCounts(s, exp.stratum)
          return { k: acc.k + o.in, n: acc.n + o.tagged }
        },
        { k: 0, n: 0 },
      )
    const b = sum(baselineSessions)
    const f = sum(followSessions)
    return {
      metricId: spec.displayId,
      kind: 'rate',
      direction: 'increase',
      baseline: { sessionIds: baselineSessions.map((s) => s.id), k: b.k, n: b.n },
      followUp: { sessionIds: followSessions.map((s) => s.id), k: f.k, n: f.n },
      sameSession: false,
    }
  }
  // METRICS §1.5 inclusion (measured or estimated, confidence ≥ 0.5, included, not hard-rejected), the
  // same rule the engine's session summaries use, so a one-session side equals that session's value.
  const included = (smp: Sample[]) => smp.filter((x) => (x.status === 'measured' || x.status === 'estimated') && (x.inclusionConfidence ?? x.confidence) >= 0.5)
  // Spreads pool within-session variances (METRICS §4.2, Σ(n_i − 1) df): a session with a single value
  // adds no information, so it is left out rather than counted in n (the 1-serve deuce block of a
  // both-sides session no longer inflates a baseline's n or its σ_r).
  const minPerSession = spec.kind === 'spread' ? 2 : 1
  let budget = 60
  const baseGroups: Sample[][] = []
  const baseIds: string[] = []
  for (const s of baselineSessions) {
    if (budget <= 0) break
    const xs = included(seriesFor(s, servesInStratum(s, exp.stratum), spec.seriesId, opts).usable).slice(0, budget)
    if (xs.length < minPerSession) continue
    budget -= xs.length
    if (xs.length) {
      baseGroups.push(xs)
      baseIds.push(s.id)
    }
  }
  const followGroups: Sample[][] = []
  const followIds: string[] = []
  for (const s of followSessions) {
    const xs = included(seriesFor(s, servesInStratum(s, exp.stratum), spec.seriesId, opts).usable)
    if (xs.length >= minPerSession) {
      followGroups.push(xs)
      followIds.push(s.id)
    }
  }
  // Spreads: the engine's own per-serve σ_r (METRICS §4.2: only σ_r is subtracted). The library's
  // measurementErrorDefault (which adds sideways drift) is a detection rule and a fallback only.
  const sigma = (groups: Sample[][]) => {
    const all = groups.flat()
    const known = all.map((x) => x.sigmaRandom).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (spec.kind !== 'spread') return {}
    if (known.length !== all.length || !all.length) return spec.sigmaR !== undefined ? { sigmaR: spec.sigmaR } : {}
    return { sigmaR: Math.sqrt(known.reduce((a, v) => a + v * v, 0) / known.length), sigmaRBySession: groups.map((g) => g.map((x) => x.sigmaRandom as number)) }
  }
  const valuesOf = (groups: Sample[][]) => groups.map((g) => g.map((x) => x.value))
  return {
    metricId: spec.displayId,
    kind: spec.kind,
    direction: spec.direction,
    ...(spec.band ? { band: spec.band } : {}),
    baseline: { sessionIds: baseIds, bySession: valuesOf(baseGroups), ...sigma(baseGroups) },
    followUp: { sessionIds: followIds, bySession: valuesOf(followGroups), ...sigma(followGroups) },
    sameSession: false,
  }
}

function emptyRequest(metricId: MetricId, kind: VerdictRequest['kind'], reason: string): VerdictRequest {
  return {
    metricId,
    kind,
    direction: 'increase',
    baseline: { sessionIds: [] },
    followUp: { sessionIds: [] },
    sameSession: false,
    notComparableReason: reason,
  }
}

export interface MatchedComparisonResult {
  request: VerdictRequest
  result: VerdictResult
  copy: string
  /** The item's resolved condition held in the re-test session (a later matched session only). */
  resolvedMet: boolean
}

/** "Did it work?" for one re-test session (METRICS §4.5 via the injected or fallback verdict). */
export function matchedComparison(input: ComparisonInput): MatchedComparisonResult {
  const request = buildVerdictRequest(input)
  const result = (input.verdict ?? metricsVerdict)(request)
  const item = getItem(input.exp.itemId)
  const matched = retestKind(input.exp, input.session) === 'matched'
  let resolvedMet = false
  if (matched && item) {
    const d = detectItem(item, { profile: input.profile, session: restrictTo(input.session, input.exp.stratum), history: input.history })
    resolvedMet = d.resolved === true && !!d.stratum && sameStratum(d.stratum, input.exp.stratum)
  }
  return { request, result, copy: verdictSentence(result, { rate: request.kind === 'rate' }), resolvedMet }
}

/** A copy of the session with only the experiment's stratum (and, for Experiment templates, block A). */
function restrictTo(session: CoachingSession, key: CoachingStratum): CoachingSession {
  const keep = new Set(preDrillServes(session, key).map((s) => s.id))
  return { ...session, serves: session.serves.filter((s) => keep.has(s.id)) }
}

// ---------------------------------------------------------------------------------------------
// Same-session before-and-after ("Straight after practice", display only)
// ---------------------------------------------------------------------------------------------

export interface SameSessionCheck {
  metricId: MetricId
  before: MetricValue
  after: MetricValue
  copy: string
}

export const STRAIGHT_AFTER_PRACTICE =
  "Straight after practice, same session. That's the drill's immediate effect, which often fades. Your next session will show what stuck."

export function sameSessionCheck(itemId: string, session: CoachingSession, profile: NormalisedProfile, stratum?: CoachingStratum): SameSessionCheck | undefined {
  const item = getItem(itemId)
  if (!item) return undefined
  const key = stratum ?? largestStratum(session)?.key
  if (!key) return undefined
  const serves = servesInStratum(session, key)
  const blocks = [...new Set(serves.map((s) => s.block ?? 0))].sort((a, b) => a - b)
  if (blocks.length < 2) return undefined
  const spec = primarySpec(item, profile)
  if (spec.noVerdict || spec.kind === 'rate') return undefined
  const opts = { heightM: profile.heightM, showExperimental: false }
  const sa = stratumSeries(session, key, spec.seriesId, { ...opts, block: blocks[0] }).usable
  const sb = stratumSeries(session, key, spec.seriesId, { ...opts, block: blocks[blocks.length - 1] }).usable
  const a = sa.map((x) => x.value)
  const b = sb.map((x) => x.value)
  const min = spec.kind === 'spread' ? 8 : 5
  if (a.length < min || b.length < min) return undefined
  // The engine's σ_r when every serve carries one (METRICS §4.2), else the library default.
  const noise = (smp: readonly Sample[]) =>
    smp.every((x) => typeof x.sigmaRandom === 'number') && smp.length ? Math.sqrt(smp.reduce((acc, x) => acc + (x.sigmaRandom as number) ** 2, 0) / smp.length) : spec.sigmaR ?? 0
  const summarise = (xs: number[], e: number): MetricValue => {
    let v: number
    if (spec.kind === 'spread') {
      const s = xs.length >= 15 ? sd(xs) : 1.4826 * mad(xs)
      v = Math.round(Math.sqrt(Math.max(0, s * s - e ** 2)) * 2) / 2
    } else {
      const c = spec.seriesId === 'leg-drive' || spec.seriesId === 'toss-drop' ? median(xs) : mean(xs)
      v = spec.seriesId === 'contact-height-ratio' ? Math.round(c * 100) / 100 : Math.round(c)
    }
    return {
      id: spec.displayId,
      value: v,
      unit: spec.displayId === 'contact-height-ratio' ? 'ratio-of-height' : spec.displayId === 'leg-drive' ? '% of height' : spec.displayId === 'rhythm-spread' ? 'ms' : 'cm',
      status: 'estimated',
      confidence: 0.8,
      basis: 'Same-session block (display only; never used for a verdict).',
      n: xs.length,
      provisional: true,
    }
  }
  return { metricId: spec.displayId, before: summarise(a, noise(sa)), after: summarise(b, noise(sb)), copy: STRAIGHT_AFTER_PRACTICE }
}

// ---------------------------------------------------------------------------------------------
// Transitions (§12.5)
// ---------------------------------------------------------------------------------------------

export interface Transition {
  status: CoachingExperiment['status'] | 'continue'
  copy: string
  variant?: DrillVariant
  swapCue?: boolean
  unlockProgression?: boolean
  cooldownSessions?: number
}

const WORSE = new Set<VerdictId>(['likely-worse', 'clearly-worse'])

export function experimentTransition(
  exp: CoachingExperiment,
  verdict: VerdictResult,
  resolvedMet: boolean,
  logs: readonly PracticeLogSummary[] = [],
  /** Local YYYY-MM-DD: a practice logged sore or with pain today holds the unlock for the day (§9.3, §10.3). */
  today?: string,
  /** The newest practice of any drill logged with pain: only successful practices after it count (§10.3). */
  lastPainLog?: PainLogMark,
): Transition {
  const item = getItem(exp.itemId)
  const subject = item ? subjectOf(item.id, item.title).toLowerCase() : 'this'
  if (verdict.verdict === 'not-comparable') return { status: 'continue', copy: verdictSentence(verdict) }
  // Only re-tests that got a verdict count towards the 2- and 3-re-test rules: a "not comparable yet"
  // one had no transition (§12.5) and must not bring parking closer.
  const judged = exp.retests.filter((r) => r.verdict !== 'not-comparable')
  const prev = judged.at(-1)
  const all = [...judged, { sessionId: '', verdict: verdict.verdict, resolvedMet }]
  const consecutiveResolved = resolvedMet && prev?.resolvedMet === true && !WORSE.has(prev.verdict) && !WORSE.has(verdict.verdict)
  if (verdict.verdict === 'clearly-better' || consecutiveResolved) {
    return {
      status: 'worked',
      copy: `It worked. We'll keep an eye on your ${subject} while you work on something new.`,
      cooldownSessions: 2,
    }
  }
  const stalled = (v: VerdictId) => v === 'no-clear-change' || WORSE.has(v)
  if (stalled(verdict.verdict) && all.length >= 3) {
    return { status: 'parked', copy: "This one isn't shifting yet, and that's normal. Let's park it and try another route.", cooldownSessions: 3 }
  }
  if (WORSE.has(verdict.verdict)) {
    return { status: 'continue', copy: "It dipped a little, which often happens mid-change. Let's make the drill a bit easier.", variant: 'regression' }
  }
  if (verdict.verdict === 'no-clear-change') {
    const earlierNoChange = judged.filter((r) => r.verdict === 'no-clear-change').length
    if (earlierNoChange >= 1) {
      return { status: 'continue', copy: "No clear change yet. Let's try it from a different angle.", swapCue: true }
    }
    return { status: 'continue', copy: 'About the same so far. Changes like this often take a few sessions.' }
  }
  if (verdict.verdict === 'likely-better') {
    // Only this item's own practices after the newest one of any drill logged with pain, and not on a
    // day a practice was logged sore or with pain (§9.3, §10.3, §12.2; practiceLogRules).
    const { yes } = successesSincePain(logs.filter((l) => !l.itemId || l.itemId === exp.itemId), lastPainLog)
    return { status: 'continue', copy: "Keep going; it's moving the right way.", unlockProgression: yes >= 2 && !soreLoggedOn(logs, today, lastPainLog) }
  }
  return { status: 'continue', copy: 'Too early to tell. Record a few more serves next time.' }
}

export const SUPERSEDED_COPY = 'Something earlier in your serve needs attention first.'

/** Sessions an item rests after its experiment ends (§7.4): worked 2, parked or superseded 3. */
export const COOLDOWN_SESSIONS = { worked: 2, parked: 3 } as const

export interface EndedExperiment {
  itemId: string
  /** 'worked' (completed) or 'parked' (parked, superseded or otherwise abandoned). */
  kind: keyof typeof COOLDOWN_SESSIONS
  /** ISO start of the session whose decision ended it (that session counts as the first rest). */
  endedAt: string
}

/**
 * Cooldowns for the session starting at `currentStartedAt` (§7.4, §12.5), from experiments that ended
 * earlier. The ending session is the first of the rest; every later session up to and including the
 * current one uses one more, so a parked item is skipped by the ending session and the next two, and
 * is eligible again on the third later session. The decision itself still lifts a cooldown for a
 * "slipped" item, which is never eligible (§6.4).
 */
export function cooldownsFrom(
  ended: readonly EndedExperiment[],
  sessions: readonly { startedAt: string }[],
  currentStartedAt: string,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of ended) {
    if (e.endedAt > currentStartedAt) continue
    const used = sessions.filter((s) => s.startedAt > e.endedAt && s.startedAt <= currentStartedAt).length
    const left = COOLDOWN_SESSIONS[e.kind] - used
    if (left > 0) out[e.itemId] = Math.max(out[e.itemId] ?? 0, left)
  }
  return out
}

/**
 * The stored ExperimentRecord status after a decision (COACHING §12.5; ARCHITECTURE Experiment.status):
 * `worked` -> 'completed'; `parked` or `superseded` -> 'abandoned'; otherwise it stays 'active'. The
 * app stores the "Did it work?" result and this status together, so an experiment whose verdict ended
 * it is never left active (a finished "clearly better" experiment is completed, not still running).
 */
export function experimentRecordStatus(
  decisionExperiment: { id: string; status: CoachingExperiment['status'] | 'continue' } | undefined,
  experimentId: string,
): 'active' | 'completed' | 'abandoned' {
  if (!decisionExperiment || decisionExperiment.id !== experimentId) return 'active'
  if (decisionExperiment.status === 'worked') return 'completed'
  if (decisionExperiment.status === 'parked' || decisionExperiment.status === 'superseded') return 'abandoned'
  return 'active'
}

// ---------------------------------------------------------------------------------------------
// Re-test due (§12.3): after at least 1 logged practice (2 is better), ideally within 7 days.
// ---------------------------------------------------------------------------------------------

export interface RetestDue {
  state: 'practise-first' | 'ready' | 'overdue'
  practices: number
  /** YYYY-MM-DD: 7 days after the first logged practice. */
  dueBy?: string
  text: string
}

const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * The local calendar date (YYYY-MM-DD) of an ISO instant, the calendar practice-log dates use. A plain
 * date passes through unchanged (parsing "YYYY-MM-DD" alone would read it as UTC midnight and shift it).
 */
export function localYmd(isoOrDate: string): string {
  if (isoOrDate.length <= 10) return isoOrDate.slice(0, 10)
  const d = new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return isoOrDate.slice(0, 10)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function retestDue(exp: CoachingExperiment, logs: readonly PracticeLogSummary[], today: string, since: string = exp.startedAt): RetestDue {
  // Session times and "now" are UTC instants; practice logs carry local dates. Compare local dates, so
  // a Melbourne morning re-test is not dated the day before (and "overdue" turns at local midnight).
  const sinceYmd = localYmd(since)
  const todayYmd = localYmd(today)
  const mine = logs.filter((l) => !l.itemId || l.itemId === exp.itemId).filter((l) => l.date >= sinceYmd)
  const words = stratumWords(exp.stratum)
  if (mine.length === 0) {
    return { state: 'practise-first', practices: 0, text: `Practise the drill once or twice first. Then record 12 to 15 ${words}.` }
  }
  const first = [...mine].sort((a, b) => (a.date < b.date ? -1 : 1))[0].date
  const dueBy = addDays(first, 7)
  const overdue = todayYmd > dueBy
  const lead = mine.length >= 2 ? 'Re-test ready.' : 'Re-test ready, though one more practice first is better.'
  return {
    state: overdue ? 'overdue' : 'ready',
    practices: mine.length,
    dueBy,
    text: `${lead} Warm up, then record 12 to 15 ${words}, before the drill.`,
  }
}

/** Earlier re-tests of an experiment, re-derived from stored sessions (for records that keep only ids). */
export function rederiveRetests(
  exp: CoachingExperiment,
  retestSessions: readonly CoachingSession[],
  allSessions: readonly CoachingSession[],
  profile: NormalisedProfile,
  verdict?: VerdictFn,
): CoachingExperiment['retests'] {
  const out: CoachingExperiment['retests'] = []
  for (const s of [...retestSessions].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))) {
    if (retestKind(exp, s) !== 'matched') continue
    const history = allSessions.filter((h) => h.id !== s.id && h.startedAt < s.startedAt)
    const c = matchedComparison({ exp: { ...exp, retests: out }, session: s, history, profile, verdict })
    out.push({ sessionId: s.id, verdict: c.result.verdict, resolvedMet: c.resolvedMet })
  }
  return out
}
