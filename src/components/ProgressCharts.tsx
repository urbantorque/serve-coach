import { useState } from 'react'
import { shortDate, type FaultTrend, type TripPoint } from '../lib/progress'
import type { ServeLoad } from '../lib/serveLoad'

const W = 350
const H = 196
const TOP = 26
const FOOT = 26
const SIDE = 16

/** A smooth line through points, without overshooting them much. */
function curve(points: { x: number; y: number }[]): string {
  if (!points.length) return ''
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const mx = (a.x + b.x) / 2
    d += ` C${mx.toFixed(1)},${a.y.toFixed(1)} ${mx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
  }
  return d
}

/** Runs of trips scored the same way: a line never crosses a change of rubric. */
function runsOf(points: readonly TripPoint[]): number[][] {
  const runs: number[][] = []
  points.forEach((p, i) => {
    const run = runs[runs.length - 1]
    if (run && points[run[run.length - 1]].scoringVersion === p.scoringVersion) run.push(i)
    else runs.push([i])
  })
  return runs
}

/**
 * The shape of the player's serve over time: each trip's typical score as a
 * line, inside a ribbon as wide as that trip's serves ran.
 *
 * The axis fits the player's own range rather than nought to a hundred, which is
 * what left the old chart mostly empty, but never spans fewer than twenty-four
 * points, so a small wobble cannot be drawn as a mountain. Tap anywhere to read
 * a trip. The numbers are also there as a table for anyone who wants them.
 */
export function ScoreRibbon({ points }: { points: TripPoint[] }) {
  const [picked, setPicked] = useState<number>()
  if (!points.length) return null
  const lows = points.map((p) => p.low)
  const highs = points.map((p) => p.high)
  let lo = Math.min(...lows) - 5
  let hi = Math.max(...highs) + 5
  if (hi - lo < 24) {
    const mid = (hi + lo) / 2
    lo = mid - 12
    hi = mid + 12
  }
  lo = Math.max(0, lo)
  hi = Math.min(100, hi)
  const x = (i: number) => (points.length === 1 ? W / 2 : SIDE + (i * (W - SIDE * 2)) / (points.length - 1))
  const y = (v: number) => TOP + ((hi - v) / Math.max(1, hi - lo)) * (H - TOP - FOOT)
  const runs = runsOf(points)
  const newest = points[points.length - 1]
  const at = picked ?? points.length - 1
  const shown = points[at]
  const breaks = runs.slice(1).map((r) => (x(r[0]) + x(r[0] - 1)) / 2)
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - box.left) / box.width) * W
    let best = 0
    points.forEach((_, i) => {
      if (Math.abs(x(i) - vx) < Math.abs(x(best) - vx)) best = i
    })
    setPicked(best)
  }
  return (
    <figure className="ribbon">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Typical score across ${points.length} sessions, most recent ${newest.overall}.`}
        onPointerDown={pick}
        // A mouse reads a trip by hovering, a finger by touching (N5.4).
        onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse') && pick(e)}
      >
        <defs>
          <linearGradient id="ribbon-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--lime)" stopOpacity="0.34" />
            <stop offset="1" stopColor="var(--lime)" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {[lo + (hi - lo) / 3, lo + ((hi - lo) * 2) / 3].map((v) => (
          <g key={v}>
            <line className="ribbon-grid" x1={SIDE} x2={W - SIDE} y1={y(v)} y2={y(v)} />
            <text className="ribbon-axis" x={W - SIDE} y={y(v) - 4} textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {runs.map((run) => {
          const stale = points[run[0]].scoringVersion !== newest.scoringVersion
          const top = run.map((i) => ({ x: x(i), y: y(points[i].high) }))
          const under = [...run].reverse().map((i) => ({ x: x(i), y: y(points[i].low) }))
          const line = run.map((i) => ({ x: x(i), y: y(points[i].overall) }))
          const band =
            run.length > 1
              ? `${curve(top)} L${under[0].x.toFixed(1)},${under[0].y.toFixed(1)} ${curve(under).slice(curve(under).indexOf('C'))} Z`
              : undefined
          return (
            <g key={run[0]} className={stale ? 'is-stale' : undefined}>
              {band && <path d={band} className="ribbon-band" fill={stale ? 'var(--ink-3)' : 'url(#ribbon-fill)'} />}
              {run.map((i) =>
                points[i].high > points[i].low ? (
                  <line key={i} className="ribbon-range" x1={x(i)} x2={x(i)} y1={y(points[i].high)} y2={y(points[i].low)} opacity="0.35" />
                ) : null,
              )}
              {run.length > 1 && <path d={curve(line)} className="ribbon-line" />}
            </g>
          )
        })}
        {breaks.map((b) => (
          <line key={b} className="ribbon-break" x1={b} x2={b} y1={TOP - 8} y2={H - FOOT + 4} />
        ))}
        {points.map((p, i) => (
          <circle key={p.id} className={`ribbon-dot${i === at ? ' is-on' : ''}`} cx={x(i)} cy={y(p.overall)} r={i === at ? 6 : 4} />
        ))}
        <text className="ribbon-axis" x={SIDE} y={H - 8}>
          {shortDate(points[0].createdAt)}
        </text>
        <text className="ribbon-axis" x={W - SIDE} y={H - 8} textAnchor="end">
          {shortDate(newest.createdAt)}
        </text>
      </svg>
      <figcaption>
        {/* Said only for a point the player picked: the newest one is the headline above the chart. */}
        {at !== points.length - 1 && (
          <>
            <strong>{shortDate(shown.createdAt)}</strong>: typical {shown.overall}
            {shown.serves < 2 ? ', one serve' : shown.low === shown.high ? `, ${shown.serves} serves, all ${shown.overall}` : `, ${shown.serves} serves from ${shown.low} to ${shown.high}`}
          </>
        )}
        {at === points.length - 1 && points.length > 1 && <span className="ribbon-note">Tap the chart to see any session.</span>}
        {breaks.length > 0 && <span className="ribbon-note">The gap in the line is where I changed how I score serves.</span>}
      </figcaption>
    </figure>
  )
}

/**
 * Each fault, serve by serve, oldest on the left: a dim square where it was named
 * and a lime one where the serve came back clean, so a fault going away looks like
 * a row lighting up. The words beside it say the same thing.
 */
export function FaultGrid({ faults }: { faults: readonly FaultTrend[] }) {
  const rows = faults.filter((f) => f.sequence.length > 0).slice(0, 4)
  if (!rows.length) return null
  return (
    <div className="fault-grid">
      {rows.map((f) => (
        <div className="fault-row" key={f.flaw}>
          <div className="fault-row-head">
            <strong>{f.title}</strong>
            <span className={f.direction === 'fewer' ? 'is-better' : f.direction === 'more' ? 'is-worse' : undefined}>
              Seen on {f.named} of {f.judged}
              {f.direction === 'fewer' ? ', less often lately' : f.direction === 'more' ? ', more often lately' : ''}
              {f.step ? `, step ${f.step.at} of ${f.step.of}` : ''}
            </span>
          </div>
          <div className="fault-cells" role="img" aria-label={`${f.title}: seen on ${f.named} of ${f.judged} serves, oldest first.`}>
            {f.sequence.map((named, i) => (
              <span key={i} className={`fault-cell${named ? ' is-named' : ''}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * In-rate by serve number, as bars (N4.3). The numbers sit beside each bar, so
 * the picture never stands alone.
 */
export function InRateBars({ rows }: { rows: readonly { label: string; inServes: number; outcomes: number }[] }) {
  // One row is a one-bar chart, and the sentence under it already says the
  // number (N5.4): bars only when there are two serves to set against each other.
  if (rows.length < 2) return null
  return (
    <div className="inrate-bars">
      {rows.map((r) => (
        <div className="inrate-row" key={r.label}>
          <span className="inrate-label">{r.label}</span>
          <span className="inrate-track" role="img" aria-label={`${r.label}: in on ${r.inServes} of ${r.outcomes}`}>
            <span className="inrate-fill" style={{ width: `${(100 * r.inServes) / Math.max(1, r.outcomes)}%` }} />
          </span>
          <span className="inrate-count tnum">
            {r.inServes} of {r.outcomes}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Serves a week, this week the bright one. A count, never a verdict on a body.
 *
 * Labelled selectively (N5.4): this week and the busiest week carry their
 * numbers, every bar says its own on hover, a usual week is a hairline across,
 * and the axis says when it starts. A week with nothing filmed is a flat line
 * on the floor, not a stub that reads as a small number.
 */
export function LoadBars({ load }: { load: ServeLoad }) {
  const most = Math.max(1, ...load.weeks.map((w) => w.serves))
  const last = load.weeks.length - 1
  const busiest = load.weeks.reduce((b, w, i) => (w.serves > load.weeks[b].serves ? i : b), 0)
  const usual = load.usual !== undefined && load.usual > 0 ? load.usual : undefined
  return (
    <figure className="load">
      <div
        className="load-bars"
        role="img"
        // Every week's count, so what a hover shows is never the only way to it.
        aria-label={`Serves a week, this week ${load.thisWeek}${usual !== undefined ? `, usually about ${Math.round(usual)}` : ''}. Week by week from ${shortDate(load.weeks[0].start)}: ${load.weeks.map((w) => w.serves).join(', ')}.`}
      >
        {usual !== undefined && <span className="load-usual" style={{ bottom: `${(usual / most) * 100}%` }} />}
        {load.weeks.map((w, i) => (
          <span
            key={w.start}
            className={`load-bar${i === last ? ' is-now' : ''}${w.serves === 0 ? ' is-empty' : ''}`}
            style={w.serves ? { height: `${(w.serves / most) * 100}%` } : undefined}
            title={`${i === last ? 'This week' : `Week of ${shortDate(w.start)}`}: ${w.serves === 1 ? 'one serve' : `${w.serves} serves`}`}
          >
            {w.serves > 0 && (i === last || i === busiest) && <span className="tnum">{w.serves}</span>}
          </span>
        ))}
      </div>
      <figcaption className="load-axis">
        <span>{shortDate(load.weeks[0].start)}</span>
        {usual !== undefined && <span className="load-key">A usual week, about {Math.round(usual)}</span>}
        <span>This week</span>
      </figcaption>
    </figure>
  )
}
