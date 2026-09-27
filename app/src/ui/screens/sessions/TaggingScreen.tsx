import { XIcon } from '@phosphor-icons/react'
import { useParams } from 'react-router'
import { IconButton } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Tagging (DESIGN §10.8, §8.14): in, net, long or wide in under 2 s a serve. Full screen, fixed pad position. */
export function TaggingScreen() {
  const { sessionId = '' } = useParams()
  return (
    <StubScreen
      title="Tag serves"
      leading={<IconButton icon={XIcon} label="Save and exit" to={paths.sessionReport(sessionId)} />}
      purpose="Tag the outcome of each serve with one thumb: In, Net, Long, Wide, plus Let, Skip and Undo. The pad never moves between serves."
      specs={['DESIGN §10.8', 'DESIGN §8.14', 'PRODUCT §6.7']}
    />
  )
}
