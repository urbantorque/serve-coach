/**
 * One lime action a screen (Mirror Wave 1, DESIGN.md: lime means "this is the
 * thing"). The tour counts lime fills on every screen at both sizes; this
 * holds the rules that made two of them, read off the stylesheets, since a
 * test renders no styles.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string }
const css = (file: string) => fs.readFileSync(`src/styles/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(file: string, selector: string): string {
  const text = css(file)
  const at = text.search(new RegExp(`(^|\\n)\\s*${selector.replace(/[.[\]()>~:+-]/g, (c) => `\\${c}`)}\\s*\\{`))
  assert(at >= 0, `no rule for ${selector} in ${file}`)
  return text.slice(text.indexOf('{', at) + 1, text.indexOf('}', at))
}

heading('One lime action a screen (Mirror Wave 1)')

check('playing a clip is never lime: the report’s, the lesson’s and the side by side’s play (M1.1)', () => {
  for (const [file, sel] of [['player.css', '.watch-play'], ['report.css', '.side-play-btn']] as const) {
    const body = rule(file, sel)
    assert(!/background[^;]*--lime\b/.test(body), `${sel} is a lime fill again`)
    assert(/background:\s*var\(--ink-4\)/.test(body) && /color:\s*var\(--fg\)/.test(body), `${sel} isn’t the raised ink control`)
  }
})

check('beside a screen’s own main action, the film button is a ring, not a second fill (M1.2)', () => {
  const body = rule('today.css', '.shell:has(.btn--primary) ~ .tabbar .tab-film')
  assert(!/background[^;]*--lime\b/.test(body), 'the stepped-back film button is still a lime fill')
  assert(/inset 0 0 0 2px var\(--lime\)/.test(body) && /color:\s*var\(--lime\)/.test(body), 'it no longer reads as the lime film button')
  // Where the screen has no main action of its own (Progress), the button keeps its fill.
  assert(/background:\s*var\(--lime\)/.test(rule('today.css', '.tab-film')), 'the film button lost its own fill')
  const app = fs.readFileSync('src/App.tsx', 'utf8')
  assert(/<\/main>\s*\n\s*\{[^}]*\n?\s*<TabBar/.test(app) || app.indexOf('</main>') < app.indexOf('<TabBar'), 'the tab bar no longer follows the screen, so the rule can’t see its main action')
})

report()
