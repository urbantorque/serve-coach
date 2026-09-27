/**
 * Reads and writes the paywall state (the `paywall` setting) and the prototype plan flag. Local only:
 * nothing is sent anywhere, and no payment is ever taken. Deleting everything clears both.
 */
import { getSetting, setSetting } from '../data/index.ts'
import type { EntitlementSetting, PaywallStateSetting } from '../data/records.ts'
import { afterShown, isPlus, type PaywallTrigger } from './triggers.ts'

export async function getPaywallState(): Promise<PaywallStateSetting> {
  return (await getSetting('paywall')) ?? {}
}

/** Records that an offer was shown (T1 once, T2 once a month, T3 each time), and returns the new state. */
export async function markPaywallShown(
  trigger: PaywallTrigger,
  extra: { feature?: string; experimentId?: string; month?: string } = {},
  now: Date = new Date(),
): Promise<PaywallStateSetting> {
  const next = afterShown(await getPaywallState(), trigger, now, extra)
  await setSetting('paywall', next, now)
  return next
}

export async function getEntitlement(): Promise<{ plus: boolean; entitlement: EntitlementSetting }> {
  const entitlement = await getSetting('entitlement')
  return { plus: isPlus(entitlement), entitlement }
}
