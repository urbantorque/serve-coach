import {
  deltaStatus,
  shortDate,
  type AreaDelta,
  type ConsistencyPoint,
  type TripPoint,
} from '../lib/progress'
import { steadyWidth } from './trendGeometry'

/** The change chip lives in its own file, so the screens that need only it do not load the charts. */
import { DeltaChip } from './DeltaChip'
export { DeltaChip }

const fmtDate = shortDate

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
        A dash means the change is too small to count: filming the same serve twice could give it. Some areas need a bigger change than others to count.
        {deltas.some((d) => deltaStatus(d.delta, d.id, d.alike) === 'soft') &&
          ' ≈ marks an area measured differently on the two serves, so its change isn’t counted.'}
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
          Typical score for each session, with the lowest and highest
          {broken ? ', with sessions scored the old way marked' : ''}
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
                {p.serves === 1 ? '1' : `${p.serves}, ${p.low} to ${p.high}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {broken && (
        <p className="sheet-note">
          I changed how I score serves partway through. Older serves use a different scale, so a jump there is the scoring, not you.
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
        A longer bar means steadier serves: it grows as your best and worst serve in one video get closer. The
        number is the score gap between them
        {points.length > shown.length ? `, showing your last ${shown.length}` : ''}.
      </li>
    </ul>
  )
}

const MAX_GAP_ROWS = 6
