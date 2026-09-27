import { Button } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { CourtSide } from '../../theme/CourtSide.tsx'
import { StubScreen } from '../StubScreen.tsx'

/** R2 set-up choice (DESIGN §10.3): upright beside the court (default) or sideways at the fence. Court-side contrast. */
export function SetupChoiceScreen() {
  return (
    <CourtSide className="min-h-[100dvh] bg-bg">
      <StubScreen
        title="Where will your phone go?"
        back={{ to: paths.record(), label: 'Record' }}
        purpose="Pick the set-up: upright beside the court, 7 to 8 m from the centre mark (recommended), or sideways at the fence. The live check decides whether the picture is tall enough."
        specs={['DESIGN §10.3 R2', 'CAPTURE §2 to §3', 'DECISIONS D1']}
        bottomAction={<Button to={paths.liveFraming()}>Continue</Button>}
      />
    </CourtSide>
  )
}
