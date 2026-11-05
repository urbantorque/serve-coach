/**
 * The serve speed on the report and the glance (N2.7): a reading in the hero,
 * a miss only inside the fold, and nothing at all when there is neither.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Report from '../../screens/Report'
import Glance from '../../screens/Glance'
import Progress from '../../screens/Progress'
import { normalise, type Session } from '../../lib/storage/db'
import { DEMO_DIALS, sampleAnalysis } from '../../dev/sampleAnalysis'
import { SPEED_MISS_LINE } from '../../lib/speedCopy'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const noop = () => {}
const base = sampleAnalysis(DEMO_DIALS.example, undefined, 60)
const reading = { speed: { ms: 36.1, low: 34.04, high: 38.36, samples: 6, span: 0.083, depthAngle: 4 } }
const render = (speed: typeof base.speed) =>
  renderToStaticMarkup(createElement(Report, { analysis: { ...base, speed }, onBack: noop, onAnalyzeAnother: noop }))
/** Everything before the fold opens. */
const aboveFold = (html: string) => html.slice(0, html.indexOf('report-more'))

heading('The serve speed, on the report')

check('a reading sits in the hero: the figure and its likely range (lift: the unit moved to Settings)', () => {
  const html = render(reading)
  const top = aboveFold(html)
  assert(top.includes('aria-label="Serve speed"'), 'no speed row above the fold')
  const kmh = top.includes('<strong>130</strong> km/h') && top.includes('122–139 km/h')
  const mph = top.includes('<strong>81</strong> mph') && top.includes('76–86 mph')
  assert(kmh || mph, 'the figure or its range is missing')
  note(kmh ? 'rendered in km/h' : 'rendered in mph')
  assert(/class="term-word"[^>]*>Likely</.test(top), '"Likely" is not defined on a tap')
  assert(html.indexOf('aria-label="Serve speed"') > html.indexOf('class="hero"'), 'the speed row is above the score')
})

check('a miss is said once, inside the fold, as its sentence', () => {
  const html = render({ miss: 'frame_rate' })
  assert(!aboveFold(html).includes('Serve speed'), 'a miss reached the top of the report')
  const line = SPEED_MISS_LINE.frame_rate
  assert(html.slice(html.indexOf('report-more')).includes(line), 'the miss sentence is not in the fold')
})

check('no speed and no miss show nothing at all', () => {
  const html = render(undefined)
  assert(!html.includes('Serve speed'), 'a speed heading with nothing under it')
})

check('the reading never wears a score colour', () => {
  const html = render(reading)
  const start = html.indexOf('class="hero-speed"')
  const section = html.slice(start, html.indexOf('</section>', start))
  assert(!/great|good|fair|work/.test(section), 'the speed reading carries a status class')
})

heading('The serve speed, on the glance')

check('a reading is one line on the glance, and a miss is not there at all', () => {
  const read = renderToStaticMarkup(createElement(Glance, { analysis: { ...base, speed: reading }, onOpenReport: noop, onBack: noop }))
  assert(/About (130 km\/h|81 mph) off the racket, likely (122–139|76–86)\./.test(read), 'the glance does not say the speed')
  const missed = renderToStaticMarkup(createElement(Glance, { analysis: { ...base, speed: { miss: 'not_found' } }, onOpenReport: noop, onBack: noop }))
  assert(!missed.includes(SPEED_MISS_LINE.not_found) && !missed.includes('off the racket'), 'the glance said a miss')
})

heading('Serve speed over time, on Progress (N2.8)')

check('the record and a clear trend are said; without readings there is no section', () => {
  const { frames: _f, ...rest } = base
  void _f
  const DAY = 86_400_000
  /** A report on trip `trip` (three days apart), `hour` hours in. */
  const at = (trip: number, hour: number, ms?: number): Session => ({
    ...normalise({
      ...rest,
      id: `speed-${trip}-${hour}`,
      speed: ms ? { speed: { ms, low: ms * 0.95, high: ms * 1.05, samples: 6, span: 0.08, depthAngle: 3 } } : undefined,
    })!,
    createdAt: Date.now() - (3 - trip) * 3 * DAY + hour * 3600_000,
  })
  const props = { onLogDrill: noop, onUndoDrill: noop, seeded: false, onBack: noop }
  const quicker = renderToStaticMarkup(createElement(Progress, { ...props, sessions: [at(0, 0, 33), at(0, 1, 33.5), at(1, 0, 40), at(1, 1, 40.5)] }))
  assert(quicker.includes('id="progress-speed"'), 'no speed section with readings')
  // 40.5 overlaps the 40 that took the record, so the record stands, not new.
  assert(/>Fastest serve: about/.test(quicker), "the record is not said, or is said as new")
  assert(/Serving faster than your last trip/.test(quicker), 'a clear rise between trips is not said')
  const none = renderToStaticMarkup(createElement(Progress, { ...props, sessions: [at(0, 0), at(0, 1), at(1, 0)] }))
  assert(!none.includes('progress-speed'), 'a speed section with nothing in it')
})

report()
