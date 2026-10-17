import { Icon } from './primitives'
import { useShareState } from './useShareState'
import { shareGraduationCard } from '../lib/share/reportCard'
import type { GraduationCard } from '../lib/graduationCard'

interface Props {
  card: GraduationCard
}

/**
 * Share a fixed fault's then and now, as one image (L3.12) — see
 * `renderGraduationCard`. The only way the card leaves the phone, and the
 * player's tap, the same as the trip and season cards beside it.
 */
export default function GraduationShareButton({ card }: Props) {
  const { sharing, trigger: share } = useShareState(() => shareGraduationCard(card))
  return (
    // `aria-live` for the same reason as the trip card's button: the text
    // changes under the player's finger.
    <button
      className="btn btn--ghost btn--full"
      onClick={() => void share()}
      disabled={sharing === 'working'}
      aria-live="polite"
    >
      <Icon name={sharing === 'done' ? 'check' : 'share'} size={17} />
      {sharing === 'working' ? 'Preparing…' : sharing === 'done' ? 'Saved' : `Share: ${card.name} fixed`}
    </button>
  )
}
