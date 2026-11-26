/**
 * What the report's held frame is stopped on, in words under it, with the
 * moment's name a tap away. Out of `Report.tsx` by section (E5.5).
 */
import type { ReactNode } from 'react'
import Term from '../../components/Term'
import type { PhaseId } from '../../lib/analysis/types'

/**
 * The held frame's caption, with the moment's name a tap away where it has a
 * meaning to give (E3.4): the word explained where it is used, not in a row
 * of words of its own.
 */
export function heldCaption(phase: PhaseId): ReactNode {
  if (phase === 'trophy') return <>Paused at the <Term id="trophy">trophy</Term></>
  if (phase === 'drop') return <>Paused at the <Term id="racketDrop">racket drop</Term></>
  return heldAt(phase)
}

/** What the held frame is stopped on, in words under it. */
export function heldAt(phase: PhaseId): string {
  return phase === 'contact' ? 'Paused at contact' : phase === 'ready' ? 'Paused at the ready position' : `Paused at the ${PHASE_NAME[phase]}`
}

const PHASE_NAME: Record<PhaseId, string> = {
  ready: 'ready position',
  toss: 'toss',
  trophy: 'trophy',
  drop: 'racket drop',
  contact: 'contact',
  finish: 'finish',
}
