/**
 * Whether a serve was a first or a second, when the player's own record can say.
 *
 * There are no labelled real clips, so nothing here rests on what a first serve
 * looks like. It rests on the player's own tags, and it speaks only where those
 * tags have already shown the pattern. Two kinds of evidence did that.
 *
 * WHAT CAME BEFORE. A fault is followed by a second serve; a second serve, or a
 * first that went in, by a new point. That is the rules of tennis, and it is
 * also not what happens in a basket of first serves. So each pattern is held to
 * the player's own record: how often, in serves they tagged, the serve after
 * that one was the number the rule expects. It counts only serves known to be
 * consecutive (`filmedBefore`).
 *
 * HOW FAST THE BALL LEFT. First serves are faster than second serves by a wide
 * margin, player by player: 175 against 146 km/h in van Trigt 2024 (eight
 * professionals, 24 of each), 24% in Chow 2003. This is the one published first
 * and second difference that is large against the reading: a speed comes with
 * its own range, typically ±5–7%. It is used only when the player's tagged first
 * and second serves sit apart at that precision (`apart`), and only when this
 * serve's whole range falls on one side of the midpoint between them.
 *
 * WHAT IS NOT HERE, and was measured (ANALYSIS-REVIEW.md, 2026-11-05):
 *   - **Serve type.** Slice has no published position of its own, and the kick's
 *     one large difference, 18–35 cm sideways, is depth from the guide's
 *     placement. See that section for what the rest would score.
 *   - **Anything from the pose.** Timing between segments does not change from
 *     a first serve to a second (125 against 127 ms, van Trigt 2024), nor does
 *     impact height (303.4 against 303.3 cm, Baiget 2023), and the toss and
 *     contact move 4–7 cm on a reading that spreads 12 cm serve to serve. What
 *     changes is speed, and the hand's reads badly at 30 fps: run 15% slower it
 *     moves 3%, and a guess from it is wrong a quarter of the time it speaks.
 *     The elbow's reads well, and is the one to try the day there are labelled
 *     clips, but nothing says what a club player's second serve does to it.
 *
 * A GUESS IS ONLY EVER A GUESS. It is never stored as a tag and no statistic
 * reads it: the only way into `ServeTag` is a tap (`withServeTag`), and nothing
 * here writes. Undefined is the common answer, and the right one for most serves.
 */
import { MIN_SERVES_EACH_SIDE } from './progress'
import { apart, readingOf, summarise } from './speedTrend'
import { cue } from './analysis/voice'
import { clipIdOf } from './storage/sessionKey'
import type { ServeTag, Session } from './storage/db'

/**
 * What a guess stands on. `after_*` is the serve before it, `speed_*` the ball.
 * Identifiers, so a screen can say them and a test can count them.
 */
export type GuessReason = 'after_a_fault' | 'after_a_second' | 'after_a_first_in' | 'speed_like_firsts' | 'speed_like_seconds'

export interface ServeGuess {
  serveNumber: 1 | 2
  /** `likely` when the player's own record bounds it at 75%, `fair` at 60%. */
  confidence: 'likely' | 'fair'
  reason: GuessReason
  /** Of the player's own cases of this kind, how many went this way. */
  agreed: number
  cases: number
}

/** The lower bound a record must reach, at 95%, before it may speak at all. */
export const FAIR_BOUND = 0.6
/** And before the guess may be called likely. */
export const LIKELY_BOUND = 0.75

/** The newest cases of each kind kept: a habit changes, and an old one should fade. */
const CASES_KEPT = 40

/**
 * A second serve follows its fault within a minute, as a next point does. The
 * ITF gives a server 25 seconds between points; a rally and a walk for the ball
 * go on top of that. Longer than this, the serve before it is not the one that
 * decided what this one was.
 */
export const SAME_POINT_SECONDS = 60

/**
 * Two clips filmed in the app, one straight after the other: their reports are
 * filed as the analysis finishes, which puts about a minute more between them.
 */
export const NEXT_CLIP_SECONDS = 120

type Rule = 'after_a_fault' | 'after_a_second' | 'after_a_first_in'

const EXPECTED: Record<Rule, 1 | 2> = { after_a_fault: 2, after_a_second: 1, after_a_first_in: 1 }

function ruleAfter(tag: ServeTag | undefined): Rule | undefined {
  if (tag?.serveNumber === 2) return 'after_a_second'
  if (tag?.serveNumber !== 1 || tag.outcome === undefined) return undefined
  return tag.outcome === 'in' ? 'after_a_first_in' : 'after_a_fault'
}

/** Where a rate sits at the least, at 95%: Wilson's bound, so a short record cannot claim a long one's certainty. */
export function rateFloor(agreed: number, cases: number): number {
  if (cases === 0) return 0
  const z = 1.96
  const p = agreed / cases
  const centre = p + (z * z) / (2 * cases)
  const margin = z * Math.sqrt((p * (1 - p)) / cases + (z * z) / (4 * cases * cases))
  return (centre - margin) / (1 + (z * z) / cases)
}

const levelOf = (agreed: number, cases: number): ServeGuess['confidence'] | undefined => {
  const floor = rateFloor(agreed, cases)
  return floor >= LIKELY_BOUND ? 'likely' : floor >= FAIR_BOUND ? 'fair' : undefined
}

/**
 * The reports oldest first, and by their place in a file. Built once, because a
 * record is a question about every report and a history runs to thousands.
 */
interface Filed {
  inOrder: readonly Session[]
  byPlace: ReadonlyMap<string, Session>
}

/** Stored reports from before serves were counted have no index, and are one serve. */
const serveIndex = (s: Session) => s.serves?.index ?? 0
const placeOf = (s: Session, index: number) => `${clipIdOf(s.id)}#${index}`

function fileReports(reports: readonly Session[]): Filed {
  const inOrder = [...reports].sort((a, b) => a.createdAt - b.createdAt)
  return { inOrder, byPlace: new Map(inOrder.map((s) => [placeOf(s, serveIndex(s)), s])) }
}

/**
 * The serve filmed straight before this one, when the clips can say.
 *
 * `createdAt` is when a report was made, not when the serve was hit, so it says
 * nothing about a clip picked from the camera roll. Two things do say: the serve
 * before it in the same file, and two clips recorded in the app, which are
 * analysed as they are filmed. `filedBefore` is the report made just before
 * this one, for the second.
 */
function filmedBefore(serve: Session, filed: Filed, filedBefore: Session | undefined): Session | undefined {
  const index = serveIndex(serve)
  if (index > 0) {
    const before = filed.byPlace.get(placeOf(serve, index - 1))
    if (!before) return undefined
    const seconds = (serve.window?.start - before.window?.start) / (serve.stretch?.factor ?? 1)
    return seconds > 0 && seconds <= SAME_POINT_SECONDS ? before : undefined
  }
  if (!serve.capture || !filedBefore?.capture) return undefined
  return serve.createdAt - filedBefore.createdAt <= NEXT_CLIP_SECONDS * 1000 ? filedBefore : undefined
}

/** How the player's own tagged serves have followed each kind of serve, newest cases only. */
function ownRecord(filed: Filed, tags: ReadonlyMap<string, ServeTag>): Record<Rule, boolean[]> {
  const record: Record<Rule, boolean[]> = { after_a_fault: [], after_a_second: [], after_a_first_in: [] }
  filed.inOrder.forEach((serve, i) => {
    const number = tags.get(serve.id)?.serveNumber
    if (number === undefined) return
    const before = filmedBefore(serve, filed, filed.inOrder[i - 1])
    const rule = before && ruleAfter(tags.get(before.id))
    if (rule) record[rule].push(number === EXPECTED[rule])
  })
  for (const rule of Object.keys(record) as Rule[]) record[rule] = record[rule].slice(-CASES_KEPT)
  return record
}

function fromTheServeBefore(serve: Session, filed: Filed, tags: ReadonlyMap<string, ServeTag>): ServeGuess | undefined {
  let filedBefore: Session | undefined
  for (const s of filed.inOrder) {
    if (s.createdAt >= serve.createdAt) break
    filedBefore = s
  }
  const before = filmedBefore(serve, filed, filedBefore)
  const rule = before && ruleAfter(tags.get(before.id))
  if (!rule) return undefined
  const cases = ownRecord(filed, tags)[rule]
  const agreed = cases.filter(Boolean).length
  const confidence = levelOf(agreed, cases.length)
  return confidence && { serveNumber: EXPECTED[rule], confidence, reason: rule, agreed, cases: cases.length }
}

/**
 * The midpoint between a player's first and second serves, when their firsts
 * sit clear above their seconds by the reader's own ranges, the rule
 * `speedTrend` keeps. A second serve read faster than a first says nothing: it
 * runs against every published figure, so it is more likely to be the tags.
 */
function speedMidpoint(firsts: readonly Session[], seconds: readonly Session[]): number | undefined {
  const fast = summarise(firsts)
  const slow = summarise(seconds)
  if (!fast || !slow || apart(fast, slow) !== 'faster') return undefined
  return (fast.ms + slow.ms) / 2
}

const sideOf = (s: Session, midpoint: number): 1 | 2 | undefined => {
  const reading = readingOf(s)
  if (!reading) return undefined
  return reading.low > midpoint ? 1 : reading.high < midpoint ? 2 : undefined
}

function fromTheBall(serve: Session, filed: Filed, tags: ReadonlyMap<string, ServeTag>): ServeGuess | undefined {
  if (!readingOf(serve)) return undefined
  const tagged = (n: 1 | 2) => filed.inOrder.filter((s) => tags.get(s.id)?.serveNumber === n && readingOf(s)).slice(-CASES_KEPT)
  const firsts = tagged(1)
  const seconds = tagged(2)
  if (firsts.length < MIN_SERVES_EACH_SIDE || seconds.length < MIN_SERVES_EACH_SIDE) return undefined
  const midpoint = speedMidpoint(firsts, seconds)
  const side = midpoint === undefined ? undefined : sideOf(serve, midpoint)
  if (!side) return undefined
  // Each tagged serve held out in turn: of those the rest would have called,
  // how many did they call as the player did? A serve inside the range of the
  // midpoint is no call at all here, as it would be for the serve being asked.
  let agreed = 0
  let cases = 0
  for (const held of [...firsts, ...seconds]) {
    const mid = speedMidpoint(
      firsts.filter((s) => s !== held),
      seconds.filter((s) => s !== held),
    )
    const called = mid === undefined ? undefined : sideOf(held, mid)
    if (called === undefined) continue
    cases++
    if (called === tags.get(held.id)?.serveNumber) agreed++
  }
  const confidence = levelOf(agreed, cases)
  return (
    confidence && {
      serveNumber: side,
      confidence,
      reason: side === 1 ? 'speed_like_firsts' : 'speed_like_seconds',
      agreed,
      cases,
    }
  )
}

/**
 * The guess, or undefined when it cannot say.
 *
 * Undefined too for a serve the player already tagged, and when the two kinds of
 * evidence disagree: two good reasons pulling apart are a reason to say nothing.
 *
 * Pure. It reads `history` and `tags` and writes nowhere.
 */
export function guessServeNumber(
  serve: Session,
  history: readonly Session[],
  tags: readonly ServeTag[],
): ServeGuess | undefined {
  const byId = new Map(tags.map((t) => [t.id, t]))
  if (byId.get(serve.id)?.serveNumber !== undefined) return undefined
  const filed = fileReports(history.filter((s) => s.id !== serve.id && s.triage?.status !== 'rejected'))
  const order = fromTheServeBefore(serve, filed, byId)
  const ball = fromTheBall(serve, filed, byId)
  if (order && ball && order.serveNumber !== ball.serveNumber) return undefined
  return order ?? ball
}

const CALLED: Record<GuessReason, string> = {
  after_a_fault: 'a second serve, because the one before it missed',
  after_a_second: 'a first serve, because the one before it was your second',
  after_a_first_in: 'a first serve, because the one before it went in',
  speed_like_firsts: 'a first serve, because the ball left at your first-serve speed',
  speed_like_seconds: 'a second serve, because the ball left at your second-serve speed',
}

/** The guess in words, for beside the tag it leaves untouched. */
export function guessLine(guess: Pick<ServeGuess, 'confidence' | 'reason'>): string {
  return cue(`${guess.confidence === 'likely' ? 'I think this was' : 'This may be'} ${CALLED[guess.reason]}.`)
}
