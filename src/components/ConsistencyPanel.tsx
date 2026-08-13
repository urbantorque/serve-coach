import { readoutOf } from '../lib/analysis/anatomy'
import {
  consistencyHeadline,
  type Consistency,
  type MetricSpread,
  type ServeGap,
} from '../lib/analysis/consistency'

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

/**
 * How many differences between the best and worst serve are worth printing.
 *
 * Three. The list is here to answer "what did I do differently on the good one",
 * and a player who has just come off court can hold three things. Ranked
 * worst-first by `size`, so the three are the three biggest.
 */
const MAX_DIFFERENCES = 3

/**
 * The best serve against the worst one, in body language.
 *
 * Only differences big enough to be said in different words survive. Two serves
 * can differ by a real number of degrees and still both read "arm dead straight"
 * — printing that pair would be the panel pointing at a difference the player
 * cannot see, act on, or verify by watching their own clip. `readoutOf` is the
 * same vocabulary the spread rows above use, so the two halves of the panel
 * cannot describe one serve in two different ways.
 */
function BestAgainstWorst({ gap }: { gap: ServeGap }) {
  const said = gap.differences
    .map((d) => ({ ...d, best: readoutOf(d.id, d.bestValue), worst: readoutOf(d.id, d.worstValue) }))
    .filter((d) => d.best && d.worst && d.best !== d.worst)
    .slice(0, MAX_DIFFERENCES)

  return (
    <div className="best-worst">
      <span className="t-overline consistency-label">Your best serve against your worst</span>

      <p className="best-worst-lead">
        Serve <strong>#{gap.best}</strong> scored <strong className="tnum">{gap.bestScore}</strong>.
        Serve <strong>#{gap.worst}</strong> scored <strong className="tnum">{gap.worstScore}</strong>.
      </p>

      {said.length > 0 ? (
        <ul className="best-worst-list">
          {said.map((d) => (
            <li key={d.id}>
              <span className="best-worst-metric">{d.label}</span>
              <span className="best-worst-pair">
                <span className="best-worst-good">#{gap.best}: {d.best}</span>
                <span className="best-worst-bad">#{gap.worst}: {d.worst}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        /* Worth saying rather than leaving blank. Two serves that score
           differently and do the same measurable things did something this app
           does not measure — where the ball went, most likely — and a player
           who can see the scores differ deserves to be told that rather than
           left to assume the list failed to load. */
        <p className="best-worst-none">
          Those two serves did the same things, as far as this can see. The difference is
          somewhere it does not measure.
        </p>
      )}
    </div>
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

      {c.gap && <BestAgainstWorst gap={c.gap} />}

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
