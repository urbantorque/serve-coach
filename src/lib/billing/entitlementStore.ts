/**
 * The player's plan, as the running app knows it (N6.4). Free until something
 * proves otherwise: a signed pass checked on this device (N6.5), or, in
 * development, `?plan=plus` for looking at the paid side.
 */
import { FREE, type Entitlement } from '../plans'

let current: Entitlement = FREE
const listeners = new Set<() => void>()

export const entitlementStore = {
  get: (): Entitlement => current,
  set(next: Entitlement) {
    if (next.plan === current.plan && next.until === current.until) return
    current = next
    for (const fn of listeners) fn()
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

if (import.meta.env?.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('plan') === 'plus') {
  entitlementStore.set({ plan: 'plus' })
}
