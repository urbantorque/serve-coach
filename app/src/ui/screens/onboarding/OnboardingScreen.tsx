import { useParams } from 'react-router'
import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Onboarding O1 to O9 (DESIGN §10.1, PRODUCT §6.1). One question per screen; no paywall; permissions deferred. */
export function OnboardingScreen() {
  const { step } = useParams()
  return (
    <StubScreen
      title={step ? `Onboarding: ${step}` : 'Welcome'}
      back={{ to: paths.today(), label: 'Today' }}
      purpose="First run: age check, how you play, goal, height and hand, level, comfort, privacy, then a sample session or your first recording."
      specs={['DESIGN §10.1', 'PRODUCT §6.1']}
    />
  )
}
