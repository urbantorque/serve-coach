import { XIcon } from '@phosphor-icons/react'
import { IconButton } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { CourtSide } from '../../theme/CourtSide.tsx'
import { StubScreen } from '../StubScreen.tsx'

/** R3 live framing (DESIGN §10.3): camera preview, one instruction pill, checklist rail, Record. Full screen, Court-side. */
export function LiveFramingScreen() {
  return (
    <CourtSide className="min-h-[100dvh] bg-bg">
      <StubScreen
        title="Live framing"
        leading={<IconButton icon={XIcon} label="Close camera" to={paths.record()} />}
        purpose="Frame the serve with the live checks (level, in frame, room above, steady, light, ball seen, frame rate, size) until Ready. Camera and motion permissions are asked here the first time."
        specs={['DESIGN §10.3 R3 to R6', 'CAPTURE §9', 'ARCHITECTURE §15']}
      />
    </CourtSide>
  )
}
