/**
 * What free and each Plus feature are, in the words a paywall and the plans
 * page share (N6.4). Apart from `plans.ts` so the gate, which Today asks on
 * its first paint, does not carry the copy into the entry chunk.
 */
import type { Feature } from './plans'

/** What each feature is, in words a paywall and the plans page share. */
export const FEATURE_COPY: Record<Feature, { name: string; line: string }> = {
  breakdown: { name: 'Everything I measured', line: 'Every area scored, every reading and every drill, not only the first fix.' },
  compare: { name: 'Side by side', line: 'Your serve beside a model serve or your own best, at the same moment.' },
  pathway: { name: 'A plan in steps', line: 'Your goal broken into steps, the next session on court, and when to move up.' },
  sessions: { name: 'Whole practices', line: 'A long video read serve by serve, with the session’s own numbers.' },
  speedTrend: { name: 'Speed over time', line: 'Your serve speed trip by trip, and first serve against second.' },
  coachShare: { name: 'A page for your coach', line: 'Every reading, the plan and what to look at, in one file you send.' },
  history: { name: 'Every serve kept open', line: 'Your whole history to reopen, not only your latest serves.' },
}

/** What free keeps, in the same words. */
export const FREE_COPY: string[] = [
  'Every serve read, on your own device',
  'Your score and the one thing to fix first, with its drill',
  'The whole breakdown on the first serve you film',
  'Your latest serves to reopen',
]
