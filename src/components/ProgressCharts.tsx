import type { FaultTrend } from '../lib/progress'

/** Dot pitch and row height of the fault strip, in its own viewBox units. */
const PITCH = 14
const ROW = 22
const LABEL_W = 0

/**
 * When each fault was named, serve by serve (N4.3).
 *
 * The section under it says "named on 4 of 10 serves, less often lately" for
 * each fault; this is the same record as a picture: a row per fault, a dot per
 * judged serve, oldest on the left, filled where the fault was named and an
 * empty ring where the serve came back clean. Whether it is clearing shows as
 * the right end of the row emptying. The sentence stays as the text version.
 */
export function FaultStrip({ faults }: { faults: readonly FaultTrend[] }) {
  const rows = faults.filter((f) => f.sequence.length > 0).slice(0, 4)
  if (!rows.length) return null
  const cols = Math.max(...rows.map((f) => f.sequence.length))
  const w = LABEL_W + cols * PITCH
  const h = rows.length * ROW
  const summary = rows.map((f) => `${f.title}: named on ${f.named} of ${f.judged}`).join('. ')
  return (
    <svg className="fault-strip" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${summary}.`}>
      {rows.map((f, r) =>
        f.sequence.map((named, c) => (
          <circle
            key={`${f.flaw}-${c}`}
            cx={LABEL_W + (cols - f.sequence.length + c) * PITCH + PITCH / 2}
            cy={r * ROW + ROW / 2}
            r={4}
            className={named ? 'fault-dot is-named' : 'fault-dot'}
          />
        )),
      )}
    </svg>
  )
}

/**
 * In-rate by serve number, as bars (N4.3): the share of the serves the player
 * tagged with where they landed that went in. The numbers sit beside each bar,
 * so the picture never stands alone.
 */
export function InRateBars({ rows }: { rows: readonly { label: string; inServes: number; outcomes: number }[] }) {
  if (!rows.length) return null
  return (
    <div className="inrate-bars">
      {rows.map((r) => (
        <div className="inrate-row" key={r.label}>
          <span className="inrate-label">{r.label}</span>
          <span
            className="inrate-track"
            role="img"
            aria-label={`${r.label}: in on ${r.inServes} of ${r.outcomes}`}
          >
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
