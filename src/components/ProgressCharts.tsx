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
        aria-label={`Typical score across ${points.length} trips, most recent ${newest.overall}.`}
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons && pick(e)}
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
          <circle key={p.id} className={`ribbon-dot${i === at ? ' is-on' : ''}`} cx={x(i)} cy={y(p.overall)} r={i === at ? 6 : 2.6} />
        ))}
        <text className="ribbon-axis" x={SIDE} y={H - 8}>
          {shortDate(points[0].createdAt)}
        </text>
        <text className="ribbon-axis" x={W - SIDE} y={H - 8} textAnchor="end">
          {shortDate(newest.createdAt)}
        </text>
      </svg>
      <figcaption>
        <strong>{shortDate(shown.createdAt)}</strong>: typical {shown.overall}
        {shown.serves > 1 ? `, ${shown.serves} serves from ${shown.low} to ${shown.high}` : ', one serve'}
        {breaks.length > 0 && <span className="ribbon-note">The gap is where the scoring changed.</span>}
      </figcaption>
    </figure>
  )
}

/**
 * Each fault, serve by serve, oldest on the left: a square where it was named, a
 * dim one where the serve came back clean, so a fault going away looks like a
 * row going dark. The words beside it say the same thing.
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
              {f.named} of {f.judged}
              {f.direction === 'fewer' ? ', less often lately' : f.direction === 'more' ? ', more often lately' : ''}
              {f.step ? `, step ${f.step.at} of ${f.step.of}` : ''}
            </span>
          </div>
          <div className="fault-cells" role="img" aria-label={`${f.title}: named on ${f.named} of ${f.judged} serves, oldest first.`}>
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
  if (!rows.length) return null
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

/** Serves a week, this week the bright one. A count, never a verdict on a body. */
export function LoadBars({ load }: { load: ServeLoad }) {
  const most = Math.max(1, ...load.weeks.map((w) => w.serves))
  return (
    <div className="load-bars" role="img" aria-label={`Serves a week, this week ${load.thisWeek}${load.usual !== undefined ? `, usually about ${Math.round(load.usual)}` : ''}.`}>
      {load.weeks.map((w, i) => (
        <span key={i} className={`load-bar${i === load.weeks.length - 1 ? ' is-now' : ''}`} style={{ height: `${Math.max(4, (w.serves / most) * 100)}%` }}>
          {w.serves > 0 && <span className="tnum">{w.serves}</span>}
        </span>
      ))}
    </div>
  )
}
