/**
 * Today on court, in minutes (N1.6).
 *
 * The week plan says what to work on and how to know it worked; it never said
 * what to do with the forty-five minutes a player actually has. This splits a
 * hit of 30, 45 or 60 minutes into a warm-up, the week's drills in their order
 * — the first gets the most, because it is the cause — a filmed check of six
 * serves, and free serves to finish.
 *
 * Pure: a plan and a length in, blocks and their lines out.
 */
import { CHECK_SERVES } from './analysis/progressions'
import type { WeekPlan } from './weekPlan'

export const COURT_MINUTES = [30, 45, 60] as const
export type CourtMinutes = (typeof COURT_MINUTES)[number]

export interface CourtBlock {
  kind: 'warm' | 'drill' | 'check' | 'free'
  minutes: number
  line: string
}

/** Warm-up and the filmed check, by session length. */
const WARM: Record<CourtMinutes, number> = { 30: 5, 45: 5, 60: 8 }
const CHECK = 5
/** The share of drill time each item gets, by how many there are: the cause first. */
const SHARES: Record<number, number[]> = { 1: [1], 2: [0.65, 0.35], 3: [0.5, 0.3, 0.2] }

export function courtPlan(week: WeekPlan | undefined, minutes: CourtMinutes): CourtBlock[] {
  const items = (week?.items ?? []).slice(0, 3)
  const warm = WARM[minutes]
  const blocks: CourtBlock[] = [{ kind: 'warm', minutes: warm, line: 'Warm up with easy serves at half pace.' }]
  if (!items.length) {
    blocks.push({ kind: 'free', minutes: minutes - warm, line: 'Serve freely, then film one to see where you are.' })
    return blocks
  }
  // About two thirds of what is left goes to drills; the rest is the check and free serves.
  const drillTime = Math.round((minutes - warm - CHECK) * 0.7)
  const shares = SHARES[items.length]
  let used = 0
  items.forEach((item, i) => {
    const m = i === items.length - 1 ? drillTime - used : Math.max(3, Math.round(drillTime * shares[i]))
    used += m
    blocks.push({ kind: 'drill', minutes: m, line: `${item.drill.name}: ${item.drill.reps}, then repeat.` })
  })
  blocks.push({ kind: 'check', minutes: CHECK, line: `Film ${CHECK_SERVES} serves to check the first drill's step.` })
  const free = minutes - warm - drillTime - CHECK
  if (free > 0) blocks.push({ kind: 'free', minutes: free, line: 'Serve freely and let the drill settle in.' })
  return blocks
}
