import { ShieldCheckIcon } from '@phosphor-icons/react'
import { ListGroup, ListRow, RowIcon } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

const back = { to: paths.profile(), label: 'You' }

/** Your serve (PRODUCT §6.13): edits single onboarding answers (O3 to O6) with the same options. */
export function YourServeScreen() {
  return (
    <StubScreen
      title="Your serve"
      back={back}
      purpose="Height, serving hand, level or UTR, goal, how you play, match nights and season. Height turns video into centimetres and never leaves this phone."
      specs={['DESIGN §10.12', 'PRODUCT §6.13', 'DESIGN §8.22 Height input']}
    />
  )
}

/** Comfort and body (COACHING §9 to §10): comfort areas, body-check history, referral state. */
export function ComfortScreen() {
  return (
    <StubScreen
      title="Comfort and body"
      back={back}
      purpose="Areas to go easy on, saved only on this phone with your consent, and your recent body checks."
      specs={['PRODUCT §6.13', 'PRODUCT §6.16', 'COACHING §9 to §10']}
    />
  )
}

/** My coach's focus (research 10 M8): pin a focus your coach gave you. */
export function CoachFocusScreen() {
  return (
    <StubScreen
      title="My coach's focus"
      back={back}
      purpose="Pin the focus your coach set. Evidence from your serves still shows beside it."
      specs={['DESIGN §8.8', 'PRODUCT §6.8.5']}
    />
  )
}

/** Storage and privacy (DESIGN §10.12, D8, ARCHITECTURE §8). */
export function StoragePrivacyScreen() {
  const facts = ['Analysis runs on this phone.', 'No account. Nothing is uploaded.', 'Comfort answers never leave this phone.']
  return (
    <StubScreen
      title="Storage and privacy"
      back={back}
      purpose="What is stored and for how long, keep or auto-delete videos, export JSON and CSV, delete all videos or everything."
      specs={['DESIGN §10.12', 'ARCHITECTURE §8', 'DECISIONS D8']}
    >
      <ListGroup label="Privacy facts">
        {facts.map((f) => (
          <ListRow
            key={f}
            leading={
              <RowIcon>
                <ShieldCheckIcon size={24} aria-hidden="true" />
              </RowIcon>
            }
            title={<span className="text-body text-ink">{f}</span>}
          />
        ))}
      </ListGroup>
    </StubScreen>
  )
}

/** About and legal: privacy policy, licences (Archivo OFL-1.1, Phosphor MIT), version. */
export function AboutScreen() {
  return (
    <StubScreen
      title="About and legal"
      back={back}
      purpose="Privacy policy, open-source licences and the app version."
      specs={['PRODUCT §11', 'DESIGN §10.12']}
    />
  )
}
