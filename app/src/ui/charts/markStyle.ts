/** Colour and class constants shared by the chart marks (tokens only, DESIGN §2.5, §2.6). */
import type { OutcomeMarkKind } from '../copy/strings.ts'

export const OUTCOME_COLOUR: Record<OutcomeMarkKind, string> = {
  in: 'var(--good)',
  untagged: 'var(--neutral)',
  net: 'var(--bad)',
  long: 'var(--bad)',
  wide: 'var(--bad)',
  fault: 'var(--bad)',
}

/** Class for band shapes: flat --band tint, hatched in Court-side (needs <BandHatch> and --hatch set on the svg). */
export const BAND_CLASS = 'fill-band court:fill-(--hatch)'

/** Stable, CSS-safe id from React's useId value. */
export const cssId = (id: string) => `c${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
