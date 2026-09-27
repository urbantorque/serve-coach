import { useContext } from 'react'
import { ThemeContext } from './resolveTheme.ts'

/**
 * Whether a camera screen should render in Court-side contrast (DESIGN §2.4): on by default for every
 * live camera screen, unless the player set Court-side contrast to Off. Use through <CourtSide>.
 */
export function useCourtSide(): boolean {
  const { courtOnCamera, courtEverywhere } = useContext(ThemeContext)
  return courtEverywhere || courtOnCamera
}
