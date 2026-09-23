/**
 * Colour lives in `tokens.css`, and nowhere else says a colour by value.
 *
 * `LOOP.md` settles the palette, and the way a settled palette drifts is not a
 * redesign — it is a sixth hard-coded tint on a new banner, each one a shade off
 * the last. Twenty-three were found and named in one pass; this keeps the count
 * at the handful below, each of which is a colour that is not part of the
 * palette at all.
 */
// No @types/node — the same shim `egress.test.ts` explains and uses.
declare const process: { cwd(): string }
// @ts-expect-error — no @types/node; see egress.test.ts.
import fsUntyped from 'fs'
// @ts-expect-error — no @types/node; see egress.test.ts.
import pathUntyped from 'path'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const fs: {
  readdirSync: (path: string) => string[]
  readFileSync: (path: string, encoding: 'utf8') => string
} = fsUntyped
const path: { join: (...parts: string[]) => string } = pathUntyped

const STYLES = path.join(process.cwd(), 'src', 'styles')

/**
 * The raw values that stay raw, by the declaration they sit in.
 *
 * White light and black shadow are materials rather than colours: a
 * highlight on a button's top edge, the shine sweeping a progress bar, a
 * drop shadow. The player's letterbox is the black a video is shown against,
 * and its chip is white over footage of any colour. The hero's sheen is a
 * gradient stop, used once.
 */
const ONE_OFFS = [
  'background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);',
  'box-shadow: 0 6px 26px -10px var(--lime-glow), inset 0 1px 0 rgba(255, 255, 255, 0.32);',
  'box-shadow: 0 1px 5px rgba(0, 0, 0, 0.6);',
  'background: linear-gradient(168deg, var(--fg) 30%, #97a6b4);',
  'background: #000;',
  'border: 1px solid rgba(255, 255, 255, 0.16);',
  'color: #fff;',
]

heading('Colour is said once, in tokens.css')

check('no stylesheet but tokens.css names a colour by value, beyond the listed one-offs', () => {
  const found: string[] = []
  for (const file of fs.readdirSync(STYLES)) {
    if (file === 'tokens.css' || !file.endsWith('.css')) continue
    const lines = fs.readFileSync(path.join(STYLES, file), 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      const code = line.replace(/\/\*.*?\*\//g, '').trim()
      if (!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(code)) return
      if (ONE_OFFS.includes(code)) return
      found.push(`${file}:${i + 1}  ${code}`)
    })
  }
  assert(
    found.length === 0,
    `raw colours outside tokens.css — name them in tokens.css, or mix a token:\n${found.join('\n')}`,
  )
})

report()
