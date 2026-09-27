/** Phase-timeline helpers (DESIGN §8.10): the ticked events and the slider's spoken value. */
import type { PhaseSpan } from '../../../analysis/types.ts'
import { PHASE_LABEL } from '../../copy/strings.ts'
import { phaseAt } from './phaseSync.ts'

export const TICK_EVENTS = ['tossRelease', 'tossApex', 'trophy', 'lowestHip', 'contact', 'landing'] as const

/** Screen-reader text for the slider ("Contact, frame 142 of 229"). */
export function sliderText(frame: number, phases: readonly PhaseSpan[], window: { startFrame: number; endFrame: number }): string {
  const p = phaseAt(phases, frame)
  const pos = frame - window.startFrame + 1
  const total = window.endFrame - window.startFrame + 1
  return `${p ? PHASE_LABEL[p.phase] : 'Serve'}, frame ${pos} of ${total}`
}
