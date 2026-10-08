/**
 * First and second serves apart (D5.3), and serves per week (D5.4), on seeded
 * sessions.
 */
import {
  MIN_OUTCOMES_FOR_RATE,
  WEEK_MS,
  byServeNumber,
  inRateByType,
  servesPerWeek,
  weekJumpLine,
} from '../progress'
import { SCORING_VERSION } from '../analysis/types'
import type { ServeOutcome, ServeTag, Session } from '../storage/db'
import type { ServeType } from '../storage/prefs'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const NOW = new Date(2026, 9, 9, 12).getTime()

function serve(i: number, overall: number, serveType: ServeType = 'flat', at = NOW - i * 3_600_000): Session {
  return {
    id: `serve-${serveType}-${i}`,
    createdAt: at,
    overall,
    serveType,
    scoringVersion: SCORING_VERSION,
    fundamentals: [],
    triage: { status: 'ok' },
  } as unknown as Session
}

const tag = (s: Session, serveNumber?: 1 | 2, outcome?: ServeOutcome): ServeTag => ({
  id: s.id,
  serveNumber,
  outcome,
  taggedAt: s.createdAt,
})

heading('First and second serves, kept apart')

check('each serve number is averaged on its own, with an in-rate once there are taps enough', () => {
  const firsts = [80, 82, 78, 84, 81, 79].map((o, i) => serve(i, o))
  const seconds = [70, 66, 68].map((o, i) => serve(10 + i, o))
  const untagged = [serve(20, 99)]
  const tags = [
    ...firsts.map((s, i) => tag(s, 1, i < 4 ? 'in' : 'net')),
    ...seconds.map((s) => tag(s, 2, 'in')),
  ]
  const split = byServeNumber([...firsts, ...seconds, ...untagged], tags, 'flat')
  note(split.map((s) => `${s.serveNumber}: ${s.serves} at ${s.average}, in ${s.inServes}/${s.outcomes}`).join(' · '))
  const first = split.find((s) => s.serveNumber === 1)!
  const second = split.find((s) => s.serveNumber === 2)!
  assert(first.serves === 6 && first.average === 81, `first serves came back ${first.serves} at ${first.average}`)
  assert(second.serves === 3 && second.average === 68, `second serves came back ${second.serves} at ${second.average}`)
  assert(first.inServes === 4 && first.outcomes === 6, 'the first-serve in-rate miscounted')
  assert(second.outcomes < MIN_OUTCOMES_FOR_RATE, 'the fixture meant three second serves to be too few for a rate')
})

check('a kick is never counted with flat serves, and a type needs taps enough for a rate', () => {
  const flat = Array.from({ length: 5 }, (_, i) => serve(i, 80))
  const kick = Array.from({ length: 4 }, (_, i) => serve(10 + i, 70, 'kick'))
  const tags = [...flat.map((s, i) => tag(s, 1, i < 3 ? 'in' : 'long')), ...kick.map((s) => tag(s, 1, 'in'))]
  assert(byServeNumber([...flat, ...kick], tags, 'flat')[0].serves === 5, 'kicks were counted as flat first serves')
  const rates = inRateByType([...flat, ...kick], tags)
  assert(rates.length === 1 && rates[0].serveType === 'flat', `rates for: ${rates.map((r) => r.serveType).join(', ')}`)
  assert(rates[0].inServes === 3 && rates[0].outcomes === 5, 'the flat in-rate miscounted')
})

heading('Serves per week')

check('serves are counted in the week they were filmed, empty weeks included', () => {
  const sessions = [
    ...Array.from({ length: 3 }, (_, i) => serve(i, 70, 'flat', NOW - i * 3_600_000)),
    ...Array.from({ length: 2 }, (_, i) => serve(10 + i, 70, 'flat', NOW - 2 * WEEK_MS - i * 3_600_000)),
  ]
  const weeks = servesPerWeek(sessions, NOW)
  note(weeks.map((w) => w.serves).join(' '))
  assert(weeks.length === 8, `${weeks.length} weeks`)
  assert(weeks[7].serves === 3 && weeks[6].serves === 0 && weeks[5].serves === 2, 'serves landed in the wrong weeks')
})

check('a week well above the four before is said, as a count', () => {
  const steady = [20, 22, 18, 20].map((serves, k) => ({ start: k, serves }))
  assert(weekJumpLine([{ start: 0, serves: 5 }, ...steady, { start: 9, serves: 46 }]) !== undefined, 'a doubling went unsaid')
  const line = weekJumpLine([...steady, { start: 9, serves: 46 }])!
  note(line)
  assert(/46 serves this week/.test(line) && /about 20/.test(line), `the line read "${line}"`)
  assert(!/injur|strain|rest|overuse|risk/i.test(line), 'the count was dressed as a medical claim')
  assert(weekJumpLine([...steady, { start: 9, serves: 28 }]) === undefined, 'a busy but ordinary week was flagged')
  assert(
    weekJumpLine([2, 3, 2, 3].map((serves, k) => ({ start: k, serves })).concat({ start: 9, serves: 8 })) === undefined,
    'a jump from three to eight was news',
  )
  assert(
    weekJumpLine([0, 20, 20, 20].map((serves, k) => ({ start: k, serves })).concat({ start: 9, serves: 60 })) === undefined,
    'a baseline with an empty week in it was trusted',
  )
})

report()
