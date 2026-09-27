/**
 * decideFocus: one coaching decision per analysed session (D6; COACHING §7.2).
 *
 *   0. safety gate (pain, red flags, an unresolved referral), then the under-18 rule
 *   1. match day: never a new focus
 *   2. data gate
 *   3. coach's focus (pinned)
 *   4. active experiment (stickiness, verdict, transition, supersede)
 *   5. candidates (detection, comfort, cooldown, experimental tier)
 *   6. rank: earlier stage, outcome gap, goal, mechanical first, confidence, library order
 *   7. nothing clear: keep going
 *   8. the decision: one focus, the evidence, one cue, one drill
 *
 * Pure and deterministic: the same input always gives the same decision.
 */
import { chooseCue, chooseDrill, buildEvidence, practiceLogRules, retestPlan, whyItMatters } from './deliver.ts'
import { detectItem, subjectOf, weakestTier, type Detection } from './detect.ts'
import {
  experimentTransition,
  matchedComparison,
  retestDue,
  retestKind,
  sameSessionCheck,
  SUPERSEDED_COPY,
  unmatchedReason,
  type Transition,
} from './experiment.ts'
import { ENGINE_VERSION, FOCUS_ITEMS, getItem, item as libItem, LIBRARY_VERSION, type LibraryItem } from './library.ts'
import { loadGuidance } from './load.ts'
import { normaliseProfile, REGION_WORDS, type NormalisedProfile } from './profile.ts'
import { compareRanked, toRanked, type Ranked } from './rank.ts'
import { COMFORT_LINE, REFERRAL_COPY, sorenessLine, UNDER_18_MESSAGE } from './safety.ts'
import { largestStratum, sameStratum } from './strata.ts'
import type {
  BodyRegion,
  CoachingDecision,
  CoachingInput,
  CoachingSession,
  CoachingStratum,
  ConsideredReason,
  FocusDecision,
  Goal,
  ItemCheck,
  KeepGoingDecision,
  RankReason,
  ReferralLevel,
  Severity,
  TraceEntry,
  WarmUpRoutine,
} from './types.ts'
import { verdictSentence } from './verdict.ts'

export const GOAL_WORDS: Record<Goal, string> = {
  'first-serves-in': 'more first serves in',
  'more-pace': 'more pace',
  'second-serve-reliability': 'a second serve you trust',
  'less-effort': 'serving with less effort',
}

export const DECISION_COPY = {
  stageEarly: 'It comes early in your serve, so fixing it often helps what follows.',
  stageClearest: 'It is the clearest change to make from this session.',
  pinned: "Your coach's focus.",
  experiment: "You're mid-experiment on this, so the focus stays until a re-test shows how it went.",
  goal: (g: Goal) => `It fits your goal: ${GOAL_WORDS[g]}.`,
  fatigue: 'Your contact point dropped late in the session. Those serves still count here.',
  baselineBuilding: 'Compared with published ranges for club players; your own baseline starts after 3 matched sessions.',
  aboveRange: 'The coaching library is written for UTR 1 to 7, so treat these as general pointers.',
  comfortLine: "Your comfort settings rule out today's main candidates. Check with a physio before working on them.",
  pinnedComfort: "Your comfort settings rule out your coach's focus today. Check with a physio before working on it.",
  notMeasurable: "We can't measure this one from this recording, so there is no evidence to show. The cue and drill still apply.",
  keepGoingTitle: 'Nothing clear to change',
  matchDay: 'No new changes today.',
  laterStage: 'Comes later in the serve, so we will look again after this.',
  smallerGap: 'Costs fewer serves than your focus right now.',
  onCooldown: 'Resting after your last experiment.',
  captureTooFew: (n: number) => `We found ${n} usable ${n === 1 ? 'serve' : 'serves'}. Coaching needs at least 6 from one session.`,
  captureTooFewFix: 'Record 12 to 15 serves from one side, with the whole toss in the picture.',
} as const

const SEVERITY_ORDER: Severity[] = ['none', 'minor', 'moderate', 'major']
const atLeast = (s: Severity, min: Severity) => SEVERITY_ORDER.indexOf(s) >= SEVERITY_ORDER.indexOf(min)

interface Ctx {
  input: CoachingInput
  profile: NormalisedProfile
  session: CoachingSession
  history: CoachingSession[]
  now: string
  trace: TraceEntry[]
  safetyNotes: string[]
  notes: string[]
}

const baseOf = (c: Ctx) => ({
  sessionId: c.session.id,
  createdAt: c.now,
  libraryVersion: LIBRARY_VERSION,
  engineVersion: ENGINE_VERSION,
  trace: c.trace,
  safetyNotes: c.safetyNotes,
  notes: c.notes,
})

export function decideFocus(input: CoachingInput): CoachingDecision {
  const now = input.now ?? new Date().toISOString()
  const session = input.session
  const history = (input.history ?? []).filter((h) => h.id !== session.id)
  const trace: TraceEntry[] = []
  const bc = input.bodyCheck
  const pre: Ctx = {
    input,
    profile: normaliseProfile(input.profile, bc?.answer === 'sore' ? bc : undefined),
    session,
    history,
    now,
    trace,
    safetyNotes: [],
    notes: [],
  }

  // 0. SAFETY GATE (always first; before the age rule so red-flag copy always shows).
  const referral = referralLevelFor(input)
  if (referral) {
    trace.push({ step: 'safety', passed: false, detail: `Referral: ${referral}. No focus, cue or drill.` })
    return { ...baseOf(pre), kind: 'referral', level: referral, copy: REFERRAL_COPY[referral] }
  }
  trace.push({ step: 'safety', passed: true, detail: bc?.answer === 'sore' ? `Sore today: ${bc.regions.join(', ')}.` : 'No pain reported.' })
  const profile = pre.profile
  if (profile.ageBand === 'under-18') {
    trace.push({ step: 'age', passed: false, detail: 'Under 18: the serve coach is for adults in v1 (D11).' })
    return { ...baseOf(pre), kind: 'not-available', reason: 'under-18', message: UNDER_18_MESSAGE }
  }
  pre.safetyNotes.push(COMFORT_LINE)
  if (profile.soreToday.length) pre.safetyNotes.push(sorenessLine(profile.soreToday))
  if (profile.aboveLibraryRange) pre.notes.push(DECISION_COPY.aboveRange)
  const ctx = pre

  // 1. MATCH DAY: carry the current cue; never start, switch, supersede or conclude anything.
  if (input.matchDay) {
    const exp = input.activeExperiment?.status === 'active' ? input.activeExperiment : undefined
    const pinnedItem = input.profile.pinnedFocusItemId ? getItem(input.profile.pinnedFocusItemId) : undefined
    const pinned = pinnedItem && !pinnedItem.contraindications.some((r) => profile.comfort.has(r)) ? pinnedItem : undefined
    const it = (exp && getItem(exp.itemId)) || (pinned?.itemType === 'focus' ? pinned : undefined) || libItem('keep-going')
    const register = exp?.cueRegister ?? profile.register
    const cue = chooseCue(it, register, exp?.stratum)
    trace.push({ step: 'match-day', passed: true, detail: `Match day: cue from ${it.id}; no new focus.` })
    return {
      ...baseOf(ctx),
      kind: 'match-day',
      itemId: it.id,
      cue,
      routine: warmUpRoutine(profile),
      message: DECISION_COPY.matchDay,
    }
  }

  // 2. DATA GATE.
  const usable = session.serves.filter((s) => s.included).length
  const dataOk = session.captureQuality !== 'poor' && usable >= 6
  trace.push({ step: 'data', passed: dataOk, detail: `${usable} usable ${usable === 1 ? 'serve' : 'serves'}, capture ${session.captureQuality}.` })

  // 5 (early). Detection for every focus item: the pinned, experiment and supersede steps need it.
  const env = { profile, session, history }
  const detections = new Map<string, Detection>()
  if (dataOk) for (const it of FOCUS_ITEMS) detections.set(it.id, detectItem(it, env))

  // 3. COACH'S FOCUS (research 10 M8).
  const pinnedId = input.profile.pinnedFocusItemId
  const pinned = pinnedId ? getItem(pinnedId) : undefined
  if (pinned && pinned.itemType === 'focus') {
    trace.push({ step: 'pinned', itemId: pinned.id, passed: true, detail: 'A coach focus is pinned.' })
    if (pinned.contraindications.some((r) => profile.comfort.has(r))) {
      trace.push({ step: 'pinned', itemId: pinned.id, passed: false, detail: 'Pinned focus excluded by a comfort setting.' })
      return keepGoing(ctx, detections, { pinnedRuledOut: true, comfortLine: DECISION_COPY.pinnedComfort })
    }
    const d = dataOk ? (detections.get(pinned.id) ?? detectItem(pinned, env)) : undefined
    const measurable = !!d && !!d.stratum && !UNMEASURABLE.has(d.status)
    const ranked = dataOk ? rankEligible(ctx, detections, new Set()) : []
    const engineTop = ranked.find((r) => r.item.id !== pinned.id)
    return buildFocus(ctx, pinned, d, {
      pinnedByCoach: true,
      measurable,
      alsoFirst: engineTop ? [checkFrom(engineTop.item, engineTop.detection, 'eligible', `${engineTop.item.title}: what this session would otherwise focus on.`)] : [],
      detections,
      ranked,
    })
  }
  if (!dataOk) return captureFix(ctx, usable)

  // 4. ACTIVE EXPERIMENT (stickiness).
  const cooldowns = { ...(input.cooldowns ?? {}) }
  const exp = input.activeExperiment?.status === 'active' ? input.activeExperiment : undefined
  let expNote: FocusDecision['experiment'] | undefined
  let verdictOut: FocusDecision['verdict'] | undefined
  let transition: Transition | undefined
  if (exp) {
    const expItem = getItem(exp.itemId)
    const kind = retestKind(exp, session)
    if (kind === 'matched' || (kind === 'unmatched' && session.template === 'retest')) {
      const cmp =
        kind === 'matched'
          ? matchedComparison({ exp, session, history, profile, verdict: input.verdict })
          : null
      const result = cmp?.result ?? { verdict: 'not-comparable' as const, method: 'coaching', reason: unmatchedReason(exp, session) }
      const copy = cmp?.copy ?? verdictSentence(result)
      verdictOut = { ...result, copy, metricId: cmp?.request.metricId ?? 'serve-in-rate', rate: cmp?.request.kind === 'rate' }
      transition = experimentTransition(exp, result, cmp?.resolvedMet ?? false, input.practiceLogs ?? [])
      trace.push({ step: 'experiment', itemId: exp.itemId, passed: true, detail: `Re-test verdict ${result.verdict}; transition ${transition.status}.` })
    } else {
      trace.push({ step: 'experiment', itemId: exp.itemId, passed: true, detail: `Not a later matched re-test (${kind}); no transition.` })
    }
    const excluded = !!expItem && expItem.contraindications.some((r) => profile.comfort.has(r))
    const stage = expItem?.detection.chainStage ?? 99
    const earlierMajor = [...detections.values()].find((d) => {
      const it = getItem(d.itemId)
      return (
        !!it &&
        (it.detection.chainStage ?? 99) < stage &&
        d.status === 'eligible' &&
        d.severity === 'major' &&
        !it.contraindications.some((r) => profile.comfort.has(r))
      )
    })
    const continues = !transition || transition.status === 'continue'
    if (expItem && continues && !excluded && !earlierMajor) {
      const d = detectionInStratum(ctx, expItem, exp.stratum) ?? detections.get(expItem.id)
      return buildFocus(ctx, expItem, d, {
        pinnedByCoach: exp.pinnedByCoach ?? false,
        measurable: true,
        experiment: {
          id: exp.id,
          itemId: exp.itemId,
          status: 'continue',
          copy: transition?.copy ?? DECISION_COPY.experiment,
          ...(transition?.variant ? { variant: transition.variant } : {}),
          ...(transition?.swapCue ? { swapCue: true } : {}),
          ...(transition?.unlockProgression ? { unlockProgression: true } : {}),
        },
        verdict: verdictOut,
        stratum: exp.stratum,
        register: transition?.swapCue ? (exp.cueRegister === 'analogy' ? 'outcome' : 'analogy') : exp.cueRegister,
        variant: transition?.variant,
        detections,
        ranked: rankEligible(ctx, detections, new Set([expItem.id])),
      })
    }
    if (expItem) {
      if (earlierMajor && continues) {
        expNote = { id: exp.id, itemId: exp.itemId, status: 'superseded', copy: SUPERSEDED_COPY, cooldownSessions: 3 }
        trace.push({ step: 'experiment', itemId: exp.itemId, passed: false, detail: `Superseded by ${earlierMajor.itemId} (earlier stage, major).` })
      } else if (transition && transition.status !== 'continue') {
        expNote = { id: exp.id, itemId: exp.itemId, status: transition.status, copy: transition.copy, cooldownSessions: transition.cooldownSessions }
      } else if (excluded) {
        expNote = { id: exp.id, itemId: exp.itemId, status: 'parked', copy: 'Your comfort settings rule this focus out for now.', cooldownSessions: 3 }
      }
      // A concluded or superseded item goes on cooldown (§7.4).
      cooldowns[expItem.id] = Math.max(cooldowns[expItem.id] ?? 0, expNote?.cooldownSessions ?? 2)
    }
  }

  // 5. CANDIDATES (comfort, cooldown) and 6. RANK.
  const ranked = rankEligible(ctx, detections, new Set(), cooldowns)
  const comfortBlocked = [...detections.values()].some((d) => d.status === 'eligible' && isComfortExcluded(d.itemId, profile))

  // 7. NOTHING CLEAR.
  if (ranked.length === 0) {
    trace.push({ step: 'select', passed: false, detail: comfortBlocked ? 'Every eligible item is excluded by comfort.' : 'Nothing eligible.' })
    return keepGoing(ctx, detections, {
      ...(comfortBlocked ? { comfortLine: DECISION_COPY.comfortLine } : {}),
      cooldowns,
      experiment: expNote,
      verdict: verdictOut,
    })
  }

  // 8. DECISION.
  const top = ranked[0]
  trace.push({ step: 'select', itemId: top.item.id, passed: true, detail: `Chosen: stage ${top.item.detection.chainStage}, gap ${top.gap.gap.toFixed(2)}.` })
  return buildFocus(ctx, top.item, top.detection, {
    pinnedByCoach: false,
    measurable: true,
    experiment: expNote,
    verdict: verdictOut,
    detections,
    ranked,
    cooldowns,
  })
}

// ---------------------------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------------------------

function referralLevelFor(input: CoachingInput): ReferralLevel | null {
  const bc = input.bodyCheck
  if (bc?.answer === 'red-flag') return bc.level
  if (bc?.answer === 'pain') return 'stop-and-book'
  if (input.activeReferral) return input.activeReferral
  if (input.painFlag) return 'stop-and-book'
  return null
}

const isComfortExcluded = (itemId: string, profile: NormalisedProfile) =>
  (getItem(itemId)?.contraindications ?? []).some((r) => profile.comfort.has(r))

const comfortRegionOf = (itemId: string, profile: NormalisedProfile): BodyRegion | undefined =>
  (getItem(itemId)?.contraindications ?? []).find((r) => profile.comfort.has(r))

// ---------------------------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------------------------

const UNMEASURABLE = new Set<Detection['status']>(['other-view', 'needs-more-serves', 'not-in-frame', 'experimental-off', 'needs-higher-fps', 'not-applicable'])

function rankEligible(ctx: Ctx, detections: Map<string, Detection>, skip: Set<string>, cooldowns: Record<string, number> = {}): Ranked[] {
  const out: Ranked[] = []
  for (const it of FOCUS_ITEMS) {
    if (skip.has(it.id)) continue
    const d = detections.get(it.id)
    if (!d || d.status !== 'eligible') continue
    if (!(d.confidence >= 0.7) || !atLeast(d.severity, 'moderate')) continue
    if (isComfortExcluded(it.id, ctx.profile)) continue
    if ((cooldowns[it.id] ?? 0) > 0) continue
    // Effective experimental items run only with "Show experimental" on (§5.1, §13).
    if (d.pathTier === 'experimental' && !ctx.profile.showExperimental) continue
    out.push(toRanked(it, d, ctx.session, ctx.input.profile.goal))
  }
  out.sort(compareRanked)
  for (const r of out) {
    ctx.trace.push({ step: 'rank', itemId: r.item.id, passed: true, detail: `stage ${r.item.detection.chainStage}, gap ${r.gap.gap.toFixed(2)}, goal ${r.goalMatch}, confidence ${r.detection.confidence.toFixed(2)}` })
  }
  return out
}

function detectionInStratum(ctx: Ctx, it: LibraryItem, key: CoachingStratum): Detection | undefined {
  const scoped: CoachingSession = { ...ctx.session, serves: ctx.session.serves.filter((s) => sameStratum(stratumOf(ctx.session, s), key)) }
  if (!scoped.serves.length) return undefined
  return detectItem(it, { profile: ctx.profile, session: scoped, history: ctx.history })
}

function stratumOf(session: CoachingSession, s: CoachingSession['serves'][number]): CoachingStratum {
  return {
    view: session.view,
    cameraSide: session.cameraSide ?? 'unknown',
    courtSide: s.courtSide ?? session.defaults?.courtSide ?? 'unknown',
    serveNumber: s.serveNumber ?? session.defaults?.serveNumber ?? 'unknown',
    intendedType: s.intendedType ?? session.defaults?.intendedType ?? 'unknown',
    handedness: session.handedness ?? 'right',
  }
}

// ---------------------------------------------------------------------------------------------
// "Why this focus?" lists
// ---------------------------------------------------------------------------------------------

function checkFrom(it: LibraryItem, d: Detection | undefined, status: ItemCheck['status'], text?: string): ItemCheck {
  return {
    itemId: it.id,
    title: it.title,
    status,
    text: text ?? d?.text ?? '',
    ...(d?.metric ? { metric: d.metric } : {}),
  }
}

/** Every focus item with what the engine found, after comfort and cooldown (the "Why?" sheet). */
function allChecks(ctx: Ctx, detections: Map<string, Detection>, focusId: string | undefined, cooldowns: Record<string, number> = {}): ItemCheck[] {
  const out: ItemCheck[] = []
  for (const it of FOCUS_ITEMS) {
    if (it.id === focusId) {
      out.push(checkFrom(it, detections.get(it.id), 'focus'))
      continue
    }
    const d = detections.get(it.id)
    const region = comfortRegionOf(it.id, ctx.profile)
    if (region) {
      out.push(checkFrom(it, d, 'comfort-setting', `${subjectOf(it.id, it.title)}: not coached because of your ${REGION_WORDS[region]} comfort setting.`))
      continue
    }
    if (!d) continue
    if ((cooldowns[it.id] ?? 0) > 0 && d.status !== 'slipped') {
      out.push(checkFrom(it, d, 'on-cooldown', `${subjectOf(it.id, it.title)}: ${DECISION_COPY.onCooldown.toLowerCase()}`))
      continue
    }
    if (d.status === 'not-applicable') continue
    if (d.status === 'eligible' && d.pathTier === 'experimental' && !ctx.profile.showExperimental) {
      out.push(checkFrom(it, d, 'experimental-off', `${subjectOf(it.id, it.title)} is an experimental check, which you haven't switched on.`))
      continue
    }
    out.push(checkFrom(it, d, d.status === 'eligible' ? 'eligible' : (d.status as ItemCheck['status'])))
  }
  return out
}

const NOTICED: readonly ItemCheck['status'][] = [
  'eligible',
  'slipped',
  'possible-only',
  'not-clear-yet',
  'comfort-setting',
  'age-rule',
  'experimental-off',
  'needs-more-sessions',
  'needs-more-serves',
  'not-in-frame',
  'needs-higher-fps',
  'on-cooldown',
]

function alsoConsidered(ctx: Ctx, checks: ItemCheck[], focus: LibraryItem, ranked: Ranked[], first: ItemCheck[]): ItemCheck[] {
  const stage = focus.detection.chainStage ?? 99
  const eligibleIds = new Set(ranked.map((r) => r.item.id))
  const out: ItemCheck[] = [...first]
  const seen = new Set(first.map((c) => c.itemId))
  for (const r of ranked) {
    if (r.item.id === focus.id || seen.has(r.item.id) || out.length >= 3) continue
    const later = (r.item.detection.chainStage ?? 99) > stage
    const reason: ConsideredReason = later ? 'later-stage' : 'smaller-gap'
    out.push(checkFrom(r.item, r.detection, reason, `${subjectOf(r.item.id, r.item.title)}: ${(later ? DECISION_COPY.laterStage : DECISION_COPY.smallerGap).toLowerCase()}`))
    seen.add(r.item.id)
  }
  for (const c of checks) {
    if (seen.has(c.itemId) || c.itemId === focus.id || eligibleIds.has(c.itemId)) continue
    if (!NOTICED.includes(c.status)) continue
    // Experimental items are named, never evidenced, when the toggle is off (research 09 §9).
    out.push(c.status === 'experimental-off' ? { ...c, metric: undefined } : c)
    seen.add(c.itemId)
  }
  void ctx
  return out
}

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

interface FocusOpts {
  pinnedByCoach: boolean
  measurable: boolean
  experiment?: FocusDecision['experiment']
  verdict?: FocusDecision['verdict']
  stratum?: CoachingStratum
  register?: 'analogy' | 'outcome'
  variant?: FocusDecision['drill']['variant']
  alsoFirst?: ItemCheck[]
  detections: Map<string, Detection>
  ranked: Ranked[]
  cooldowns?: Record<string, number>
}

function buildFocus(ctx: Ctx, it: LibraryItem, d: Detection | undefined, o: FocusOpts): FocusDecision {
  const { profile, session, input } = ctx
  const stratum = o.stratum ?? d?.stratum ?? largestStratum(session)?.key ?? fallbackStratum(session)
  const r = d ? toRanked(it, d, session, input.profile.goal) : undefined
  const line = r?.gap.line ?? 'none'
  const measurable = o.measurable && !!d && !UNMEASURABLE.has(d.status)
  const evidence = measurable && d
    ? buildEvidence(it, d, session, ctx.history, profile, line)
    : {
        keyFramePhase: it.evidence.keyFramePhase,
        keyFrameEvent: null,
        compareTo: 'none' as const,
        overlay: it.evidence.overlay,
        stats: [],
        outcomeLine: 'none' as const,
        viewNote: DECISION_COPY.notMeasurable,
      }
  const logs = (input.practiceLogs ?? []).filter((l) => !l.itemId || l.itemId === it.id)
  const rules = practiceLogRules(logs, it.id)
  const register = o.register ?? profile.register
  const cue = chooseCue(it, register, stratum)
  const drill = chooseDrill(it, profile, input.profile.goal, logs, o.variant ? { forceVariant: o.variant } : {})
  const primaryStatus = d?.metric?.value.status
  const effectiveTier = weakestTier([it.evidenceTier, d?.pathTier ?? it.evidenceTier, ...(primaryStatus === 'experimental' ? (['experimental'] as const) : [])])
  const reasons: RankReason[] = []
  if (o.pinnedByCoach) reasons.push({ kind: 'pinned', text: DECISION_COPY.pinned })
  if (o.experiment && o.experiment.status === 'continue') reasons.push({ kind: 'experiment', text: o.experiment.copy })
  const stage = it.detection.chainStage ?? 99
  const beatsLater = o.ranked.some((x) => x.item.id !== it.id && (x.item.detection.chainStage ?? 99) > stage)
  if (!o.pinnedByCoach && (stage <= 3 || beatsLater)) reasons.push({ kind: 'stage', text: stage <= 3 ? DECISION_COPY.stageEarly : DECISION_COPY.stageClearest })
  if (measurable && d) reasons.push({ kind: 'detection', text: d.status === 'eligible' ? d.text : `This session: ${d.text.charAt(0).toLowerCase()}${d.text.slice(1)}`, ...(d.metric ? { metric: d.metric } : {}), ...(d.playerEntered ? { playerEntered: true } : {}) })
  if (!measurable) reasons.push({ kind: 'detection', text: DECISION_COPY.notMeasurable })
  if (evidence.outcomeSentence) reasons.push({ kind: 'outcome', text: evidence.outcomeSentence })
  if (it.goalsServed.includes(input.profile.goal)) reasons.push({ kind: 'goal', text: DECISION_COPY.goal(input.profile.goal) })
  if (session.flags?.fatigue) reasons.push({ kind: 'fatigue', text: DECISION_COPY.fatigue })
  if (measurable && d && (d.path === 'absolute' || d.path === 'population') && !hasHistory(ctx, stratum)) {
    ctx.notes.push(DECISION_COPY.baselineBuilding)
  }
  const checks = allChecks(ctx, o.detections, it.id, o.cooldowns)
  const exp = input.activeExperiment
  const sameSession = exp && exp.itemId === it.id ? sameSessionCheck(it.id, session, profile, exp.stratum) : undefined
  const retested = exp && retestKind(exp, session) === 'matched'
  const due = exp && exp.status === 'active' && exp.itemId === it.id ? retestDue(exp, input.practiceLogs ?? [], ctx.now, retested ? session.startedAt : exp.startedAt) : undefined
  ctx.trace.push({ step: 'cue', itemId: it.id, passed: true, detail: `${cue.register} cue.` })
  ctx.trace.push({ step: 'drill', itemId: it.id, passed: true, detail: `${drill.variant} variant.` })
  return {
    ...baseOf(ctx),
    kind: 'focus',
    itemId: it.id,
    faultId: it.faultId ?? it.id,
    title: it.title,
    phase: it.evidence.keyFramePhase,
    chainStage: it.detection.chainStage,
    stratum,
    cue,
    drill,
    whyItMatters: whyItMatters(it, session, stratum, profile),
    effectiveTier,
    wording: d?.wording ?? 'likely',
    severity: d?.severity ?? 'none',
    pinnedByCoach: o.pinnedByCoach,
    measurable,
    evidence,
    reasons,
    alsoConsidered: alsoConsidered(ctx, checks, it, o.ranked, o.alsoFirst ?? []),
    checks,
    retest: retestPlan(stratum),
    load: loadGuidance(profile, input.profile.goal, input.load, { fatigue: session.flags?.fatigue }),
    ...(o.verdict ? { verdict: o.verdict } : {}),
    ...(o.experiment ? { experiment: o.experiment } : {}),
    ...(sameSession ? { sameSession } : {}),
    ...(due ? { retestDue: due } : {}),
    logHints: {
      suggestRegression: rules.suggestRegression,
      suggestOtherCue: rules.suggestOtherCue,
      progressionUnlocked: !!drill.progression,
    },
    detectionConfidence: d?.confidence ?? 0,
    outcomeGap: r?.gap.gap ?? 0,
  }
}

function hasHistory(ctx: Ctx, key: CoachingStratum): boolean {
  return ctx.history.filter((h) => h.startedAt < ctx.session.startedAt && h.view === key.view).length >= 3
}

function fallbackStratum(session: CoachingSession): CoachingStratum {
  return {
    view: session.view,
    cameraSide: session.cameraSide ?? 'unknown',
    courtSide: session.defaults?.courtSide ?? 'unknown',
    serveNumber: session.defaults?.serveNumber ?? 'unknown',
    intendedType: session.defaults?.intendedType ?? 'unknown',
    handedness: session.handedness ?? 'right',
  }
}

function keepGoing(
  ctx: Ctx,
  detections: Map<string, Detection>,
  o: { pinnedRuledOut?: boolean; comfortLine?: string; cooldowns?: Record<string, number>; experiment?: FocusDecision['experiment']; verdict?: FocusDecision['verdict'] },
): KeepGoingDecision {
  const it = libItem('keep-going')
  const stratum = largestStratum(ctx.session)?.key ?? fallbackStratum(ctx.session)
  const checks = allChecks(ctx, detections, undefined, o.cooldowns)
  ctx.trace.push({ step: 'select', itemId: 'keep-going', passed: true, detail: 'Keep going: nothing clear to change.' })
  return {
    ...baseOf(ctx),
    kind: 'keep-going',
    itemId: 'keep-going',
    title: DECISION_COPY.keepGoingTitle,
    stratum,
    whyItMatters: it.whyItMatters,
    cue: chooseCue(it, ctx.profile.register, stratum),
    drill: chooseDrill(it, ctx.profile, ctx.input.profile.goal, []),
    effectiveTier: it.evidenceTier,
    checks,
    ...(o.comfortLine ? { comfortLine: o.comfortLine } : {}),
    ...(o.pinnedRuledOut ? { pinnedRuledOut: true } : {}),
    load: loadGuidance(ctx.profile, ctx.input.profile.goal, ctx.input.load, { fatigue: ctx.session.flags?.fatigue }),
    ...(o.experiment ? { experiment: o.experiment } : {}),
    ...(o.verdict ? { verdict: o.verdict } : {}),
  }
}

const SEVERITY_RANK = { block: 0, warn: 1, info: 2 } as const

function captureFix(ctx: Ctx, usable: number): CoachingDecision {
  const failing = (ctx.session.qualityChecks ?? []).filter((c) => !c.pass).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const top = failing[0]
  ctx.trace.push({ step: 'data', passed: false, detail: top ? `Capture fix: ${top.id}.` : 'Capture fix: too few usable serves.' })
  const useCheck = top && (ctx.session.captureQuality === 'poor' || top.severity !== 'info')
  return {
    ...baseOf(ctx),
    kind: 'capture-fix',
    issueId: useCheck ? top.id : 'too-few-serves',
    message: useCheck ? top.message : DECISION_COPY.captureTooFew(usable),
    ...(useCheck ? (top.fix ? { fix: top.fix } : {}) : { fix: DECISION_COPY.captureTooFewFix }),
    usableServes: usable,
    captureQuality: ctx.session.captureQuality,
  }
}

/** The warm-up routine (§11.1) with today's comfort notes; offered before sessions and on match day. */
export function warmUpRoutine(profile: NormalisedProfile): WarmUpRoutine {
  const it = libItem('warm-up-routine')
  const comfortNotes = [...profile.comfort].map((r) => it.comfortNotes[r]).filter((x): x is string => !!x)
  const stopEarly = profile.comfort.has('shoulder') || profile.comfort.has('elbow')
  return {
    itemId: 'warm-up-routine',
    title: it.title,
    minutes: it.drill.minutes,
    setup: it.drill.setup,
    steps: stopEarly ? it.drill.steps.slice(0, 2) : [...it.drill.steps],
    closing: 'Done. Same cue tonight.',
    maxServes: stopEarly ? 4 : 10,
    comfortNotes: [...new Set(comfortNotes)],
  }
}
