/**
 * Whether two serves count as the same trip to the court, and whether a
 * stretch of practice is long enough to say something true about.
 *
 * R25 asked whether a visit to the court is a thing this app knows about. It
 * already was — `thenAndNow` has refused to compare two reports filed
 * minutes apart since it existed — but the concept lived as an inline
 * comparison with no name, untested on its own. `sameTrip` gives it one.
 *
 * R26 asked for a milestone that survives the rule `PracticeCard` already
 * lives by: nothing here can be produced by pressing anything, only by real
 * analyses filed over real time — and `sixWeekMilestone` has to report a
 * stretch that went backwards exactly as plainly as one that improved, or it
 * is a badge with the shape sanded off rather than a fact.
 */
import {
  MIN_THEN_AND_NOW_GAP_MS,
  STREAK_GAP_MS,
  bestConsistencyGap,
  bestGapEverLine,
  bestGapLine,
  bestHandSpeed,
  bestHandSpeedEverLine,
  bestHandSpeedLine,
  buildConsistencyTrend,
  buildProgress,
  sameTrip,
  sixWeekMilestone,
  thenAndNow,
  tripStreak,
} from '../progress'
import { MIN_SPEED_EVIDENCE } from '../analysis/power'
import { assert, check, heading, report } from '../analysis/__tests__/harness'
import type { Session } from '../storage/db'

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

/** A saved report, thin but shaped like the real thing. */
function savedServe(createdAt: number, id = `s-${createdAt}`, overall = 70): Session {
  return {
    id,
    createdAt,
    overall,
    serveType: 'flat',
    fundamentals: [],
  } as unknown as Session
}

heading('Same trip to the court')

check('serves minutes apart are the same trip', () => {
  const a = savedServe(0)
  const b = savedServe(20 * 60 * 1000) // 20 minutes later
  assert(sameTrip(a, b), 'twenty minutes apart was read as two trips')
})

check('serves a day apart are different trips', () => {
  const a = savedServe(0)
  const b = savedServe(MIN_THEN_AND_NOW_GAP_MS + 1)
  assert(!sameTrip(a, b), 'a day and a millisecond apart still read as one trip')
})

check('the boundary itself belongs to "different trip"', () => {
  // thenAndNow's own check is a strict less-than, so the exact threshold has
  // to land on the "these may be compared" side or the boundary silently
  // moves the moment the two disagree.
  const a = savedServe(0)
  const b = savedServe(MIN_THEN_AND_NOW_GAP_MS)
  assert(!sameTrip(a, b), 'exactly the threshold apart was still read as the same trip')
})

check('order does not matter', () => {
  const a = savedServe(0)
  const b = savedServe(60_000)
  assert(sameTrip(a, b) === sameTrip(b, a), 'sameTrip disagreed with itself about argument order')
})

check('a custom gap is honoured, not just the default', () => {
  const a = savedServe(0)
  const b = savedServe(90 * 60 * 1000) // ninety minutes
  assert(sameTrip(a, b, 60 * 60 * 1000) === false, 'a ninety-minute gap passed a sixty-minute window')
  assert(sameTrip(a, b, 2 * 60 * 60 * 1000) === true, 'a ninety-minute gap failed a two-hour window')
})

heading('Then, and now')

check('two reports from the same trip never become a then-and-now pair', () => {
  const sessions = [savedServe(0, 'a'), savedServe(30 * 60 * 1000, 'b')]
  assert(thenAndNow(sessions, 60) === undefined, 'compared a player against their own basket')
})

check('reports a day apart do become a pair', () => {
  const sessions = [savedServe(0, 'a'), savedServe(MIN_THEN_AND_NOW_GAP_MS + 60_000, 'b')]
  const pair = thenAndNow(sessions, 60)
  assert(pair !== undefined, 'refused to pair two reports a day apart')
  assert(pair!.then.id === 'a' && pair!.now.id === 'b', 'paired the wrong two reports')
})

check('the oldest and the newest are chosen, not two in the middle', () => {
  const sessions = [
    savedServe(0, 'oldest'),
    savedServe(2 * MIN_THEN_AND_NOW_GAP_MS, 'middle'),
    savedServe(4 * MIN_THEN_AND_NOW_GAP_MS, 'newest'),
  ]
  const pair = thenAndNow(sessions, 60)
  assert(
    pair!.then.id === 'oldest' && pair!.now.id === 'newest',
    `paired ${pair!.then.id} against ${pair!.now.id}`,
  )
})

check('one report cannot be its own before-and-after', () => {
  assert(thenAndNow([savedServe(0)], 60) === undefined, 'a single report produced a pair')
  assert(thenAndNow([], 60) === undefined, 'no reports at all produced a pair')
})

heading('A milestone worth naming')

check('nothing is said before six weeks have actually passed', () => {
  const sessions = [savedServe(0, 'a', 60), savedServe(5 * WEEK, 'b', 80)]
  const progress = buildProgress(sessions)!
  assert(sixWeekMilestone(progress) === undefined, 'spoke before a real six-week stretch existed')
})

check('a single report has nothing to be a milestone about', () => {
  const progress = buildProgress([savedServe(0, 'a', 70)])!
  assert(sixWeekMilestone(progress) === undefined, 'produced a milestone from one report')
})

// Three sessions clustered at "now" rather than one, so `recentAverage` — a
// three-serve rolling mean, deliberately steadier than any single serve —
// reflects the recent cluster cleanly instead of blending in the one from
// six weeks ago.
const recentCluster = (start: number, score: number, prefix: string): Session[] =>
  [0, 1, 2].map((i) => savedServe(start + i * DAY, `${prefix}${i}`, score))

check('an improvement over six weeks is said, with both numbers', () => {
  const sessions = [savedServe(0, 'first', 52), ...recentCluster(6 * WEEK, 71, 'r')]
  const progress = buildProgress(sessions)!
  const line = sixWeekMilestone(progress)
  assert(line !== undefined, 'six real weeks of improvement produced nothing')
  assert(line!.includes('52') && line!.includes('71'), `neither number appeared in "${line}"`)
})

check('a stretch that went backwards is still reported, not hidden', () => {
  // The whole point: a milestone that only speaks up on good news is a
  // quieter version of the badge this feature is built to not be.
  const sessions = [savedServe(0, 'first', 78), ...recentCluster(6 * WEEK, 55, 'r')]
  const progress = buildProgress(sessions)!
  const line = sixWeekMilestone(progress)
  assert(line !== undefined, 'a regression over six real weeks said nothing at all')
  assert(line!.includes('78') && line!.includes('55'), `neither number appeared in "${line}"`)
})

check('a flat six weeks reads as flat, not as a manufactured direction', () => {
  const sessions = [savedServe(0, 'first', 70), ...recentCluster(6 * WEEK, 71, 'r')]
  const progress = buildProgress(sessions)!
  const line = sixWeekMilestone(progress)
  assert(line !== undefined, 'a flat six weeks produced nothing')
  assert(!/from your first serve|now\./.test(line!), `a one-point drift was read as a real direction: "${line}"`)
})

check('a recalibration cannot be quietly used as the "before"', () => {
  // The same guard every other comparison in this file already has:
  // subtracting across a rubric break measures the recalibration, not six
  // weeks of practice.
  const sessions = [
    { ...savedServe(0, 'old', 40), scoringVersion: 1 } as unknown as Session,
    { ...savedServe(6 * WEEK, 'new', 71), scoringVersion: 2 } as unknown as Session,
  ]
  const progress = buildProgress(sessions)!
  assert(
    sixWeekMilestone(progress) === undefined,
    'measured six weeks of practice across a rubric change instead of refusing to',
  )
})

heading('A trip streak, not a tap streak')

check('no history is a streak of nothing', () => {
  assert(tripStreak([], 0) === 0, 'an empty history produced a nonzero streak')
})

check('a first-ever trip counts as a streak of one', () => {
  const sessions = [savedServe(0)]
  assert(tripStreak(sessions, 0) === 1, 'a single recent trip was not counted at all')
})

check('a lapsed streak reads as zero, not as whatever it once reached', () => {
  const sessions = [savedServe(0, 'a'), savedServe(3 * DAY, 'b')]
  const now = 3 * DAY + STREAK_GAP_MS + 1
  assert(tripStreak(sessions, now) === 0, 'a streak past its own window still reported a count')
})

check('trips well inside the window chain into one streak', () => {
  const sessions = [savedServe(0, 'a'), savedServe(5 * DAY, 'b'), savedServe(11 * DAY, 'c')]
  assert(tripStreak(sessions, 11 * DAY) === 3, 'three trips each within nine days of the last did not chain')
})

check('one wide gap caps the streak at the run since it', () => {
  // Same three trips, but the first gap now exceeds STREAK_GAP_MS — only the
  // two trips after it should count, not the one stranded on the far side.
  const wideGap = STREAK_GAP_MS + DAY
  const sessions = [savedServe(0, 'a'), savedServe(wideGap, 'b'), savedServe(wideGap + 5 * DAY, 'c')]
  assert(
    tripStreak(sessions, wideGap + 5 * DAY) === 2,
    'a gap wider than the window still chained across it',
  )
})

check('multiple serves on one trip are one trip, not one per serve', () => {
  const sessions = [savedServe(0, 'a'), savedServe(20 * 60 * 1000, 'b'), savedServe(40 * 60 * 1000, 'c')]
  assert(tripStreak(sessions, 40 * 60 * 1000) === 1, 'one afternoon of serves counted as more than one trip')
})

check('exactly the boundary gap still counts as kept', () => {
  const sessions = [savedServe(0, 'a'), savedServe(STREAK_GAP_MS, 'b')]
  assert(tripStreak(sessions, STREAK_GAP_MS) === 2, 'a gap of exactly the window broke the streak')
})

check('session order does not matter', () => {
  const forward = [savedServe(0, 'a'), savedServe(5 * DAY, 'b')]
  const backward = [savedServe(5 * DAY, 'b'), savedServe(0, 'a')]
  assert(
    tripStreak(forward, 5 * DAY) === tripStreak(backward, 5 * DAY),
    'passing the same two trips in reverse order changed the streak',
  )
})

heading('The tightest gap swept, not the latest one')

/** A basket's worth of a report, thin but shaped like the real thing. */
function basketServe(createdAt: number, id: string, overallScores: number[]): Session {
  return {
    id,
    createdAt,
    overall: Math.max(...overallScores),
    serveType: 'flat',
    fundamentals: [],
    consistency: {
      serves: overallScores.length,
      overallScores,
      serveNumbers: overallScores.map((_, i) => i + 1),
      metrics: [],
      score: 70,
    },
  } as unknown as Session
}

check('one basket has nothing to be a record against', () => {
  const trend = buildConsistencyTrend([basketServe(0, 'a', [60, 75])])
  assert(bestConsistencyGap(trend) === undefined, 'a single basket produced a record')
})

check('the smallest gap across every basket wins, not the most recent', () => {
  const sessions = [
    basketServe(0, 'a', [50, 80]), // gap 30
    basketServe(DAY, 'b', [60, 68]), // gap 8 — the actual best
    basketServe(2 * DAY, 'c', [55, 79]), // gap 24, most recent
  ]
  const trend = buildConsistencyTrend(sessions)
  const record = bestConsistencyGap(trend)
  assert(record !== undefined, 'three baskets produced no record at all')
  assert(record!.gap === 8, `wrong basket won: gap ${record!.gap}, expected 8`)
  assert(record!.createdAt === DAY, 'the record was not attributed to the basket that actually set it')
})

check('a tie keeps the earlier basket as the record, not the newer one', () => {
  // reduce's own left-to-right fold keeps the first minimum it sees, which is
  // the honest answer for a tie: the record was set the first time that gap
  // was reached, not re-set every time it is matched again.
  const sessions = [basketServe(0, 'a', [60, 70]), basketServe(DAY, 'b', [55, 65])]
  const trend = buildConsistencyTrend(sessions)
  const record = bestConsistencyGap(trend)
  assert(record?.createdAt === 0, 'a tied gap moved the record to the later basket')
})

heading('The record is decided by what is on screen, not by what is newest')

/**
 * The first version of `bestGapLine` took a `current` flag computed inside
 * `bestConsistencyGap` itself, against the trend's own most recent point —
 * which answers "is the record held by my latest basket", not "is the
 * record held by the basket I am looking at right now". Those agree exactly
 * until somebody reopens an old report, which live-testing this in the
 * browser did immediately: an old, wide-gap basket still read "your
 * tightest gap yet". `bestGapLine` now takes the viewed basket's own
 * `createdAt` and compares directly, so the two questions cannot be
 * conflated again.
 */
check('the basket that set the record reads as current, by its own createdAt', () => {
  const record = { gap: 3, createdAt: DAY }
  const line = bestGapLine(record, DAY)
  assert(line.includes('yet'), `the record basket was not read as current: "${line}"`)
})

check('a different, older basket on screen reads as "so far", dated, not as current', () => {
  const record = { gap: 3, createdAt: DAY }
  const line = bestGapLine(record, 0)
  assert(!line.includes('yet'), `an old basket was still credited with the record: "${line}"`)
  assert(line.includes('so far'), `an old basket did not read as "so far": "${line}"`)
})

heading('The fastest hand ever measured, not the hand it was estimated from')

/** A saved report carrying a hand-speed reading, thin but shaped like the real thing. */
function powerServe(createdAt: number, id: string, speed: number, confidence = 0.9): Session {
  return {
    ...savedServe(createdAt, id),
    power: { speed, confidence, samples: 5 },
  } as unknown as Session
}

check('one reading has nothing to be a record against', () => {
  assert(bestHandSpeed([powerServe(0, 'a', 4)]) === undefined, 'a single reading produced a record')
})

check('a reading below the evidence gate is not eligible, the same bar PowerPanel itself uses', () => {
  const sessions = [powerServe(0, 'a', 4, MIN_SPEED_EVIDENCE - 0.01), powerServe(DAY, 'b', 3, 0.9)]
  const record = bestHandSpeed(sessions)
  // Only 'b' clears the gate, and one eligible reading is not a record either.
  assert(record === undefined, 'a reading nobody was ever shown was counted towards a record')
})

check('the fastest reading wins, not the most recent', () => {
  const sessions = [
    powerServe(0, 'a', 3.2),
    powerServe(DAY, 'b', 4.5), // the actual fastest
    powerServe(2 * DAY, 'c', 3.8), // most recent, but not the fastest
  ]
  const record = bestHandSpeed(sessions)
  assert(record !== undefined, 'three readings produced no record at all')
  assert(record!.speed === 4.5, `wrong reading won: ${record!.speed}`)
  assert(record!.createdAt === DAY, 'the record was not attributed to the session that actually set it')
})

heading('The hand-speed record is decided by what is on screen, not by what is newest')

check('the session that set the record reads as current, by its own createdAt', () => {
  const record = { speed: 4.5, createdAt: DAY }
  const line = bestHandSpeedLine(record, undefined, DAY)
  assert(line.includes('yet'), `the record session was not read as current: "${line}"`)
  assert(line.includes('body heights/sec'), `no height on file should keep house units: "${line}"`)
})

check('a different, older session on screen reads as "so far", dated, not as current', () => {
  const record = { speed: 4.5, createdAt: DAY }
  const line = bestHandSpeedLine(record, undefined, 0)
  assert(!line.includes('yet'), `an old session was still credited with the record: "${line}"`)
  assert(line.includes('so far'), `an old session did not read as "so far": "${line}"`)
})

check('a stated height converts the record to km/h, the same as PowerPanel', () => {
  const record = { speed: 4.5, createdAt: DAY }
  const line = bestHandSpeedLine(record, 178, DAY)
  assert(line.includes('km/h'), `a stated height did not switch the unit: "${line}"`)
  assert(!line.includes('body heights'), `house units still appeared alongside a stated height: "${line}"`)
})

heading('The tightest gap, stated with no basket on screen to compare it against')

check('states the record plainly, in bestGapEverLine\'s own phrasing rather than bestGapLine\'s per-basket one', () => {
  const line = bestGapEverLine({ gap: 6, createdAt: DAY })
  assert(line.includes('6'), `the gap itself did not appear: "${line}"`)
  assert(line.includes('was 6 points'), `not the aggregate phrasing this function owns: "${line}"`)
  assert(!line.includes('between your best serve'), `used bestGapLine's per-basket phrasing instead: "${line}"`)
})

check('dates the record the same way bestGapLine does', () => {
  const line = bestGapEverLine({ gap: 6, createdAt: DAY })
  assert(line.includes('set '), `no date attached: "${line}"`)
})

heading('The hand-speed record, stated with no report on screen to compare it against')

check('states the record plainly, dated, in house units with no height on file', () => {
  const line = bestHandSpeedEverLine({ speed: 4.5, createdAt: DAY }, undefined)
  assert(line.includes('4.5'), `the speed itself did not appear: "${line}"`)
  assert(line.includes('body heights/sec'), `no height on file should keep house units: "${line}"`)
  assert(line.includes('set '), `no date attached: "${line}"`)
  assert(!line.includes('yet —'), `used bestHandSpeedLine's per-report phrasing: "${line}"`)
})

check('converts to km/h with a stated height, same as bestHandSpeedLine', () => {
  const line = bestHandSpeedEverLine({ speed: 4.5, createdAt: DAY }, 178)
  assert(line.includes('km/h'), `a stated height did not switch the unit: "${line}"`)
  assert(!line.includes('body heights'), `house units still appeared alongside a stated height: "${line}"`)
})

report()
