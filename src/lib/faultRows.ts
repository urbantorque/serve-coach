/**
 * The words beside a fault row on Progress (E2.2), apart from the chart so a
 * test can hold them to the voice lint and to what they may claim.
 */
import { CHECK_SERVES } from './analysis/progressions'
import type { FaultTrend } from './progress'

/** A fault row's one line: the recent window against the drill check's mark. */
export function faultRowLine(gone: number, of: number, need: number | undefined, direction: FaultTrend['direction']): string {
  const lately = direction === 'fewer' ? ', and it’s showing up less' : direction === 'more' ? ', and it’s showing up more' : ''
  const base = `Gone on ${gone} of your last ${of}`
  // Against the check's mark where there is one; else whether it is going.
  if (need === undefined || of < CHECK_SERVES) return `${base}${lately}.`
  return gone >= need ? `${base}, enough for a drill check.` : `${base}. A drill check needs ${need}.`
}
