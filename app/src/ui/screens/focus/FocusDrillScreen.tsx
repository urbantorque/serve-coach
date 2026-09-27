import { Button } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Focus & drill (DESIGN §10.9, §8.8): one focus, the evidence, one cue, one drill. Primary in the bottom bar. */
export function FocusDrillScreen() {
  return (
    <StubScreen
      title="Your focus"
      back={{ to: paths.today(), label: 'Today' }}
      purpose="Explain the one focus with your own key frames and 1 or 2 stats, give the cue and the drill, then start it."
      specs={['DESIGN §10.9', 'DESIGN §8.8', 'PRODUCT §6.8', 'COACHING §8']}
      bottomAction={<Button to={paths.drill()}>Start drill</Button>}
    />
  )
}
