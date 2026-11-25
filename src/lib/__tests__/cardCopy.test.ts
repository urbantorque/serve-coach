/**
 * The words on the one artifact other people see.
 *
 * WHY THIS FILE EXISTS. C5's audit found that this repo's two copy gates cover
 * tables and JSX, and that a third kind of copy sits between them — assembled or
 * declared somewhere neither gate walks. It found three shipped defects in the
 * practice card. **The share card is the same gap and a worse place for it.**
 *
 * `reportCard.ts` makes forty-four `fillText` calls and no gate had ever read one
 * of them. Everything else this app writes is read by the player alone, on their
 * own phone, and can be corrected on the next report. A share card is a PNG that
 * goes to a coach, a partner, a group chat. It is the only copy in this app that
 * cannot be taken back.
 *
 * WHAT IT FOUND ON ITS FIRST RUN: the privacy footer, printed on **every** card,
 * read *"Measured on device · nothing was uploaded"* — passive, and passive in
 * the one sentence that is a promise rather than a description. Every other
 * privacy line in the app is active and says the same thing in the same words:
 * `Home.tsx` has "Your video stays on this device and never leaves it",
 * `FramingCheck.tsx` has "Your video never leaves the device".
 *
 * PARTIAL COVERAGE, AND SAYING SO IS THE POINT. Fifteen of the forty-four drawn
 * strings are literals this can see; the rest are built from variables at draw
 * time and are invisible to a regex, exactly as `jsxCopy.test.ts` admits about
 * interpolated JSX. A gate that implied it read all forty-four would be worse
 * than one that says it reads fifteen.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { cueIssues, wordCount } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string }
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }

const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/share/reportCard.ts'), 'utf8')

/**
 * Strings long enough to be a sentence rather than a label.
 *
 * Starts with a capital and runs at least twelve characters — `jsxCopy.test.ts`'s
 * heuristic, for its reasons. It over-matches a comment and under-matches
 * anything interpolated, and both directions are named rather than tuned away.
 */
const LITERALS = [
  ...[...src.matchAll(/'([A-Z][^']{11,})'/g)].map((m) => m[1]),
  // A template whose only hole is the device's name (N3.4), read the way the
  // suite's own device reads it: as a phone.
  ...[...src.matchAll(/`([A-Z][^`]{11,})`/g)]
    .map((m) => m[1])
    .filter((t) => (t.match(/\$\{/g) ?? []).length === (t.match(/\$\{deviceNoun\(\)\}/g) ?? []).length)
    .map((t) => t.replace(/\$\{deviceNoun\(\)\}/g, 'phone')),
]

/**
 * Drawn strings the editor is wrong about.
 *
 * All-caps kickers are labels, not cues — "WORK ON THIS NEXT" is a heading in
 * the same sense `t-overline` is on screen, and the report already carries that
 * exact phrase as a heading. Each row says why.
 */
const RULINGS: readonly { text: string; why: string }[] = []

heading('The words on the card that leaves the phone')

check('every sentence drawn on a share card answers to the editor', () => {
  const ruled = new Set(RULINGS.map((r) => r.text))
  const failing = LITERALS.filter((l) => !ruled.has(l) && cueIssues(l).length > 0)
  assert(
    failing.length === 0,
    failing
      .map((f) => `"${f}" fails the editor: ${cueIssues(f).join('; ')}`)
      .join(' · ') +
      '. This is the one copy in the app that can’t be taken back — it is a PNG in somebody ' +
      "else's chat.",
  )
  note(`${LITERALS.length} drawn literals read, ${RULINGS.length} ruled exempt`)
})

check('no drawn sentence runs past the cap', () => {
  // Tighter than the screen in practice, because a card is a fixed-width canvas
  // and a long line is clipped rather than wrapped — but the cap is the cap, and
  // the clipping is `reportCard.ts`'s own problem to measure.
  const over = LITERALS.filter((l) => wordCount(l) > 25)
  assert(over.length === 0, over.map((o) => `"${o}" is ${wordCount(o)} words`).join(' · '))
  note(`longest drawn line: ${Math.max(...LITERALS.map(wordCount))} words`)
})

check('the privacy footer is active, and says what the rest of the app says', () => {
  /*
   * Pinned specifically, because it is the sentence most worth being right and
   * the one that was wrong. It is a promise rather than a description, printed
   * on every card, and read by people who have never opened this app.
   *
   * Checked for agreement with the screens rather than for exact words: three
   * surfaces say this and they must not drift into three different claims.
   */
  const footer = LITERALS.find((l) => /Measured on/.test(l))
  assert(footer !== undefined, 'the card no longer carries a privacy footer at all')
  note(`footer: "${footer}"`)
  assert(cueIssues(footer!).length === 0, `the footer fails the editor: ${cueIssues(footer!).join('; ')}`)
  assert(
    /never left it|never leaves/.test(footer!),
    `the footer no longer says the video stayed put: "${footer}"`,
  )
})

check('the scan can still see the card at all', () => {
  /*
   * The half every text-matched gate in this repo has had to grow. A regex that
   * stopped matching would report zero failures and pass everything — and
   * `tallies.test.ts` exists because this repo once shipped a suite that passed
   * while proving nothing.
   */
  assert(LITERALS.length >= 12, `only ${LITERALS.length} drawn literals found in reportCard.ts`)
  const draws = (src.match(/fillText\(/g) ?? []).length
  assert(draws > 30, `only ${draws} fillText calls found, so this file may have been restructured`)
  note(`${draws} fillText calls, ${LITERALS.length} of them from literals this can read`)
})

report()
