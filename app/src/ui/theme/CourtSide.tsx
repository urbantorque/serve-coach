import { IconContext } from '@phosphor-icons/react'
import { useContext, type ReactNode } from 'react'
import { useCourtSide } from './useCourtSide.ts'

/**
 * Root for camera screens (set-up choice, live framing, countdown, recording, tally): switches the
 * subtree to the Court-side token set and 28 px icons unless the player turned it off (DESIGN §2.4).
 */
export function CourtSide({ children, className }: { children: ReactNode; className?: string }) {
  const on = useCourtSide()
  const icons = useContext(IconContext)
  return (
    <div data-contrast={on ? 'court' : undefined} className={className}>
      <IconContext.Provider value={{ ...icons, size: on ? 28 : icons.size }}>{children}</IconContext.Provider>
    </div>
  )
}
