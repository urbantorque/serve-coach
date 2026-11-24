import { RUNGS, rungName } from '../lib/analysis/tiers'

/**
 * How good a serve to ask this player for.
 *
 * Every target band in the engine comes off the ladder in `analysis/tiers.ts`,
 * and the band handed back is always the one belonging to the rung above where
 * the player sits. That machinery has been running since the diagnostic pass
 * shipped, reading a rating out of `prefs.tier` — and nothing anywhere in the
 * app ever wrote to `prefs.tier`. It was permanently undefined, so every serve
 * fell to `inferTier`, which estimates a rung from the serve itself and is
 * deliberately pessimistic about it.
 *
 * That fallback is the right default and the wrong only option. A player whose
 * clip was scrappy gets estimated low and is then handed a target they have
 * already cleared, which reads as the app not noticing what they can do. The fix
 * is a rating they can state — and can decline to state, which is why "work it
 * out for me" is a real option here rather than an empty state.
 *
 * The rungs and their names come from the ladder itself rather than being
 * written here, so that this control and the line on the report that says which
 * rung was used cannot end up describing one fact in two vocabularies.
 */
interface Props {
  value?: number
  onChange: (tier: number | undefined) => void
  /**
   * What the engine estimated, when it had to. Shown against the auto option so
   * keeping the estimate is an informed choice rather than a shrug.
   */
  estimated?: number
}

export default function LevelPicker({ value, onChange, estimated }: Props) {
  return (
    <fieldset className="level-pick">
      <legend>What level do you play at?</legend>
      <div className="level-pick-options">
        <button
          type="button"
          className={`level-option${value === undefined ? ' is-on' : ''}`}
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
        >
          <strong>Work it out for me</strong>
          <span>
            {estimated === undefined
              ? 'I judge it from your serve'
              : `My guess: ${rungName(estimated)}`}
          </span>
        </button>
        {RUNGS.map((r) => (
          <button
            key={r.tier}
            type="button"
            className={`level-option${value === r.tier ? ' is-on' : ''}`}
            aria-pressed={value === r.tier}
            onClick={() => onChange(r.tier)}
          >
            <strong>{sentenceCase(r.name)}</strong>
            <span>{r.blurb}</span>
          </button>
        ))}
      </div>
      <p className="level-pick-note">
        Your score and the faults I look for are the same at every level. This only changes which fix
        comes first.
      </p>
    </fieldset>
  )
}

/** The rung names are written to sit mid-sentence, so the buttons capitalise them. */
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
