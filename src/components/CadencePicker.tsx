import type { Cadence } from '../lib/storage/prefs'

interface Props {
  value?: Cadence
  onChange: (cadence: Cadence | undefined) => void
}

const OPTIONS: { value: Cadence | undefined; label: string }[] = [
  { value: undefined, label: 'Work it out' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
]

/**
 * How often the player gets to a court (L3.6).
 *
 * The streak used to break after nine days, so a player who plays every other
 * week never saw one. Read off their visits by default; asked here for the
 * player whose pace the app has not seen enough of yet, or has guessed wrong.
 * The same buttons as the hand picker above, so Settings reads as one form.
 */
export default function CadencePicker({ value, onChange }: Props) {
  return (
    <fieldset className="hand-pick">
      <legend>How often do you get to a court?</legend>
      <div className="hand-pick-options">
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            className={`hand-option${value === o.value ? ' is-on' : ''}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="hand-pick-note">I count your run of trips at this pace, with a few days to spare.</p>
    </fieldset>
  )
}
