/**
 * A time estimate (L6.9): how long an analysis takes, from this phone's own
 * past ones — nothing until there are enough, a cold engine kept apart, a
 * basket counted per serve.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { MIN_TIMINGS, estimateLine, roughSeconds, timingsOf } from '../analysis/timings'
import Analyzing from '../../screens/Analyzing'
import type { Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const past = (warm: number[], cold: number[] = []): Session[] =>
  [
    ...warm.map((ms) => ({ cost: { ms, coldEngine: false } })),
    ...cold.map((ms) => ({ cost: { ms, coldEngine: true } })),
  ] as unknown as Session[]

heading('A time estimate')

check('nothing is promised until this phone has done enough of them', () => {
  assert(estimateLine(timingsOf(past([20_000, 22_000]))) === undefined, `an estimate from ${MIN_TIMINGS - 1} passes`)
  assert(estimateLine(undefined) === undefined, 'an estimate from nothing')
})

check('the estimate is the warm median, rounded to what a player can hold', () => {
  const line = estimateLine(timingsOf(past([24_100, 25_400, 31_000, 19_000])))
  note(line ?? 'none')
  assert(line === 'About 25 seconds on this phone.', `said "${line}"`)
  assert(roughSeconds(12_300) === 12 && roughSeconds(26_900) === 25 && roughSeconds(300) === 1, 'rounding')
  // A cold pass is a download and is not let near the warm figure.
  assert(estimateLine(timingsOf(past([10_000, 10_000, 10_000], [90_000]))) === 'About 10 seconds on this phone.', 'a cold pass moved the warm estimate')
})

check('a cold engine is said as a download, priced when this phone has priced one', () => {
  const warmOnly = timingsOf(past([10_000, 11_000, 12_000]))
  assert(estimateLine(warmOnly, { cold: true }) === 'About 11 seconds on this phone, plus the first download.', 'an unpriced download was priced')
  const withCold = timingsOf(past([10_000, 11_000, 12_000], [60_000, 70_000, 80_000]))
  assert(estimateLine(withCold, { cold: true }) === 'About 70 seconds on this phone, with the first download.', `said "${estimateLine(withCold, { cold: true })}"`)
})

check('a basket is the per-serve figure times its serves', () => {
  const t = timingsOf(past([25_000, 25_000, 25_000]))
  const line = estimateLine(t, { serves: 6 })
  assert(line === 'About 3 minutes for 6 serves on this phone.', `said "${line}"`)
  assert(estimateLine(t, { serves: 3 }) === 'About 75 seconds for 3 serves on this phone.', 'a short basket')
})

check('the analysing screen says it', () => {
  const out = renderToStaticMarkup(
    createElement(Analyzing, {
      progress: { step: 'tracking', ratio: 0.2 } as never,
      fileName: 'serve.mp4',
      onCancel: () => {},
      history: past([20_000, 21_000, 22_000]),
    }),
  )
  assert(out.includes('About 20 seconds on this phone.'), 'the estimate never reached the screen')
})

report()
