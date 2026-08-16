/**
 * Reading back what a pass actually cost, off the history.
 *
 * `Analysis.cost` has been written on every report since it was added and read
 * by nothing, which made it the one measurement in this repo that existed and
 * was never consulted — while a dozen files went on reasoning with "about half
 * a minute", a figure nobody had ever checked against a device.
 *
 * What is pinned here is mostly what it refuses to say: no figure off one or
 * two passes, and never an average across a cold engine and a warm one.
 */
import { MIN_TIMINGS, coldTimingLine, timingLine, timingsOf } from '../timings'
import { throttleProgress } from '../analyze'
import type { Session } from '../../storage/db'
import { assert, check, heading, report } from './harness'

const at = (ms: number | undefined, coldEngine = false): Session =>
  ({ cost: ms === undefined ? undefined : { ms, coldEngine } }) as unknown as Session

heading('What the history says a serve costs')

check('fewer than three warm passes says nothing at all', () => {
  for (let n = 0; n < MIN_TIMINGS; n++) {
    const history = Array.from({ length: n }, () => at(20_000))
    assert(timingsOf(history) === undefined, `${n} passes produced a figure`)
  }
})

check('three warm passes produce a median and a range', () => {
  const t = timingsOf([at(18_000), at(22_000), at(30_000)])
  assert(t !== undefined, 'three passes produced nothing')
  assert(t!.medianMs === 22_000, `median was ${t!.medianMs}`)
  assert(t!.fastestMs === 18_000 && t!.slowestMs === 30_000, 'the range is wrong')
  assert(t!.n === 3, `counted ${t!.n} passes`)
})

check('a cold start never enters the warm figures', () => {
  // A cold pass includes a 19 MB download, so folding it in would report
  // somebody's signal as a property of their phone.
  const t = timingsOf([at(18_000), at(19_000), at(20_000), at(90_000, true)])
  assert(t!.n === 3, `a cold pass was counted as warm: n=${t!.n}`)
  assert(t!.slowestMs === 20_000, `the cold pass leaked into the range: ${t!.slowestMs}`)
  assert(t!.cold === 1, `cold passes counted: ${t!.cold}`)
})

check('one cold start is counted and not yet reported', () => {
  const t = timingsOf([at(18_000), at(19_000), at(20_000), at(90_000, true)])
  assert(t!.coldMedianMs === undefined, 'a single cold pass was reported as a figure')
  assert(coldTimingLine(t) === undefined, 'a single cold pass reached a sentence')
})

check('three cold starts get their own figure, said as its own thing', () => {
  const t = timingsOf([
    at(18_000), at(19_000), at(20_000),
    at(80_000, true), at(90_000, true), at(100_000, true),
  ])
  assert(t!.coldMedianMs === 90_000, `cold median was ${t!.coldMedianMs}`)
  const line = coldTimingLine(t)!
  assert(/19 MB/.test(line), `the cold line does not say what is in it: "${line}"`)
})

check('reports with no cost on them are simply not counted', () => {
  // Every report filed before the field existed, and every dev fixture.
  const t = timingsOf([at(undefined), at(undefined), at(18_000), at(19_000), at(20_000)])
  assert(t!.n === 3, `counted ${t!.n} of three timed passes`)
})

check('a nonsense duration is dropped rather than averaged in', () => {
  const t = timingsOf([
    at(18_000), at(19_000), at(20_000),
    at(0), at(-5), at(Number.NaN), at(Number.POSITIVE_INFINITY),
  ])
  assert(t!.n === 3, `junk durations were counted: n=${t!.n}`)
})

check('the line names the spread, not just the middle', () => {
  // A phone that reads a serve in 12 s and sometimes in 40 is throttling, and
  // a median on its own hides exactly that.
  const line = timingLine(timingsOf([at(12_000), at(20_000), at(40_000)]))!
  assert(/12/.test(line) && /40/.test(line), `the range is missing: "${line}"`)
  assert(/3 serves/.test(line), `the count is missing: "${line}"`)
})

check('no readings, no sentence', () => {
  assert(timingLine(undefined) === undefined, 'a missing figure produced a sentence')
})

/* ------------------------------------------- progress on its way to a screen */

heading('How often the analysing screen is asked to redraw')

check('progress within one step is rate-limited', () => {
  const seen: string[] = []
  let now = 0
  const to = throttleProgress((p) => seen.push(`${p.step}:${p.ratio}`), 100, () => now)
  // Twenty reports over a tenth of a second, which is what a tracking pass does.
  for (let i = 0; i < 20; i++) {
    now += 5
    to({ step: 'tracking', ratio: i / 20 })
  }
  assert(seen.length <= 2, `${seen.length} of 20 reports reached the screen`)
})

check('a change of step is never dropped, whatever the clock says', () => {
  // Each step is a different sentence on screen, not a finer reading of the
  // same one — holding one back leaves the screen describing the wrong phase.
  const seen: string[] = []
  const now = 0
  const to = throttleProgress((p) => seen.push(p.step), 100, () => now)
  to({ step: 'engine', ratio: 0 })
  to({ step: 'scanning', ratio: 0 })
  to({ step: 'tracking', ratio: 0 })
  to({ step: 'measuring', ratio: 0 })
  assert(
    seen.join() === 'engine,scanning,tracking,measuring',
    `steps were dropped: ${seen.join()}`,
  )
})

check('the last report always lands', () => {
  // Without this the bar keeps whatever percentage it happened to be shown.
  const seen: string[] = []
  let now = 0
  const to = throttleProgress((p) => seen.push(`${p.step}:${p.ratio}`), 100, () => now)
  to({ step: 'done', ratio: 1 })
  now += 1
  to({ step: 'done', ratio: 1 })
  assert(seen.length === 2, `a finished pass reported ${seen.length} times, expected 2`)
})

report()
