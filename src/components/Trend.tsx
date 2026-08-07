import { useMemo, useRef, useState } from 'react'
import { MEANINGFUL_DELTA, deltaStatus, type AreaDelta, type TrendPoint } from '../lib/progress'

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

/** Shared path builder: maps scores onto a 0–100 y-axis inside the viewBox. */
function geometry(points: TrendPoint[], w: number, h: number, pad: number) {
  const n = points.length
  const x = (i: number) => (n === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1))
  const y = (v: number) => h - pad - (v / 100) * (h - pad * 2)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.overall).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${(h - pad).toFixed(1)} L${x(0).toFixed(1)},${(h - pad).toFixed(1)} Z`
  return { x, y, line, area }
}

export function Sparkline({ points }: { points: TrendPoint[] }) {
  const h = 44
  const g = useMemo(() => geometry(points, VB_W, h, 6), [points])
  if (points.length < 2) return null
  const last = points[points.length - 1]

  return (
    <svg className="spark" viewBox={`0 0 ${VB_W} ${h}`} role="img" aria-label="Recent overall scores">
      <path d={g.area} fill="var(--lime)" opacity="0.1" />
      <path d={g.line} fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={g.x(points.length - 1)} cy={g.y(last.overall)} r="4.5" fill="var(--lime)" stroke="var(--ink-2)" strokeWidth="2" />
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

  return (
    <figure className="chart">
      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${VB_W} ${h}`}
        role="img"
        aria-label={`Overall serve score across ${points.length} sessions, most recent ${last.overall}`}
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

        <path d={g.area} fill="var(--lime)" opacity="0.1" />
        <path
          d={g.line}
          fill="none"
          stroke="var(--lime)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {active && (
          <line
            x1={g.x(hover!)} x2={g.x(hover!)} y1={pad} y2={h - pad}
            stroke="var(--fg-faint)" strokeWidth="1"
          />
        )}

        {points.map((p, i) => (
          <circle
            key={p.id}
            cx={g.x(i)}
            cy={g.y(p.overall)}
            r={i === points.length - 1 || i === hover ? 4.5 : 3}
            fill="var(--lime)"
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
            <span>overall · {fmtDate(active.createdAt)}</span>
          </>
        ) : (
          <span className="chart-hint">Touch the chart to read any session</span>
        )}
      </figcaption>
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

/** The same numbers as text. Charts are never the only way to read the data. */
export function TrendTable({ points }: { points: TrendPoint[] }) {
  return (
    <table className="dtable">
      <caption className="sr-only">Overall serve score by session</caption>
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
            <td className="tnum">{p.overall}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
