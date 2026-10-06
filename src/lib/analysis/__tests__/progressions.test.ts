/**
 * The drill ladders, held to the same rules as every other line a player reads,
 * and tied to the drill the report already hands out.
 */
import { CHECK_SERVES, checkDrill, drillCheckLine, everyProgression, progressionFor, stepOf } from '../progressions'
import { FLAWS, type FlawFinding, type FlawId } from '../flaws'
import type { Diagnosis } from '../diagnose'
import type { Triage } from '../triage'
import { drillIdFor } from '../triage'
import { drillFor } from '../verdict'
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
      assert(at >= 0, `${flaw} (${axis ?? 'no axis'}): "${drill!.name}" is not on its ladder`)
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

check('a full basket that falls short is not yet, and so is one past saving', () => {
  const short = checkDrill('shallow_drop', basket('shallow_drop', 'clean', 'clean', 'clean', 'named', 'named', 'named'))!
  assert(short.outcome === 'not_yet', `full basket: ${short.outcome}`)
  // Three named in four read: four of six is out of reach whatever else is filmed.
  const lost = checkDrill('shallow_drop', basket('shallow_drop', 'named', 'named', 'named', 'clean', 'unseen', 'refused'))!
  assert(lost.outcome === 'not_yet', `out of reach: ${lost.outcome}`)
})

check('serves the fault could not be judged on count for nothing either way', () => {
  const c = checkDrill('shallow_drop', basket('shallow_drop', 'clean', 'clean', 'unseen', 'refused', 'unseen', 'clean'))!
  assert(c.read === 3 && c.clean === 3, `read ${c.read}, clean ${c.clean}`)
  assert(c.outcome === 'unread', `three clean of three read is not a pass of four: ${c.outcome}`)
})

check('a fault with no ladder has no check', () => {
  assert(checkDrill('pancake_contact', basket('pancake_contact', 'clean')) === undefined, 'the pancake was checked')
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

report()
