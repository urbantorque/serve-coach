/**
 * How many serves a player has been filming, against what is usual for them.
 *
 * `servesPerWeek` counts them and `recurringStrainOf` counts what keeps coming
 * up on film, and each says so on its own. This reads the two together: a level,
 * the numbers for a small chart, and at most one line of guidance.
 *
 * GUIDANCE, NOT A DIAGNOSIS. This is a tally of filmed serves. The app cannot see
 * a serve nobody filmed, how hard anybody swung, how long they rested or how a
 * body feels, so nothing here says what will happen to one: no percentages, no
 * risk, and no word for how anything feels. It says the count is up and how
 * people usually build, the way a coach would across a net.
 *
 * USUAL IS THEIR OWN, and a player's own weeks off are not part of it. The mean of
 * the last four weeks with any serves in them, reaching back past weeks with
 * none, so a fortnightly player has a usual too. `weekJumpLine` asks for four
 * unbroken weeks and is silent for them. Where it does speak the two read the same
 * four weeks and the same line (`weekJumped`), so a jump there is a jump here.
 * Too few weeks to know what is usual is the answer `steady`, with no usual at all.
 *
 * A week under way only counts up, so a Tuesday can read low and never high.
 */
import { mean } from './analysis/geometry'
import type { StrainRecord } from './analysis/strain'
import { strainJoint } from './analysis/verdict'
import { recurringStrainOf, servesPerWeek, weekJumped, type WeekCount } from './progress'
import type { PracticeSession } from './session/session'
import type { Session } from './storage/db'

export type LoadLevel = 'steady' | 'building' | 'jump'

export interface ServeLoad {
  /** Oldest first, this week last, empty weeks included: the chart. */
  weeks: WeekCount[]
  /** Serves filmed so far this week. */
  thisWeek: number
  /** A usual week, rounded. Absent until there are enough weeks to say. */
  usual?: number
  /** The tallest thing on the chart, to scale it. */
  peak: number
  level: LoadLevel
  /** Joint warnings that keep coming up (`recurringStrain`), worst-recurring first. */
  strain: StrainRecord[]
  /** One line of guidance, when there is any to give. */
  line?: string
}

/** Weeks the chart draws. */
export const CHART_WEEKS = 8

/** Weeks back a usual is looked for: long enough for a monthly player to have one. */
const USUAL_REACH = 13

/** Weeks with serves in them that make a usual. */
const USUAL_WEEKS = 4

/** The fewest of them worth calling usual. */
const MIN_USUAL_WEEKS = 3

/**
 * Above usual by a quarter and five serves, short of a jump: a week on the way
 * up. Ten serves at the least, so filming three clips more is not a build.
 */
const isBuilding = (current: number, usual: number) => current >= 10 && current >= usual * 1.25 && current - usual >= 5

const lineFor = (level: LoadLevel, strain: readonly StrainRecord[]): string | undefined => {
  if (level === 'steady') return undefined
  const joint = strain.length ? strainJoint(strain[0].flag) : undefined
  const opening = level === 'jump' ? 'More serves filmed than usual' : 'Your serves are climbing'
  return joint
    ? `${opening}, and the same note on ${joint} keeps coming up. Build up over a few weeks.`
    : `${opening}${level === 'jump' ? ' this week' : ''}. Build up over a few weeks.`
}

export function serveLoad(
  sessions: Session[],
  now: number = Date.now(),
  practice: readonly Pick<PracticeSession, 'createdAt' | 'found'>[] = [],
): ServeLoad {
  const all = servesPerWeek(sessions, now, USUAL_REACH, practice)
  const thisWeek = all[all.length - 1].serves
  const played = all.slice(0, -1).filter((w) => w.serves > 0).slice(-USUAL_WEEKS)
  const usual = played.length >= MIN_USUAL_WEEKS ? mean(played.map((w) => w.serves)) : undefined
  const level: LoadLevel =
    usual === undefined ? 'steady' : weekJumped(thisWeek, usual) ? 'jump' : isBuilding(thisWeek, usual) ? 'building' : 'steady'
  const strain = recurringStrainOf(sessions)
  const weeks = all.slice(-CHART_WEEKS)
  const line = lineFor(level, strain)
  return {
    weeks,
    thisWeek,
    ...(usual !== undefined ? { usual: Math.round(usual) } : {}),
    peak: Math.max(usual ?? 0, ...weeks.map((w) => w.serves)),
    level,
    strain,
    ...(line ? { line } : {}),
  }
}
