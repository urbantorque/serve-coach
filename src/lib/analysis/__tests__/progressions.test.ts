/**
 * The drill ladders, held to the same rules as every other line a player reads,
 * and tied to the drill the report already hands out.
 */
import { CHECK_SERVES, everyProgression, progressionFor, stepOf } from '../progressions'
import { FLAWS } from '../flaws'
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

report()
