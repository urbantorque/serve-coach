/**
 * One motion language (E1.7; DESIGN.md, Motion).
 *
 * Presses gave by eleven different amounts, from 0.9 to 0.985, and only one
 * kind of fold moved as it opened. The language is one movement per kind of
 * change: a press by the size of what is pressed, a fold rising into place, a
 * sheet, a screen, and the arrivals that keep their own timing. This reads
 * every stylesheet and holds it to that, so the next control added presses the
 * same way the last one did.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string) => string[] }

const sheets = fs
  .readdirSync('src/styles')
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ f, css: fs.readFileSync(`src/styles/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))

const rules = sheets.flatMap(({ f, css }) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ f, selector: m[1].trim(), body: m[2] })))

/**
 * The durations that are not tokens, each with why: arrivals that keep their
 * own timing, the sheet's quicker way out, and reduced motion's zero.
 */
const OWN_TIMING: Record<string, string[]> = {
  'analysing.css': ['2.4s', '1.2s', '1.6s', '320ms'], // the waiting screen: its loops, and the bar that fills
  'controls.css': ['1s'], // the score ring, timed with the count-up it draws
  'report.css': ['520ms', '620ms', '160ms', '300ms', '420ms'], // the report's replay and its moment plate
  'states.css': ['200ms'], // a sheet leaving: SHEET_EXIT_MS in primitives.tsx
  'tokens.css': ['0.01ms'], // reduced motion
}

heading('One motion language (E1.7)')

check('every press gives by one of the three press sizes', () => {
  const presses = rules.filter((r) => /:active\b/.test(r.selector) && /transform\s*:/.test(r.body))
  const off = presses.filter((r) => !/transform\s*:\s*var\(--press(-wide|-small)?\)/.test(r.body))
  note(`${presses.length} press rules`)
  assert(presses.length >= 18, `only ${presses.length} press rules: the scan has stopped seeing them`)
  assert(off.length === 0, `a press off the scale: ${off.map((r) => `${r.f} ${r.selector}`).join('; ')}`)
  const tokens = sheets.find((s) => s.f === 'tokens.css')!.css
  for (const t of ['--press-wide', '--press', '--press-small']) assert(new RegExp(`${t}\\s*:\\s*scale\\(`).test(tokens), `${t} is not a scale in tokens.css`)
})

check('every fold opens the same way, at the sheet’s pace, and leaves nothing on transform', () => {
  const fold = rules.find((r) => r.f === 'controls.css' && r.selector === 'details[open] > :not(summary)')
  assert(fold !== undefined, 'no shared fold rule in controls.css')
  assert(/animation\s*:\s*unfold\s+var\(--base\)\s+var\(--ease-out\)\s+backwards/.test(fold!.body), `the fold is "${fold!.body.trim()}"`)
  const unfolds = sheets.filter((s) => /@keyframes\s+unfold\b/.test(s.css))
  assert(unfolds.length === 1, `@keyframes unfold is defined ${unfolds.length} times: ${unfolds.map((s) => s.f).join(', ')}`)
  const both = rules.filter((r) => /animation\s*:\s*unfold[^;]*\bboth\b/.test(r.body))
  assert(both.length === 0, `a fold left on transform: ${both.map((r) => r.selector).join(', ')}`)
})

check('every other duration is a token', () => {
  const found: string[] = []
  for (const { f, css } of sheets) {
    for (const m of css.matchAll(/(?:animation|transition)(?:-duration|-delay)?\s*:\s*([^;]+);/g)) {
      const raw = m[1].replace(/var\([^)]*\)/g, '')
      for (const t of raw.match(/\b\d*\.?\d+m?s\b/g) ?? []) if (!(OWN_TIMING[f] ?? []).includes(t)) found.push(`${f} ${t}`)
    }
  }
  assert(found.length === 0, `durations that should be --fast, --base or --slow, or listed with why: ${found.join(', ')}`)
})

check('under reduced motion, everything is at rest', () => {
  const tokens = sheets.find((s) => s.f === 'tokens.css')!.css
  assert(/prefers-reduced-motion:\s*reduce[\s\S]*animation-duration:\s*0\.01ms\s*!important[\s\S]*transition-duration:\s*0\.01ms\s*!important/.test(tokens), 'the reduced-motion rule went')
})

report()
