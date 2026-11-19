import { useCallback, useSyncExternalStore } from 'react'
import { GATED } from '../lib/billing/config'
import { entitlementStore } from '../lib/billing/entitlementStore'
import { can, type Entitlement, type Feature } from '../lib/plans'

/** The player's plan as it is now (N6.5), for the page that shows it. */
export function useEntitlement(): Entitlement {
  return useSyncExternalStore(entitlementStore.subscribe, entitlementStore.get, entitlementStore.get)
}

/**
 * `can` for a component: the player's plan as it is now, and a re-render when
 * it changes, so a purchase opens every gate on screen at once (N6.4).
 */
export function useCan(): (feature: Feature, o?: { firstServe?: boolean }) => boolean {
  const entitlement = useSyncExternalStore(entitlementStore.subscribe, entitlementStore.get, entitlementStore.get)
  return useCallback((feature, o) => can(feature, { entitlement, gated: GATED, firstServe: o?.firstServe }), [entitlement])
}
