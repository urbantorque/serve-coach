import type { Cadence } from '../lib/storage/prefs'

interface Props {
  value?: Cadence
  /** The pace the streak is read at when nobody has chosen, from the player's visits (E1.3). */
  guess?: Cadence
  onChange: (cadence: Cadence | undefined) => void
}

const OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
]

/**
 * How often the player gets to a court (L3.6).
 *
 * The streak used to break after nine days, so a player who plays every other
 * week never saw one. Read off their visits by default, and that reading is
 * now shown as the chosen option (E1.3), where a fourth "Work it out for me"
 * option used to stand in for it, wrapped onto two lines in its pill and
 * never said what it had worked out. One tap on another pace sets it.
 */
export default function CadencePicker({ value, guess, onChange }: Props) {
  const shown = value ?? guess
  return (
    <fieldset className="hand-pick">
      <legend>How often do you get to a court?</legend>
      <div className="hand-pick-options">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`hand-option${shown === o.value ? ' is-on' : ''}`}
            aria-pressed={shown === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="hand-pick-note">
        {value ? '' : 'I’ve guessed this from your sessions. '}
        Your streak keeps going as long as you play about this often, with a few days to spare.
      </p>
    </fieldset>
  )
}
