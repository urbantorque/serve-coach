import { useMemo, useRef, useState } from 'react'
import type { ChangeScope } from '../lib/analysis/realChange'
import {
  deltaStatus,
  shortDate,
  type AreaDelta,
  type ConsistencyPoint,
  type TrendPoint,
  type TripPoint,
} from '../lib/progress'
import { VB_W, chartGeometry, labelX, steadyWidth } from './trendGeometry'

/**
 * The colour of a run: the old rubric is drawn as background, not as series.
 *
 * Stays here rather than moving with the geometry — it is a choice about ink,
 * and `trendGeometry.ts` deliberately knows nothing about how the paths it
 * builds are painted.
 */
const strokeOf = (stale: boolean) => (stale ? 'var(--fg-faint)' : 'var(--lime)')

/* ============================================================ delta chip === */

/**
 * Colour is never the only channel here — the sign and the arrow carry the same
 * meaning, which is what keeps this readable for a colourblind reader and in
 * forced-colours mode.
 *
 * `scope` says what the change is a change of, which sets how far it has to
 * go to be the serve rather than the camera (`REAL_CHANGE`, L3.1). `alike`
 * says whether the two serves were graded on the same rows.
 */
export function DeltaChip({
  delta,
  scope,
  alike = true,
  compact = false,
}: {
  delta?: number
  scope: ChangeScope
  alike?: boolean
  compact?: boolean
}) {
  if (delta === undefined) return null
  const state = deltaStatus(delta, scope, alike)

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

  // Past the line, but the two serves were measured on different rows — the
  // drop found on one and not the other, say — so the gap is partly the
  // measuring. The neutral chip, with a mark that says "about" rather than the
  // dash that says "nothing", and no digit for the same reason the dash has
  // none.
  if (state === 'soft') {
    return (
      <span className={`delta delta--flat${compact ? ' delta--compact' : ''}`} title="Measured differently, so not compared">
        <span aria-hidden="true">≈</span>
        <span className="sr-only">measured differently, so not compared</span>
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

export function Sparkline({ points }: { points: TrendPoint[] }) {
  const h = 44
  const g = useMemo(() => chartGeometry(points, VB_W, h, 6), [points])
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
          {s.area && !s.stale && <path d={s.area} fill="var(--lime)" opacity="0.1" />}
          <path
            d={s.line}
            fill="none"
            stroke={strokeOf(s.stale)}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* A lone point between two breaks strokes nothing — `M` with no `L`
              draws no line at any linecap — so the serve would simply vanish
              from a chart that says how many serves are on it. */}
          {s.from === s.to && s.to !== last && (
            <circle cx={g.x(s.from)} cy={g.y(points[s.from].overall)} r="3" fill={strokeOf(s.stale)} />
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
          stroke="var(--fg-faint)"
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

      <circle cx={g.x(last)} cy={g.y(points[last].overall)} r="4.5" fill="var(--lime)" stroke="var(--ink-2)" strokeWidth="2" />
    </svg>
  )
}

/* ============================================================ score trend === */

const fmtDate = shortDate

/**
 * The typical score across trips (L3.2): each dot a trip's median, with a
 * faint bar for the range its serves ran over. One series, so no legend — the
 * heading says what is plotted. Only the latest point is labelled; the rest
 * are carried by the axis and the hover tooltip rather than a number on
 * every dot.
 */
export function ScoreTrend({ points }: { points: TripPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number>()
  const h = 150
  const pad = 16
  const g = useMemo(() => chartGeometry(points, VB_W, h, pad), [points])

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
        aria-label={`Typical serve score across ${points.length} trips, most recent ${last.overall}${broken ? ', split where the scoring changed' : ''}`}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={() => setHover(undefined)}
      >
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={pad} x2={VB_W - pad} y1={g.y(v)} y2={g.y(v)}
              stroke="var(--hairline)" strokeWidth="1"
            />
            <text x={0} y={g.y(v) + 3.5} className="chart-tick">{v}</text>
          </g>
        ))}

        {g.segments.map((s) => (
          <g key={s.from}>
            {s.area && !s.stale && <path d={s.area} fill="var(--lime)" opacity="0.1" />}
            <path
              d={s.line}
              fill="none"
              stroke={strokeOf(s.stale)}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
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
            stroke="var(--fg-faint)"
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
            stroke="var(--fg-faint)" strokeWidth="1"
          />
        )}

        {/* What each trip's serves ran over, under its dot: the spread is
            part of the reading, and a median drawn alone looks as sure as
            one serve. */}
        {points.map((p, i) =>
          p.high > p.low ? (
            <line
              key={`range-${p.id}`}
              x1={g.x(i)}
              x2={g.x(i)}
              y1={g.y(p.high)}
              y2={g.y(p.low)}
              stroke={strokeOf(stale(p))}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.35"
            />
          ) : null,
        )}

        {points.map((p, i) => (
          <circle
            key={p.id}
            cx={g.x(i)}
            cy={g.y(p.overall)}
            r={i === points.length - 1 || i === hover ? 4.5 : 3}
            fill={strokeOf(stale(p))}
            stroke="var(--ink-2)"
            strokeWidth="2"
          />
        ))}

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
              typical · {fmtDate(active.createdAt)} ·{' '}
              {active.serves === 1 ? 'one serve' : `${active.serves} serves, ${active.low}–${active.high}`}
              {stale(active) ? ' · scored the old way' : ''}
            </span>
          </>
        ) : (
          <span className="chart-hint">Touch the chart to read any trip</span>
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
        const state = deltaStatus(d.delta, d.id, d.alike)
        const pct = (Math.abs(d.delta) / widest) * 50
        return (
          <li key={d.id} className="dbar">
            <span className="dbar-label">{d.label}</span>
            <span className="dbar-track">
              <span className="dbar-axis" />
              <span
                className={`dbar-fill dbar-fill--${state === 'soft' ? 'flat' : state}`}
                style={
                  d.delta >= 0
                    ? { left: '50%', width: `${pct}%` }
                    : { right: '50%', width: `${pct}%` }
                }
              />
            </span>
            <span className="dbar-value tnum">
              {d.to}
              <DeltaChip delta={d.delta} scope={d.id} alike={d.alike} compact />
            </span>
          </li>
        )
      })}
      <li className="dbars-note">
        A dash is a change the camera alone could make filming the same serve
        twice. Each area has its own line, because the camera moves some far more
        than others.
        {deltas.some((d) => deltaStatus(d.delta, d.id, d.alike) === 'soft') &&
          ' ≈ marks an area measured differently on the two serves, so its change is not counted.'}
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
export function TrendTable({ points }: { points: TripPoint[] }) {
  const current = points[points.length - 1]?.scoringVersion
  const stale = (p: TripPoint) => p.scoringVersion !== current
  const broken = points.some(stale)

  return (
    <>
      <table className="dtable">
        <caption className="sr-only">
          Typical serve score by trip, with the range the serves ran over
          {broken ? ', and the trips scored the old way marked' : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Typical</th>
            <th scope="col">Serves</th>
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
              <td className="tnum">
                {p.serves === 1 ? '1' : `${p.serves}, ${p.low}–${p.high}`}
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
  // A longer bar is a steadier clip (L4.9): every other bar on this sheet
  // grows with the good direction, and this one used to grow with the gap,
  // which a player reads the wrong way round once and then never trusts. The
  // bar is the room left before the widest gap shown plus a margin — floored
  // at 40, so one tight run does not stretch a near-miss into a full bar.
  const span = Math.max(40, ...points.map((p) => p.gap)) + 5
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
            <span className="gap-fill" style={{ width: `${steadyWidth(p.gap, span)}%` }} />
          </span>
          <span className="gap-value tnum">{p.gap}</span>
        </li>
      ))}
      {/* "Points" read as tennis points here, and "gap" was already doing duty
          for the scoring break two blocks up in the same sheet. */}
      <li className="gaps-note">
        Longer is steadier: the bar grows as your best and worst serve in one clip close up. The
        number is the points between them
        {points.length > shown.length ? ` — showing your last ${shown.length}` : ''}.
      </li>
    </ul>
  )
}

const MAX_GAP_ROWS = 6
