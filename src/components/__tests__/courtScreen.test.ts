/**
 * The court screen, read from a fence (E4.4): a guided set's big line is the
 * set's own fault, and a strain warning leads, above the numbers.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Glance from '../../screens/Glance'
import { DEMO_DIALS, sampleAnalysis } from '../../dev/sampleAnalysis'
import { FAULT_NAME } from '../../lib/graduation'
import { normalise } from '../../lib/storage/db'
import { causalPlan } from '../../lib/analysis/verdict'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const noop = () => {}

/** Court mode is hands-free on: the readout layout a player walking back sees. */
function onCourt<T>(run: () => T): T {
  const g = globalThis as { localStorage?: unknown; window?: unknown }
  const before = { storage: g.localStorage, window: g.window }
  g.localStorage = { getItem: () => JSON.stringify({ handsFree: true }), setItem: noop, removeItem: noop }
  g.window = { matchMedia: () => ({ matches: false }) }
  try {
    return run()
  } finally {
    g.localStorage = before.storage
    g.window = before.window
  }
}

heading('The court screen, read from a fence (E4.4)')

check('a guided set’s big line names the set’s fault and this serve’s verdict on it', () => {
  const live = sampleAnalysis()
  const first = live.triage?.status === 'ok' ? live.triage.primary_flaw?.flaw : undefined
  const target = 'shallow_drop'
  assert(first !== undefined && first !== target, 'the sample serve’s first fix is the set’s fault, so this proves nothing')
  const out = onCourt(() =>
    renderToStaticMarkup(createElement(Glance, { analysis: live, onOpenReport: noop, onBack: noop, onRecordAnother: noop, trip: { ladder: { [target]: 1 }, target } })),
  )
  const line = out.slice(out.indexOf('court-readout-line'), out.indexOf('</p>', out.indexOf('court-readout-line')))
  note(line.replace(/<[^>]+>/g, '').replace(/^[^>]*>/, ''))
  assert(line.includes(FAULT_NAME[target]), 'the big line doesn’t name the set’s fault')
  assert(!line.includes(live.focus.title), 'the big line still names another fault')
})

check('on court, a strain warning leads, above the numbers', () => {
  // The line the app works out from the player's sessions (`glanceStrainLine`), handed in as it is there.
  const strain = 'That’s your lower back in 3 of your last 3 sessions.'
  const sore = sampleAnalysis({ spineLean: DEMO_DIALS.injury.spineLean, cameraYaw: DEMO_DIALS.injury.cameraYaw })
  const out = onCourt(() => renderToStaticMarkup(createElement(Glance, { analysis: sore, onOpenReport: noop, onBack: noop, onRecordAnother: noop, strain })))
  assert(out.includes('glance-strain') && out.includes('court-readout'), 'the court layout or the warning went missing')
  assert(out.indexOf('glance-strain') < out.indexOf('court-readout'), 'the strain warning sits under the numbers')
  assert((out.match(/glance-strain/g) ?? []).length === 1, 'the warning is drawn twice')
})

heading('The court screen names what the report names (Mirror M1.4)')

// The landing's real serve: scored, no graded fault, and a card row to work on.
const real = normalise(JSON.parse((fsUntyped as { readFileSync: (p: string, e: string) => string }).readFileSync('public/landing/report.json', 'utf8')))!

check('a serve with no graded fault is named by its card’s focus, on court and off, as its report is', () => {
  assert(causalPlan(real.triage, real.diagnosis).length === 0, 'the real serve now has a graded fault, so this proves nothing')
  const props = { analysis: real, onOpenReport: noop, onBack: noop, onRecordAnother: noop }
  const court = onCourt(() => renderToStaticMarkup(createElement(Glance, props)))
  const line = court.slice(court.indexOf('court-readout-line'), court.indexOf('</p>', court.indexOf('court-readout-line'))).replace(/<[^>]+>/g, '')
  note(`on court: ${line.replace(/^[^>]*>/, '')}`)
  assert(line.includes(real.focus.title), 'the court line doesn’t name the report’s fix')
  assert(!court.includes('Nothing stood out'), 'it still says nothing stood out')
  const g = globalThis as { localStorage?: unknown; window?: unknown }
  const before = { storage: g.localStorage, window: g.window }
  g.localStorage = { getItem: () => JSON.stringify({ handsFree: false }), setItem: noop, removeItem: noop }
  g.window = { matchMedia: () => ({ matches: false }) }
  try {
    const off = renderToStaticMarkup(createElement(Glance, props))
    assert(off.includes(real.focus.title) && !off.includes('Nothing stood out'), 'off court it still says nothing stood out')
  } finally {
    g.localStorage = before.storage
    g.window = before.window
  }
})

report()
