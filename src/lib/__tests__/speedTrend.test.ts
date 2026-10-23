/**
 * Serve speed over time (N2.8): ranges compared with ranges, and nothing said
 * where they overlap.
 */
import { MIN_SPEED_SERVES, apart, fastestServe, speedByServeNumber, speedByTrip, speedTrend, summarise } from '../speedTrend'
import { assert, check, heading, report } from '../analysis/__tests__/harness'
import type { ServeTag, Session } from '../storage/db'

const DAY = 24 * 60 * 60 * 1000

/** A saved report with a speed reading, ±5% either side unless given. */
function served(createdAt: number, id: string, ms?: number, half = 0.05, rejected = false): Session {
  return {
    id,
    createdAt,
    overall: 70,
    serveType: 'flat',
    fundamentals: [],
    ...(rejected ? { triage: { status: 'rejected' } } : {}),
    ...(ms === undefined ? {} : { speed: { speed: { ms, low: ms * (1 - half), high: ms * (1 + half), samples: 6, span: 0.08, depthAngle: 3 } } }),
  } as unknown as Session
}

/** A trip of serves an hour apart on day `day`, at these speeds. */
const trip = (day: number, speeds: number[], prefix = `d${day}`) =>
  speeds.map((ms, k) => served(day * 3 * DAY + k * 3600_000, `${prefix}-${k}`, ms))

heading('The trend between trips')

check('a single trip says nothing', () => {
  assert(speedTrend(trip(0, [36, 37, 38]), []) === undefined, 'one trip gave a trend')
})

check('two trips whose ranges overlap say nothing', () => {
  // 36 ±5% runs to 37.8; 37.5 ±5% starts at 35.6.
  assert(speedTrend([...trip(0, [36, 36, 36]), ...trip(1, [37.5, 37.5])], []) === undefined, 'an overlap was called a change')
})

check('ranges clear of each other say faster, or slower', () => {
  const up = speedTrend([...trip(0, [33, 34, 33]), ...trip(1, [40, 41, 40])], [])
  assert(up?.direction === 'faster', `rising trips said ${up?.direction}`)
  const down = speedTrend([...trip(0, [41, 40]), ...trip(1, [33, 34])], [])
  assert(down?.direction === 'slower', `falling trips said ${down?.direction}`)
})

check('the newest trip is set against the one before it, not the first', () => {
  const t = speedTrend([...trip(0, [30, 30]), ...trip(1, [40, 40]), ...trip(2, [40.5, 40.5])], [])
  assert(t === undefined, 'the newest trip was compared with the oldest')
})

check(`a trip needs ${MIN_SPEED_SERVES} readings, and refused reports and second serves do not count`, () => {
  assert(summarise([served(0, 'a', 40)]) === undefined, 'one reading made a trip figure')
  assert(summarise([served(0, 'a', 40), served(1, 'b', 40, 0.05, true)]) === undefined, 'a refused report was counted')
  const sessions = [...trip(0, [33, 33]), ...trip(1, [40, 40])]
  const tags: ServeTag[] = sessions.slice(2).map((s) => ({ id: s.id, serveNumber: 2 }) as ServeTag)
  assert(speedTrend(sessions, tags) === undefined, 'second serves made the newest trip')
})

check('a trip is held no tighter than one serve: the middle of its serves’ ranges', () => {
  const s = summarise(trip(0, [30, 40, 50]))!
  assert(s.ms === 40 && Math.abs(s.low - 38) < 1e-9 && Math.abs(s.high - 42) < 1e-9, JSON.stringify(s))
  assert(apart({ low: 43, high: 47 }, s) === 'faster' && apart({ low: 41, high: 47 }, s) === undefined, 'apart is not strict')
})

heading('Every trip, for the chart (C5)')

check('one bar per trip with enough readings, oldest first, second serves left out', () => {
  const sessions = [...trip(0, [33, 34]), ...trip(1, [40]), ...trip(2, [36, 37, 38]), ...trip(3, [41, 41])]
  const tags: ServeTag[] = [{ id: 'd3-0', serveNumber: 2 } as ServeTag]
  const bars = speedByTrip(sessions, tags)
  assert(bars.length === 2, `${bars.length} bars: a one-reading trip, or a trip left one first serve, was drawn`)
  assert(bars[0].at < bars[1].at && bars[0].ms === 33.5 && bars[1].ms === 37, JSON.stringify(bars.map((b) => b.ms)))
})

check('the trend is read off the same bars the chart draws', () => {
  const sessions = [...trip(0, [33, 34, 33]), ...trip(1, [36, 36]), ...trip(2, [41, 40])]
  const bars = speedByTrip(sessions, [])
  const t = speedTrend(sessions, [])!
  assert(JSON.stringify(t.now) === JSON.stringify(bars[2]), 'the trend compared a trip the chart does not show')
  assert(JSON.stringify(t.then) === JSON.stringify(bars[1]), 'the trend skipped the trip before the newest')
})

heading('First serves against second serves')

check('each side needs readings, and only separated ranges are given a direction', () => {
  const sessions = [served(0, 'a', 42), served(1, 'b', 43), served(2, 'c', 33), served(3, 'd', 32)]
  const tag = (id: string, n: 1 | 2) => ({ id, serveNumber: n }) as ServeTag
  const both = speedByServeNumber(sessions, [tag('a', 1), tag('b', 1), tag('c', 2), tag('d', 2)])
  assert(both?.direction === 'slower' && both.first.serves === 2 && both.second.serves === 2, JSON.stringify(both))
  assert(speedByServeNumber(sessions, [tag('a', 1), tag('b', 1), tag('c', 2)]) === undefined, 'one second serve was a side')
  const near = [served(0, 'f', 42), served(1, 'g', 43), served(2, 'h', 41), served(3, 'i', 42)]
  const close = speedByServeNumber(near, [tag('f', 1), tag('g', 1), tag('h', 2), tag('i', 2)])
  assert(close !== undefined && close.direction === undefined, 'overlapping sides were given a direction')
})

heading('The fastest serve on record')

check('the record moves only when a whole range sits above the holder', () => {
  const sessions = [served(0, 'a', 36), served(DAY, 'b', 37.5), served(2 * DAY, 'c', 41)]
  const r = fastestServe(sessions)!
  assert(r.id === 'c' && r.isNew, `holder ${r.id}, new ${r.isNew}`)
  // 37.5 overlaps 36's range, so it never took the record from it.
  const r2 = fastestServe(sessions.slice(0, 2))!
  assert(r2.id === 'a' && !r2.isNew, `holder ${r2.id}, new ${r2.isNew}`)
})

check('a first reading is a record, not a record broken; nothing read is no record', () => {
  const r = fastestServe([served(0, 'a', 36)])!
  assert(r.id === 'a' && !r.isNew, JSON.stringify(r))
  assert(fastestServe([served(0, 'a')]) === undefined, 'a report with no reading held the record')
  assert(fastestServe([served(0, 'a', 60, 0.05, true)]) === undefined, 'a refused report held the record')
})

report()
