import type { TrendPoint } from '../lib/progress'

/**
 * The arithmetic behind the trend charts, with no React in it.
 *
 * `Trend.tsx` is the largest untested file in the app's screen layer, and
 * almost all of it is presentation over decisions that already live in tested
 * modules — `deltaStatus`, `shortDate` and the trend data itself are all
 * `progress.ts`. This was the exception: a hundred lines of path-building that
 * nothing could exercise, drawing the one claim on the progress sheet a player
 * actually reads as evidence. A chart that puts a dot in the wrong place is not
 * a cosmetic bug; it is the app asserting something about somebody's serve.
 *
 * Here rather than inside the component for the reason `statusLabels.ts` gives
 * at length: a module exporting both components and plain values is not a clean
 * fast-refresh boundary, and in this app a full reload throws away the analysis.
 */

/** The viewBox width both charts are laid out in. */
export const VB_W = 320

/**
 * Half the width of the break label at the 9px `.chart-axis` size, in viewBox
 * units. Both charts set `overflow: visible`, so a label centred on a break near
 * either edge does not clip — it hangs outside the chart and over whatever sits
 * beside it. Clamping to this keeps the words inside the box; the couple of
 * units it slides off the rule cost nothing, since the rule is the thing being
 * labelled and it is the only one on screen.
 */
export const BREAK_LABEL_HALF = 34

export const labelX = (at: number) =>
  Math.min(VB_W - BREAK_LABEL_HALF, Math.max(BREAK_LABEL_HALF, at))

/** A run of points scored the same way, and the path that joins them. */
export interface Segment {
  /** Indices into the full `points` array — the ends of this run, inclusive. */
  from: number
  to: number
  line: string
  /** Absent on a run of one: there is nothing to fill under a single point. */
  area?: string
  /** Scored under an older rubric than the player's latest serve. */
  stale: boolean
}

export interface ChartGeometry {
  /** Viewbox x for the point at index `i`. */
  x: (i: number) => number
  /** Viewbox y for a 0–100 score. */
  y: (v: number) => number
  segments: Segment[]
  /** Where a rubric changed, in viewbox x. One per boundary, never at an end. */
  breaks: number[]
}

/**
 * Maps scores onto a 0–100 y-axis inside the viewBox, as one path per run of
 * points that share a rubric rather than one path over all of them.
 *
 * A recalibration moves a saved score with the player having done nothing —
 * a recreational serve scored in the forties before the last change scores in
 * the seventies after it — and a saved report keeps no frames, so the old
 * numbers can never be brought onto the new scale. A segment joining those two
 * dots draws the recalibration as a climb, directly beside a delta chip that has
 * correctly refused to report any change at all. Of the two the player believes
 * the line, so the line has to stop.
 */
export function chartGeometry(
  points: TrendPoint[],
  w: number,
  h: number,
  pad: number,
): ChartGeometry {
  const n = points.length
  const x = (i: number) => (n === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1))
  const y = (v: number) => h - pad - (v / 100) * (h - pad * 2)
  const floor = (h - pad).toFixed(1)
  // Judged against the newest rubric rather than the oldest: that is the one the
  // player's last serve was scored under, and the one every figure printed
  // beside the chart is talking about.
  const current = points[n - 1]?.scoringVersion

  const segments: Segment[] = []
  let start = 0
  for (let i = 1; i <= n; i++) {
    if (i < n && points[i].scoringVersion === points[i - 1].scoringVersion) continue
    const line = points
      .slice(start, i)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(start + k).toFixed(1)},${y(p.overall).toFixed(1)}`)
      .join(' ')
    segments.push({
      from: start,
      to: i - 1,
      line,
      area:
        i - start > 1
          ? `${line} L${x(i - 1).toFixed(1)},${floor} L${x(start).toFixed(1)},${floor} Z`
          : undefined,
      stale: points[start].scoringVersion !== current,
    })
    start = i
  }

  // Halfway between the two points either side. Sitting the break on one of them
  // would read as that particular serve being the odd one, when what changed
  // happened between the two and to neither.
  const breaks = segments.slice(1).map((s) => (x(s.from - 1) + x(s.from)) / 2)
  return { x, y, segments, breaks }
}
