import { speedFigures, type SpeedUnit } from '../lib/speedCopy'
import type { SpeedSummary } from '../lib/speedTrend'
import '../styles/speed.css'

/** Trips drawn at most: past six the dates under the bars stop fitting a phone. */
const MOST = 6

const W = 320
const H = 150
const LEFT = 34
const RIGHT = 6
const TOP = 10
const BOTTOM = 26

/** A grid step in whole units that gives three to five lines over this span. */
function gridStep(span: number): number {
  return span <= 20 ? 5 : span <= 45 ? 10 : 20
}

const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * Serve speed by trip, as ranges (C5).
 *
 * One bar per trip: the likely range of its typical first serve, with a tick at
 * the best figure — the same figures `speedTrendLine` says in words underneath.
 * Bars, not a line through points, because each reading is a range, and a line
 * would draw a rise between two trips whose ranges overlap, which the sentence
 * under it refuses to call a change. The newest trip is the lime one.
 *
 * Drawn to scale on whole units, and only with two trips or more: one bar is
 * the fastest-serve line again, as a shape.
 */
export default function SpeedTrips({ trips, unit }: { trips: readonly SpeedSummary[]; unit: SpeedUnit }) {
  const shown = trips.slice(-MOST)
  if (shown.length < 2) return null
  const figs = shown.map((t) => speedFigures(t, unit))
  const low = Math.min(...figs.map((f) => f.low))
  const high = Math.max(...figs.map((f) => f.high))
  const step = gridStep(high - low)
  const from = Math.floor(low / step) * step
  const to = Math.max(from + step, Math.ceil(high / step) * step)
  const y = (v: number) => TOP + ((to - v) / (to - from)) * (H - TOP - BOTTOM)
  const slot = (W - LEFT - RIGHT) / shown.length
  const x = (i: number) => LEFT + (i + 0.5) * slot
  const bar = Math.min(22, slot * 0.5)
  const lines: number[] = []
  for (let v = from; v <= to; v += step) lines.push(v)
  const last = figs[figs.length - 1]

  return (
    <svg
      className="speed-trips"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Typical first serve by trip, ${shown.length} trips, from about ${figs[0].best} to about ${last.best} ${last.unit}. Each bar is the likely range.`}
    >
      {lines.map((v) => (
        <g key={v}>
          <line className="speed-trips-grid" x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} />
          <text className="speed-trips-axis" x={LEFT - 6} y={y(v) + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {figs.map((f, i) => {
        const now = i === figs.length - 1 ? ' is-now' : ''
        return (
          <g key={shown[i].at}>
            <rect
              className={`speed-trips-bar${now}`}
              x={x(i) - bar / 2}
              width={bar}
              y={y(f.high)}
              height={Math.max(2, y(f.low) - y(f.high))}
              rx={4}
            />
            <line className={`speed-trips-best${now}`} x1={x(i) - bar / 2 - 5} x2={x(i) + bar / 2 + 5} y1={y(f.best)} y2={y(f.best)} />
            <text className={`speed-trips-axis${now}`} x={x(i)} y={H - 8} textAnchor="middle">
              {day(shown[i].at)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
