/**
 * Four up (Apex E): which kept serves stand beside this one, and that each is
 * what its caption says it is.
 */
import { compareSet, MONTH_AT_LEAST_MS } from '../compareSet'
import type { Session } from '../storage/db'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY
const serve = (id: string, daysAgo: number, overall: number, extra: Partial<Session> = {}): Session =>
  ({ id, createdAt: NOW - daysAgo * DAY, overall, serveType: 'flat', scoringVersion: 7, phases: [], ...extra }) as unknown as Session
const shown = serve('now', 0, 70)
const all = (s: Session) => s.id !== 'gone'

heading('The serves beside this one')

check('best, last and a month before, in that order, each once', () => {
  const set = compareSet([serve('a', 2, 60), serve('b', 10, 85), serve('c', 31, 50), serve('d', 50, 55), shown], shown, all)
  assert(set.map((s) => `${s.who}:${s.session.id}`).join(' ') === 'best:b last:a month:c', set.map((s) => `${s.who}:${s.session.id}`).join(' '))
})

check('a best that is also the last is shown once, as the best, and the next serve is not called the last', () => {
  const set = compareSet([serve('a', 2, 90), serve('b', 10, 60), serve('c', 30, 50), shown], shown, all)
  assert(set.map((s) => s.who).join(' ') === 'best month', set.map((s) => `${s.who}:${s.session.id}`).join(' '))
})

check('only serves with a clip on the device, so no pane is empty', () => {
  const set = compareSet([serve('gone', 2, 99), serve('a', 3, 60), shown], shown, all)
  assert(set.every((s) => s.session.id !== 'gone') && set[0].session.id === 'a', set.map((s) => s.session.id).join(' '))
})

check('a month before means at least three weeks before, nearest thirty days', () => {
  const near = compareSet([serve('x', 1, 99), serve('y', 2, 98), serve('w', 14, 40), shown], shown, all)
  assert(!near.some((s) => s.who === 'month'), 'a fortnight was called a month')
  const far = compareSet([serve('x', 1, 99), serve('y', 2, 98), serve('p', 25, 40), serve('q', 33, 40), serve('r', 70, 40), shown], shown, all)
  assert(far.find((s) => s.who === 'month')?.session.id === 'q', far.map((s) => `${s.who}:${s.session.id}`).join(' '))
  assert(MONTH_AT_LEAST_MS === 21 * DAY, 'three weeks')
})

check('never a later serve, another serve type, a refused clip, or this serve', () => {
  const set = compareSet(
    [
      serve('later', -1, 99),
      serve('kick', 3, 99, { serveType: 'kick' } as Partial<Session>),
      serve('refused', 4, 99, { triage: { status: 'rejected' } } as unknown as Partial<Session>),
      shown,
    ],
    shown,
    all,
  )
  assert(set.length === 0, set.map((s) => s.session.id).join(' '))
})

check('a best from an older rubric is not called the best, but can still be the last', () => {
  const set = compareSet([serve('old', 2, 99, { scoringVersion: 6 } as Partial<Session>), shown], shown, all)
  assert(set.map((s) => `${s.who}:${s.session.id}`).join(' ') === 'last:old', set.map((s) => `${s.who}:${s.session.id}`).join(' '))
})

report()
