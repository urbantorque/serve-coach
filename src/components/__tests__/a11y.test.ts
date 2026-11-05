/**
 * Every control named (M4.3).
 *
 * Each screen is rendered in the states a player meets — a new player's home and
 * a returning one's, a live report, a refused one, the example, the glance, the
 * progress screen — and every button, link and input in it has to carry a name
 * a screen reader can say: its own text, an aria-label, or a label.
 */
import { DEFAULTS } from '../../lib/storage/prefs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Home from '../../screens/Home'
import Report from '../../screens/Report'
import Glance from '../../screens/Glance'
import Progress from '../../screens/Progress'
import { DEMO_DIALS, sampleAnalysis } from '../../dev/sampleAnalysis'
import { normalise, type Session } from '../../lib/storage/db'
import type { Analysis } from '../../lib/analysis/types'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const noop = () => {}
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el)
const stored = (a: Analysis, id: string, at: number): Session => {
  const { frames: _f, ...rest } = a
  void _f
  return { ...normalise({ ...rest, id })!, createdAt: at }
}

/** Every control in the markup with no name a screen reader could say. */
function unnamed(markup: string): string[] {
  const out: string[] = []
  for (const m of markup.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, tag, attrs, inner] = m
    const text = inner.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim()
    if (!text && !/aria-label="[^"]+"/.test(attrs) && !/aria-labelledby="[^"]+"/.test(attrs)) out.push(`<${tag}${attrs.slice(0, 80)}>`)
  }
  for (const m of markup.matchAll(/<input\b([^>]*)>/g)) {
    const attrs = m[1]
    if (/type="hidden"|\bhidden=""/.test(attrs)) continue
    if (!/aria-label="[^"]+"/.test(attrs) && !/id="([^"]+)"/.test(attrs)) out.push(`<input${attrs.slice(0, 80)}>`)
  }
  return out
}

const homeProps = {
  offlineReady: true,
  sessionsLoaded: true,
  prefs: DEFAULTS,
  onPrefs: noop,
  onFilm: noop,
  onOpen: noop,
  onShowHistory: noop,
  onShowSettings: noop,
  onShowProgress: noop,
  onShowExample: noop,
  onRecorded: noop,
  onCheckDrill: noop,
}
const history = Array.from({ length: 6 }, (_, i) => stored(sampleAnalysis(DEMO_DIALS.injury), `serve-a11y-${i}`, Date.now() - (5 - i) * 3 * 86_400_000))

const SCREENS: [string, string][] = [
  ['home, new player', html(createElement(Home, { ...homeProps, sessions: [] }))],
  ['home, returning', html(createElement(Home, { ...homeProps, sessions: history }))],
  ['report, live', html(createElement(Report, { analysis: sampleAnalysis(), onBack: noop, onAnalyzeAnother: noop, onTagServe: noop, onTagOutcome: noop, onLadderStep: noop, onGlance: noop }))],
  ['report, example', html(createElement(Report, { analysis: sampleAnalysis(DEMO_DIALS.example), example: true, onBack: noop, onAnalyzeAnother: noop }))],
  ['glance', html(createElement(Glance, { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop, onTagServe: noop, onTagOutcome: noop, onStartSet: noop, onRecordAnother: noop }))],
  ['progress', html(createElement(Progress, { sessions: history, onLogDrill: noop, onUndoDrill: noop, seeded: false, onBack: noop }))],
]

heading('Every control named')

check('every button, link and input on every screen has a name to say', () => {
  const bad: string[] = []
  let controls = 0
  for (const [name, markup] of SCREENS) {
    controls += (markup.match(/<(button|a|input)\b/g) ?? []).length
    for (const u of unnamed(markup)) bad.push(`${name}: ${u}`)
  }
  note(`${controls} controls across ${SCREENS.length} screens`)
  assert(controls > 40, 'the screens rendered too few controls to mean anything')
  assert(bad.length === 0, `unnamed controls:\n    ${bad.join('\n    ')}`)
})

check('focus follows reading order: nothing jumps the queue with a positive tabindex', () => {
  for (const [name, markup] of SCREENS) {
    const jumps = [...markup.matchAll(/tabindex="([1-9]\d*)"/gi)].map((m) => m[0])
    assert(jumps.length === 0, `${name}: ${jumps.join(', ')}`)
  }
})

check('a toggle says whether it is on', () => {
  for (const [name, markup] of SCREENS) {
    for (const m of markup.matchAll(/<button\b([^>]*class="[^"]*(?:serve-chip|seg-item|chip--toggle)[^"]*"[^>]*)>/g)) {
      assert(/aria-pressed="(true|false)"/.test(m[1]), `${name}: a toggle without aria-pressed: ${m[1].slice(0, 80)}`)
    }
  }
})

report()
