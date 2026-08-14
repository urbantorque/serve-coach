/**
 * The arithmetic behind the chart a player reads as evidence of progress.
 *
 * `Trend.tsx` was the largest untested file in the screen layer, and almost all
 * of it turned out to be presentation over decisions that already live in
 * tested modules — `deltaStatus`, `shortDate` and the trend data itself are all
 * `progress.ts`. The path building was the exception, and it is the part worth
 * catching wrong: a dot in the wrong place is not a cosmetic bug, it is the app
 * asserting something about somebody's serve that did not happen.
 *
 * The rubric break is what most of this is about. A recalibration moves a saved
 * score with the player having done nothing, and a saved report keeps no frames,
 * so old numbers can never be brought onto the new scale. A line joining those
 * two dots draws the recalibration as a climb — beside a delta chip that has
 * correctly refused to report any change at all. Of the two, the player
 * believes the line.
 */
import { BREAK_LABEL_HALF, VB_W, chartGeometry, labelX } from '../trendGeometry'
import type { TrendPoint } from '../../lib/progress'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const H = 120
const PAD = 6

const point = (overall: number, scoringVersion: number): TrendPoint =>
  ({ overall, scoringVersion, createdAt: overall * 1000 }) as unknown as TrendPoint

/** All one rubric, which is every ordinary history. */
const steady = [70, 74, 71, 80].map((v) => point(v, 2))
/** Two eras: three serves under the old rubric, two under the new. */
const recalibrated = [40, 44, 42].map((v) => point(v, 1)).concat([76, 78].map((v) => point(v, 2)))

heading('Putting the dots where the scores are')

check('every point lands inside the viewBox', () => {
  // Not a formality: `y` is built from a 0–100 assumption, and a score outside
  // that range silently draws above the roof or under the floor rather than
  // failing.
  const g = chartGeometry(steady, VB_W, H, PAD)
  for (let i = 0; i < steady.length; i++) {
    const x = g.x(i)
    const y = g.y(steady[i].overall)
    assert(x >= 0 && x <= VB_W, `point ${i} sits at x=${x}, outside 0–${VB_W}`)
    assert(y >= 0 && y <= H, `point ${i} sits at y=${y}, outside 0–${H}`)
  }
})

check('a higher score is drawn higher up', () => {
  // Image y grows downwards, so this is the one inversion that would make the
  // whole chart lie while still looking like a chart.
  const g = chartGeometry(steady, VB_W, H, PAD)
  assert(g.y(80) < g.y(40), `80 drew at y=${g.y(80)}, below 40 at y=${g.y(40)}`)
  assert(g.y(100) < g.y(0), 'the axis is upside down')
})

check('the ends of the axis are the padding, not the edge', () => {
  const g = chartGeometry(steady, VB_W, H, PAD)
  assert(Math.abs(g.x(0) - PAD) < 1e-9, `first point at x=${g.x(0)}, expected the padding`)
  assert(Math.abs(g.x(3) - (VB_W - PAD)) < 1e-9, `last point at x=${g.x(3)}`)
  assert(Math.abs(g.y(0) - (H - PAD)) < 1e-9, 'zero is not on the floor')
  assert(Math.abs(g.y(100) - PAD) < 1e-9, 'a hundred is not at the ceiling')
})

check('a single point is centred rather than pinned to the left edge', () => {
  // `n - 1` is zero here, and the obvious formula divides by it. A NaN x would
  // drop the dot out of the SVG entirely and leave an empty chart that looks
  // like having no history.
  const g = chartGeometry([point(70, 2)], VB_W, H, PAD)
  assert(Number.isFinite(g.x(0)), `a lone point drew at x=${g.x(0)}`)
  assert(Math.abs(g.x(0) - VB_W / 2) < 1e-9, `a lone point drew at x=${g.x(0)}, not centred`)
})

check('an empty history produces no segments and no breaks', () => {
  const g = chartGeometry([], VB_W, H, PAD)
  assert(g.segments.length === 0, `drew ${g.segments.length} segments from no points`)
  assert(g.breaks.length === 0, `drew ${g.breaks.length} breaks from no points`)
})

heading('Where the line has to stop')

check('one rubric draws one unbroken run', () => {
  const g = chartGeometry(steady, VB_W, H, PAD)
  assert(g.segments.length === 1, `split an unbroken history into ${g.segments.length} runs`)
  assert(g.breaks.length === 0, `drew ${g.breaks.length} break rules on one rubric`)
  assert(!g.segments[0].stale, 'the current rubric was drawn as background')
})

check('a recalibration splits the line rather than climbing across it', () => {
  const g = chartGeometry(recalibrated, VB_W, H, PAD)
  assert(g.segments.length === 2, `drew ${g.segments.length} runs across one recalibration`)
  assert(g.segments[0].from === 0 && g.segments[0].to === 2, 'the old run has the wrong ends')
  assert(g.segments[1].from === 3 && g.segments[1].to === 4, 'the new run has the wrong ends')
  // No path command joins the two — that join is the false climb.
  assert(!g.segments[0].line.includes(g.x(3).toFixed(1)), 'the old run reaches into the new one')
})

check('only the run the player is not being scored under is stale', () => {
  // Judged against the newest rubric, not the oldest: that is the one their last
  // serve was scored under and the one every figure beside the chart means.
  const g = chartGeometry(recalibrated, VB_W, H, PAD)
  assert(g.segments[0].stale, 'the superseded run was drawn as the live series')
  assert(!g.segments[1].stale, 'the current run was drawn as background')
})

check('the break rule sits between the two serves, not on either', () => {
  // Sitting it on one of them reads as that serve being the odd one, when what
  // changed happened between the two and to neither.
  const g = chartGeometry(recalibrated, VB_W, H, PAD)
  assert(g.breaks.length === 1, `drew ${g.breaks.length} break rules for one recalibration`)
  const at = g.breaks[0]
  assert(at > g.x(2) && at < g.x(3), `the rule at ${at} is not between x=${g.x(2)} and x=${g.x(3)}`)
  assert(Math.abs(at - (g.x(2) + g.x(3)) / 2) < 1e-9, 'the rule is not halfway')
  note(`break drawn at ${at.toFixed(1)}, between ${g.x(2).toFixed(1)} and ${g.x(3).toFixed(1)}`)
})

check('two recalibrations draw three runs and two rules', () => {
  const thrice = [point(40, 1), point(60, 2), point(80, 3)]
  const g = chartGeometry(thrice, VB_W, H, PAD)
  assert(g.segments.length === 3, `drew ${g.segments.length} runs across two recalibrations`)
  assert(g.breaks.length === 2, `drew ${g.breaks.length} rules across two recalibrations`)
  assert(g.segments.filter((s) => s.stale).length === 2, 'the wrong number of runs is background')
})

check('a run of one point has no area to fill under it', () => {
  // A fill needs two corners on the floor. Built from a single point it closes
  // back on itself and paints a spike.
  const g = chartGeometry(recalibrated.slice(2), VB_W, H, PAD)
  const lone = g.segments.find((s) => s.from === s.to)
  assert(lone !== undefined, 'expected a single-point run in this history')
  assert(lone!.area === undefined, 'a single point was given an area to fill')
})

check('a filled run closes on the floor, so it cannot paint over the chart', () => {
  const g = chartGeometry(steady, VB_W, H, PAD)
  const area = g.segments[0].area
  assert(area !== undefined, 'a four-point run has no area')
  assert(area!.trim().endsWith('Z'), 'the area path is not closed')
  assert(area!.includes((H - PAD).toFixed(1)), 'the area does not close on the floor')
})

heading('Keeping the break label inside the box')

check('a label near either edge is pulled back in', () => {
  // Both charts set `overflow: visible`, so a label centred near an edge does
  // not clip — it hangs outside and over whatever sits beside it.
  assert(labelX(0) === BREAK_LABEL_HALF, `a rule at 0 labelled at ${labelX(0)}`)
  assert(labelX(VB_W) === VB_W - BREAK_LABEL_HALF, `a rule at the edge labelled at ${labelX(VB_W)}`)
})

check('a label with room is left where the rule is', () => {
  const middle = VB_W / 2
  assert(labelX(middle) === middle, `a centred rule was nudged to ${labelX(middle)}`)
})

report()
