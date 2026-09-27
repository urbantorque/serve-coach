import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Compare, "Did it work?" (DESIGN §10.11, §8.12, §8.13): verdict words first, before and after, video compare. */
export function CompareScreen() {
  return (
    <StubScreen
      title="Did it work?"
      back={{ to: paths.progress(), label: 'Progress' }}
      purpose="Give the verdict of the experiment in words, the before and after values on one axis, the guard metric, and your serves side by side."
      specs={['DESIGN §10.11', 'DESIGN §8.12 to §8.13', 'PRODUCT §6.10', 'METRICS §4.5']}
    />
  )
}
