import { useMemo } from 'react'
import FixedPair from './FixedPair'
import { Icon } from './primitives'
import { progressionFor } from '../lib/analysis/progressions'
import { recentStepPass, stepPassPair } from '../lib/graduationCard'
import type { FlawId } from '../lib/analysis/flaws'
import type { Session } from '../lib/storage/db'

/**
 * A step passed, as a moment on Home (Q10).
 *
 * Moving up a rung used to be one line in the glance, gone with the next
 * serve. Weeks of a drill deserve to be seen: the step left behind, the one
 * now on, and the fault's moment then and now when the history can draw both.
 * Lazily loaded, so Home's entry carries none of the drawing, nor the choice of
 * which step to show: Home only asks whether any was ever passed.
 */
export default function StepPassed({ sessions, passedAt, ladder }: {
  sessions: readonly Session[]
  passedAt: Partial<Record<string, number>>
  ladder?: Partial<Record<string, number>>
}) {
  const passed = recentStepPass(passedAt, ladder, Date.now())
  return passed ? <StepPassedCard sessions={sessions} flaw={passed.flaw} rung={passed.rung} passedAt={passed.at} /> : null
}

/** The card for one step passed: the two step names, and the fault then and now when it can be drawn. */
export function StepPassedCard({ sessions, flaw, rung, passedAt }: {
  sessions: readonly Session[]
  flaw: FlawId
  /** The rung the player is on now, one above the step they passed. */
  rung: number
  passedAt: number
}) {
  const ladder = progressionFor(flaw)
  const pair = useMemo(() => stepPassPair(sessions, flaw, passedAt), [sessions, flaw, passedAt])
  const left = ladder?.steps[rung - 1]
  const on = ladder?.steps[rung]
  if (!ladder || !left || !on) return null
  return (
    <section className="block step-passed" aria-labelledby="step-passed-title">
      <h2 className="block-title" id="step-passed-title">
        Step passed
      </h2>
      <p className="week-note">
        <Icon name="check" size={15} />
        <span>
          You passed <strong>{left.name}</strong>. Now on <strong>{on.name}</strong>, step {rung + 1} of{' '}
          {ladder.steps.length}.
        </span>
      </p>
      {pair && <FixedPair then={pair.then} now={pair.now} title="That step, then and now" />}
    </section>
  )
}
