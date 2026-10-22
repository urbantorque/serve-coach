/**
 * The serve speed on the report and the glance (N2.7): a reading under the
 * hero, a miss only inside the fold, and nothing at all when there is neither.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Report from '../../screens/Report'
import Glance from '../../screens/Glance'
import SpeedRow from '../SpeedRow'
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

check('a reading sits under the hero: the figure, its likely range and the unit switch', () => {
  const html = render(reading)
  const top = aboveFold(html)
  assert(top.includes('aria-label="Serve speed"'), 'no speed row above the fold')
  const kmh = top.includes('<strong>130</strong> km/h') && top.includes('122–139 km/h')
  const mph = top.includes('<strong>81</strong> mph') && top.includes('76–86 mph')
  assert(kmh || mph, 'the figure or its range is missing')
  note(kmh ? 'rendered in km/h' : 'rendered in mph')
  assert(/class="term-word"[^>]*>Likely</.test(top), '"Likely" is not defined on a tap')
  assert(/aria-label="Speed unit"/.test(top) && (top.match(/aria-pressed="true"/g) ?? []).length >= 1, 'the unit switch is missing or shows no state')
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

check('the row never wears a score colour', () => {
  const html = renderToStaticMarkup(createElement(SpeedRow, { speed: reading.speed }))
  assert(!/great|good|fair|work/.test(html), 'the speed row carries a status class')
})

heading('The serve speed, on the glance')

check('a reading is one line on the glance, and a miss is not there at all', () => {
  const read = renderToStaticMarkup(createElement(Glance, { analysis: { ...base, speed: reading }, onOpenReport: noop, onBack: noop }))
  assert(/About (130 km\/h|81 mph) off the racket, likely (122–139|76–86)\./.test(read), 'the glance does not say the speed')
  const missed = renderToStaticMarkup(createElement(Glance, { analysis: { ...base, speed: { miss: 'not_found' } }, onOpenReport: noop, onBack: noop }))
  assert(!missed.includes(SPEED_MISS_LINE.not_found) && !missed.includes('off the racket'), 'the glance said a miss')
})

report()
