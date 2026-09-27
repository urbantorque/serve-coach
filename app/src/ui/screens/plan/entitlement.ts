/**
 * The local plan flag (PRODUCT §5.2, §6.15). Public API for other screens that mark Plus features:
 * `usePlan()` returns `{ plus, entitlement }` (undefined while loading). In the PWA prototype the flag
 * is only ever switched by the Plan screen's test buttons; no payment is taken and nothing is sent.
 */
import { getSetting, setSetting } from '../../../data/index.ts'
import { useSetting } from '../../../data/hooks.ts'
import type { EntitlementSetting } from '../../../data/records.ts'
import { FREE_ENTITLEMENT, isPlus, prototypeEntitlement, type PlanId } from './planModel.ts'

export function usePlan(): { plus: boolean; entitlement: EntitlementSetting } | undefined {
  const entitlement = useSetting('entitlement')
  if (entitlement === undefined) return undefined
  return { plus: isPlus(entitlement), entitlement }
}

export async function getPlan(): Promise<{ plus: boolean; entitlement: EntitlementSetting }> {
  const entitlement = await getSetting('entitlement')
  return { plus: isPlus(entitlement), entitlement }
}

/** Prototype only: switches Plus on for testing. Takes no payment and calls no store. */
export async function switchOnTestPlus(plan: PlanId, now: Date = new Date()): Promise<EntitlementSetting> {
  const e = prototypeEntitlement(plan, now)
  await setSetting('entitlement', e, now)
  return e
}

export async function switchOffTestPlus(now: Date = new Date()): Promise<void> {
  await setSetting('entitlement', FREE_ENTITLEMENT, now)
}
