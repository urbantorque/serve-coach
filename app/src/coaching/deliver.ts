/**
 * Delivery (COACHING §8, §9, §12.2): the cue by level, the drill variant, the "why it matters"
 * variant, the evidence (key frames and 1 to 2 stats) and the re-test plan.
 */
import type { KeyFrameEvent, MetricId, MetricValue, ServePhase } from '../analysis/types.ts'
import { metricsValue, type Detection } from './detect.ts'
import { getItem, type LibraryItem } from './library.ts'
import type { NormalisedProfile } from './profile.ts'
import { seriesFor, stratumSeries, values } from './series.ts'
import { mean, median } from './stats.ts'
import { matchedHistory, servesInStratum, stratumWords } from './strata.ts'
import type {
  CoachingSession,
  CoachingStratum,
  CueChoice,
  CueRegister,
  DrillChoice,
  DrillVariant,
  EvidenceStat,
  FocusEvidence,
  Goal,
  PracticeLogSummary,
  RetestPlan,
} from './types.ts'

// ---------------------------------------------------------------------------------------------
// Cue (§9.1): analogy for UTR 1-3, outcome for UTR 4-7; second-serve strata use outcomeSecondServe.
// ---------------------------------------------------------------------------------------------

export function chooseCue(item: LibraryItem, register: CueRegister, stratum?: CoachingStratum): CueChoice {
  const second = stratum?.serveNumber === 2 && item.cues.outcomeSecondServe
  const other: CueRegister = register === 'analogy' ? 'outcome' : 'analogy'
  if (second) {
    return {
      id: `${item.id}:outcome:second`,
      text: item.cues.outcomeSecondServe as string,
      register: 'outcome',
      other: { register: 'analogy', text: item.cues.analogy },
    }
  }
  return {
    id: `${item.id}:${register}`,
    text: item.cues[register],
    register,
    other: { register: other, text: item.cues[other] },
  }
}

// ---------------------------------------------------------------------------------------------
// Drill (§9.1 to §9.3, §12.2)
// ---------------------------------------------------------------------------------------------

export interface LogRules {
  unlockProgression: boolean
  suggestRegression: boolean
  suggestOtherCue: boolean
  /** Logs of this item, newest last. */
  logs: PracticeLogSummary[]
}

/** §12.2: 2 "yes" logs unlock the progression; 2 "no" suggest the regression; 2 awkward in a row suggest the other cue. */
export function practiceLogRules(logs: readonly PracticeLogSummary[], itemId?: string): LogRules {
  const mine = logs.filter((l) => !itemId || !l.itemId || l.itemId === itemId)
  const yes = mine.filter((l) => l.successCriterionMet === 'yes').length
  const no = mine.filter((l) => l.successCriterionMet === 'no').length
  const lastTwo = mine.slice(-2)
  return {
    unlockProgression: yes >= 2,
    suggestRegression: no >= 2 && yes < 2,
    suggestOtherCue: lastTwo.length === 2 && lastTwo.every((l) => l.feel === 'awkward'),
    logs: [...mine],
  }
}

/** Whether the progression's gate passes for this player (level and comfort, §5.4). */
export function progressionGatePasses(item: LibraryItem, profile: NormalisedProfile): boolean {
  const g = item.drill.progressionGate
  return g.levels.includes(profile.level) && !g.excludeIfComfort.some((r) => profile.comfort.has(r))
}

const COUNT = /(\d+)\s+of\s+(\d+)/i

function parseCounter(criterion: string): DrillChoice['counter'] {
  const m = COUNT.exec(criterion)
  if (!m) return undefined
  const target = Number(m[1])
  const of = Number(m[2])
  const rest = criterion.slice(m.index + m[0].length).replace(/^\s+/, '').replace(/[.,].*$/, '')
  const label = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : 'Successful reps'
  return { target, of, label }
}

/** Serves a drill uses: the numbered serves and balls in its steps, 20 to 40 (§11 drill volume). */
function drillServes(item: LibraryItem): number {
  let total = 0
  for (const s of item.drill.steps) {
    for (const m of s.matchAll(/(\d+)\s+(serves|balls|second serves)/gi)) total += Number(m[1])
  }
  return Math.min(40, Math.max(item.id === 'warm-up-routine' ? 10 : 20, total || 30))
}

export function chooseDrill(
  item: LibraryItem,
  profile: NormalisedProfile,
  goal: Goal,
  logs: readonly PracticeLogSummary[] = [],
  opts: { forceVariant?: DrillVariant } = {},
): DrillChoice {
  const rules = practiceLogRules(logs, item.id)
  const gatePasses = progressionGatePasses(item, profile)
  const progVariant: 'progression' | 'progression-alt' | null = gatePasses ? 'progression' : item.drill.progressionAlt ? 'progression-alt' : null
  const progText = progVariant === 'progression' ? item.drill.progression : progVariant === 'progression-alt' ? item.drill.progressionAlt : undefined
  const sore = profile.soreToday.length > 0
  let variant: DrillVariant = 'base'
  if (opts.forceVariant) variant = opts.forceVariant
  else if (goal === 'less-effort' || rules.suggestRegression) variant = 'regression'
  else if (rules.unlockProgression && progVariant && !sore) variant = progVariant
  const unlocked = rules.unlockProgression && !!progVariant && !sore
  const comfortNotes = [...profile.comfort].map((r) => item.comfortNotes[r]).filter((x): x is string => !!x)
  const optionalAid = item.drill.optionalAid?.text
  return {
    id: `${item.id}:${variant}`,
    itemId: item.id,
    variant,
    name: item.drill.name,
    minutes: item.drill.minutes,
    setup: item.drill.setup,
    steps: [...item.drill.steps],
    successCriterion: item.drill.successCriterion,
    counter: parseCounter(item.drill.successCriterion),
    regression: item.drill.regression,
    ...(unlocked && progText && progVariant
      ? { progression: { text: progText, label: progVariant === 'progression' ? item.drill.progressionGate.label : null, variant: progVariant } }
      : {}),
    ...(!unlocked
      ? { progressionLocked: sore && rules.unlockProgression ? 'paused-sore' : !progVariant ? 'level-or-comfort' : 'needs-two-logs' }
      : {}),
    ...(item.drill.note ? { note: item.drill.note } : {}),
    ...(optionalAid ? { optionalAid } : {}),
    comfortNotes,
    tossOnlyReps: item.drill.tossOnlyReps,
    approxServes: drillServes(item),
  } as DrillChoice
}

// ---------------------------------------------------------------------------------------------
// Why it matters (whyItMattersVariants, bring-it-down branch §7.2)
// ---------------------------------------------------------------------------------------------

export function whyItMatters(item: LibraryItem, session: CoachingSession, stratum: CoachingStratum | undefined, profile: NormalisedProfile): string {
  const variants = item.whyItMattersVariants ?? []
  if (!variants.length || !stratum) return item.whyItMatters
  const opts = { heightM: profile.heightM, showExperimental: false }
  const toss = values(stratumSeries(session, stratum, 'toss-forward', opts))
  const contact = values(stratumSeries(session, stratum, 'contact-forward', opts))
  const kick = stratum.intendedType === 'kick'
  for (const v of variants) {
    if (v.id === 'tossFar' && toss.length >= 6 && mean(toss) > 60) return v.text
    if (v.id === 'contactShort' && contact.length >= 6 && mean(contact) < (kick ? 0 : 15)) return v.text
  }
  return item.whyItMatters
}

// ---------------------------------------------------------------------------------------------
// Evidence (§8)
// ---------------------------------------------------------------------------------------------

const PHASE_EVENT: Record<ServePhase, KeyFrameEvent> = {
  setup: 'setup',
  toss: 'apex',
  loading: 'trophy',
  drive: 'trophy',
  contact: 'contact',
  landing: 'landing',
  recovery: 'recovery',
}

export function keyFrameEventFor(item: LibraryItem): KeyFrameEvent | null {
  // The hip-rise overlay is drawn on the contact frame (DESIGN §8.7 leg-drive tile).
  if (item.evidence.overlay === 'hip-rise') return 'contact'
  return item.evidence.keyFramePhase ? PHASE_EVENT[item.evidence.keyFramePhase] : null
}

const VIEW_NOTE_SPREAD = 'From the side, a little of this comes from tosses drifting sideways.'

/** Representative serve: closest to the median (per-serve items) or furthest from it (spreads). */
function representative(d: Detection): string | undefined {
  const sig = d.signal
  if (!sig) return undefined
  const good = sig.samples.filter((s) => s.confidence >= 0.7)
  const pool = good.length ? good : sig.samples
  if (!pool.length) return undefined
  const med = median(pool.map((s) => s.raw))
  const dist = (s: (typeof pool)[number]) => Math.abs(s.raw - med)
  return [...pool].sort((a, b) => (sig.spread ? dist(b) - dist(a) : dist(a) - dist(b)))[0].serveId
}

/**
 * Best serve (§8.1): this session and the last 3 matched sessions, confidence >= 0.7, went in when
 * tagged. Per-serve items: the best value within the resolved band; spreads: closest to the median.
 */
function bestServe(d: Detection, session: CoachingSession, history: readonly CoachingSession[], profile: NormalisedProfile): { serveId: string; sessionId: string } | undefined {
  const sig = d.signal
  if (!sig || !d.stratum) return undefined
  const sessions = [session, ...matchedHistory(history, d.stratum, session.startedAt).slice(0, 3)]
  type Cand = { serveId: string; sessionId: string; raw: number; outcome?: string; tagged: boolean }
  const cands: Cand[] = []
  for (const s of sessions) {
    const serves = servesInStratum(s, d.stratum)
    const tagged = serves.some((x) => x.outcome && x.outcome !== 'unknown')
    // A spread picks the serve nearest the middle: relative, so an unknown pitch does not matter (METRICS §1.1 item 3).
    const series = seriesFor(s, serves, sig.metricId, { heightM: profile.heightM, showExperimental: false, forSpread: !!sig.spread })
    for (const x of series.usable) {
      if (x.confidence < 0.7) continue
      if (tagged && x.outcome !== 'in') continue
      cands.push({ serveId: x.serveId, sessionId: s.id, raw: x.value, outcome: x.outcome, tagged })
    }
  }
  if (!cands.length) return undefined
  if (sig.spread) {
    const med = median(cands.map((c) => c.raw))
    const c = [...cands].sort((a, b) => Math.abs(a.raw - med) - Math.abs(b.raw - med))[0]
    return { serveId: c.serveId, sessionId: c.sessionId }
  }
  const inBand = cands.filter((c) => (sig.faultDirection === 'below' ? c.raw >= sig.splitAt : c.raw <= sig.splitAt))
  if (!inBand.length) return undefined
  const c = [...inBand].sort((a, b) => (sig.faultDirection === 'below' ? b.raw - a.raw : a.raw - b.raw))[0]
  return { serveId: c.serveId, sessionId: c.sessionId }
}

function evidenceStats(item: LibraryItem, d: Detection, session: CoachingSession, profile: NormalisedProfile): EvidenceStat[] {
  const out: EvidenceStat[] = []
  for (const id of item.evidence.statIds) {
    let v: MetricValue | undefined
    if (d.metric && d.metric.metricId === id) v = d.metric.value
    else v = metricsValue(session, d.stratum, id) ?? computedStat(id, session, d, profile)
    // §8.2: only measured, estimated or player-entered values; experimental never in a focus explanation.
    if (!v || v.status === 'experimental' || v.status === 'unavailable') continue
    out.push({ metricId: id, value: v })
  }
  return out.slice(0, 2)
}

function computedStat(id: MetricId, session: CoachingSession, d: Detection, profile: NormalisedProfile): MetricValue | undefined {
  if (!d.stratum) return undefined
  const s = stratumSeries(session, d.stratum, id, { heightM: profile.heightM, showExperimental: false })
  const xs = values(s)
  if (xs.length < 5) return undefined
  const useMean = id === 'toss-forward' || id === 'contact-forward' || id === 'contact-height-ratio'
  const c = useMean ? mean(xs) : median(xs)
  const ratio = id === 'toss-apex-height'
  const step = id === 'contact-height-ratio' || ratio ? 0.01 : id.startsWith('rhythm') ? 10 : 1
  const v = ratio ? c / (profile.heightM * 100) : c
  const status = s.usable.some((x) => x.status === 'estimated') ? 'estimated' : s.usable[0].status
  return {
    id,
    value: Math.round(v / step) * step,
    unit: ratio || id === 'contact-height-ratio' ? 'ratio-of-height' : id.startsWith('rhythm') ? 'ms' : id === 'leg-drive' ? '% of height' : 'cm',
    status,
    confidence: s.usable.reduce((a, x) => a + x.confidence, 0) / xs.length,
    basis: 'Session centre of the serves in this set-up (coaching read).',
    n: xs.length,
    nEligible: s.recorded,
    ...(ratio ? { secondary: { cm: Math.round(c) } } : {}),
  }
}

export const OUTCOME_LINE = {
  noClearDifference: 'No clear difference yet between your in and out serves on this.',
} as const

const ASSOCIATION: Record<string, string> = {
  'toss-height-steady': 'Your serves that went in tended to have a toss peak closer to your usual height.',
  'toss-spot-steady': 'Your serves that went in tended to have a toss closer to your usual spot.',
  'toss-in-front': 'Your serves that went in tended to have the toss further in front.',
  'toss-within-reach': 'Your serves that went in tended to have the toss closer to you.',
  'toss-to-reach-height': 'Your serves that went in tended to have a shorter ball drop.',
  'legs-spring': 'Your serves that went in tended to have more leg drive.',
  'steady-rhythm': 'Your serves that went in tended to have a more even rhythm.',
  'flowing-motion': 'Your serves that went in tended to have a shorter pause at the top.',
  'reach-up': 'Your serves that went in tended to have a higher contact point.',
  'contact-in-front': 'Your serves that went in tended to have contact further in front.',
}

export function buildEvidence(
  item: LibraryItem,
  d: Detection,
  session: CoachingSession,
  history: readonly CoachingSession[],
  profile: NormalisedProfile,
  line: 'association' | 'no-clear-difference' | 'none',
): FocusEvidence {
  const keyServeId = representative(d) ?? session.representativeServeId
  let compareTo: FocusEvidence['compareTo'] = item.evidence.compareTo === 'none' ? 'none' : item.evidence.compareTo
  let compareServeId: string | undefined
  let compareSessionId: string | undefined
  if (compareTo === 'best-serve') {
    const b = bestServe(d, session, history, profile)
    if (b && b.serveId !== keyServeId) {
      compareServeId = b.serveId
      compareSessionId = b.sessionId
    } else compareTo = 'previous-session'
  }
  if (compareTo === 'previous-session' && d.stratum) {
    const prev = matchedHistory(history, d.stratum, session.startedAt)[0]
    if (prev) {
      compareSessionId = prev.id
      compareServeId = prev.representativeServeId ?? servesInStratum(prev, d.stratum).find((s) => s.included)?.id
    } else if (!compareServeId) {
      compareTo = session.bestServeId && session.bestServeId !== keyServeId ? 'best-serve' : 'none'
      compareServeId = compareTo === 'best-serve' ? session.bestServeId : undefined
      compareSessionId = compareTo === 'best-serve' ? session.id : undefined
    }
  }
  const spreadItem = item.detection.kind === 'spread' && item.id !== 'steady-rhythm'
  return {
    keyFramePhase: item.evidence.keyFramePhase,
    keyFrameEvent: keyFrameEventFor(item),
    ...(keyServeId ? { keyServeId } : {}),
    compareTo,
    ...(compareServeId ? { compareServeId } : {}),
    ...(compareSessionId ? { compareSessionId } : {}),
    overlay: item.evidence.overlay,
    stats: evidenceStats(item, d, session, profile),
    ...(item.evidence.viewNote ? { viewNote: item.evidence.viewNote } : spreadItem ? { viewNote: VIEW_NOTE_SPREAD } : {}),
    outcomeLine: line,
    ...(line === 'no-clear-difference' ? { outcomeSentence: OUTCOME_LINE.noClearDifference } : {}),
    ...(line === 'association' && ASSOCIATION[item.id] ? { outcomeSentence: ASSOCIATION[item.id] } : {}),
  }
}

// ---------------------------------------------------------------------------------------------
// Re-test plan (§12.3)
// ---------------------------------------------------------------------------------------------

export function retestPlan(stratum: CoachingStratum): RetestPlan {
  const words = stratumWords(stratum)
  return {
    serves: { min: 12, max: 15 },
    stratumText: words,
    text: `After 1 or 2 practices, in a later session: warm up, then record 12 to 15 ${words}, before the drill.`,
  }
}

export function itemTitle(id: string): string {
  return getItem(id)?.title ?? id
}
