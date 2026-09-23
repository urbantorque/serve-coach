import { useEffect, useRef, useState } from 'react'
import { createBackStack, type BackStack } from '../lib/backStack'

/**
 * One stack for the whole page, made on first use so the module stays safe to
 * import where there is no `window` (the Node test suites import components).
 */
let stack: BackStack | undefined

function backStack(): BackStack {
  if (!stack) {
    stack = createBackStack(window.history)
    window.addEventListener('popstate', () => stack!.popped())
  }
  return stack
}

/**
 * While `active`, the back gesture runs `onBack` instead of leaving the app.
 *
 * `onBack` is read through a ref so the layer depends only on `active`: every
 * caller passes an inline arrow, and a layer re-opened on each render would
 * push a history entry per render. See `lib/backStack.ts` for the bookkeeping.
 *
 * A back press spends the layer's history entry whatever `onBack` does. Most
 * handlers close the thing, so `active` goes false and that is the end of it;
 * the one that does not — stopping a basket sweep hands back a report, which
 * is still not home — would otherwise leave a live screen with no entry under
 * it, and the next back would leave the app. `spent` re-arms it.
 */
export function useBackLayer(active: boolean, onBack: () => void) {
  const ref = useRef(onBack)
  const [spent, setSpent] = useState(0)
  useEffect(() => {
    ref.current = onBack
  })
  useEffect(() => {
    if (!active) return
    return backStack().open(() => {
      ref.current()
      setSpent((n) => n + 1)
    })
  }, [active, spent])
}
