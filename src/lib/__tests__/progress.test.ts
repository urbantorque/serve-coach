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
import { MIN_THEN_AND_NOW_GAP_MS, buildProgress, sameTrip, sixWeekMilestone, thenAndNow } from '../progress'
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

report()
