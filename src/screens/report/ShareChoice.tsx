import type { SharingState } from '../../components/useShareState'
import { Icon } from '../../components/primitives'

interface Props {
  card: SharingState
  onCard: () => void
  coach: SharingState
  onCoach: () => void
}

/**
 * Sharing as one choice, behind one button.
 *
 * The report used to end on three stacked exits. This is what each of the other
 * two became: pick who it is for, and only then does anything get made. Nothing
 * leaves the phone until the player picks where it goes in their own share sheet.
 */
export default function ShareChoice({ card, onCard, coach, onCoach }: Props) {
  return (
    <div className="share-choice">
      <button className="share-option" onClick={onCard} disabled={card === 'working'} aria-live="polite">
        <span className="share-option-mark">
          <Icon name={card === 'done' ? 'check' : 'trophy'} size={22} />
        </span>
        <span>
          <strong>{card === 'working' ? 'Preparing…' : card === 'done' ? 'Saved' : 'A card of this serve'}</strong>
          <span>A picture to send to a friend.</span>
        </span>
      </button>
      <button className="share-option" onClick={onCoach} disabled={coach === 'working'} aria-live="polite">
        <span className="share-option-mark">
          <Icon name={coach === 'done' ? 'check' : 'target'} size={22} />
        </span>
        <span>
          <strong>{coach === 'working' ? 'Preparing…' : coach === 'done' ? 'Ready to send' : 'A page for my coach'}</strong>
          <span>Every measurement, the plan, and what to look at.</span>
        </span>
      </button>
      <p className="sheet-note">Nothing leaves your phone until you choose where it goes.</p>
    </div>
  )
}
