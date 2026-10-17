import { useState } from 'react'
import type { PhaseId } from '../lib/analysis/types'
import { pairRankModifier } from './statusLabels'

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
 * `leftIsBetter` is the whole of the ranking claim, and it drives both halves
 * of how that claim is made: the caption colour, through `pairRankModifier`,
 * and the screen-reader text beside it for whoever cannot see colour. A caller
 * that passes nothing gets neither.
 *
 * That symmetry is new and it is the point. Not every caller can honestly make
 * the claim: the basket comparison can, since `leftCaption`/`rightCaption` are
 * built from `pair.best`/`pair.worst` and left is the higher score by
 * construction, but "Then, and now" cannot — it orders by date, because the
 * whole point is showing what changed over six weeks whichever direction it
 * went. The component always honoured that. The stylesheet did not: it accented
 * the first figure unconditionally, so a player whose serve had gone backwards
 * saw their older, worse serve tinted as the good one. See `pairRankModifier`
 * for the fix and `NEXT.md` R37 for how long it sat there.
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
   * Which of the two is the better serve, or nothing where there is no such
   * claim to make (see the note above).
   *
   * Absent is a real answer and not a missing one: it means neither caption is
   * accented and neither carries the screen-reader label, so a caller with
   * nothing honest to say says nothing rather than defaulting to a guess.
   */
  leftIsBetter?: boolean
  /**
   * One moment at a time, picked from pills (L4.9). Six pairs stacked was a
   * scroll of twelve photographs; one pair at a size a phone can show is the
   * comparison a player actually makes, moment by moment.
   */
  oneAtATime?: boolean
}

export default function FramePair({
  heading,
  leftCaption,
  rightCaption,
  positions,
  leftIsBetter,
  oneAtATime = false,
}: Props) {
  const [at, setAt] = useState(0)
  const shown = oneAtATime ? positions.slice(at, at + 1) : positions
  return (
    <div className="pair-frames">
      <span className="t-overline consistency-label">{heading}</span>
      {oneAtATime && positions.length > 1 && (
        <div className="phase-pills" role="group" aria-label="Which moment">
          {positions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`phase-pill${i === at ? ' is-active' : ''}`}
              aria-pressed={i === at}
              onClick={() => setAt(i)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <ul className={`pair-list${oneAtATime ? ' pair-list--one' : ''}`}>
        {shown.map((p) => (
          <li key={p.id}>
            <span className="pair-label">{p.label}</span>
            <div className={`pair-shots ${pairRankModifier(leftIsBetter)}`.trimEnd()}>
              <figure>
                {/* Decorative: the caption beside it already names the position
                    and the serve, and there is nothing in the picture a sentence
                    can carry that the readouts above do not. */}
                {p.left ? <img src={p.left} alt="" loading="lazy" /> : <span className="pair-missing" />}
                <figcaption>
                  {leftCaption}
                  {leftIsBetter !== undefined && (
                    <span className="sr-only">
                      {leftIsBetter ? ' — the better serve' : ' — the worse serve'}
                    </span>
                  )}
                </figcaption>
              </figure>
              <figure>
                {p.right ? <img src={p.right} alt="" loading="lazy" /> : <span className="pair-missing" />}
                <figcaption>
                  {rightCaption}
                  {leftIsBetter !== undefined && (
                    <span className="sr-only">
                      {leftIsBetter ? ' — the worse serve' : ' — the better serve'}
                    </span>
                  )}
                </figcaption>
              </figure>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
