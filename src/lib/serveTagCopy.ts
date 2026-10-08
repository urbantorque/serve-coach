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
