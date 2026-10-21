import type { Dispatch, RefObject, SetStateAction } from 'react'

/**
 * "Go again", straight to the capture it needs (N0.4): the viewfinder for a
 * refusal or an in-app recording, the picker for a picked clip, over Home.
 *
 * The picker is the app's own input, clicked a tick after Home mounts, the way
 * the first-run guide and the session's "pick again" already do it. Out of
 * `App.tsx` to keep that file under its size budget.
 */
export function captureAgainWith(deps: {
  goHome: () => void
  setFramingNonce: Dispatch<SetStateAction<number>>
  setFirstRunIntent: (intent: 'pick') => void
  pickRef: RefObject<HTMLInputElement | null>
}) {
  return (how: 'pick' | 'framing') => {
    deps.goHome()
    if (how === 'framing') {
      deps.setFramingNonce((n) => n + 1)
      return
    }
    deps.setFirstRunIntent('pick')
    setTimeout(() => deps.pickRef.current?.click(), 0)
  }
}
