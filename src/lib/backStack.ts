/**
 * The phone's back gesture, made to close what is on top instead of the app.
 *
 * The app has no router: six screens and a handful of sheets are React state,
 * and nothing ever touched `history`. So on Android the back button, and on
 * iOS the edge swipe in a browser tab, left the app from any screen — a player
 * reading their report pressed back to close a sheet and landed on whatever
 * page they had open before. That is the most common gesture on a phone, and
 * the one place a web app most visibly stops feeling like an app.
 *
 * The fix is a stack of layers, not a router. Anything that can be dismissed —
 * a screen other than home, a sheet — opens a layer while it is showing. A
 * layer pushes one history entry; a back press pops the top layer and runs its
 * close. A layer closed by the app's own controls (the close button, a
 * backdrop tap, a navigation) takes its history entry back out with a
 * `history.back()` that this module then ignores, so the history depth and the
 * number of open layers stay equal.
 *
 * History entries are counted, never identified. The entries are anonymous and
 * the stack only has to agree with the browser on how many there are, which is
 * what lets a layer underneath close first (going home with a sheet open)
 * without the two falling out of step.
 *
 * DOM-free by construction — the history and the listener are passed in — so
 * the bookkeeping is tested in Node against a fake history rather than trusted.
 */

export interface HistoryLike {
  pushState(data: unknown, unused: string): void
  back(): void
}

export interface BackStack {
  /** Open a layer. Returns its close, for when the app itself dismisses it. */
  open(onBack: () => void): () => void
  /** The browser moved back one entry. Wire to `popstate`. */
  popped(): void
  /** How many layers are open. For tests and for nothing else. */
  readonly depth: number
}

export function createBackStack(history: HistoryLike): BackStack {
  const layers: { onBack: () => void }[] = []
  let ignore = 0

  return {
    open(onBack) {
      const layer = { onBack }
      layers.push(layer)
      history.pushState({ serveCoachLayer: layers.length }, '')
      return () => {
        const i = layers.indexOf(layer)
        // Already gone: the back press that closed it popped it first, and the
        // browser has already moved, so there is no entry left to take back.
        if (i < 0) return
        layers.splice(i, 1)
        ignore++
        history.back()
      }
    },
    popped() {
      if (ignore > 0) {
        ignore--
        return
      }
      // A back press with no layer open is a genuine exit, or an entry left
      // over from before a reload; either way it is not ours to handle.
      layers.pop()?.onBack()
    },
    get depth() {
      return layers.length
    },
  }
}
