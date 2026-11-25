/**
 * A guided set (C1.1): every ladder has a line a voice can say, every line the
 * set can say keeps the copy rules, and a set played serve by serve says what
 * the serves earned and ends when it has an answer.
 */
import { repLine, setDone, setIntro } from '../guidedSet'
import { tripDrillCheck } from '../tripCheck'
import { everyProgression, filmable, judgeServe, type Judged } from '../analysis/progressions'
import { cueIssues, wordCount } from '../analysis/voice'
import type { FlawId } from '../analysis/flaws'
import type { Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const MIN = 60 * 1000

/** A serve judged clean or named for `flaw`, as the engine files it. */
function serve(i: number, flaw: FlawId, verdict: 'c' | 'n' | 'u'): Session {
  const finding = {
    flaw,
    detected: verdict === 'n',
    signal: 's',
    value: 0.5,
    unit: 'ratio',
    miss: verdict === 'n' ? 0.2 : 0,
    target: [0.6, 1],
    target_tier: 4,
    severity: verdict === 'n' ? 'medium' : 'none',
    // Below the evidence floor: a serve the engine could not judge for this fault.
    confidence: verdict === 'u' ? 0.1 : 0.9,
  }
  return {
    id: `guided-${i}`,
    createdAt: i * 3 * MIN,
    overall: 70,
    fundamentals: [],
    phases: [],
    triage: { status: 'ok' },
    diagnosis: { flaws: [finding] },
  } as unknown as Session
}

/** What the glance says after each serve of a set, in order. */
function play(flaw: FlawId, pattern: string): { line: string; done: boolean }[] {
  const said: { line: string; done: boolean }[] = []
  const serves: Session[] = []
  for (const [i, p] of [...pattern].entries()) {
    const latest = serve(i, flaw, p as 'c' | 'n' | 'u')
    serves.push(latest)
    const trip = tripDrillCheck(serves, latest, undefined, undefined, flaw)
    said.push({ line: repLine(flaw, judgeServe(latest, flaw), trip)!, done: setDone(trip) })
  }
  return said
}

/** Characters a phone's voice reads out by name or skips. */
const UNSPEAKABLE = /[/%°×–—()[\]{}#&*_~|<>@]/

heading('Every ladder has a line a voice can say')
const ladders = everyProgression()
check(`all ${ladders.length} ladders`, () => {
  for (const [flaw, ladder] of ladders) {
    assert(ladder.say.length > 0, `${flaw} has no spoken cue`)
    assert(wordCount(ladder.say) <= 6, `${flaw}: "${ladder.say}" is over six words`)
  }
})

heading('Every line a set can say keeps the copy rules')
check('the intro, every rep, and the result, for every step of every ladder', () => {
  let lines = 0
  for (const [flaw, ladder] of ladders) {
    const said = new Set<string>()
    for (const step of ladder.steps) {
      const intro = setIntro(flaw, step.name)
      // A step with no served ball is never filmed as a set (W5.2).
      assert((intro === undefined) === (step.check.by === 'self'), `${flaw} "${step.name}": intro ${intro ? 'said' : 'withheld'} on a ${step.check.by} step`)
      if (intro) said.add(intro)
    }
    for (const pattern of ['cccccc', 'nnnnnn', 'cncncn', 'uucccccc', 'ncnnc']) {
      for (const { line } of play(flaw, pattern)) said.add(line)
    }
    for (const j of ['clean', 'named', 'unread'] as Judged[]) said.add(repLine(flaw, j, undefined)!)
    for (const line of said) {
      assert(!!line, `${flaw}: an empty line`)
      const issues = cueIssues(line)
      assert(issues.length === 0, `${flaw}: "${line}": ${issues.join(', ')}`)
      assert(!UNSPEAKABLE.test(line), `${flaw}: "${line}" has a character a voice mangles`)
      lines++
    }
  }
  note(`${lines} distinct lines checked`)
})

heading('A set, serve by serve')
const DROP: FlawId = 'shallow_drop'
check('the intro names the step, the count and the cue', () => {
  const line = setIntro(DROP, 'Racket falls')!
  assert(line === 'Racket falls, 6 serves. Let the tip fall behind you.', line)
})
check('a clean serve is counted; a named one is counted and gets the cue again', () => {
  const said = play(DROP, 'cn')
  assert(said[0].line === 'Clean, 1 of 1 without the fault so far.', said[0].line)
  assert(said[1].line === 'Not yet, 1 of 2 without the fault so far. Let the tip fall behind you.', said[1].line)
  assert(!said[0].done && !said[1].done, 'two serves aren’t a set')
})
check('a serve the engine couldn’t judge is said to be that, and counts neither way', () => {
  const said = play(DROP, 'cu')
  assert(said[1].line.startsWith('I couldn’t judge that one'), said[1].line)
  assert(!said[1].line.includes('without the fault so far'), said[1].line)
})
check('a passed set says so and ends', () => {
  const said = play(DROP, 'cccccc')
  const last = said[said.length - 1]
  assert(last.done, 'six clean serves are an answer')
  assert(last.line.includes('passed this step'), last.line)
  note(last.line)
})
check('a set past reaching its bar ends early, and says to stay', () => {
  const said = play(DROP, 'nnn')
  const end = said.findIndex((s) => s.done)
  assert(end >= 0 && end < 6, `ended at serve ${end + 1}`)
  assert(said[end].line.includes('Stay on this step'), said[end].line)
  note(`ended after ${end + 1} serves: ${said[end].line}`)
})

check('a step with no served ball can’t be filmed as a check; a served one and a plain drill can (W5.2)', () => {
  const ladder = everyProgression().find(([f]) => f === 'toss_arm_drops')![1]
  const self = ladder.steps.find((s) => s.check.by === 'self')!
  const served = ladder.steps.find((s) => s.check.by === 'engine')!
  assert(!filmable('toss_arm_drops', self.name), `"${self.name}" was filmable`)
  assert(filmable('toss_arm_drops', served.name), `"${served.name}" wasn’t filmable`)
  assert(filmable('toss_arm_drops', 'A card drill'), 'a plain drill wasn’t filmable')
})

report()
