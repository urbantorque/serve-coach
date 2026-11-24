import { useState, type ReactNode } from 'react'
import FaultDemoPanel from '../../components/FaultDemoPanel'
import { Cue, Icon } from '../../components/primitives'
import type { DrillCheck } from '../../lib/analysis/progressions'
import { CHECK_SERVES, drillCheckLine, filmable, progressionFor, stepCheckLine } from '../../lib/analysis/progressions'
import type { Analysis } from '../../lib/analysis/types'
import { hasDemo } from '../../lib/faultDemoDials'
import { COST_NAME, LESSONS, fromLine } from '../../lib/analysis/lessons'

type PlanItem = Analysis['focus']

interface Props {
  item: PlanItem
  racket: 'left' | 'right'
  /** What the last basket said about this step, when one judged it. */
  check?: DrillCheck
  /** The rung the player is on, or -1 where this drill has no ladder. */
  rung: number
  onLadderStep?: (flaw: string, step: number, from?: number) => void
  /** The last filmed check, on a fault that is no longer the first fix. */
  drilled?: ReactNode
  /** Straight to the viewfinder, with this drill as what the serves are counted for. */
  onFilmCheck?: () => void
  /** The season's card for this drill, with its log, when the season agrees. */
  season?: ReactNode
  /** The player's own latest serve that had this right (C1.3), said in a line. */
  ownGood?: string
}

/**
 * One fix, as a lesson: what to do, how it should feel, how it moves on, and
 * the fault shown moving. Everything the report's first screen does not need.
 *
 * Moving a step is always the player's tap. A ladder that moved itself would be
 * a ladder nobody trusted.
 */
export default function DrillCard({ item, racket, check, rung, onLadderStep, drilled, onFilmCheck, season, ownGood }: Props) {
  const ladder = item.flaw ? progressionFor(item.flaw, item.axis) : undefined
  const onLadder = Boolean(ladder) && rung >= 0
  const drill = ladder && onLadder ? ladder.steps[rung] : item.drill
  const [movedTo, setMovedTo] = useState<number>()
  const flaw = item.flaw
  const lesson = flaw ? LESSONS[flaw] : undefined

  const move = (to: number) => {
    if (!flaw || !onLadderStep) return
    onLadderStep(flaw, to, rung)
    setMovedTo(to)
  }
  const now = movedTo !== undefined && ladder ? `Now on step ${movedTo + 1} of ${ladder.steps.length}: ${ladder.steps[movedTo].name}.` : undefined

  return (
    <div className="drill-card focus-drill">
      <p className="drill-for">{item.title}</p>
      {onLadder && ladder && (
        <p className="drill-step-of">
          Step {rung + 1} of {ladder.steps.length}
          <span className="drill-reps">{drill.reps}</span>
        </p>
      )}
      {!onLadder && <p className="drill-step-of">{drill.reps}</p>}

      {check && (
        <div className="drill-check">
          <p>{now ?? drillCheckLine(check)}</p>
          {onLadderStep && flaw && movedTo === undefined && ladder && (
            <>
              {check.outcome === 'passed' && rung < ladder.steps.length - 1 && (
                <button className="btn btn--primary btn--full" onClick={() => move(rung + 1)}>
                  Move up a step
                </button>
              )}
              {check.outcome === 'not_yet' && check.clean <= check.need / 2 && rung > 0 && (
                <button className="btn btn--ghost btn--full" onClick={() => move(rung - 1)}>
                  Go back a step
                </button>
              )}
            </>
          )}
        </div>
      )}

      <p className="drill-how">{drill.how}</p>
      {ladder && (
        <p className="drill-feel">
          <strong>Feel:</strong> {ladder.cue}
        </p>
      )}

      {hasDemo(flaw) && <FaultDemoPanel flaw={flaw} racket={racket} />}

      {!check && ladder && onLadder && (
        <div className="drill-check">
          <p>{now ?? stepCheckLine(ladder, ladder.steps[rung])}</p>
          {onLadderStep && flaw && movedTo === undefined && ladder.steps[rung].check.by === 'self' && rung < ladder.steps.length - 1 && (
            <button className="btn btn--ghost btn--full" onClick={() => move(rung + 1)}>
              I can do this, move up a step
            </button>
          )}
        </div>
      )}
      {drilled}
      {season}

      {/* Only a step with a served ball to read (W5.2): the rest the player checks themselves, above. */}
      {onFilmCheck && filmable(flaw, drill.name) && (
        <button className="btn btn--primary btn--big btn--full" onClick={onFilmCheck}>
          <Icon name="camera" size={20} />
          Film serves to check it
        </button>
      )}

      {/* Why the drill is worth a week (C1.3): what the fault costs, and good, cited or marked. */}
      {lesson && (
        <details className="drill-ladder drill-lesson">
          <summary>
            Why it matters
            <Icon name="chevron" size={14} />
          </summary>
          <ul className="drill-steps">
            {lesson.costs.map((cost) => (
              <li key={cost.text}>
                <span className="drill-step-name">{COST_NAME[cost.kind]}</span>
                <span className="drill-step-how">{cost.text}</span>
                <span className="drill-step-reps">{fromLine(cost.from)}</span>
              </li>
            ))}
            <li>
              <span className="drill-step-name">What good looks like</span>
              <span className="drill-step-how">{lesson.good.text}</span>
              <span className="drill-step-reps">{fromLine(lesson.good.from)}</span>
            </li>
          </ul>
          {ownGood && <p className="drill-note">{ownGood}</p>}
        </details>
      )}

      {ladder && onLadder && (
        <details className="drill-ladder">
          <summary>
            All {ladder.steps.length} steps
            <Icon name="chevron" size={14} />
          </summary>
          <ol className="drill-steps">
            {ladder.steps.map((step, i) => (
              <li key={step.name} className={i === rung ? 'is-now' : undefined} aria-current={i === rung ? 'step' : undefined}>
                <span className="drill-step-name">
                  {step.name}
                  {i === rung && <span className="drill-step-now">Now</span>}
                </span>
                <span className="drill-step-how">{step.how}</span>
                <span className="drill-step-reps">
                  {step.reps}, {step.check.by === 'engine' ? 'film it to check' : 'check it yourself'}
                </span>
              </li>
            ))}
          </ol>
          <p className="drill-note">
            <strong>Too hard?</strong> <Cue text={ladder.easier} />
          </p>
          <p className="drill-note">
            <strong>Watch for:</strong> <Cue text={ladder.mistake} />
          </p>
          <p className="drill-note">
            For a step you film, you move up when {ladder.pass} of {CHECK_SERVES} serves show none of this fault.
          </p>
        </details>
      )}
    </div>
  )
}
