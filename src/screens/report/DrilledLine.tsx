/**
 * The drill the player came in with, read on this serve, when it has stopped
 * being the report's first fix. Out of `Report.tsx` by section (E5.5).
 */
import { useState } from 'react'
import type { Analysis } from '../../lib/analysis/types'
import { drillCheckLine } from '../../lib/analysis/progressions'
import { FAULT_NAME } from '../../lib/graduation'
import { MOVE_UP } from '../../lib/phrases'

/** The fault the player was drilling, when it has stopped being the first fix. */
export function DrilledLine({
  check,
  rung,
  steps,
  stepName,
  onLadderStep,
}: {
  check: NonNullable<Analysis['drillCheck']>
  rung: number
  steps: number
  stepName?: string
  onLadderStep?: (flaw: string, step: number, from?: number) => void
}) {
  const [moved, setMoved] = useState(false)
  const name = FAULT_NAME[check.flaw]
  return (
    <div className="drill-check">
      <p>{moved ? `${name}: now on step ${rung + 2} of ${steps}, ${stepName}.` : `${name}, which you were drilling: ${drillCheckLine(check)}`}</p>
      {onLadderStep && !moved && check.outcome === 'passed' && rung < steps - 1 && (
        <button
          className="btn btn--ghost btn--full"
          onClick={() => {
            onLadderStep(check.flaw, rung + 1, rung)
            setMoved(true)
          }}
        >
          {MOVE_UP}
        </button>
      )}
    </div>
  )
}
