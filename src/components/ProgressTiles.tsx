import type { BestTrip, Progress } from '../lib/progress'
import { tripDay, tripRangeLine } from '../lib/progress'
import type { PartState, ServePath } from '../lib/servePath'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import { DeltaChip } from './Trend'

interface Props {
  form: Progress
  path?: ServePath
  best?: BestTrip
  /** How many body-position bests the history holds. */
  bests: number
}

/** The path's states, as the dots on its tile. */
const DOT: Record<PartState, string> = {
  not_seen: 'none',
  working: 'work',
  holding: 'good',
  locked: 'great',
}

/** Scroll to a section of the sheet, gently unless the player asked for less motion. */
function goTo(id: string) {
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
}

/**
 * Progress at a glance (L4.9): four tiles in the first screen — the typical
 * serve on the latest trip, the records, the serve path and the trip chart —
 * each a door to its full section below. The headline tile is the form and
 * stays a fact; the other three are buttons, because each has more under it.
 */
export default function ProgressTiles({ form, path, best, bests }: Props) {
  const trip = form.latestTrip
  const range = tripRangeLine(trip)
  const holding = path?.parts.filter((p) => p.state === 'holding' || p.state === 'locked').length ?? 0
  const recent = form.trips.slice(-10).map((p) => p.overall)

  return (
    <div className="tiles" role="group" aria-label="Your progress at a glance">
      <div className="tile tile--form">
        <span className="tile-label">Typical {SERVE_TYPES[form.serveType].word} serve</span>
        <span className="tile-figure tnum">{trip.overall}</span>
        <span className="tile-note">
          {tripDay(trip.createdAt)}
          {range && (
            <>
              <br />
              {range}
            </>
          )}
        </span>
        {form.tripDelta !== undefined && (
          <span className="tile-chip">
            <DeltaChip delta={form.tripDelta} scope="trip" compact />
            <span className="tile-note">vs last trip</span>
          </span>
        )}
      </div>

      {(best || bests > 0) && (
        <button type="button" className="tile" onClick={() => goTo('progress-records')}>
          <span className="tile-label">Records</span>
          <span className="tile-figure tnum">{best ? best.score : bests}</span>
          <span className="tile-note">
            {best ? 'your best trip' : bests === 1 ? 'body best' : 'body bests'}
            {best && bests > 0 && (
              <>
                <br />
                {bests} body {bests === 1 ? 'best' : 'bests'}
              </>
            )}
          </span>
        </button>
      )}

      {path && (
        <button type="button" className="tile" onClick={() => goTo('progress-path')}>
          <span className="tile-label">Serve path</span>
          <span className="tile-figure tnum">
            {holding}
            <span className="tile-of">/{path.parts.length}</span>
          </span>
          <span className="tile-note">parts holding</span>
          <span className="tile-dots" aria-hidden="true">
            {path.parts.map((p) => (
              <span key={p.group} className={`tile-dot tile-dot--${DOT[p.state]}`} />
            ))}
          </span>
        </button>
      )}

      {recent.length > 1 && (
        <button type="button" className="tile" onClick={() => goTo('progress-chart')}>
          <span className="tile-label">By trip</span>
          <Sparkline values={recent} />
          <span className="tile-note">
            {form.trips.length} {form.trips.length === 1 ? 'trip' : 'trips'}
          </span>
        </button>
      )}
    </div>
  )
}

/** The latest trips' medians as one line, the newest marked. Scaled to its own range. */
function Sparkline({ values }: { values: number[] }) {
  const W = 96
  const H = 34
  const lo = Math.min(...values) - 2
  const hi = Math.max(...values) + 2
  const x = (i: number) => 3 + (i / Math.max(1, values.length - 1)) * (W - 6)
  const y = (v: number) => 3 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const last = values.length - 1
  return (
    <svg className="tile-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Your last ${values.length} trips, newest ${values[last]}`}>
      <path d={d} fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="3" fill="var(--lime)" />
    </svg>
  )
}
