/**
 * Progress as a dashboard (L4.9, lift): the shape of the player's serve first,
 * then-and-now one moment at a time, repeatability drawn so a longer bar is
 * steadier, one share button for the whole sheet, and the list in its own sheet.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Progress from '../../screens/Progress'
import FramePair from '../../components/FramePair'
import ThenNow from '../../components/ThenNow'
import { GapTrend } from '../../components/Trend'
import { steadyWidth } from '../../components/trendGeometry'
import { buildProgress } from '../progress'
import { servePath } from '../servePath'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import type { ServeDials } from '../analysis/syntheticServe'
import type { Session } from '../storage/db'
import type { ConsistencyPoint } from '../progress'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function rigTrip(day: number, dials: Partial<ServeDials>, count = 3): Session[] {
  return Array.from({ length: count }, (_, i) => {
    const { frames: _f, ...a } = sampleAnalysis({ ...dials, seed: day * 10 + i + 1 })
    void _f
    return { ...a, id: `serve-pd${day}x${i}-0`, createdAt: day * DAY + i * HOUR, scoringVersion: 5 } as Session
  })
}

const NO_DROP: Partial<ServeDials> = { dropBelowShoulder: -0.25 }
const sessions = [...rigTrip(0, NO_DROP), ...rigTrip(3, {}), ...rigTrip(6, {})].sort((a, b) => b.createdAt - a.createdAt)
const noop = () => {}
const html = renderToStaticMarkup(
  createElement(Progress, { sessions, onBack: noop, onOpen: noop, onLogDrill: noop, onUndoDrill: noop, seeded: false }),
)

heading('The shape first')

check('the typical serve and the ribbon come before every section, and the records right under them', () => {
  const shape = html.indexOf('class="shape"')
  assert(shape >= 0, 'no shape')
  const firstSection = html.indexOf('class="block')
  assert(shape < firstSection, 'a section comes before the shape')
  const form = buildProgress(sessions)!
  const path = servePath(sessions)!
  note(`typical ${form.latestTrip.overall}, ${form.trips.length} trips`)
  const top = html.slice(shape, firstSection)
  assert(top.includes(`>${form.latestTrip.overall}<`), 'the head does not show the trip median')
  assert(top.includes('class="ribbon'), 'no ribbon')
  assert(top.includes('id="progress-records"') && top.includes('serves filmed'), 'the records are not under the ribbon')
  // The path stays one tap away, every part on it.
  assert((html.match(/class="path-part /g) ?? []).length === path.parts.length, 'one row per part of the path')
})

heading('Every serve, in its own sheet')

check('the screen ends on one way to the list, and the list is not on the page', () => {
  assert(html.includes('class="progress-all"') && html.includes(`>${sessions.length}<`), 'no way to the list, or not the count')
  assert(!html.includes('history-trip'), 'the whole list is back on the page')
})

heading('Then and now, one moment at a time')

check('one pair of bodies, one moment chosen, and the basket comparison keeps all six', () => {
  const carried = sessions.filter((s) => s.track)
  assert(carried.length >= 2, 'the seeded serves carry no swing')
  const pair = renderToStaticMarkup(createElement(ThenNow, { then: carried[carried.length - 1], now: carried[0] }))
  assert((pair.match(/<canvas/g) ?? []).length === 2, 'not one pair')
  assert((pair.match(/class="seg-item( is-on)?"/g) ?? []).length === 4, 'a moment has no control')
  assert((pair.match(/aria-pressed="true"/g) ?? []).length === 1, 'no moment is marked as chosen')
  const positions = (['trophy', 'drop', 'contact'] as const).map((id) => ({ id, label: id, left: 'a.jpg', right: 'b.jpg' }))
  const all = renderToStaticMarkup(createElement(FramePair, { heading: 'Best and worst', leftCaption: 'Best', rightCaption: 'Worst', positions }))
  assert((all.match(/<li/g) ?? []).length === 3, 'the basket comparison changed')
})

heading('Second serves, as their own view')

check('enough tagged seconds offers a view of them, and the whole screen follows', () => {
  const tag = (s: Session, serveNumber: 1 | 2) => ({ id: s.id, serveNumber, taggedAt: s.createdAt })
  const tagged = sessions.map((s, i) => tag(s, i % 2 ? 2 : 1))
  const out = renderToStaticMarkup(
    createElement(Progress, { sessions, tags: tagged, onBack: noop, onOpen: noop, onLogDrill: noop, onUndoDrill: noop, seeded: false }),
  )
  assert(out.includes('aria-label="Which serves"') && out.includes('Second serves'), 'no way to see the second serves')
  const few = tagged.slice(0, 3).map((t) => ({ ...t, serveNumber: 2 as const }))
  const none = renderToStaticMarkup(
    createElement(Progress, { sessions, tags: few, onBack: noop, onOpen: noop, onLogDrill: noop, onUndoDrill: noop, seeded: false }),
  )
  assert(!none.includes('aria-label="Which serves"'), 'three seconds were offered as a view')
})

heading('A longer bar is steadier')

check('the bar grows as the gap closes, and the note says so', () => {
  assert(steadyWidth(5, 45) > steadyWidth(20, 45) && steadyWidth(20, 45) > steadyWidth(40, 45), 'a wider gap drew a longer bar')
  const points = [30, 12, 20].map((gap, i) => ({ id: `c${i}`, createdAt: i * DAY, gap }) as unknown as ConsistencyPoint)
  const out = renderToStaticMarkup(createElement(GapTrend, { points }))
  const widths = [...out.matchAll(/gap-fill" style="width:([\d.]+)%/g)].map((m) => Number(m[1]))
  note(`bars ${widths.join(', ')} for gaps 20, 12, 30 (newest first)`)
  // Newest first: gaps 20, 12, 30.
  assert(widths[1] > widths[0] && widths[0] > widths[2], 'the bars do not grow with steadiness')
  assert(out.includes('A longer bar means steadier serves'), 'the note still reads the old way round')
})

heading('One share button')

check('the sheet has one share button, with each card inside it', () => {
  assert((html.match(/Share your progress/g) ?? []).length === 1, 'not exactly one share button')
  for (const old of ['Share your season', 'Share this trip', 'Share: ']) assert(!html.includes(old), `"${old}" is still its own button`)
  const menu = html.slice(html.indexOf('class="share-menu"'))
  assert(menu.includes('This trip'), 'the trip card is not inside the share button')
})

report()
