import { useCallback, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { assertGateable, markPaywallShown, type PlusFeature } from '../../../entitlement/index.ts'
import { usePlan } from './entitlement.ts'
import { PlusSheet } from './PlusSheet.tsx'

export interface PlusGate {
  /** Plus is on for this phone (the prototype's test flag). */
  plus: boolean
  /** The flag has loaded. */
  ready: boolean
  /** Runs `action` with Plus; otherwise opens the T3 sheet naming the feature (and records it). */
  request: (action: () => void) => void
  /** The sheet to render once, anywhere in the screen. */
  sheet: ReactNode
}

/**
 * T3 (PRODUCT §6.15): a Plus feature tapped. Wrap the feature's action with `request`. Only Plus
 * features can be gated (features.ts refuses the always-free areas).
 */
export function usePlusGate(feature: PlusFeature): PlusGate {
  if (import.meta.env.DEV) assertGateable(feature)
  const plan = usePlan()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const plus = plan?.plus ?? false
  const request = useCallback(
    (action: () => void) => {
      if (plus) {
        action()
        return
      }
      setOpen(true)
      void markPaywallShown('t3', { feature }).catch(() => undefined)
    },
    [plus, feature],
  )
  return {
    plus,
    ready: plan !== undefined,
    request,
    sheet: <PlusSheet open={open} onClose={() => setOpen(false)} trigger="t3" feature={feature} from={`${location.pathname}${location.search}`} />,
  }
}
