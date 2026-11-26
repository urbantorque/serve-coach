import type { Handedness } from '../lib/storage/prefs'

interface Props {
  value?: Handedness
  /** What the app reads with when nobody has chosen: the latest serve's hand, or right (E1.3). */
  guess?: Handedness
  /** Whether that guess came from the player's own serves. */
  fromServes?: boolean
  onChange: (hand: Handedness) => void
}

/**
 * Which hand holds the racket.
 *
 * Asked rather than inferred, because this one answer decides every keyframe
 * after it: the racket arm defines contact, contact anchors the search for the
 * trophy and the drop, and getting it backwards produces a confident report
 * about the wrong arm — a serve with no racket drop and a toss that never goes
 * up. The detector can work it out from which arm peaks later, but that is a
 * guess made per clip, and it is at its worst on exactly the short or partly
 * occluded clips where everything else is hardest too.
 *
 * A player who never chose sees the guess chosen, and is told it is one
 * (E1.3): a question with neither answer marked read as nothing set at all.
 */
export default function HandednessPicker({ value, guess, fromServes, onChange }: Props) {
  const shown = value ?? guess
  const word = shown === 'left' ? 'left-handed' : 'right-handed'
  return (
    <fieldset className="hand-pick">
      <legend>Which hand do you serve with?</legend>
      <div className="hand-pick-options">
        {(['right', 'left'] as const).map((hand) => (
          <button
            key={hand}
            type="button"
            className={`hand-option${shown === hand ? ' is-on' : ''}`}
            aria-pressed={shown === hand}
            onClick={() => onChange(hand)}
          >
            {hand === 'right' ? 'Right-handed' : 'Left-handed'}
          </button>
        ))}
      </div>
      <p className="hand-pick-note">
        {value
          ? 'This tells me which arm holds the racket. You can change it on any report.'
          : `${fromServes ? 'From your serves, I’ve guessed' : 'I’ve guessed'} ${word}. Tap the other if that’s wrong.`}
      </p>
    </fieldset>
  )
}
