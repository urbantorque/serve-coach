/**
 * Outcome gap (COACHING §7.3) and the D6 lexicographic ranking (§7.2 step 6).
 */
import type { Detection } from './detect.ts'
import type { LibraryItem } from './library.ts'
import { libraryOrder } from './library.ts'
import { outcomeCounts } from './series.ts'
import { welch } from './stats.ts'
import type { CoachingSession, Goal } from './types.ts'

export interface OutcomeGap {
  gap: number
  /** 'association': the personal term surfaced; 'no-clear-difference': it could be tested and did not. */
  line: 'association' | 'no-clear-difference' | 'none'
  source: 'personal' | 'static' | 'none'
  /** Personal association direction, for the sentence ("serves that went in tended to…"). */
  inBetter?: boolean
}

/**
 * gap in [0, 1]: the share of the stratum's serves that the fault plausibly costs.
 * 1. Personal association (per-serve tags, >= 6 in and >= 6 faults, a per-serve signal): counts only
 *    when the 99% interval excludes 0, |delta| >= SWC and the direction matches the fault.
 * 2. Static link: misses of the most common linked type / serves in the stratum (ranking only, never
 *    shown as a personal finding).
 * 3. No outcome data: 0.
 */
export function outcomeGap(item: LibraryItem, d: Detection, session: CoachingSession): OutcomeGap {
  if (!d.stratum) return { gap: 0, line: 'none', source: 'none' }
  const o = d.outcomes ?? outcomeCounts(session, d.stratum)
  let line: OutcomeGap['line'] = 'none'
  let personal = 0
  if (d.signal && o.source === 'tags') {
    const tagged = d.signal.samples.filter((s) => s.outcome && s.outcome !== 'let' && s.outcome !== 'unknown')
    const inVals = tagged.filter((s) => s.outcome === 'in').map((s) => s.value)
    const faultVals = tagged.filter((s) => s.outcome !== 'in').map((s) => s.value)
    if (inVals.length >= 6 && faultVals.length >= 6) {
      line = 'no-clear-difference'
      const w = welch(inVals, faultVals, 0.99)
      const excludesZero = w.low > 0 || w.high < 0
      // Fault 'above': serves that went in should have smaller values; 'below': larger.
      const directionOk = d.signal.faultDirection === 'above' ? w.diff < 0 : w.diff > 0
      if (excludesZero && Math.abs(w.diff) >= d.signal.swc && directionOk) {
        line = 'association'
        const present = (v: number) => (d.signal!.faultDirection === 'above' ? v > d.signal!.splitAt : v < d.signal!.splitAt)
        const p = tagged.filter((s) => present(s.value))
        const a = tagged.filter((s) => !present(s.value))
        const rate = (xs: typeof tagged) => (xs.length ? xs.filter((s) => s.outcome === 'in').length / xs.length : 0)
        personal = Math.max(0, rate(a) - rate(p)) * (tagged.length ? p.length / tagged.length : 0)
      }
    }
  }
  if (personal > 0) return { gap: personal, line, source: 'personal', inBetter: true }
  const linked = item.detection.linkedOutcomes
  if (o.source === 'none' || o.serves === 0 || linked.length === 0) return { gap: 0, line, source: 'none' }
  const counts = linked.map((t) => (t === 'net' ? o.net : t === 'long' ? o.long : o.net + o.long + o.wide))
  return { gap: Math.max(...counts) / o.serves, line, source: 'static' }
}

export interface Ranked {
  item: LibraryItem
  detection: Detection
  gap: OutcomeGap
  goalMatch: boolean
  mechanical: boolean
}

/**
 * D6 order: (a) chain stage ascending; (b) outcome gap descending, gaps within 0.05 tie;
 * (c) goal match first; (d) mechanical before outcome-only; (e) confidence descending;
 * (f) library order.
 */
export function compareRanked(a: Ranked, b: Ranked): number {
  const sa = a.item.detection.chainStage ?? 99
  const sb = b.item.detection.chainStage ?? 99
  if (sa !== sb) return sa - sb
  if (Math.abs(a.gap.gap - b.gap.gap) > 0.05) return b.gap.gap - a.gap.gap
  if (a.goalMatch !== b.goalMatch) return a.goalMatch ? -1 : 1
  if (a.mechanical !== b.mechanical) return a.mechanical ? -1 : 1
  if (a.detection.confidence !== b.detection.confidence) return b.detection.confidence - a.detection.confidence
  return libraryOrder(a.item.id) - libraryOrder(b.item.id)
}

export function toRanked(item: LibraryItem, d: Detection, session: CoachingSession, goal: Goal): Ranked {
  return {
    item,
    detection: d,
    gap: outcomeGap(item, d, session),
    goalMatch: item.goalsServed.includes(goal),
    mechanical: item.detection.kind !== 'outcome',
  }
}
