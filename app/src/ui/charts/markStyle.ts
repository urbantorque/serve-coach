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

/**
 * Interval fills (DESIGN §9.7, §12; WCAG 1.4.11). The 80% range is solid in the row colour, so it is at
 * least 3:1 against the 95% tint and the surface in Day, Night and Court-side; the 95% range is a tint
 * with a full-colour outline (3:1 against the surface); the estimate tick is --ink with a --surface
 * halo, overhanging the bars by 4 px. tokens.test.ts checks these pairs in every set.
 */
export const INTERVAL_FILL = { ci95: 0.12, ci95Court: 0.3, ci80: 1 } as const

/** Stable, CSS-safe id from React's useId value. */
export const cssId = (id: string) => `c${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
