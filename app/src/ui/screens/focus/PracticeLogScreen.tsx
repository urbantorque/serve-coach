import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Practice log (DESIGN §8.15 sheet catalogue, PRODUCT §6.8.3, COACHING §12.2). A sheet in the finished app. */
export function PracticeLogScreen() {
  return (
    <StubScreen
      title="Log practice"
      back={{ to: paths.today(), label: 'Today' }}
      purpose="Log a practice in about 10 seconds: minutes, whether you met the goal, how it felt and whether the cue helped. The body check runs first if you are sore."
      specs={['DESIGN §8.15', 'PRODUCT §6.8.3', 'COACHING §12.2']}
    />
  )
}
