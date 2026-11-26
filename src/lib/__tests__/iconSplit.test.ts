/**
 * The glyphs are split where the first screen ends (E0.3).
 *
 * `icons.ts` sits on the entry chunk, and `iconsMore.ts` loads after the first
 * paint. A glyph an entry module draws but that lives in `iconsMore.ts` would
 * still show, a moment late, with its box held: so the failure this guards is
 * quiet, a blank icon on the first screen for a frame. It walks the static
 * imports from `main.tsx` the way `entryGraph.test.ts` does, and reads each
 * entry module for an icon named in place: `name="back"`, `icon: 'warn'`, or
 * one side of a ternary handed to `name`.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { GLYPHS } from '../../components/icons'
import { MORE_GLYPHS } from '../../components/iconsMore'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string; existsSync: (p: string) => boolean }
const path = pathUntyped as { join: (...p: string[]) => string; dirname: (p: string) => string; normalize: (p: string) => string }

function resolve(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined
  const base = path.normalize(path.join(path.dirname(from), spec))
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (fs.existsSync(base + ext)) return base + ext
  }
  return undefined
}

function entryModules(): string[] {
  const start = path.normalize('src/main.tsx')
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    const file = queue.shift()!
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
      if (m[1]) continue
      const to = resolve(file, m[2])
      if (to && !seen.has(to)) {
        seen.add(to)
        queue.push(to)
      }
    }
  }
  return [...seen]
}

/** Where a module names a glyph to draw. */
const draws = (src: string, glyph: string) =>
  new RegExp(`(?:\\bname|\\bicon)\\s*[=:]\\s*\\{?\\s*['"]${glyph}['"]|\\?\\s*['"]${glyph}['"]\\s*:|:\\s*['"]${glyph}['"]\\s*\\}|['"]${glyph}['"]\\s+as\\s+IconName`).test(src)

heading('The glyphs are split where the first screen ends (E0.3)')

const entry = entryModules().filter((f) => !/icons(More)?\.ts$/.test(f))
const later = Object.keys(MORE_GLYPHS)
const first = Object.keys(GLYPHS)

check('the two files share no glyph', () => {
  const both = later.filter((g) => first.includes(g))
  assert(both.length === 0, `in both files: ${both.join(', ')}`)
  note(`${first.length} glyphs on the entry chunk, ${later.length} after the first paint`)
})

check('no module on the entry chunk draws a glyph that loads later', () => {
  const found: string[] = []
  for (const file of entry) {
    const src = fs.readFileSync(file, 'utf8')
    for (const g of later) if (draws(src, g)) found.push(`${file.replace(/\\/g, '/').split('/').pop()} draws ${g}`)
  }
  assert(found.length === 0, `${found.join('; ')}: move the glyph out of LATER in scripts/icons.mjs and regenerate`)
  note(`${entry.length} entry modules read`)
})

check('the split still reaches the glyphs a lazy screen draws', () => {
  // The scan is only as good as its patterns: it has to find at least the
  // later glyphs the lazy screens are known to draw, or it would pass blind.
  const report_ = fs.readFileSync('src/screens/Report.tsx', 'utf8')
  const glance = fs.readFileSync('src/screens/Glance.tsx', 'utf8')
  assert(draws(glance, 'back'), 'the scan no longer sees `name="back"` in Glance.tsx')
  assert(draws(report_, 'chevron'), 'the scan no longer sees the chevron in Report.tsx')
  assert(draws(glance, 'warn'), 'the scan no longer sees the warning glyph in Glance.tsx')
})

check('the first-screen glyphs no entry module names in place are listed', () => {
  // Not a failure: a glyph can be chosen by a value (a moment's icon, a
  // tab's), which this scan cannot see. Listed so the next split starts here.
  const unseen = first.filter((g) => !entry.some((f) => draws(fs.readFileSync(f, 'utf8'), g)))
  note(unseen.length ? `named only by value, or not on the first screen: ${unseen.join(', ')}` : 'every first-screen glyph is named in place')
})

report()
