import { useEffect } from 'react'

/**
 * Keep the screen on while `active`.
 *
 * An analysis takes the better part of half a minute and a basket several
 * times that, and a phone's screen timeout is often thirty seconds. A screen
 * that locks mid-analysis backgrounds the tab, the browser stops giving it
 * frames, and the seek-and-detect loop stalls until somebody unlocks it — the
 * player comes back to a progress bar that has not moved and reads it as the
 * app having hung.
 *
 * The lock is dropped by the browser whenever the page is hidden, so it is
 * taken again when the page comes back. Where the API does not exist (older
 * iOS, Firefox) this does nothing, which is the behaviour those players
 * already had.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    let live = true

    const take = async () => {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (live) lock = next
        else void next.release()
      } catch {
        // Refused — low battery, a background tab, a permissions policy. The
        // analysis still runs; it just might be paused by the screen.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void take()
    }

    void take()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [active])
}
