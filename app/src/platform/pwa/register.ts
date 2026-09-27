/**
 * Service worker registration and the update state behind the calm update prompt (platform/ui).
 *
 * - Registers /sw.js once the page has loaded, in production builds only, and never inside the
 *   Capacitor shell (its bundle is local; WKWebView service workers need App-Bound Domains,
 *   ARCHITECTURE §15.1).
 * - A new version waits. The prompt offers Reload; only that tap activates it (SKIP_WAITING), and the
 *   page reloads once the new worker takes control. Nothing reloads by itself, so a recording or an
 *   analysis is never cut off by an update.
 * - Checks for a new version when the app comes back to the foreground, at most once an hour.
 */
import { create } from 'zustand'

export type PwaPhase = 'off' | 'registering' | 'ready' | 'unsupported' | 'error'

export interface PwaState {
  phase: PwaPhase
  /** The app shell is cached: Serve Coach opens without a connection. */
  offlineReady: boolean
  /** A new version is installed and waiting for the player's Reload. */
  updateReady: boolean
  /** The player chose "Later" for this waiting version. */
  updateDismissed: boolean
  applyUpdate: () => void
  dismissUpdate: () => void
}

let waiting: ServiceWorker | null = null
let reloadRequested = false

export const usePwa = create<PwaState>()((set) => ({
  phase: 'off',
  offlineReady: false,
  updateReady: false,
  updateDismissed: false,
  applyUpdate: () => {
    if (!waiting) return
    reloadRequested = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
  },
  dismissUpdate: () => set({ updateDismissed: true }),
}))

/** True inside the Capacitor iOS shell. */
export function isNativeShell(win: { Capacitor?: { isNativePlatform?: () => boolean } } = globalThis as never): boolean {
  try {
    return Boolean(win.Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

/** 'standalone' when opened from the Home Screen (or an installed app window). */
export function displayMode(): 'standalone' | 'browser' | 'unknown' {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return 'standalone'
    if (typeof matchMedia === 'function') return matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'
  } catch {
    // Fall through.
  }
  return 'unknown'
}

const UPDATE_CHECK_MS = 60 * 60 * 1000

function track(reg: ServiceWorkerRegistration, sw: ServiceWorker, hadController: boolean): void {
  const settle = () => {
    if (sw.state !== 'installed' && sw.state !== 'activated') return
    if (hadController && reg.waiting === sw) {
      waiting = sw
      usePwa.setState({ updateReady: true, updateDismissed: false })
    } else if (sw.state === 'activated' || !hadController) {
      usePwa.setState({ offlineReady: true })
    }
  }
  sw.addEventListener('statechange', settle)
  settle()
}

export interface RegisterOptions {
  url?: string
  /** Register in a dev build too (only when the plugin's dev worker is enabled). */
  force?: boolean
}

export async function registerServiceWorker(options: RegisterOptions = {}): Promise<ServiceWorkerRegistration | null> {
  const nav = globalThis.navigator
  if (!nav || !('serviceWorker' in nav)) {
    usePwa.setState({ phase: 'unsupported' })
    return null
  }
  if (isNativeShell() || (import.meta.env.DEV && !options.force)) return null
  usePwa.setState({ phase: 'registering' })
  try {
    const hadController = Boolean(nav.serviceWorker.controller)
    const reg = await nav.serviceWorker.register(options.url ?? '/sw.js', { scope: '/', updateViaCache: 'none' })
    if (reg.waiting) track(reg, reg.waiting, hadController)
    if (reg.installing) track(reg, reg.installing, hadController)
    if (reg.active && hadController) usePwa.setState({ offlineReady: true })
    reg.addEventListener('updatefound', () => {
      if (reg.installing) track(reg, reg.installing, Boolean(nav.serviceWorker.controller))
    })
    nav.serviceWorker.addEventListener('controllerchange', () => {
      // Only the player's Reload leads here with a reload; the first install just takes control.
      if (reloadRequested) {
        reloadRequested = false
        location.reload()
      }
    })
    let lastCheck = Date.now()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_MS) return
      lastCheck = Date.now()
      void reg.update().catch(() => undefined)
    })
    usePwa.setState({ phase: 'ready' })
    return reg
  } catch {
    usePwa.setState({ phase: 'error' })
    return null
  }
}

/** Registers after the page has loaded, so the precache download never competes with first paint. */
export function registerWhenLoaded(options: RegisterOptions = {}): void {
  if (typeof window === 'undefined') return
  const go = () => void registerServiceWorker(options)
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
}
