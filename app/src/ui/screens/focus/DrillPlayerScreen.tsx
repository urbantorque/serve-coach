import { XIcon } from '@phosphor-icons/react'
import { IconButton } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Drill player (DESIGN §10.9): full-screen timer, step, big counter, cue reminder. */
export function DrillPlayerScreen() {
  return (
    <StubScreen
      title="Drill"
      leading={<IconButton icon={XIcon} label="Close drill" to={paths.focus()} />}
      purpose="Run the drill step by step with a timer and a counter for the success criterion, then finish and log it."
      specs={['DESIGN §10.9 Drill player', 'PRODUCT §6.8.2']}
    />
  )
}
