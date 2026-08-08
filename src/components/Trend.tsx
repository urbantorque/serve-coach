import { useMemo, useRef, useState } from 'react'
import {
  MEANINGFUL_DELTA,
  deltaStatus,
  type AreaDelta,
  type ConsistencyPoint,
  type TrendPoint,
} from '../lib/progress'

/* ============================================================ delta chip === */

/**
 * Colour is never the only channel here — the sign and the arrow carry the same
 * meaning, which is what keeps this readable for a colourblind reader and in
 * forced-colours mode.
 */
export function DeltaChip({ delta, compact = false }: { delta?: number; compact?: boolean }) {
  if (delta === undefined) return null
  const state = deltaStatus(delta)

  // A noise-level change shows the dash alone. Printing the digit as well reads
  // as a negative number when it sits beside a score — "92" then "–1" looks
  // like ninety-one — and the whole point of the threshold is that the digit
  // does not mean anything.
  if (state === 'flat') {
    return (
      <span className={`delta delta--flat${compact ? ' delta--compact' : ''}`}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">no real change</span>
      </span>
    )
  }

  const up = delta > 0
  return (
    <span className={`delta delta--${state}${compact ? ' delta--compact' : ''}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="tnum">{Math.abs(delta)}</span>
      <span className="sr-only">{up ? 'up' : 'down'}</span>
    </span>
  )
}

/* ============================================================== sparkline === */

const VB_W = 320

/** A run of points scored the same way, and the path that joins them. */
interface Segment {
  /** Indices into the full `points` array — the ends of this run, inclusive. */
  from: number
  to: number
  line: string
  /** Absent on a run of one: there is nothing to fill under a single point. */
  area?: string
  /** Scored under an older rubric than the player's latest serve. */
  stale: boolean
}

/**
 * The colour of a run: the old rubric is drawn as background, not as series.
 * Quiet, but not --fg-faint — that grey is 2.42:1 on the page, and a line a
 * player is expected to read the shape of is a mark that carries data.
 */
const strokeOf = (stale: boolean) => (stale ? 'var(--fg-muted)' : 'var(--black)')

/**
 * Optic yellow is 1.28:1 on this page's white, so it cannot carry the line — it
 * carries the area under it and the square markers on it, both of which are
 * fills sitting against a black stroke. The series itself is black, which is
 * both the loudest thing available and the only one that survives sunlight.
 */
const MARKER = 'var(--yellow)'

/**
 * Half the width of the break label at the `.chart-axis` size, in viewBox
 * units. Both charts set `overflow: visible`, so a label centred on a break near
 * either edge does not clip — it hangs outside the chart and over whatever sits
 * beside it. Clamping to this keeps the words inside the box; the couple of
 * units it slides off the rule cost nothing, since the rule is the thing being
 * labelled and it is the only one on screen.
 *
 * Widened with the tick type when it went from 9px to the 11px --t-overline.
 */
const BREAK_LABEL_HALF = 42

const labelX = (at: number) => Math.min(VB_W - BREAK_LABEL_HALF, Math.max(BREAK_LABEL_HALF, at))

/**
 * Shared path builder: maps scores onto a 0–100 y-axis inside the viewBox, as
 * one path per run of points that share a rubric rather than one path over all
 * of them.
 *
 * A recalibration moves a saved score with the player having done nothing —
 * a recreational serve scored in the forties before the last change scores in
 * the seventies after it — and a saved report keeps no frames, so the old
 * numbers can never be brought onto the new scale. A segment joining those two
 * dots draws the recalibration as a climb, directly beside a delta chip that has
 * correctly refused to report any change at all. Of the two the player believes
 * the line, so the line has to stop.
 */
function geometry(points: TrendPoint[], w: number, h: number, pad: number) {
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
      area: i - start > 1 ? `${line} L${x(i - 1).toFixed(1)},${floor} L${x(start).toFixed(1)},${floor} Z` : undefined,
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

export function Sparkline({ points }: { points: TrendPoint[] }) {
  const h = 44
  const g = useMemo(() => geometry(points, VB_W, h, 6), [points])
  if (points.length < 2) return null
  const last = points.length - 1
  const broken = g.breaks.length > 0

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${VB_W} ${h}`}
      role="img"
      aria-label={
        broken
          ? 'Recent overall scores, split where the scoring changed'
          : 'Recent overall scores'
      }
    >
      {g.segments.map((s) => (
        <g key={s.from}>
          {/* Only the current run is filled. The old scores are real but they are
              not this measurement, so they read as the backdrop the new run is
              drawn against rather than as more of the same series. */}
          {s.area && !s.stale && <path d={s.area} fill={MARKER} opacity="0.32" />}
          <path
            d={s.line}
            fill="none"
            stroke={strokeOf(s.stale)}
            strokeWidth="2"
            strokeLinejoin="miter"
            strokeLinecap="butt"
          />
          {/* A lone point between two breaks strokes nothing — `M` with no `L`
              draws no line at any linecap — so the serve would simply vanish
              from a chart that says how many serves are on it. */}
          {s.from === s.to && s.to !== last && (
            <rect
              x={g.x(s.from) - 3}
              y={g.y(points[s.from].overall) - 3}
              width="6"
              height="6"
              fill={strokeOf(s.stale)}
            />
          )}
        </g>
      ))}

      {g.breaks.map((bx) => (
        <line
          key={bx}
          x1={bx}
          x2={bx}
          y1={0}
          y2={h - 11}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      ))}
      {/* Only the newest break is named. Two labels at this size overlap into
          something unreadable, and this is the one that explains the gap between
          the greyed history and the run the headline figure comes from. */}
      {broken && (
        <text
          x={labelX(g.breaks[g.breaks.length - 1])}
          y={h - 2}
          className="chart-axis"
          textAnchor="middle"
        >
          scoring changed
        </text>
      )}

      <rect
        x={g.x(last) - 4}
        y={g.y(points[last].overall) - 4}
        width="8"
        height="8"
        fill={MARKER}
        stroke="var(--black)"
        strokeWidth="2"
      />
    </svg>
  )
}

/* ============================================================ score trend === */

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * Overall score across sessions. One series, so no legend — the heading says
 * what is plotted. Only the latest point is labelled; the rest are carried by
 * the axis and the hover tooltip rather than a number on every dot.
 */
export function ScoreTrend({ points }: { points: TrendPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number>()
  const h = 150
  const pad = 16
  const g = useMemo(() => geometry(points, VB_W, h, pad), [points])

  if (points.length < 2) return null

  const track = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = (e.clientX - rect.left) / rect.width
    const i = Math.round(ratio * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }

  const active = hover !== undefined ? points[hover] : undefined
  const last = points[points.length - 1]
  const broken = g.breaks.length > 0
  const stale = (p: TrendPoint) => p.scoringVersion !== last.scoringVersion

  return (
    <figure className="chart">
      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${VB_W} ${h}`}
        role="img"
        aria-label={`Overall serve score across ${points.length} sessions, most recent ${last.overall}${broken ? ', split where the scoring changed' : ''}`}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={() => setHover(undefined)}
      >
        {/* The baseline is the axis and is drawn as one: black and heavy. The
            two above it are guides, so they sit back in the raised surface
            grey and never compete with the series. */}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={pad} x2={VB_W - pad} y1={g.y(v)} y2={g.y(v)}
              stroke={v === 0 ? 'var(--black)' : 'var(--surface-raised)'}
              strokeWidth={v === 0 ? 2 : 1}
            />
            <text x={0} y={g.y(v) + 3.5} className="chart-tick">{v}</text>
          </g>
        ))}

        {g.segments.map((s) => (
          <g key={s.from}>
            {s.area && !s.stale && <path d={s.area} fill={MARKER} opacity="0.32" />}
            <path
              d={s.line}
              fill="none"
              stroke={strokeOf(s.stale)}
              strokeWidth="2.5"
              strokeLinejoin="miter"
              strokeLinecap="butt"
            />
          </g>
        ))}

        {/* Drawn above the gridlines and below the dots, so it reads as part of
            the plot rather than as another axis rule. */}
        {g.breaks.map((bx) => (
          <line
            key={bx}
            x1={bx}
            x2={bx}
            y1={pad - 2}
            y2={h - pad}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ))}
        {broken && (
          <text
            x={labelX(g.breaks[g.breaks.length - 1])}
            y={pad - 6}
            className="chart-axis"
            textAnchor="middle"
          >
            scoring changed
          </text>
        )}

        {active && (
          <line
            x1={g.x(hover!)} x2={g.x(hover!)} y1={pad} y2={h - pad}
            stroke="var(--black)" strokeWidth="1"
          />
        )}

        {/* Square markers, optic yellow on the current run and grey on the run
            scored the old way — the same two-tone the line already uses, so a
            reader never has to work out which dots belong to which scale. */}
        {points.map((p, i) => {
          const r = i === points.length - 1 || i === hover ? 5 : 3.5
          return (
            <rect
              key={p.id}
              x={g.x(i) - r}
              y={g.y(p.overall) - r}
              width={r * 2}
              height={r * 2}
              fill={stale(p) ? 'var(--surface-raised)' : MARKER}
              stroke={strokeOf(stale(p))}
              strokeWidth="2"
            />
          )
        })}

        <text x={pad} y={h - 2} className="chart-axis">{fmtDate(points[0].createdAt)}</text>
        <text x={VB_W - pad} y={h - 2} className="chart-axis" textAnchor="end">
          {fmtDate(last.createdAt)}
        </text>
      </svg>

      <figcaption className="chart-readout">
        {active ? (
          <>
            <strong className="tnum">{active.overall}</strong>
            {/* Said on the point itself as well as under the chart: a player
                reading one old score off the tooltip is the likeliest moment to
                take it for a figure comparable to today's. */}
            <span>
              overall · {fmtDate(active.createdAt)}
              {stale(active) ? ' · scored the old way' : ''}
            </span>
          </>
        ) : (
          <span className="chart-hint">Touch the chart to read any session</span>
        )}
      </figcaption>

      {broken && (
        <p className="sheet-note">
          The line breaks where the scoring changed. Serves either side sit on different scales, so
          the step is the new scoring rather than your serve.
        </p>
      )}
    </figure>
  )
}

/* ============================================================= delta bars === */

/**
 * Change per fundamental since the previous serve: a diverging form, two hues
 * either side of a neutral centre line. Bars grow from that centre, so which
 * side a bar is on says the same thing its colour does.
 */
export function DeltaBars({ deltas }: { deltas: AreaDelta[] }) {
  if (!deltas.length) return null
  const widest = Math.max(10, ...deltas.map((d) => Math.abs(d.delta)))

  return (
    <ul className="dbars">
      {deltas.map((d) => {
        const state = deltaStatus(d.delta)
        const pct = (Math.abs(d.delta) / widest) * 50
        return (
          <li key={d.id} className="dbar">
            <span className="dbar-label">{d.label}</span>
            <span className="dbar-track">
              <span className="dbar-axis" />
              <span
                className={`dbar-fill dbar-fill--${state}`}
                style={
                  d.delta >= 0
                    ? { left: '50%', width: `${pct}%` }
                    : { right: '50%', width: `${pct}%` }
                }
              />
            </span>
            <span className="dbar-value tnum">
              {d.to}
              <DeltaChip delta={d.delta} compact />
            </span>
          </li>
        )
      })}
      <li className="dbars-note">
        Anything under {MEANINGFUL_DELTA} points is serve-to-serve noise rather than a
        change in technique.
      </li>
    </ul>
  )
}

/* ================================================================= table === */

/**
 * The same numbers as text. Charts are never the only way to read the data.
 *
 * Which means the break has to be marked here too. The chart says "scoring
 * changed" in three places — the dashed rule, the greyed run, the note beneath —
 * and none of them survive being read as a table, so a reader who cannot use the
 * chart is the one person handed a column of scores that silently mixes two
 * scales. Marked per row rather than as a rule between rows, because a table is
 * read a cell at a time and a separator two rows up is long gone by then.
 */
export function TrendTable({ points }: { points: TrendPoint[] }) {
  const current = points[points.length - 1]?.scoringVersion
  const stale = (p: TrendPoint) => p.scoringVersion !== current
  const broken = points.some(stale)

  return (
    <>
      <table className="dtable">
        <caption className="sr-only">
          Overall serve score by session
          {broken ? ', with the serves scored the old way marked' : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Overall</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr key={p.id}>
              <td>{fmtDate(p.createdAt)}</td>
              <td>
                <span className="tnum">{p.overall}</span>
                {/* The same words the chart's tooltip uses for the same point,
                    so the two surfaces cannot be read as saying different
                    things about one serve. */}
                {stale(p) && <span className="chart-hint"> · scored the old way</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {broken && (
        <p className="sheet-note">
          The scoring changed partway through. Serves marked the old way sit on a different scale —
          that step is the scoring, not your serve.
        </p>
      )}
    </>
  )
}

/* =========================================================== consistency === */

/**
 * How far apart a player's best and worst serve are, basket by basket.
 *
 * The one chart in the app where down is the good direction, which is exactly
 * why it is drawn as bars running from a fixed left edge rather than as another
 * line beside the score trend. Two lines on one page, one improving upwards and
 * one improving downwards, is a reading everybody gets wrong once.
 *
 * A serve that averages 68 tells a club player almost nothing. Their good one
 * being a 79 and their bad one a 51 tells them why they lose their serve, and
 * that gap closing is usually the first thing that moves when technique starts
 * to hold up under pressure.
 */
export function GapTrend({ points }: { points: ConsistencyPoint[] }) {
  if (!points.length) return null
  // Floored at 20 so a genuinely tight run of baskets does not get magnified
  // into a wall of full-width bars by its own best case.
  const widest = Math.max(20, ...points.map((p) => p.gap))
  // Newest first, and capped. This block sits under a hero score, a sparkline
  // and a set of delta bars, and every row it adds is another number competing
  // with those. Six baskets is a season of sweeps for anybody filming them.
  const shown = [...points].reverse().slice(0, MAX_GAP_ROWS)

  return (
    <ul className="gaps">
      {shown.map((p) => (
        <li key={p.id} className="gap">
          <span className="gap-date">{fmtDate(p.createdAt)}</span>
          <span className="gap-track">
            <span className="gap-fill" style={{ width: `${Math.max(2, (p.gap / widest) * 100)}%` }} />
          </span>
          <span className="gap-value tnum">{p.gap}</span>
        </li>
      ))}
      {/* "Points" read as tennis points here, and "gap" was already doing duty
          for the scoring break two blocks up in the same sheet. */}
      <li className="gaps-note">
        The score gap between your best and worst serve in one clip. Smaller is steadier
        {points.length > shown.length ? ` — showing your last ${shown.length}` : ''}.
      </li>
    </ul>
  )
}

const MAX_GAP_ROWS = 6
