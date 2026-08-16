/**
 * Taking a new version of the app, at a moment that costs nothing.
 *
 * THE PROBLEM. The service worker was registered with `registerType:
 * 'autoUpdate'`, which does exactly what it says: when a new build lands, the
 * waiting worker takes over and the page reloads. That is the right default for
 * a page somebody is reading and the wrong one for this app, because of what it
 * is usually in the middle of. A single analysis is around half a minute of
 * seeking and pose detection; a basket sweep is one full pass over the video per
 * serve, up to six of them, and it is the most expensive thing this app
 * computes. A reload through either of those loses all of it — the object URL,
 * the tracked frames, the in-memory cache — and the player is returned to the
 * home screen with no message and no idea why. On a court, mid-basket.
 *
 * It is also the least likely failure to be reported and the hardest to
 * reproduce, because it only happens to somebody who was analysing at the exact
 * moment a deploy reached them.
 *
 * THE RULE. A new version is taken as soon as the app is doing nothing that
 * would be lost, and held indefinitely otherwise. "Doing nothing" is decided by
 * the caller, because this module has no idea what is on screen — see
 * `applyWhenIdle`.
 *
 * WHY NOT A BANNER. "A new version is available, tap to reload" is the usual
 * answer and it is worse here for two reasons. It is a decision the player
 * cannot make well — nothing on that banner tells them whether they are about
 * to lose a sweep — and it puts a control on the screen of an app whose whole
 * design is one instruction at a time. Holding the update until the home screen
 * costs the player nothing and asks them nothing.
 *
 * WHAT THIS IS NOT. Not a version check over the network beyond what the service
 * worker already does, and no new request: the update is discovered by the same
 * registration the app has always had. The README's claim that the app checks
 * for its own updates is unchanged; what changed is when it acts on one.
 */
import { registerSW } from 'virtual:pwa-register'

/** The waiting worker's own "take over now", handed over by `registerSW`. */
let activate: ((reload?: boolean) => Promise<void>) | undefined

let waiting = false
const listeners = new Set<() => void>()

/**
 * Start listening for new versions. Called once, from `main.tsx`.
 *
 * Deliberately not `immediate: true` any more. That flag registers the worker
 * before the first paint, which was worth having when the registration itself
 * was the whole of the behaviour; now that a new version is held rather than
 * applied, registering a beat later costs nothing and keeps the first paint
 * clear on the slowest phones — which is the moment this app is most often
 * opened on, at a court, on a cold cache.
 */
export function watchForUpdates(): void {
  try {
    activate = registerSW({
      onNeedRefresh() {
        waiting = true
        for (const fn of listeners) fn()
      },
    })
  } catch {
    // No service worker — an unsupported browser, a page served over plain
    // http, a private window. The app works; it simply will not update itself.
  }
}

/** Whether a new version is built, waiting, and not yet taken. */
export const updateWaiting = (): boolean => waiting

/** Told when that changes, so a screen can act on it. Returns an unsubscribe. */
export function onUpdateWaiting(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Take the waiting version now, which reloads the page.
 *
 * `idle` is the caller's promise that nothing would be lost by doing so, and it
 * is asked as a function rather than a boolean so it is evaluated at the moment
 * of acting rather than at the moment of subscribing — an analysis can start
 * between the two.
 *
 * Returns whether it acted, which is what makes this testable without a service
 * worker: the decision is the whole of the logic here, and the reload is the
 * browser's.
 */
export function applyWhenIdle(idle: () => boolean): boolean {
  if (!waiting || !activate || !idle()) return false
  waiting = false
  void activate(true)
  return true
}

/** For tests: pretend a new version has landed, without a service worker. */
export function __setWaitingForTest(
  state: boolean,
  fake?: (reload?: boolean) => Promise<void>,
): void {
  waiting = state
  activate = fake ?? (async () => {})
}
