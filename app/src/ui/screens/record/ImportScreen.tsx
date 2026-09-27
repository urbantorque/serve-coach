import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Import a video (PRODUCT §6.3.6, §7.8): pick a clip, probe summary, a few questions, then Processing. */
export function ImportScreen() {
  return (
    <StubScreen
      title="Import a video"
      back={{ to: paths.record(), label: 'Record' }}
      purpose="Bring in a clip filmed elsewhere. We check its frame rate and length, ask which side and serve it shows, remove the sound and analyse it on this phone."
      specs={['PRODUCT §6.3.6', 'PRODUCT §7.8', 'ARCHITECTURE §5.1']}
    />
  )
}
