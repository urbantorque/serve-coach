import { readoutOf } from '../lib/analysis/anatomy'
import { consistencyHeadline, type Consistency, type MetricSpread } from '../lib/analysis/consistency'

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
    /*
     * Rung four. The tier rides on the ink colour of the score rather than on a
     * ring or a coloured rule: the report already spends its one big number on
     * the serve score, and a second gauge of the same shape halfway down the
     * page competed with it. A card of context with a heavier edge than the one
     * instruction on the page is the ladder upside down.
     */
    <section className={`consistency consistency--${c.status}`}>
      <div className="consistency-head">
        <span className="t-overline consistency-kicker">How repeatable</span>
        <span className="consistency-score">
          <span className="tnum">{c.score}</span>
          <span className="consistency-out-of">/100</span>
        </span>
        <h2 className="t-subhead">Across {c.serves} serves</h2>
        <p>{consistencyHeadline(c)}</p>
      </div>

      {c.skipped > 0 && (
        <p className="note">
          {c.skipped} {c.skipped === 1 ? 'serve was' : 'serves were'} too unclear to measure and
          {c.skipped === 1 ? ' was' : ' were'} left out.
        </p>
      )}

      <div className="consistency-scores">
        <span className="t-overline consistency-label">Overall, serve by serve</span>
        <div className="consistency-chips">
          {c.overallScores.map((s, i) => (
            <span key={i} className="cchip">
              <em className="tnum">{s}</em>
              {/* The serve's own number in the clip, not its position in this
                  list. A sweep drops a serve it could not read and covers only
                  the last few of a long basket, so numbering by position points
                  the player at the wrong serve in a clip they can count. */}
              <span>#{c.serveNumbers[i] ?? i + 1}</span>
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
        A low score means that part of the serve changes every time. Worst first — the top row is
        the one to start on.
      </p>

      <button className="btn btn--ghost btn--full" onClick={onDismiss}>
        Back to this serve
      </button>
    </section>
  )
}
