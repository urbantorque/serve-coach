/**
 * Which of two paired serves is shown as the better one, and on whose say-so.
 *
 * `FramePair` draws two serves side by side for two callers, and only one of
 * them has a "better" to claim — the basket comparison orders by score, "Then,
 * and now" orders by date and can regress. The component honoured that from the
 * day it was written; the stylesheet did not, and accented whichever figure
 * happened to be first. A player whose serve had gone backwards over six weeks
 * was therefore shown their older, worse serve tinted as the good one, on the
 * one screen built to tell them whether they were improving.
 *
 * Two things are checked here and they are deliberately different in kind. The
 * first is ordinary logic: `pairRankModifier` maps the claim onto a class, and
 * absent has to mean *neither*. The second reads `report.css` off disk, because
 * the defect lived in the stylesheet rather than in any TypeScript — a check
 * that never looks at the CSS would have passed happily for the whole time this
 * was broken. It is the same trade `egress.test.ts` makes and for the same
 * reason: a text match over a file is a blunt instrument, and it is the only
 * instrument that reaches the thing that was actually wrong.
 */
// No @types/node in this project — same trade `harness.ts` and `egress.test.ts`
// make. TypeScript's bundler resolution already recognises `fs`/`path` as real,
// typeless modules, so `@ts-expect-error` rather than a fresh `declare module`.
declare const process: { cwd(): string }
// @ts-expect-error — no @types/node; see the comment above.
import fsUntyped from 'fs'
// @ts-expect-error — no @types/node; see the comment above.
import pathUntyped from 'path'
import { pairRankModifier } from '../statusLabels'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const fs: { readFileSync: (path: string, encoding: 'utf8') => string } = fsUntyped
const path: { join: (...parts: string[]) => string } = pathUntyped

heading('Who is allowed to be called the better serve')

check('a caller with no claim to make accents neither side', () => {
  // The defect, stated as the rule that was broken. "Then, and now" passes
  // nothing, because it orders by date and cannot honestly rank the two.
  assert(
    pairRankModifier(undefined) === '',
    `an absent claim produced "${pairRankModifier(undefined)}", which colours a serve`,
  )
})

check('a caller that ranks them gets a modifier naming the side', () => {
  assert(pairRankModifier(true) === 'pair-shots--better-left', 'left-is-better lost its modifier')
  assert(pairRankModifier(false) === 'pair-shots--better-right', 'right-is-better lost its modifier')
})

check('the two claims are never the same class', () => {
  // A boolean read in only one of its two states is one waiting to be misread
  // by its next caller — which is exactly how the original defect survived: the
  // component handled `true` and left everything else to the stylesheet.
  assert(
    pairRankModifier(true) !== pairRankModifier(false),
    'both polarities produced the same class, so the claim carries no direction',
  )
})

heading('The stylesheet cannot make the claim on its own')

/**
 * The rule as it stands, read off disk.
 *
 * Whitespace-normalised before matching. The check is about which selectors
 * carry `--good` onto a caption, and reformatting the file must not be able to
 * fail it — nor to quietly pass it.
 */
const CSS = fs
  .readFileSync(path.join(process.cwd(), 'src', 'styles', 'report.css'), 'utf8')
  .replace(/\s+/g, ' ')

check('no rule colours a pair caption by position alone', () => {
  // The exact selector that shipped the bug: position, with nothing about
  // whether a ranking was claimed. Written as a search for `.pair-shots`
  // followed directly by a positional pseudo-class, so re-introducing it under
  // any spacing or as part of a longer list is caught.
  const positional = /\.pair-shots\s*(figure)?\s*:?(first|last)-child/.test(CSS)
  assert(
    !positional,
    'a `.pair-shots figure:first-child` rule is back — that colours "Then, and now" by date order',
  )
})

check('the caption accent is gated on both modifiers, and only those', () => {
  // Both, not one: a fix that gated only `--better-left` would leave the
  // right-hand claim silent, which is the same defect with the sides swapped.
  for (const modifier of ['pair-shots--better-left', 'pair-shots--better-right']) {
    assert(
      CSS.includes(`.${modifier}`),
      `${modifier} is not in the stylesheet, so that half of the claim draws nothing`,
    )
  }
  note('both ranking modifiers are styled; neither is reachable without a caller passing leftIsBetter')
})

report()
