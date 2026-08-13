import type { PhaseId } from '../lib/analysis/types'

/**
 * Two serves, the same six positions, side by side.
 *
 * One component and not two, because the two things it draws are the same
 * picture with different captions: the best serve in a basket against the worst,
 * and the serve you hit today against the one you hit six weeks ago. Both exist
 * to do the thing a coach does with a phone at the net — put the good one next
 * to the bad one and stop talking.
 *
 * It knows nothing about where the pairs came from. Working out which two serves
 * are worth comparing is a judgement about serves and belongs with the code that
 * makes it; this only lays them out, which is why a second copy of the layout
 * for the second caller would have been two components drifting apart over one
 * grid.
 *
 * The left column is always the better of the two, for a caller that has an
 * actual "better" to claim — the caption colour says so, and `leftIsBetter`
 * says it again for whoever cannot see colour.
 *
 * Not every caller can honestly make that claim. The basket comparison can:
 * `leftCaption`/`rightCaption` are built from `pair.best`/`pair.worst`, so
 * left is the higher score by construction. "Then, and now" cannot — it
 * orders by date, not by score, because the whole point is showing what
 * changed over six weeks whichever direction it went. The colour rule below
 * is written for the caller that can make the claim and applies to both, so
 * a player whose serve has gone backwards still sees the older, worse one
 * tinted as if it were the good one. Known, not fixed here: fixing the
 * colour is a rendering change this round's "not a pixel" rule forbids: see
 * `NEXT.md`, R21.
 */
export interface PairPosition {
  id: PhaseId
  label: string
  left?: string
  right?: string
}

interface Props {
  heading: string
  leftCaption: string
  rightCaption: string
  positions: PairPosition[]
  /**
   * Whether the left column is actually the better serve — absent where
   * there is no such claim to make (see the caveat above). Adds nothing to
   * what is on screen either way: this only feeds a screen-reader-only
   * label, so a caller with nothing honest to say says nothing rather than
   * defaulting to a guess.
   */
  leftIsBetter?: boolean
}

export default function FramePair({
  heading,
  leftCaption,
  rightCaption,
  positions,
  leftIsBetter,
}: Props) {
  return (
    <div className="pair-frames">
      <span className="t-overline consistency-label">{heading}</span>
      <ul className="pair-list">
        {positions.map((p) => (
          <li key={p.id}>
            <span className="pair-label">{p.label}</span>
            <div className="pair-shots">
              <figure>
                {/* Decorative: the caption beside it already names the position
                    and the serve, and there is nothing in the picture a sentence
                    can carry that the readouts above do not. */}
                {p.left ? <img src={p.left} alt="" loading="lazy" /> : <span className="pair-missing" />}
                <figcaption>
                  {leftCaption}
                  {leftIsBetter === true && <span className="sr-only"> — the better serve</span>}
                </figcaption>
              </figure>
              <figure>
                {p.right ? <img src={p.right} alt="" loading="lazy" /> : <span className="pair-missing" />}
                <figcaption>
                  {rightCaption}
                  {leftIsBetter === true && <span className="sr-only"> — the worse serve</span>}
                </figcaption>
              </figure>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
