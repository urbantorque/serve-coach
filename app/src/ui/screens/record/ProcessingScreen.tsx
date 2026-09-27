import { ProgressStages } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Processing (DESIGN §10.4, §8.18): staged, determinate progress; the first serve is viewable before the job finishes. */
export function ProcessingScreen() {
  return (
    <StubScreen
      title="Analysing"
      back={{ to: paths.record(), label: 'Record' }}
      purpose="Shows the four analysis stages with real progress from the analysis worker, the first finished serve, and Cancel. Nothing is running here yet."
      specs={['DESIGN §10.4', 'PRODUCT §6.4', 'ARCHITECTURE §5.8']}
    >
      <ProgressStages
        overall={0}
        stages={[
          { id: 'find', label: 'Finding serves', state: 'waiting' },
          { id: 'toss', label: 'Tracking the toss', state: 'waiting' },
          { id: 'time', label: 'Timing each phase', state: 'waiting' },
          { id: 'focus', label: 'Choosing your focus', state: 'waiting' },
        ]}
      />
    </StubScreen>
  )
}
