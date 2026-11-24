import type { IconName } from './icons'
import { practiceHeadline, repeatabilityNote, type PracticeFocus } from '../lib/practice'
import { Cue, Icon } from './primitives'

const VERDICT: Record<PracticeFocus['verdict'], { label: string; icon: IconName }> = {
  improving: { label: 'Improving', icon: 'check' },
  stuck: { label: 'No change', icon: 'clock' },
  slipping: { label: 'Getting worse', icon: 'warn' },
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
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(scores[n - 1])} r="3.5" fill="currentColor" />
    </svg>
  )
}

interface Props {
  focus: PracticeFocus
  /** Record that the player did the drill. Absent where nothing can store it. */
  onLogDrill?: () => void
  /** Take back the most recent one. A tap on a phone is easy to make by accident. */
  onUndoDrill?: () => void
  /**
   * The card above it already gives this fix and this drill (L1.6).
   *
   * Then the season's word on it stays — how it has moved, how often it was
   * the weakest, the log — and the instruction and the drill are not printed a
   * second time, one scroll under the first. Two identical drill cards on one
   * page read as two things to do.
   */
  sameAsFocus?: boolean
}

export default function PracticeCard({ focus, onLogDrill, onUndoDrill, sameAsFocus = false }: Props) {
  const v = VERDICT[focus.verdict]
  const note = repeatabilityNote(focus)

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

      {focus.fix && !sameAsFocus && (
        <p className="practice-fix">
          <Cue text={focus.fix} />
        </p>
      )}

      {/* What to groove, when it is not what to fix. A sentence and not a second
          drill: this card carries one instruction, and the ranked plan on the
          report is where more than one thing to do lives. */}
      {note && (
        <p className="practice-groove">
          <Cue text={note} />
        </p>
      )}

      <div className="drill">
        {sameAsFocus ? (
          <span className="drill-kicker">Same drill as above: {focus.drill.name}</span>
        ) : (
          <>
            <span className="drill-kicker">Drill · {focus.fundamentalLabel}</span>
            <h4>{focus.drill.name}</h4>
            <p>{focus.drill.how}</p>
            <span className="drill-reps">{focus.drill.reps}</span>
          </>
        )}

        {/*
          * One tap, and no reward for it.
          *
          * Deliberately not a streak, a badge or a congratulation. What this
          * records is evidence, and the sentence it changes at the top of the
          * card is the whole payoff: an app that celebrates the tap is asking
          * to be tapped, which would fill the record with drills nobody did and
          * make the evidence worthless.
          *
          * Absent when there is nothing to write to, so a build without storage
          * does not show a control that silently does nothing.
          */}
        {onLogDrill && (
          <button type="button" className="btn btn--ghost btn--full drill-done" onClick={onLogDrill}>
            I did this drill
          </button>
        )}

        {/* A count, not a tally to grow. It is here so the player can see what
            the sentence above is counting, and so an accidental tap is visible
            rather than silently becoming evidence. */}
        {focus.drilled ? (
          <div className="drill-logged">
            <p>
              Marked done {focus.drilled} {focus.drilled === 1 ? 'time' : 'times'} since the first of these{' '}
              {focus.sessionsConsidered} serves.
            </p>
            {onUndoDrill && (
              <button type="button" className="btn btn--ghost" onClick={onUndoDrill}>
                Undo the last one
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
