/**
 * The closed beta (PRODUCT §5.3, product decision 2026-09-28): everything is unlocked for beta testers.
 * The paywall moments (T1 after the first "Did it work?" verdict, T2 allowance reached, T3 a Plus
 * feature tapped) still appear, as a calm, non-blocking "Plus preview": what Plus will include, the
 * proposed price, "Beta: this is unlocked for you", and a one-tap willingness-to-pay question recorded
 * as a local beta event. The Plan screen's prototype switch (`afterBetaTest`) turns the after-beta free
 * plan on for this phone, so its gates can be tested; test Plus still unlocks them then.
 */
import { recordEvent } from '../data/index.ts'
import type { EntitlementSetting, PaywallStateSetting } from '../data/records.ts'
import { isPlus, localDay, type PaywallTrigger } from './triggers.ts'
import type { PlusFeature } from './features.ts'

/** PRODUCT §5.3: the PWA beta unlocks every Plus feature. */
export const BETA_EVERYTHING_UNLOCKED = true

/** The price the willingness-to-pay question names (PRODUCT §5.2, MONETISATION §5: yearly plan, AUD incl. GST). */
export const PREVIEW_PRICE = { plan: 'annual', words: 'A$99.99 a year', short: 'A$99.99/yr', eventId: 'annual-99-99' } as const

export type WtpAnswer = 'yes' | 'maybe' | 'no'
export const WTP_ANSWERS: readonly { value: WtpAnswer; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'No' },
]

/** The beta applies: everything unlocked, unless the after-beta test is on. */
export function inBeta(e: EntitlementSetting | undefined): boolean {
  return BETA_EVERYTHING_UNLOCKED && !e?.afterBetaTest
}

/** A Plus feature is open: Plus (test Plus in the prototype), or the beta. */
export function hasPlusAccess(e: EntitlementSetting | undefined, now: Date = new Date()): boolean {
  return isPlus(e, now) || inBeta(e)
}

/**
 * T3 in the beta: the preview sheet appears the first time a feature is tapped on a local day (the
 * feature opens either way). Test Plus never sees it.
 */
export function t3PreviewDue(e: EntitlementSetting | undefined, state: PaywallStateSetting | undefined, feature: PlusFeature, now: Date = new Date()): boolean {
  if (isPlus(e, now) || !inBeta(e)) return false
  const today = localDay(now)
  return !(state?.log ?? []).some((l) => l.trigger === 't3' && l.feature === feature && localDay(new Date(l.at)) === today)
}

/**
 * Records the one-tap answer as a local beta event (docs/MONETISATION.md §8): the moment, the answer and
 * the price asked about. Never throws; the tester sees it in Profile > Beta data and nothing is sent.
 */
export function recordWtpAnswer(trigger: PaywallTrigger, answer: WtpAnswer, now: Date = new Date()): Promise<boolean> {
  return recordEvent('plus_wtp_answered', { trigger, wtp: answer, price: PREVIEW_PRICE.eventId }, { now })
}
