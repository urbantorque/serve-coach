/**
 * The drill ladders, held to the same rules as every other line a player reads,
 * and tied to the drill the report already hands out.
 */
import {
  CHECK_SERVES,
  checkDrill,
  drillCheckLine,
  drillForMetric,
  everyProgression,
  faultForMetric,
  lastSeverity,
  missSide,
  progressionFor,
  rungFor,
  startingRung,
  stepCheckLine,
  stepOf,
  type Step,
} from '../progressions'
import { DRILLS, FUNDAMENTALS, METRICS, SERVE_TYPES, metricCopy } from '../coaching'
import { CARD_SIGNAL, SIGNALS } from '../tiers'
import type { Drill } from '../types'
import type { ServeType } from '../../storage/prefs'
import { FLAWS, type FlawFinding, type FlawId } from '../flaws'
import type { Diagnosis } from '../diagnose'
import type { Triage } from '../triage'
import { drillIdFor } from '../triage'
import { causalPlan, drillFor } from '../verdict'
import type { Severity } from '../tiers'
import { cueIssues } from '../voice'
import { assert, check, heading, note, report } from './harness'

const named = FLAWS.filter((f) => !f.notNamed).map((f) => f.flaw)

heading('Every fault the engine names has a ladder')

check('a ladder for each named fault, and none for the one never named', () => {
  for (const flaw of named) assert(progressionFor(flaw) !== undefined, `${flaw} has no ladder`)
  assert(progressionFor('pancake_contact') === undefined, 'the pancake has a ladder it can never be shown')
})

check('three to five steps, and a bar inside one basket', () => {
  for (const [flaw, p] of everyProgression()) {
    assert(p.steps.length >= 3 && p.steps.length <= 5, `${flaw}: ${p.steps.length} steps`)
    assert(p.pass >= 1 && p.pass <= CHECK_SERVES, `${flaw}: a bar of ${p.pass} of ${CHECK_SERVES}`)
    assert(new Set(p.steps.map((s) => s.name)).size === p.steps.length, `${flaw}: a step named twice`)
  }
})

heading('The report’s drill is a rung on its own ladder')

check('for every fault and every axis, the drill on the card is one of the steps', () => {
  for (const flaw of named) {
    for (const axis of [undefined, 'depth', 'lateral'] as const) {
      const p = progressionFor(flaw, axis)!
      const drill = drillFor(drillIdFor(flaw, axis))
      assert(drill !== undefined, `${flaw}: no drill on the card`)
      const at = stepOf(p, drill!)
      assert(at >= 0, `${flaw} (${axis ?? 'no axis'}): "${drill!.name}" isn’t on its ladder`)
    }
  }
  note(
    everyProgression()
      .map(([flaw, p]) => `${flaw}: step ${stepOf(p, drillFor(drillIdFor(flaw))!) + 1} of ${p.steps.length}`)
      .join(' · '),
  )
})

heading('Every line passes the copy rules')

check('cues, steps, the easier way in and the mistake all pass the lint', () => {
  const failures: string[] = []
  for (const [flaw, p] of everyProgression()) {
    const lines = [p.cue, p.easier, p.mistake, ...p.steps.map((s) => s.how)]
    for (const line of lines) {
      const issues = cueIssues(line)
      if (issues.length) failures.push(`${flaw}: "${line}" — ${issues.join('; ')}`)
    }
  }
  assert(failures.length === 0, failures.join('\n'))
})

check('no step asks for a pause or a freeze in the swing', () => {
  // Holding a position mid-serve is how a player learns to stop at the top and
  // start again from still — the hitch. The coaching sources that use holds say
  // so, and the ladders were written without them.
  for (const [flaw, p] of everyProgression()) {
    for (const s of p.steps) {
      assert(!/\b(pause|freeze|stop)\b/i.test(s.how), `${flaw}: "${s.name}" asks the swing to stop`)
    }
  }
})

check('"drop" is only ever the racket drop', () => {
  // The app owns the word: the ball falls, the racket drops.
  for (const [flaw, p] of everyProgression()) {
    for (const line of [p.cue, p.easier, p.mistake, ...p.steps.map((s) => s.how)]) {
      assert(!/\bball (drops|dropping)\b|\bdrop the ball\b/i.test(line), `${flaw}: "${line}" drops a ball`)
    }
  }
})

heading('A basket checks the step')

/** A swept serve as the check reads it: the one finding, and whether the clip was read. */
function serve(flaw: FlawId, verdict: 'clean' | 'named' | 'unseen' | 'refused') {
  return {
    triage: { status: verdict === 'refused' ? 'rejected' : 'ok' } as Triage,
    diagnosis: {
      flaws:
        verdict === 'refused'
          ? []
          : [{ flaw, detected: verdict === 'named', confidence: verdict === 'unseen' ? 0.2 : 0.9 } as FlawFinding],
    } as unknown as Diagnosis,
  }
}
const basket = (flaw: FlawId, ...v: ('clean' | 'named' | 'unseen' | 'refused')[]) => v.map((x) => serve(flaw, x))

check('enough clean serves pass the step, at the ladder’s own bar', () => {
  // shallow_drop asks for four of six.
  const c = checkDrill('shallow_drop', basket('shallow_drop', 'clean', 'clean', 'named', 'clean', 'clean', 'named'))!
  assert(c.outcome === 'passed', `outcome ${c.outcome}`)
  assert(c.read === 6 && c.clean === 4 && c.need === 4, `read ${c.read}, clean ${c.clean}, need ${c.need}`)
})

check('a full basket that falls short isn’t yet, and so is one past saving', () => {
  const short = checkDrill('shallow_drop', basket('shallow_drop', 'clean', 'clean', 'clean', 'named', 'named', 'named'))!
  assert(short.outcome === 'not_yet', `full basket: ${short.outcome}`)
  // Three named in four read: four of six is out of reach whatever else is filmed.
  const lost = checkDrill('shallow_drop', basket('shallow_drop', 'named', 'named', 'named', 'clean', 'unseen', 'refused'))!
  assert(lost.outcome === 'not_yet', `out of reach: ${lost.outcome}`)
})

check('serves the fault couldn’t be judged on count for nothing either way', () => {
  const c = checkDrill('shallow_drop', basket('shallow_drop', 'clean', 'clean', 'unseen', 'refused', 'unseen', 'clean'))!
  assert(c.read === 3 && c.clean === 3, `read ${c.read}, clean ${c.clean}`)
  assert(c.outcome === 'unread', `three clean of three read isn’t a pass of four: ${c.outcome}`)
})

check('a fault with no ladder has no check', () => {
  assert(checkDrill('pancake_contact', basket('pancake_contact', 'clean')) === undefined, 'the pancake was checked')
})

heading('No drill stops the swing, and one source per fault (L1.4)')

/**
 * Whether a drill asks the player to stop the motion: a freeze, a pause, a held
 * position counted in seconds or in holds, or a basket on the toes. A pause
 * practised is a pause learned, which is how a hitch is taught. "Without a
 * single pause" is the opposite instruction and is set aside first.
 */
function stopsTheSwing(d: Drill): boolean {
  const how = d.how.replace(/(without (a single )?|never )pause/gi, '')
  return (
    /\b(freeze|frozen|pause|stop dead)\b/i.test(how) ||
    /\bhold\b[^.]*\bseconds?\b/i.test(how) ||
    /heels off/i.test(how) ||
    /\bholds\b/i.test(d.reps)
  )
}

check('no drill the app can hand out asks the swing to stop', () => {
  const reachable: [string, Drill][] = [
    ...Object.entries(DRILLS).map(([k, d]) => [`DRILLS.${k}`, d] as [string, Drill]),
    ...Object.entries(FUNDAMENTALS).map(([k, f]) => [`area ${k}`, f.drill] as [string, Drill]),
    ...everyProgression().flatMap(([flaw, p]) => p.steps.map((s) => [`${flaw} ladder`, s] as [string, Drill])),
  ]
  for (const id of Object.keys(METRICS)) {
    for (const type of Object.keys(SERVE_TYPES) as ServeType[]) {
      for (const axis of [undefined, 'depth', 'lateral'] as const) {
        const copy = metricCopy(id, type, axis)
        if (copy?.drill) reachable.push([`${id} (${type}${axis ? `, ${axis}` : ''})`, copy.drill])
      }
    }
  }
  const stopping = reachable.filter(([, d]) => stopsTheSwing(d))
  note(`${reachable.length} drills read`)
  assert(stopping.length === 0, stopping.map(([where, d]) => `${where}: "${d.name}"`).join('; '))
  // And every fix line, which a player reads as an instruction too (N7.3): two
  // asked for a basket on the toes after the drills had stopped doing so.
  const fixes: string[] = []
  for (const id of Object.keys(METRICS)) {
    for (const type of Object.keys(SERVE_TYPES) as ServeType[]) {
      for (const axis of [undefined, 'depth', 'lateral'] as const) {
        const copy = metricCopy(id, type, axis)
        for (const line of Object.values(copy?.fix ?? {})) {
          if (line && stopsTheSwing({ name: id, how: line, reps: '' })) fixes.push(`${id} (${type}): "${line}"`)
        }
      }
    }
  }
  assert(fixes.length === 0, `a fix line stops the swing: ${fixes.join('; ')}`)
  // The detector itself, against the drills it was written for.
  assert(stopsTheSwing({ name: 'x', how: 'Pause at the drop with the elbow high.', reps: '10 holds' }), 'missed a pause')
  assert(stopsTheSwing({ name: 'x', how: 'Sink, hold two seconds, drive up.', reps: '8' }), 'missed a timed hold')
  assert(!stopsTheSwing({ name: 'x', how: 'Accelerate without a single pause until the ball leaves.', reps: '5' }), 'flagged the cure')
})

check("a ladder goes only with a miss on its own fault's side (N7.3)", () => {
  let read = 0
  for (const card of Object.keys(CARD_SIGNAL)) {
    const flaw = faultForMetric(card)
    if (!flaw) continue
    const direction = SIGNALS[CARD_SIGNAL[card]].direction
    const ideal = METRICS[card].ideal
    assert(missSide({ value: ideal[0] - 1, ideal }) === 'low', `${card}: a value under the band isn’t low`)
    assert(missSide({ value: ideal[1] + 1, ideal }) === 'high', `${card}: a value over the band isn’t high`)
    assert(missSide({ value: (ideal[0] + ideal[1]) / 2, ideal }) === undefined, `${card}: the middle of the band missed`)
    if (direction === 'higher') {
      assert(faultForMetric(card, 'low') === flaw, `${card}: a miss under the band lost ${flaw}`)
      assert(faultForMetric(card, 'high') === undefined, `${card}: a miss over the band handed out ${flaw}`)
      read++
    }
    if (direction === 'lower') {
      assert(faultForMetric(card, 'high') === flaw, `${card}: a miss over the band lost ${flaw}`)
      assert(faultForMetric(card, 'low') === undefined, `${card}: a miss under the band handed out ${flaw}`)
      read++
    }
  }
  note(`${read} one-sided rows checked`)
  // The case that was found: contact far in front walked back towards contact behind the head.
  const own = { name: 'own', how: 'own', reps: 'own' }
  assert(drillForMetric('contactAhead', own, undefined, undefined, 'high').drill === own, 'contact far in front got the contact-behind ladder')
  assert(drillForMetric('contactAhead', own, undefined, undefined, 'low').drill !== own, 'contact behind the head lost its ladder')
  assert(!METRICS.contactAhead.fix.high, 'contact far in front is told to pull the toss back again')
})

check("a card row that is a fault's number hands out that fault's ladder", () => {
  for (const card of Object.keys(CARD_SIGNAL)) {
    const flaw = faultForMetric(card)
    assert(flaw !== undefined, `${card} reads a fault's number and maps to none`)
    const ladder = progressionFor(flaw!)
    if (!ladder) continue
    const own = { name: 'own', how: 'own', reps: 'own' }
    const { drill } = drillForMetric(card, own)
    // With no rung stored, the rung the report's plan starts at.
    assert(drill === ladder.steps[rungFor(flaw!, ladder)], `${card}: "${drill.name}"`)
    // And at the newest report's severity, the very step that report's plan started on (L4.2).
    for (const severity of ['high', 'medium', 'low'] as const) {
      const at = drillForMetric(card, own, undefined, severity).drill
      assert(at === ladder.steps[startingRung(ladder, severity)], `${card} (${severity}): "${at.name}"`)
    }
  }
  // And a row no fault is judged on keeps its own.
  const own = { name: 'own', how: 'own', reps: 'own' }
  assert(drillForMetric('armExtension', own).drill === own, 'a row with no fault lost its own drill')
})

check('every line a check can print passes the copy rules', () => {
  const lines = [
    drillCheckLine({ flaw: 'shallow_drop', read: 6, clean: 5, need: 4, outcome: 'passed' }),
    drillCheckLine({ flaw: 'shallow_drop', read: 6, clean: 2, need: 4, outcome: 'not_yet' }),
    drillCheckLine({ flaw: 'shallow_drop', read: 2, clean: 2, need: 4, outcome: 'unread' }),
  ]
  for (const line of lines) {
    const issues = cueIssues(line)
    assert(issues.length === 0, `"${line}": ${issues.join('; ')}`)
  }
})

heading('A ladder that starts where the player is (L4.2)')

/** A report naming one fault at one severity, as the plan reads it. */
function namedAt(flaw: FlawId, severity: Severity) {
  const triage = {
    status: 'ok',
    primary_flaw: { flaw, group: 'x', signal: 'x', value: 0, unit: 'ratio', target: [1, 2], target_tier: 3, severity },
    injury_risk: [],
    suppressed_count: 0,
  } as unknown as Triage
  const diagnosis = {
    flaws: [{ flaw, detected: true, severity, confidence: 0.9, value: 0, target: [1, 2] } as unknown as FlawFinding],
  } as unknown as Diagnosis
  return { triage, diagnosis }
}

check('a serious fault starts on the most guided step, a slight one nearer the match, never on the last', () => {
  const rows: string[] = []
  for (const [flaw, p] of everyProgression()) {
    const [high, medium, low] = (['high', 'medium', 'low'] as const).map((s) => startingRung(p, s))
    assert(high === 0, `${flaw}: a serious fault starts on step ${high + 1}`)
    assert(high < medium && medium <= low, `${flaw}: ${high}, ${medium}, ${low} isn’t in order`)
    assert(low <= p.steps.length - 2, `${flaw}: a slight fault starts on the match step`)
    assert(startingRung(p) === medium && startingRung(p, 'none') === medium, `${flaw}: no grade didn’t start at medium`)
    rows.push(`${flaw} ${high + 1}/${medium + 1}/${low + 1} of ${p.steps.length}`)
  }
  note(rows.join(' · '))
})

check('seeded severities map to the rung the plan hands out, and a moved rung wins', () => {
  for (const flaw of named) {
    const ladder = progressionFor(flaw)!
    for (const severity of ['high', 'medium', 'low'] as const) {
      const { triage, diagnosis } = namedAt(flaw, severity)
      const plan = causalPlan(triage, diagnosis)
      const want = ladder.steps[startingRung(ladder, severity)]
      assert(plan[0]?.drill.name === want.name, `${flaw} (${severity}): "${plan[0]?.drill.name}", not "${want.name}"`)
      assert(rungFor(flaw, ladder, undefined, severity) === stepOf(ladder, plan[0].drill), `${flaw}: the rung and the plan disagree`)
    }
    assert(rungFor(flaw, ladder, { [flaw]: ladder.steps.length - 1 }, 'high') === ladder.steps.length - 1, `${flaw}: a moved rung lost`)
  }
})

check('the season card starts from the newest report that named the fault', () => {
  const at = (createdAt: number, severity: Severity, detected = true) => ({
    createdAt,
    diagnosis: { flaws: [{ flaw: 'shallow_drop', detected, severity }] } as unknown as Diagnosis,
  })
  assert(lastSeverity([at(1, 'low'), at(3, 'high'), at(2, 'medium')], 'shallow_drop') === 'high', 'not the newest')
  assert(lastSeverity([at(1, 'low'), at(5, 'high', false)], 'shallow_drop') === 'low', 'a clean report set the grade')
  assert(lastSeverity([], 'shallow_drop') === undefined, 'a grade out of nothing')
})

check('every step declares how it is passed: the app on served balls, the player on the rest', () => {
  // Type-level: a drill that does not say how it is passed is not a step.
  // @ts-expect-error — `check` is required.
  const bare: Step = { name: 'x', how: 'x', reps: 'x' }
  void bare
  // Steps whose serve the engine cannot read as a serve: seated, or started
  // with the racket already up behind the back.
  const MODIFIED = new Set(['Seated serves', 'Racket-up serves'])
  const failures: string[] = []
  let engine = 0
  let self = 0
  for (const flaw of named) {
    for (const axis of [undefined, 'depth', 'lateral'] as const) {
      const p = progressionFor(flaw, axis)!
      for (const s of p.steps) {
        const by = s.check?.by
        if (by !== 'engine' && by !== 'self') {
          failures.push(`${flaw}: "${s.name}" has no check`)
          continue
        }
        const balls = /\b(serves|points|rounds|pairs)\b/.test(s.reps) && !MODIFIED.has(s.name)
        if (balls !== (by === 'engine')) failures.push(`${flaw}: "${s.name}" (${s.reps}) is checked by ${by}`)
        const line = stepCheckLine(p, s)
        const issues = cueIssues(line)
        if (issues.length) failures.push(`${flaw}: "${line}" — ${issues.join('; ')}`)
        if (axis === undefined && by === 'engine') engine++
        else if (axis === undefined) self++
      }
    }
  }
  note(`${engine} steps the app checks, ${self} the player checks`)
  assert(failures.length === 0, failures.join('\n'))
  // And the most like a match is always the app's to judge.
  for (const [flaw, p] of everyProgression()) {
    assert(p.steps[p.steps.length - 1].check.by === 'engine', `${flaw}: the last step is self-checked`)
  }
})

report()
