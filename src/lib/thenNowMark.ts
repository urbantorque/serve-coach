/**
 * What "then and now" marks on the player's two bodies (E2.1).
 *
 * Two figures side by side that looked the same, with nothing marking the
 * change, were the app's best proof of progress saying nothing. This picks one
 * fault to mark on both: the moment it is read at, whether each serve had it
 * (painted in `--work` where it did), and each serve's reading of it in the
 * report's own body words.
 *
 * Only a graded row is used, the one `faultMetric` returns: a band from a study
 * or from real serve motion stands behind it. A fault with no graded row on
 * both serves is not marked, and the screen says it cannot show one, rather
 * than drawing a change it cannot support. Whether each serve had the fault is
 * the engine's own finding on that serve, judged with enough evidence, the rule
 * `faultTrends` and `checkDrill` keep.
 */
import { MIN_EVIDENCE, type FlawId } from './analysis/flaws'
import type { PhaseId } from './analysis/types'
import { FAULT_NAME } from './graduation'
import { faultMetric } from './lookFor'
import type { Session } from './storage/db'

export interface ThenNowMark {
  flaw: FlawId
  /** The fault's short name: "Tossing arm". */
  name: string
  /** The moment the fault is read at, where both bodies are held. */
  moment: PhaseId
  then: { readout: string; had: boolean }
  now: { readout: string; had: boolean }
  /** Gone (had it then, not now), still there, newly there, or clean both times. */
  change: 'gone' | 'still' | 'came' | 'clean'
}

function judged(s: Session, flaw: FlawId): boolean | undefined {
  const f = s.diagnosis?.flaws?.find((x) => x.flaw === flaw)
  // Judged only with enough evidence, the rule `faultTrends` and `checkDrill` keep.
  if (!f || !(f.confidence >= MIN_EVIDENCE)) return undefined
  return f.detected
}

/** Preference among faults with a reading on both: one that went, then the one asked for, then one still there. */
const RANK: Record<ThenNowMark['change'], number> = { gone: 0, still: 2, came: 3, clean: 4 }

export function thenNowMark(then: Session, now: Session, prefer?: FlawId): ThenNowMark | undefined {
  const flaws = new Set<FlawId>([...(then.diagnosis?.flaws ?? []), ...(now.diagnosis?.flaws ?? [])].map((f) => f.flaw))
  const marks: ThenNowMark[] = []
  for (const flaw of flaws) {
    const a = faultMetric(then.fundamentals ?? [], flaw)
    const b = faultMetric(now.fundamentals ?? [], flaw)
    const hadThen = judged(then, flaw)
    const hadNow = judged(now, flaw)
    // A graded row on both serves, read at one moment, and judged on both.
    if (!a || !b || a.phase !== b.phase || hadThen === undefined || hadNow === undefined) continue
    const change = hadThen && !hadNow ? 'gone' : hadThen && hadNow ? 'still' : hadNow ? 'came' : 'clean'
    marks.push({ flaw, name: FAULT_NAME[flaw], moment: a.phase, then: { readout: a.readout, had: hadThen }, now: { readout: b.readout, had: hadNow }, change })
  }
  const rank = (m: ThenNowMark) => (m.change === 'gone' ? 0 : m.flaw === prefer && m.change !== 'clean' ? 1 : RANK[m.change])
  const best = marks.sort((x, y) => rank(x) - rank(y))[0]
  // Clean on both is nothing to mark.
  return best && best.change !== 'clean' ? best : undefined
}

/** The picture in words, for a screen reader and for anyone who reads before looking. */
export function thenNowLine(m: ThenNowMark, thenDay: string, nowDay: string): string {
  if (m.change === 'gone') return `${m.name}: on ${thenDay}, ${lower(m.then.readout)}; on ${nowDay}, ${lower(m.now.readout)}. That fault has gone.`
  if (m.change === 'came') return `${m.name}: on ${thenDay}, ${lower(m.then.readout)}; on ${nowDay}, ${lower(m.now.readout)}.`
  return `${m.name}: on ${thenDay}, ${lower(m.then.readout)}; on ${nowDay}, ${lower(m.now.readout)}. Still one to work on.`
}

const lower = (s: string) => s.replace(/\.$/, '').replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLowerCase())
