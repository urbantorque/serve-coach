/**
 * The practice session's screen, rendered at every stage, and every sentence
 * its dashboard can say (L2.8).
 *
 * The lines are the engine's own: the rig's serves read through `lineOf`, the
 * way a session reads them, so the dashboard is drawn from the shapes storage
 * holds. The copy checks walk every reading and every fault the dashboard can
 * name, through the same `cueIssues` the coaching copy answers to.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Session, { type SessionStage } from '../../screens/Session'
import SessionDashboard from '../SessionDashboard'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { lineOf } from '../../lib/session/line'
import { normalisePracticeSession, type PracticeSession } from '../../lib/session/session'
import { driftLine, fixCountLine, goneLine, headlineOf, noFixLine, sinceLine, unsureLine } from '../../lib/session/sessionCopy'
import { sessionStats } from '../../lib/session/stats'
import { servesPerWeek } from '../../lib/progress'
import { FLAWS } from '../../lib/analysis/flaws'
import { progressionFor, startingRung } from '../../lib/analysis/progressions'
import { CARD_NOISE_SD } from '../../lib/analysis/consistency'
import { cueIssues } from '../../lib/analysis/voice'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

const found = Array.from({ length: 14 }, (_, i) => 6 + i * 12)
const lines = found.map((t, i) =>
  i === 3
    ? { number: i + 1, t, status: 'unclear' as const }
    : lineOf(
        sampleAnalysis({ seed: 9100 + i, dropBelowShoulder: -0.2, contactReach: i >= 10 ? 1.16 : 1.34 }),
        i + 1,
        t,
      ),
)

const session: PracticeSession = {
  id: 'practice-test',
  createdAt: Date.UTC(2026, 9, 9),
  updatedAt: Date.UTC(2026, 9, 9),
  fileName: 'Tuesday basket.mov',
  duration: 200,
  serveType: 'flat',
  handedness: 'right',
  mode: 'every',
  found,
  chosen: found.map((_, i) => i),
  lines,
  phase: 'done',
  scoringVersion: 5,
  stills: { 1: 'data:image/jpeg;base64,AAAA' },
}

const noop = () => {}
const draw = (over: Partial<PracticeSession>, stage: SessionStage, canRead = true, previous?: PracticeSession) =>
  renderToStaticMarkup(
    createElement(Session, {
      session: { ...session, ...over },
      previous,
      stage,
      canRead,
      onStart: noop,
      onStop: noop,
      onPickAgain: noop,
      onLeave: noop,
    }),
  )

heading('Every stage draws')

check('the plan, before the file is timed and after', () => {
  const fresh = { found: undefined, chosen: undefined, lines: [], phase: 'locating' as const, duration: 600 }
  const timing = draw(fresh, { state: 'planning', timed: false })
  assert(timing.includes('Timing your phone on this video…'), 'the timing line is missing')
  const priced = draw(fresh, { state: 'planning', timed: true, perSampleMs: 120 })
  assert(priced.includes('A sample of 12') && priced.includes('Every serve'), 'a choice is missing')
  assert(/About \d+ minutes|About a minute/.test(priced), 'no time was quoted on a timed file')
  const untimed = draw(fresh, { state: 'planning', timed: true })
  assert(untimed.includes('I could not time your phone'), 'an untimed file did not say so')
})

check('reading, paused, and a session reopened without its file', () => {
  const half = { phase: 'reading' as const, lines: lines.slice(0, 5) }
  const running = draw(half, { state: 'running', ratio: 0.5, detail: 'Reading serve 6 of 14' })
  assert(running.includes('Reading serve 6 of 14') && running.includes('Stop and keep what is read'), 'the reading screen is incomplete')
  const paused = draw(half, { state: 'paused', reason: 'hidden', perSampleMs: 120 })
  assert(paused.includes('went into the background') && paused.includes('5 of 14 serves read'), 'the pause did not say why or where')
  const reopened = draw({ ...half, phase: 'stopped' }, { state: 'paused', reason: 'player' }, false)
  assert(reopened.includes('Pick the video') && reopened.includes('9 to go'), 'a reopened session did not ask for its file')
})

check('the finished session draws every part it has data for', () => {
  const previous = { ...session, id: 'practice-before', createdAt: session.createdAt - 7 * 864e5, lines: lines.slice(0, 9) }
  const done = draw({}, { state: 'done' }, false, previous)
  for (const part of ['What to work on', 'Start against end', 'Every serve', 'Best and worst', 'Since last session', 'All 14 serves']) {
    assert(done.includes(part), `"${part}" is missing`)
  }
  assert(done.includes('data:image/jpeg;base64,AAAA'), 'the kept still was not drawn')
  const withUnsure = draw({ unsure: [40, 90] }, { state: 'done' }, false)
  assert(withUnsure.includes('2 overheads reached like a serve'), 'the overheads left out were not counted')
  assert(done.includes('session-pick-blank'), 'a serve with no still did not get a blank')
  const one = draw({ lines: lines.slice(0, 1) }, { state: 'done' })
  assert(!one.includes('Every serve'), 'a section with nothing to draw kept its heading')
  const none = draw({ found: [], chosen: [], lines: [] }, { state: 'done' })
  assert(none.includes('I could not find a serve in this video.'), 'a session with no serves said something else')
})

check('a stored session comes back with its stills and rubric, and nothing that is not a picture', () => {
  const back = normalisePracticeSession(
    JSON.parse(JSON.stringify({ ...session, stills: { 1: session.stills![1], x: 'data:image/jpeg;a', 2: 'javascript:alert(1)' } })),
  )!
  assert(back.scoringVersion === 5, 'the rubric was lost')
  assert(JSON.stringify(Object.keys(back.stills!)) === '["1"]', `kept stills ${JSON.stringify(back.stills)}`)
})

check('with the video open the best and worst serves play; without it, the player is asked for it', () => {
  const open = renderToStaticMarkup(createElement(SessionDashboard, { session, videoUrl: 'blob:session' }))
  assert((open.match(/Watch the serve at/g) ?? []).length === 6, 'not every pick could be watched')
  const closed = renderToStaticMarkup(createElement(SessionDashboard, { session, onPickAgain: noop }))
  assert(!closed.includes('Watch the serve at'), 'a pick offered to play with no video open')
  assert(closed.includes('Pick the same video again to watch these serves'), 'the way to watch them was not offered')
})

heading('What the dashboard says')

check('every sentence it can build passes the copy rules', () => {
  const stats = sessionStats(lines)
  const said: string[] = [headlineOf(stats), sinceLine(70, 64), sinceLine(70, 70)]
  for (const id of Object.keys(CARD_NOISE_SD)) {
    for (const [early, late] of [
      [0, 1e3],
      [1e3, 0],
      [0.5, 0.6],
    ]) {
      said.push(driftLine({ id, early, late, gap: late - early, strength: 4, earlyServes: 5, lateServes: 5 }))
    }
  }
  for (const spec of FLAWS) {
    said.push(goneLine(spec.flaw))
    said.push(fixCountLine({ flaw: spec.flaw, judged: 30, named: 21, rate: 0.7, verdict: true }, 40))
    said.push(fixCountLine({ flaw: spec.flaw, judged: 40, named: 21, rate: 0.5, verdict: true }, 40))
    said.push(
      headlineOf({ ...stats, drifts: [], faults: [{ flaw: spec.flaw, judged: 30, named: 21, rate: 0.7, verdict: true }] }),
    )
  }
  said.push(headlineOf({ ...stats, read: 0 }), headlineOf({ ...stats, drifts: [], faults: [] }))
  said.push(headlineOf({ ...stats, read: 1, drifts: [], faults: [] }), noFixLine(1), noFixLine(20))
  said.push(unsureLine(1), unsureLine(4))
  assert(!headlineOf({ ...stats, read: 1, drifts: [], faults: [] }).includes('most of them'), 'one serve was said to be most of them')
  const failing = said.filter((s) => cueIssues(s).length).map((s) => `"${s}": ${cueIssues(s).join('; ')}`)
  assert(failing.length === 0, failing.slice(0, 4).join('\n'))
})

heading('Serves per week')

check('a session counts every serve it found, not one', () => {
  const now = Date.UTC(2026, 9, 9, 12)
  const weeks = servesPerWeek([], now, 2, [{ createdAt: now - 3600e3, found }])
  assert(weeks[weeks.length - 1].serves === found.length, `this week counted ${weeks[weeks.length - 1].serves}`)
  assert(servesPerWeek([], now, 2)[1].serves === 0, 'a week with nothing in it counted serves')
})

heading('A fix leads to its drill (Q11)')

check("each fix names the drill at the player's own step, with how to do it, and the first opens the court card", () => {
  const fixes = sessionStats(lines).faults.filter((f) => f.verdict)
  assert(fixes.length > 0, 'the test session has no fix, so this checks nothing')
  const flaw = fixes[0].flaw
  const ladder = progressionFor(flaw)!
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
  const on = Math.min(2, ladder.steps.length - 1)
  const moved = renderToStaticMarkup(createElement(SessionDashboard, { session, ladder: { [flaw]: on } }))
  assert(moved.includes(esc(ladder.steps[on].name)), "the fix did not name the player's own step")
  assert(moved.includes(`step ${on + 1} of ${ladder.steps.length}`), 'the step was not placed on its ladder')
  assert(moved.includes(esc(ladder.steps[on].how)), 'the drill came without how to do it')
  assert((moved.match(/Open the court card/g) ?? []).length === 1, 'the court card is offered on more than the first fix, or not at all')
  const fresh = renderToStaticMarkup(createElement(SessionDashboard, { session }))
  const start = startingRung(ladder)
  assert(fresh.includes(`step ${start + 1} of ${ladder.steps.length}`), 'a ladder never moved did not start where the plan starts it')
})

report()
