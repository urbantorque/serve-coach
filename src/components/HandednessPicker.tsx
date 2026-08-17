import type { Handedness } from '../lib/storage/prefs'

interface Props {
  value?: Handedness
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
 * A player's serving hand does not change, so this is a question worth asking
 * once and never again.
 */
export default function HandednessPicker({ value, onChange }: Props) {
  return (
    <fieldset className="hand-pick">
      <legend>Which hand do you serve with?</legend>
      <div className="hand-pick-options">
        {(['right', 'left'] as const).map((hand) => (
          <button
            key={hand}
            type="button"
            className={`hand-option${value === hand ? ' is-on' : ''}`}
            aria-pressed={value === hand}
            onClick={() => onChange(hand)}
          >
            {hand === 'right' ? 'Right-handed' : 'Left-handed'}
          </button>
        ))}
      </div>
      <p className="hand-pick-note">
        This decides which arm the app measures, so it is worth getting right. You can change it
        on any report.
      </p>
    </fieldset>
  )
}
