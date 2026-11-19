import { useCallback, useSyncExternalStore } from 'react'
import { GATED } from '../lib/billing/config'
import { entitlementStore } from '../lib/billing/entitlementStore'
import { can, type Feature } from '../lib/plans'

/**
 * `can` for a component: the player's plan as it is now, and a re-render when
 * it changes, so a purchase opens every gate on screen at once (N6.4).
 */
export function useCan(): (feature: Feature, o?: { firstServe?: boolean }) => boolean {
  const entitlement = useSyncExternalStore(entitlementStore.subscribe, entitlementStore.get, entitlementStore.get)
  return useCallback((feature, o) => can(feature, { entitlement, gated: GATED, firstServe: o?.firstServe }), [entitlement])
}
