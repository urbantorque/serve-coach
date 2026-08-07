import { readoutOf } from '../lib/analysis/anatomy'
import { consistencyHeadline, type Consistency, type MetricSpread } from '../lib/analysis/consistency'
import { Icon, ScoreRing } from './primitives'

/**
 * How far each measurement travelled across the basket.
 *
 * The bar shows the spread positioned inside the metric's own axis, with the
 * target band behind it — so a wide bar sitting inside the band reads
 * differently from a narrow one sitting outside it, which is exactly the
 * distinction a player needs.
 */
function SpreadRow({ m }: { m: MetricSpread }) {
  const span = m.range[1] - m.range[0] || 1
  const pct = (v: number) => ((Math.max(m.range[0], Math.min(m.range[1], v)) - m.range[0]) / span) * 100
  const left = pct(m.min)
  const width = Math.max(1.5, pct(m.max) - left)
  const bandLeft = pct(m.ideal[0])
  const bandWidth = Math.max(2, pct(m.ideal[1]) - bandLeft)
  const low = readoutOf(m.id, m.min)
  const high = readoutOf(m.id, m.max)

  return (
    <li className="spread">
      <div className="spread-top">
        <span className="spread-label">{m.label}</span>
        <span className={`spread-score tnum spread-score--${m.status}`}>{m.score}</span>
      </div>

      <div className="bar">
        <div className="bar-track" />
        <div className="bar-band" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} />
        <div
          className={`spread-fill spread-fill--${m.status}`}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </div>

      {/* The two ends of the basket, in body language. A player cannot act on
          "varies by 0.14×"; they can act on being told their contact ran from
          head height to full reach across six serves. */}
      <p className="spread-detail">
        {low === high ? (
          <>Every serve: {low}</>
        ) : (
          <>
            {low}
            <span className="spread-sep">→</span>
            {high}
          </>
        )}
      </p>
    </li>
  )
}

interface Props {
  consistency: Consistency
  onDismiss: () => void
}

export default function ConsistencyPanel({ consistency: c, onDismiss }: Props) {
  return (
    <section className="consistency">
      <div className="consistency-head">
        <ScoreRing score={c.score} status={c.status} size={72} label="repeat" />
        <div>
          <h2>Across {c.serves} serves</h2>
          <p>{consistencyHeadline(c)}</p>
        </div>
      </div>

      {c.skipped > 0 && (
        <p className="note">
          <Icon name="warn" size={16} />
          <span>
            {c.skipped} {c.skipped === 1 ? 'serve was' : 'serves were'} too unclear to measure and
            {c.skipped === 1 ? ' was' : ' were'} left out.
          </span>
        </p>
      )}

      <div className="consistency-scores">
        <span className="block-title">Overall, serve by serve</span>
        <div className="consistency-chips">
          {c.overallScores.map((s, i) => (
            <span key={i} className="cchip">
              <em className="tnum">{s}</em>
              <span>#{i + 1}</span>
            </span>
          ))}
        </div>
      </div>

      <ul className="spreads">
        {c.metrics.map((m) => (
          <SpreadRow key={m.id} m={m} />
        ))}
      </ul>

      <p className="consistency-foot">
        Each score is how little that element moved, measured against its own target band. The
        list is ordered worst first — the top one is what to groove.
      </p>

      <button className="btn btn--ghost btn--full" onClick={onDismiss}>
        Back to this serve
      </button>
    </section>
  )
}
