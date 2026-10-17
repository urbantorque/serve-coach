/**
 * Progress as a dashboard (L4.9): four tiles in the first screen, then-and-now
 * one moment at a time, repeatability drawn so a longer bar is steadier, and
 * one share button for the whole sheet.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Progress from '../../screens/Progress'
import FramePair from '../../components/FramePair'
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
  createElement(Progress, { sessions, onBack: noop, onLogDrill: noop, onUndoDrill: noop, seeded: false }),
)

heading('Four tiles, first')

check('the form, records, path and chart tiles come before every section', () => {
  const tiles = html.indexOf('class="tiles"')
  assert(tiles >= 0, 'no tiles')
  const firstSection = html.indexOf('class="block"')
  assert(tiles < firstSection, 'a section comes before the tiles')
  const group = html.slice(tiles, firstSection)
  const form = buildProgress(sessions)!
  const path = servePath(sessions)!
  const holding = path.parts.filter((p) => p.state === 'holding' || p.state === 'locked').length
  note(`typical ${form.latestTrip.overall}, ${holding} of ${path.parts.length} holding, ${form.trips.length} trips`)
  for (const label of ['Typical flat serve', 'Serve path', 'By trip']) assert(group.includes(label), `no ${label} tile`)
  assert(group.includes(`>${form.latestTrip.overall}<`), 'the form tile does not show the trip median')
  assert(group.includes(`${holding}<span class="tile-of">/${path.parts.length}`), 'the path tile miscounts')
  assert((group.match(/class="tile-dot /g) ?? []).length === path.parts.length, 'one dot per part')
  // Each door leads somewhere that exists.
  for (const id of ['progress-path', 'progress-chart']) assert(html.includes(`id="${id}"`), `${id} is not on the sheet`)
})

heading('Then and now, one moment at a time')

check('one pair is shown, with a pill for every moment, and the basket comparison keeps all six', () => {
  const positions = (['trophy', 'drop', 'contact'] as const).map((id) => ({ id, label: id, left: 'a.jpg', right: 'b.jpg' }))
  const one = renderToStaticMarkup(
    createElement(FramePair, { heading: 'Then, and now', leftCaption: 'May', rightCaption: 'June', positions, oneAtATime: true }),
  )
  assert((one.match(/<li/g) ?? []).length === 1, 'more than one moment shown')
  assert((one.match(/class="phase-pill( is-active)?"/g) ?? []).length === 3, 'a moment has no pill')
  assert(one.includes('aria-pressed="true"'), 'no moment is marked as chosen')
  const all = renderToStaticMarkup(createElement(FramePair, { heading: 'Best and worst', leftCaption: 'Best', rightCaption: 'Worst', positions }))
  assert((all.match(/<li/g) ?? []).length === 3 && !all.includes('phase-pill'), 'the basket comparison changed')
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
  assert(out.includes('Longer is steadier'), 'the note still reads the old way round')
})

heading('One share button')

check('the sheet has one share button, with each card inside it', () => {
  assert((html.match(/Share your progress/g) ?? []).length === 1, 'not exactly one share button')
  for (const old of ['Share your season', 'Share this trip', 'Share: ']) assert(!html.includes(old), `"${old}" is still its own button`)
  const menu = html.slice(html.indexOf('class="share-menu"'))
  assert(menu.includes('This trip'), 'the trip card is not inside the share button')
})

report()
