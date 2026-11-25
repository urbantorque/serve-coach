/**
 * The words on the serve-tag controls, held once for the two screens that draw
 * them: the glance after a recorded serve, and every report (D5.1).
 */
import type { ServeOutcome } from './storage/db'

/**
 * The four outcomes as the player would say them.
 *
 * Sentence case and one word each, because these are chips in a row and not
 * sentences. 'In' rather than 'Went in' for the same reason the serve-number
 * buttons say 'First serve' and not 'It was a first serve'.
 */
export const OUTCOME_LABEL: Record<ServeOutcome, string> = {
  in: 'In',
  long: 'Long',
  net: 'Net',
  wide: 'Wide',
}

export const SERVE_NUMBER_LABEL: Record<1 | 2, string> = {
  1: 'First serve',
  2: 'Second serve',
}

/** Where it landed, as the end of a sentence. */
const LANDED: Record<ServeOutcome, string> = { in: 'in', long: 'long', net: 'in the net', wide: 'wide' }

/**
 * The one line that stands for both tag rows while they are folded away
 * (2026-11-25). The rows were two always-open rows of chips on the report and
 * on the court screen, which read as a form a player had to fill in. They are
 * optional: the app cannot see where a ball lands, and it guesses the serve
 * number only once the player's own record shows the pattern
 * (`serveGuess.ts`). So the screen says what it already knows, and a tap opens
 * the choices.
 */
export function serveTagSummary(
  serveNumber: 1 | 2 | undefined,
  outcome: ServeOutcome | undefined,
  guess?: 1 | 2,
): string {
  const number = serveNumber ? SERVE_NUMBER_LABEL[serveNumber] : undefined
  const landed = outcome ? LANDED[outcome] : undefined
  if (number && landed) return `${number}, ${landed}. Change`
  if (number) return `${number}. Add where it landed`
  if (landed) return `Landed ${landed}. Add first or second serve`
  if (guess) return `Looks like a ${SERVE_NUMBER_LABEL[guess].toLowerCase()}. Tell me how it went`
  return 'Tell me how this serve went (optional)'
}
