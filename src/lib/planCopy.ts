/**
 * What free and each Plus feature are, in the words a paywall and the plans
 * page share (N6.4). Apart from `plans.ts` so the gate, which Today asks on
 * its first paint, does not carry the copy into the entry chunk.
 */
import type { Feature } from './plans'

/** What each feature is, in words a paywall and the plans page share. */
export const FEATURE_COPY: Record<Feature, { name: string; line: string }> = {
  breakdown: { name: 'Everything I measured', line: 'Every part of your serve scored, every measurement and every drill, not only the first fix.' },
  compare: { name: 'Side by side', line: 'Your serve beside a model serve or your own best, at the same moment.' },
  pathway: { name: 'A plan in steps', line: 'Your goal broken into steps, the next session on court, and when to move up.' },
  sessions: { name: 'Whole practices', line: 'A long practice video checked serve by serve, with numbers for the whole practice.' },
  speedTrend: { name: 'Speed over time', line: 'Your serve speed each time you play, and first serves compared with second serves.' },
  coachShare: { name: 'A page for your coach', line: 'All your measurements, your plan and what to watch for, in one file to send your coach.' },
  history: { name: 'All your past serves', line: 'Reopen any serve you have filmed, not only your latest ones.' },
}

/** What free keeps, in the same words. */
export const FREE_COPY: string[] = [
  'Every serve checked, on your own device',
  'Your score and the one thing to fix first, with its drill',
  'Full results for the first serve you film',
  'Reopen your latest serves',
]
