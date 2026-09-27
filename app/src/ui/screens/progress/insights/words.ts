import type { VerdictWord } from '../../../../data/domain.ts'
import { MORE_SERVES_CAP as MAX_SERVES_TO_CONFIRM } from '../../../../analysis/stats/index.ts'

/** "About 10 more serves to confirm." or the > 150 message (METRICS §4.5 step 4). */
export function moreServesText(n: number | undefined, verdict: VerdictWord): string | null {
  if (n === undefined || verdict === 'not-comparable' || verdict === 'clearly-better' || verdict === 'clearly-worse' || verdict === 'no-clear-change') return null
  if (!Number.isFinite(n) || n > MAX_SERVES_TO_CONFIRM) {
    return 'More than 150 serves; this difference is too small to confirm by counting. Watch toss spread and contact height instead.'
  }
  if (n <= 0) return 'One more matched session should settle it.'
  return verdict === 'too-early' || verdict === 'too-early-to-tell' ? `About ${n} more serves would settle it.` : `About ${n} more serves to confirm.`
}
