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
 * The left column is always the better of the two. Both callers order them that
 * way, and the caption colour says so.
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
}

export default function FramePair({ heading, leftCaption, rightCaption, positions }: Props) {
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
                <figcaption>{leftCaption}</figcaption>
              </figure>
              <figure>
                {p.right ? <img src={p.right} alt="" loading="lazy" /> : <span className="pair-missing" />}
                <figcaption>{rightCaption}</figcaption>
              </figure>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
