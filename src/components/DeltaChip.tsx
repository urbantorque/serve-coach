import type { ChangeScope } from '../lib/analysis/realChange'
import { deltaStatus } from '../lib/progress'

/**
 * Colour is never the only channel here — the sign and the arrow carry the same
 * meaning, which is what keeps this readable for a colourblind reader and in
 * forced-colours mode.
 *
 * `scope` says what the change is a change of, which sets how far it has to
 * go to be the serve rather than the camera (`REAL_CHANGE`, L3.1). `alike`
 * says whether the two serves were graded on the same rows.
 */
export function DeltaChip({
  delta,
  scope,
  alike = true,
  compact = false,
}: {
  delta?: number
  scope: ChangeScope
  alike?: boolean
  compact?: boolean
}) {
  if (delta === undefined) return null
  const state = deltaStatus(delta, scope, alike)

  // A noise-level change shows the dash alone. Printing the digit as well reads
  // as a negative number when it sits beside a score — "92" then "–1" looks
  // like ninety-one — and the whole point of the threshold is that the digit
  // does not mean anything.
  if (state === 'flat') {
    return (
      <span className={`delta delta--flat${compact ? ' delta--compact' : ''}`}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">no real change</span>
      </span>
    )
  }

  // Past the line, but the two serves were measured on different rows — the
  // drop found on one and not the other, say — so the gap is partly the
  // measuring. The neutral chip, with a mark that says "about" rather than the
  // dash that says "nothing", and no digit for the same reason the dash has
  // none.
  if (state === 'soft') {
    return (
      <span className={`delta delta--flat${compact ? ' delta--compact' : ''}`} title="Measured differently, so not compared">
        <span aria-hidden="true">≈</span>
        <span className="sr-only">measured differently, so not compared</span>
      </span>
    )
  }

  const up = delta > 0
  return (
    <span className={`delta delta--${state}${compact ? ' delta--compact' : ''}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="tnum">{Math.abs(delta)}</span>
      <span className="sr-only">{up ? 'up' : 'down'}</span>
    </span>
  )
}

