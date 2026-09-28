/**
 * The local plan flag (PRODUCT §5.2, §5.3, §6.15). Public API for other screens that mark Plus features:
 * `usePlan()` returns `{ plus, unlocked, beta, entitlement }` (undefined while loading), and `usePlusGate`
 * (in usePlusGate.tsx) wraps a Plus feature with the T3 sheet. In the PWA prototype the flag is only
 * ever switched by the Plan screen's test buttons; no payment is taken and nothing is sent.
 *
 * - `plus`: test Plus is on for this phone.
 * - `beta`: the beta applies (everything unlocked), unless the Plan screen's after-beta test is on.
 * - `unlocked`: Plus features are open (Plus, or the beta).
 */
import { getSetting, setSetting } from '../../../data/index.ts'
import { useSetting } from '../../../data/hooks.ts'
import type { EntitlementSetting } from '../../../data/records.ts'
import { hasPlusAccess, inBeta } from '../../../entitlement/index.ts'
import { FREE_ENTITLEMENT, isPlus, prototypeEntitlement, type PlanId } from './planModel.ts'

export interface PlanState {
  plus: boolean
  unlocked: boolean
  beta: boolean
  entitlement: EntitlementSetting
}

function planState(entitlement: EntitlementSetting): PlanState {
  const plus = isPlus(entitlement)
  return { plus, unlocked: hasPlusAccess(entitlement), beta: inBeta(entitlement) && !plus, entitlement }
}

export function usePlan(): PlanState | undefined {
  const entitlement = useSetting('entitlement')
  if (entitlement === undefined) return undefined
  return planState(entitlement)
}

export async function getPlan(): Promise<PlanState> {
  return planState(await getSetting('entitlement'))
}

/** Keeps the after-beta test switch when test Plus goes on or off. */
async function keepTest(e: EntitlementSetting): Promise<EntitlementSetting> {
  const current = await getSetting('entitlement')
  return current?.afterBetaTest ? { ...e, afterBetaTest: true } : e
}

/**
 * Prototype only: switches Plus on for testing. Takes no payment and calls no store. `via` and
 * `feature` record which paywall moment led here (the fake-door intent, kept on this phone).
 */
export async function switchOnTestPlus(plan: PlanId, now: Date = new Date(), via?: EntitlementSetting['via'], feature?: string): Promise<EntitlementSetting> {
  const e = await keepTest(prototypeEntitlement(plan, now, via, feature))
  await setSetting('entitlement', e, now)
  return e
}

export async function switchOffTestPlus(now: Date = new Date()): Promise<void> {
  await setSetting('entitlement', await keepTest(FREE_ENTITLEMENT), now)
}

/** Prototype only: test the after-beta free plan on this phone (Plus features lock again). */
export async function setAfterBetaTest(on: boolean, now: Date = new Date()): Promise<void> {
  const current = (await getSetting('entitlement')) ?? FREE_ENTITLEMENT
  const next: EntitlementSetting = { ...current }
  if (on) next.afterBetaTest = true
  else delete next.afterBetaTest
  await setSetting('entitlement', next, now)
}
