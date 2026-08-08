import { practiceHeadline, type PracticeFocus } from '../lib/practice'
import { Cue, Icon } from './primitives'

const VERDICT: Record<PracticeFocus['verdict'], { label: string; icon: string }> = {
  improving: { label: 'Improving', icon: 'check' },
  stuck: { label: 'Not moving', icon: 'clock' },
  slipping: { label: 'Going backwards', icon: 'warn' },
}

/**
 * A tiny run chart of one measurement across recent sessions.
 *
 * Small enough to read at a glance and no more: a single series, so no legend,
 * and only the latest point carries a value. It exists to answer one question —
 * is this getting better — which a row of numbers answers worse.
 */
function Runline({ scores }: { scores: number[] }) {
  const W = 120
  const H = 30
  const n = scores.length
  if (n < 2) return null
  const x = (i: number) => 3 + (i * (W - 6)) / (n - 1)
  const y = (v: number) => H - 3 - (Math.max(0, Math.min(100, v)) / 100) * (H - 6)
  const d = scores.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  return (
    <svg
      className="runline"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Score across the last ${n} serves: ${scores.join(', ')}`}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="butt" />
      {/* The latest serve, marked square like every other measurement on the
          page. Butt caps above so the line stops at the point rather than
          overshooting it by half a stroke. */}
      <rect x={x(n - 1) - 3} y={y(scores[n - 1]) - 3} width="6" height="6" fill="currentColor" />
    </svg>
  )
}

export default function PracticeCard({ focus }: { focus: PracticeFocus }) {
  const v = VERDICT[focus.verdict]

  return (
    <section className={`practice practice--${focus.verdict}`}>
      <div className="practice-top">
        <span className="practice-kicker">
          <Icon name="target" size={14} />
          Practise this
        </span>
        <span className={`practice-verdict practice-verdict--${focus.verdict}`}>
          <Icon name={v.icon} size={13} />
          {v.label}
        </span>
      </div>

      <h3>{focus.label}</h3>
      <p className="practice-lead">
        <Cue text={practiceHeadline(focus)} />
      </p>

      <div className="practice-stats">
        <span className={`practice-run practice-run--${focus.verdict}`}>
          <Runline scores={focus.scores} />
        </span>
        <span className="practice-figures tnum">
          <strong>{focus.average}</strong>
          <span>
            average over {focus.sessionsConsidered} serves
            {/* Only print the trend once it is big enough to have earned a
                verdict. "+1 recently" beside a "Not moving" badge is the card
                contradicting itself over what we already called noise. */}
            {focus.verdict !== 'stuck' && focus.trend !== undefined && (
              <>
                {' · '}
                {focus.trend > 0 ? '+' : ''}
                {focus.trend} recently
              </>
            )}
          </span>
        </span>
      </div>

      {focus.fix && (
        <p className="practice-fix">
          <Cue text={focus.fix} />
        </p>
      )}

      <div className="drill">
        <span className="drill-kicker">Drill · {focus.fundamentalLabel}</span>
        <h4>{focus.drill.name}</h4>
        <p>{focus.drill.how}</p>
        <span className="drill-reps">{focus.drill.reps}</span>
      </div>
    </section>
  )
}
