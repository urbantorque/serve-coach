/** A second serve that goes in, read off the player's own tags (N4.3). */
import { MIN_TAGGED, clearlyMoreIn, secondInByTrip, type InRate } from '../secondServe'
import type { ServeTag, Session } from '../storage/db'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const DAY = 24 * 3600 * 1000
const rate = (inn: number, of: number, at = 0): InRate => ({ inn, of, at })

heading('Clearly more in, not luckily more in')

check('a small lucky step isn’t a change, and a real one is', () => {
  assert(!clearlyMoreIn(rate(8, 10), rate(6, 10)), '6 of 10 to 8 of 10 was called a change')
  assert(clearlyMoreIn(rate(17, 20), rate(9, 20)), '9 of 20 to 17 of 20 wasn’t')
  assert(!clearlyMoreIn(rate(9, 20), rate(17, 20)), 'a drop was called more in')
  assert(!clearlyMoreIn(rate(7, 7), rate(0, 7)), `fewer than ${MIN_TAGGED} a side was judged`)
  assert(!clearlyMoreIn(rate(10, 10), rate(10, 10)), 'all in against all in was called a change')
})

check('false changes are rare when nothing changed', () => {
  // Two trips of 12 second serves, both truly 55% in: how often does the test
  // call the second clearly better? It should be near 5% and no worse.
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const draw = (n: number) => Array.from({ length: n }, () => rand() < 0.55).filter(Boolean).length
  let called = 0
  const N = 4000
  for (let i = 0; i < N; i++) if (clearlyMoreIn(rate(draw(12), 12), rate(draw(12), 12))) called++
  assert(called / N <= 0.05, `${((100 * called) / N).toFixed(1)}% of unchanged pairs called better`)
})

heading('Counted from the tags')

check('only second serves tagged with where they landed count, trip by trip', () => {
  const mk = (i: number, day: number): Session => ({ id: `s${i}`, createdAt: day * DAY + i * 60_000 }) as Session
  const sessions = [...Array.from({ length: 10 }, (_, i) => mk(i, 1)), ...Array.from({ length: 10 }, (_, i) => mk(100 + i, 9))]
  const tags: ServeTag[] = sessions.map((s, i) => ({
    id: s.id,
    serveNumber: i % 10 === 9 ? 1 : 2,
    outcome: i % 10 === 8 ? undefined : i % 10 < 4 ? 'in' : 'net',
    taggedAt: s.createdAt,
  }))
  const trips = secondInByTrip(sessions, tags)
  assert(trips.length === 2, `${trips.length} trips`)
  assert(trips[0].of === 8 && trips[0].inn === 4, `first trip read ${trips[0].inn} of ${trips[0].of}`)
  assert(trips[0].at < trips[1].at, 'not oldest first')
  const thin = secondInByTrip(sessions.slice(0, 6), tags)
  assert(thin.length === 0, 'a trip under the minimum was counted')
})

report()
