import { useCallback, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useSetting } from '../../../data/hooks.ts'
import { assertGateable, markPaywallShown, t3PreviewDue, type PlusFeature } from '../../../entitlement/index.ts'
import { usePlan } from './entitlement.ts'
import { PlusSheet } from './PlusSheet.tsx'

export interface PlusGate {
  /** The feature is open: test Plus, or the beta (everything unlocked, PRODUCT §5.3). */
  plus: boolean
  /** The beta applies: open, with the non-blocking preview at the moment. */
  beta: boolean
  /** The flag has loaded. */
  ready: boolean
  /**
   * Runs `action` when the feature is open. In the beta it also shows the Plus preview the first time
   * the feature is tapped that day (non-blocking: the feature opens under it). After the beta (the Plan
   * screen's test), a free player gets the T3 offer instead and the action does not run.
   */
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
  const state = useSetting('paywall')
  const location = useLocation()
  const [open, setOpen] = useState(false)
  // Until the plan loads, the beta applies (everything unlocked): nothing locks by accident.
  const beta = plan?.beta ?? true
  const unlocked = plan?.unlocked ?? true
  const request = useCallback(
    (action: () => void) => {
      if (unlocked) {
        action()
        // The preview needs the plan read: before that, the feature simply opens.
        if (plan && beta && t3PreviewDue(plan.entitlement, state, feature)) {
          setOpen(true)
          void markPaywallShown('t3', { feature }).catch(() => undefined)
        }
        return
      }
      setOpen(true)
      void markPaywallShown('t3', { feature }).catch(() => undefined)
    },
    [unlocked, beta, plan, state, feature],
  )
  return {
    plus: unlocked,
    beta,
    ready: plan !== undefined,
    request,
    sheet: <PlusSheet open={open} onClose={() => setOpen(false)} trigger="t3" feature={feature} from={`${location.pathname}${location.search}`} beta={beta} />,
  }
}
