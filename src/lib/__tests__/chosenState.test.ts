/**
 * One look for "chosen" (E1.4).
 *
 * A picked option was marked four ways: a lime outline in Settings, a filled
 * panel on a segmented control, a lime glow on a pressed chip, and a lime
 * fill on a serve chip or a tag. Lime is for the main action (DESIGN.md), so a
 * screen with a picked option on it had two lime things, and a player moving
 * between screens learned four marks for one meaning. Every rule that styles
 * a chosen choice now draws `--chosen`, and none draws lime.
 *
 * Not choices, and so not held to it: the tab bar's current tab (where you
 * are, which DESIGN.md gives the lime), the framing pips (a reading of the
 * camera) and a chart's picked dot (a point on a line).
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string) => string[] }

const NOT_CHOICES = ['.tab', '.framer-pip', '.ribbon-dot']

/** Every rule whose selector marks a chosen state, with its body. */
function chosenRules(): { file: string; selector: string; body: string }[] {
  const out: { file: string; selector: string; body: string }[] = []
  for (const file of fs.readdirSync('src/styles').filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(`src/styles/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim()
      // Only the rule that sets the state itself: a descendant's colour
      // under a chosen option (`.level-option.is-on strong`) is that option's own business.
      const own = selector.split(',').map((s) => s.trim()).filter((s) => /(\.is-on|\[aria-pressed=['"]?true['"]?\])$/.test(s))
      if (!own.length || own.every((s) => NOT_CHOICES.some((n) => s.startsWith(n)))) continue
      out.push({ file, selector, body: m[2] })
    }
  }
  return out
}

heading('One look for "chosen" (E1.4)')

const rules = chosenRules()

check('every chosen choice draws the one chosen fill', () => {
  const off = rules.filter((r) => !/background:\s*var\(--chosen\)/.test(r.body))
  note(`${rules.length} chosen rules: ${rules.map((r) => r.selector).join(', ')}`)
  assert(rules.length >= 7, `only ${rules.length} chosen rules found: the scan has stopped seeing them`)
  assert(off.length === 0, `not on --chosen: ${off.map((r) => `${r.file} ${r.selector}`).join('; ')}`)
})

check('no chosen choice is lime', () => {
  const lime = rules.filter((r) => /--lime|--moment/.test(r.body))
  assert(lime.length === 0, `lime on a chosen choice: ${lime.map((r) => `${r.file} ${r.selector}`).join('; ')}`)
})

report()
