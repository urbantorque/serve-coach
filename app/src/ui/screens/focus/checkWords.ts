/**
 * The words under a coaching check, wherever a check is shown: the focus sheet's "Also noticed" and
 * "What we checked" rows (ItemCheck) and the focus card's "Also checked" lines (the stored
 * CoachingDecision.alternatives).
 *
 * An item that is experimental because of its coaching RULE (coaching-library.json evidenceTier
 * 'experimental': no club-player thresholds yet) says so. The coaching engine words it as "{subject}
 * is an experimental check", which reads as if the measurement were experimental while the report
 * shows the same value as an Estimate (steady-rhythm beside "Rhythm consistency ≈ 35 ms"). Checks
 * that are experimental because of their DATA keep the engine's text. Mapping here, at render time,
 * also corrects decisions stored before the wording changed, the sample player's included.
 */
import { getItem, ITEM_WORDS, itemByFaultId, type ItemCheck } from '../../../coaching/index.ts'
import { FOCUS_COPY } from './copy.ts'

/** The engine's experimental-off sentence (coaching/detect.ts, coaching/decide.ts). */
const EXPERIMENTAL_OFF = /is an experimental check, which you haven't switched on\.$/

/** The line under a check in the focus sheet (the row's title names the item). */
export function checkText(c: Pick<ItemCheck, 'itemId' | 'status' | 'text'>): string {
  if (c.status === 'experimental-off' && getItem(c.itemId)?.evidenceTier === 'experimental') return FOCUS_COPY.ruleExperimentalOff
  return c.text
}

/** One stored "Also checked" line on the focus card (no titles there, so it names the subject). */
export function alternativeText(a: { faultId: string; reason: string }): string {
  const it = itemByFaultId(a.faultId)
  if (it?.evidenceTier !== 'experimental' || !EXPERIMENTAL_OFF.test(a.reason)) return a.reason
  return FOCUS_COPY.ruleExperimentalOffFor(ITEM_WORDS[it.id]?.subject ?? it.title)
}
