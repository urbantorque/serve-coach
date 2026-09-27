// DESIGN §13.7 item 2: parse tokens.css and assert every §2.3 pair meets its WCAG requirement in
// Day, Night and Court-side. Also keeps the z-index tokens in step with ui/tokens/z.ts.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Z } from '../tokens/z.ts'

const tokensCss = readFileSync(resolve(process.cwd(), 'src/ui/styles/tokens.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`missing ${selector}`)
  const body = tokensCss.slice(start, tokensCss.indexOf('\n}', start))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const day = block(':root')
const sets = {
  Day: day,
  Night: { ...day, ...block("[data-theme='dark']") },
  'Court-side': { ...day, ...block("[data-contrast='court']") },
}

function hex(set: Record<string, string>, name: string): string {
  let v = set[name]
  for (let i = 0; v?.startsWith('var(') && i < 5; i++) v = set[v.slice(4, -1)]
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a hex colour: ${v}`)
  return v
}

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** [foreground, background, minimum] from DESIGN §2.3. */
const PAIRS: [string, string, number][] = [
  // Primary and secondary text: AAA (7:1) in every set.
  ['--ink', '--bg', 7], ['--ink', '--surface', 7], ['--ink', '--surface-2', 7],
  ['--ink-2', '--bg', 7], ['--ink-2', '--surface', 7], ['--ink-2', '--surface-2', 7],
  // Other text: AA 4.5.
  ['--ink-3', '--bg', 4.5], ['--ink-3', '--surface', 4.5], ['--ink-3', '--surface-2', 4.5],
  ['--ink-inverse', '--surface-inverse', 4.5],
  ['--on-optic', '--optic', 4.5], ['--on-optic', '--optic-press', 4.5],
  ['--ink', '--good-soft', 4.5], ['--ink', '--bad-soft', 4.5],
  ['--critical', '--surface', 4.5], ['--critical', '--critical-soft', 4.5], ['--ink', '--critical-soft', 4.5],
  ['--on-critical', '--critical', 4.5],
  // Graphics and control boundaries: 3:1.
  ['--optic-edge', '--surface', 3], ['--line-strong', '--surface', 3], ['--line-strong', '--bg', 3],
  ['--focus', '--surface', 3],
  ['--good', '--good-soft', 3], ['--good', '--surface', 3],
  ['--bad', '--bad-soft', 3], ['--bad', '--surface', 3],
  ['--neutral', '--surface', 3], ['--attention', '--surface', 3],
  ['--cat-1', '--surface', 3], ['--cat-2', '--surface', 3], ['--cat-3', '--surface', 3],
]

describe('colour tokens (DESIGN §2.2, §2.3)', () => {
  for (const [setName, set] of Object.entries(sets)) {
    it(`${setName}: every text and graphic pair meets its requirement`, () => {
      const failures = PAIRS.map(([fg, bg, min]) => ({ fg, bg, min, ratio: contrast(hex(set, fg), hex(set, bg)) }))
        .filter((p) => p.ratio < p.min)
        .map((p) => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)} < ${p.min}`)
      expect(failures).toEqual([])
    })
  }

  it('no pure black or white in the standard themes (taste skill, DESIGN §0)', () => {
    for (const set of [sets.Day, sets.Night]) {
      for (const v of Object.values(set)) expect(v.toLowerCase()).not.toMatch(/^#(000000|ffffff)$/)
    }
  })

  it('Day values match the DESIGN §2.2 table for the key tokens', () => {
    expect(hex(sets.Day, '--bg')).toBe('#f1f3ef')
    expect(hex(sets.Day, '--optic')).toBe('#d4ee48')
    expect(hex(sets.Night, '--bg')).toBe('#0b0f0d')
    expect(hex(sets['Court-side'], '--ink')).toBe('#060907')
    expect(sets['Court-side']['--border-w']).toBe('2px')
  })
})

describe('z-index layers (DESIGN §5.4)', () => {
  it('tokens.css and z.ts agree', () => {
    const css = { content: '--z-content', sticky: '--z-sticky', tabbar: '--z-tabbar', videoControls: '--z-video-controls', sheet: '--z-sheet', toast: '--z-toast', camera: '--z-camera' }
    for (const [k, name] of Object.entries(css)) expect(Number(day[name])).toBe(Z[k as keyof typeof Z])
  })
})
