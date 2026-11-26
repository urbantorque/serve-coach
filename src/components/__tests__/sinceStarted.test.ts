/**
 * The progress story's head (E4.3): "since you started" only when it is true,
 * and under the two bodies only what the screen already holds to the noise.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import ThenNow from '../ThenNow'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { normalise, type Session } from '../../lib/storage/db'
import { shortDate } from '../../lib/progress'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

const DAY = 86_400_000
const T0 = new Date(2026, 9, 10, 10).getTime()
const stored = (id: string, at: number, dials = {}): Session => {
  const { frames: _f, ...rest } = sampleAnalysis(dials)
  void _f
  return normalise({ ...rest, id, createdAt: at })!
}

heading('The progress story, as proof (E4.3)')

const then = stored('then', T0)
const now = stored('now', T0 + 40 * DAY, { tossArmHold: 0.72 })
const draw = (since?: Parameters<typeof ThenNow>[0]['since']) => renderToStaticMarkup(createElement(ThenNow, { then, now, since }))

check('"since you started" only when the earlier serve is the first', () => {
  assert(draw({ first: true, gone: [] }).includes('Since you started'), 'the first serve is not said as the start')
  const dated = draw({ first: false, gone: [] })
  assert(!dated.includes('Since you started') && dated.includes(`Since ${shortDate(then.createdAt)}`), 'a later serve was called the start')
})

check('what moved is listed under the bodies, and nothing when nothing did', () => {
  const out = draw({ first: true, gone: ['Leg drive', 'Tossing arm'], speed: 'Your serve speed went up: about 78 to about 85 mph.' })
  assert(out.includes('then-now-since') && out.includes('Gone since then: leg drive, tossing arm.') && out.includes('about 85 mph'), 'the faults gone or the speed went missing')
  assert(!draw({ first: true, gone: [] }).includes('then-now-since'), 'an empty list was drawn')
})

report()
