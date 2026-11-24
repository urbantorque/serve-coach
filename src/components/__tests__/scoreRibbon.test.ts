/**
 * The chart a player reads as evidence of progress.
 *
 * A dot in the wrong place is not a cosmetic bug: it is the app asserting
 * something about somebody's serve that did not happen. The rubric break is what
 * most of this is about. A recalibration moves a saved score with the player
 * having done nothing, and a saved report keeps no frames, so old numbers can
 * never be brought onto the new scale. A line joining those two dots draws the
 * recalibration as a climb, beside a delta chip that has correctly refused to
 * report any change at all. Of the two, the player believes the line.
 *
 * Read off the drawn chart, because the geometry and the drawing are one thing
 * now: the axis fits the player's own range, which is what the old nought to a
 * hundred could not do.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { ScoreRibbon } from '../ProgressCharts'
import type { TripPoint } from '../../lib/progress'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const W = 350
const H = 196

const point = (overall: number, scoringVersion: number, i: number, spread = 3): TripPoint =>
  ({
    id: `t${i}`,
    overall,
    scoringVersion,
    createdAt: (i + 1) * 86_400_000,
    low: overall - spread,
    high: overall + spread,
    serves: spread ? 4 : 1,
  }) as unknown as TripPoint

const series = (values: number[], version = 5) => values.map((v, i) => point(v, version, i))
/** Three trips under the old rubric, two under the new. */
const recalibrated = [40, 44, 42].map((v, i) => point(v, 4, i)).concat([76, 78].map((v, i) => point(v, 5, i + 3)))

const draw = (points: TripPoint[]) => renderToStaticMarkup(createElement(ScoreRibbon, { points }))
const dots = (out: string) => [...out.matchAll(/<circle class="ribbon-dot[^"]*" cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
const rules = (out: string) => [...out.matchAll(/<line class="ribbon-break" x1="([\d.]+)"/g)].map((m) => Number(m[1]))

heading('Putting the dots where the scores are')

check('every point lands inside the box', () => {
  for (const values of [[70, 74, 71, 80], [100, 99, 100], [0, 2, 1], [55]]) {
    for (const d of dots(draw(series(values)))) {
      assert(d.x >= 0 && d.x <= W && d.y >= 0 && d.y <= H, `a dot at ${d.x},${d.y} is outside the box`)
    }
  }
})

check('a higher score is drawn higher up', () => {
  const d = dots(draw(series([70, 80, 60])))
  assert(d[1].y < d[0].y && d[0].y < d[2].y, 'the heights do not follow the scores')
})

check('a single trip is centred, not pinned to the left', () => {
  const d = dots(draw(series([72])))
  assert(d.length === 1 && Math.abs(d[0].x - W / 2) < 0.01, 'one point is not in the middle')
})

check('no trips draws nothing', () => {
  assert(draw([]) === '', 'an empty history drew something')
})

check('the axis fits the player, and a wobble is never a mountain', () => {
  const wobble = dots(draw(series([70, 72, 71, 73])))
  const rise = Math.max(...wobble.map((d) => d.y)) - Math.min(...wobble.map((d) => d.y))
  const plot = H - 26 - 26
  note(`three points of wobble rise ${rise.toFixed(0)} of ${plot}`)
  assert(rise / plot <= 3 / 24 + 0.001, 'the axis spans fewer than twenty-four points')
  const climb = dots(draw(series([40, 55, 70, 85])))
  const span = Math.max(...climb.map((d) => d.y)) - Math.min(...climb.map((d) => d.y))
  assert(span > plot * 0.6, 'a real climb does not fill the chart')
})

heading('Where the line has to stop')

check('one rubric draws one unbroken line', () => {
  const out = draw(series([70, 74, 71, 80]))
  assert((out.match(/class="ribbon-line"/g) ?? []).length === 1, 'not one line')
  assert(rules(out).length === 0 && !out.includes('The break in the line is where I changed how I score serves'), 'a break with no change of rubric')
})

check('a recalibration splits the line rather than climbing across it', () => {
  const out = draw(recalibrated)
  assert((out.match(/class="ribbon-line"/g) ?? []).length === 2, 'the line ran across the change')
  // Three trips join with two curves, two trips with one: three in all, where
  // one line across would have had four.
  const curves = [...out.matchAll(/d="([^"]+)" class="ribbon-line"/g)].map((m) => (m[1].match(/C/g) ?? []).length)
  assert(curves.join() === '2,1', `the runs joined ${curves.join()}`)
  assert(out.includes('The break in the line is where I changed how I score serves'), 'the gap is not explained')
})

check('only the run the player is not being scored under is faded', () => {
  const out = draw(recalibrated)
  assert((out.match(/class="is-stale"/g) ?? []).length === 1, 'not one run faded')
  assert(out.indexOf('class="is-stale"') < out.indexOf('<g><path') || out.includes('class="is-stale"'), 'the wrong run faded')
  const stale = out.slice(out.indexOf('class="is-stale"'))
  assert(stale.indexOf('class="ribbon-line"') >= 0, 'the old run lost its line')
})

check('the break sits between the two serves, not on either', () => {
  const out = draw(recalibrated)
  const d = dots(out)
  const [rule] = rules(out)
  assert(Math.abs(rule - (d[2].x + d[3].x) / 2) < 0.1, 'the rule is not halfway')
})

check('two recalibrations draw three runs and two rules', () => {
  const out = draw([point(40, 3, 0), point(41, 3, 1), point(60, 4, 2), point(61, 4, 3), point(80, 5, 4), point(81, 5, 5)])
  assert((out.match(/class="ribbon-line"/g) ?? []).length === 3 && rules(out).length === 2, 'not three runs and two rules')
})

check('a run of one trip has no ribbon to fill, and keeps its dot', () => {
  const out = draw([point(40, 4, 0), point(76, 5, 1), point(78, 5, 2)])
  assert((out.match(/class="ribbon-band"/g) ?? []).length === 1, 'a single trip drew a ribbon')
  assert(dots(out).length === 3, 'a dot went missing')
})

heading('Saying what it plots')

check('the picture has a text version, and a trip reads out', () => {
  const out = draw(series([70, 74]))
  assert(out.includes('aria-label="Typical score across 2 court trips, most recent 74."'), 'no text version')
  assert(out.includes('typical 74, 4 serves from 71 to 77'), 'the newest trip does not read out')
})

report()
