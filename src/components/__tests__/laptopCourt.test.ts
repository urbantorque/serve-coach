/**
 * The court screen on a laptop (E5.7): the player's own serve fills the left
 * pane, held at the fix's moment, and the reading and the one action share the
 * right. A phone keeps its one column and never loads the figure; a refused
 * clip draws no body, because nothing on it was read.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import GlanceFigure from '../GlanceFigure'
import Glance from '../../screens/Glance'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { faultMoment } from '../../lib/lookFor'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string }
const noop = () => {}

/** A screen of a given width, hands-free off: the layout a laptop opens on. */
function at<T>(wide: boolean, run: () => T): T {
  const g = globalThis as { localStorage?: unknown; window?: unknown }
  const before = { storage: g.localStorage, window: g.window }
  g.localStorage = { getItem: () => JSON.stringify({ handsFree: false }), setItem: noop, removeItem: noop }
  g.window = { matchMedia: () => ({ matches: wide }) }
  try {
    return run()
  } finally {
    g.localStorage = before.storage
    g.window = before.window
  }
}

heading('The court screen on a laptop (E5.7)')

const live = sampleAnalysis()
const flaw = live.triage?.status === 'ok' ? live.triage.primary_flaw?.flaw : undefined

check('the figure is the player’s own serve, held at the fix’s moment', () => {
  assert(flaw !== undefined, 'the sample serve names no fix, so this proves nothing')
  const moment = faultMoment(live.fundamentals ?? [], flaw)
  const out = renderToStaticMarkup(createElement(GlanceFigure, { analysis: live, about: flaw, paint: true }))
  const caption = out.slice(out.indexOf('<figcaption>'), out.indexOf('</figcaption>')).replace(/<[^>]+>/g, '')
  note(`${flaw}, held at ${moment}: “${caption}”`)
  assert(out.includes('<canvas') && out.includes('aria-label="Your serve, paused at'), 'no figure, or a figure with no words for a screen reader')
  assert(moment !== undefined && caption.includes(moment === 'drop' ? 'racket drop' : moment), 'the caption doesn’t name the fix’s moment')
  const plain = renderToStaticMarkup(createElement(GlanceFigure, { analysis: live }))
  assert(plain.includes('Paused at contact'), 'with no fix, the serve isn’t held at contact')
})

const screen = (wide: boolean, analysis = live) =>
  at(wide, () => renderToStaticMarkup(createElement(Glance, { analysis, onOpenReport: noop, onBack: noop, onRecordAnother: noop })))

check('a laptop gets the picture, before the reading; a phone never does', () => {
  const laptop = screen(true)
  assert(laptop.includes('glance-figure') && laptop.indexOf('glance-figure') < laptop.indexOf('glance-body'), 'the laptop has no picture, or it isn’t first')
  assert(!screen(false).includes('glance-figure'), 'a phone drew the laptop’s picture')
})

check('a refused clip draws no body', () => {
  // As `?demo=glance-refused` builds it.
  const refused = { ...live, triage: { ...live.triage, status: 'rejected', reason: 'too_few_frames' } } as typeof live
  const out = screen(true, refused)
  assert(out.includes('glance-hints'), 'the refusal didn’t render, so this proves nothing')
  assert(!out.includes('glance-figure'), 'a refused clip was drawn')
})

check('the laptop lays the picture left and everything else right', () => {
  const css = fs.readFileSync('src/styles/wide.css', 'utf8')
  assert(/\.shell > \.glance:has\(> \.glance-figure\)\s*\{[^}]*grid-template-columns/.test(css), 'no two-pane rule for a pictured court screen')
  assert(/\.glance > :not\(\.glance-top\):not\(\.glance-body\):not\(\.glance-figure\)/.test(css), 'the right-pane rule would also move the picture right')
  assert(/\.glance:has\(> \.glance-figure\) > \.glance-body\s*\{[^}]*grid-column: 2/.test(css), 'the reading doesn’t move right of the picture')
})

report()
