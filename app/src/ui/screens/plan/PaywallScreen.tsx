import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/**
 * Plan and paywall (DESIGN §10.13, PRODUCT §6.15). A sheet after the first verdict and from Profile.
 * In the PWA beta everything is unlocked: an honest fake door that says Plus is free during the beta.
 */
export function PaywallScreen() {
  return (
    <StubScreen
      title="Plan"
      back={{ to: paths.profile(), label: 'You' }}
      purpose="Explain Plus calmly: unlimited analysed sessions, full history and trends. Pain check, export and deletion are always free. No countdowns, no pre-ticked options."
      specs={['DESIGN §10.13', 'PRODUCT §5.2', 'PRODUCT §6.15']}
    />
  )
}
