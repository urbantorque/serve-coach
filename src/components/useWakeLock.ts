import { useEffect, useState } from 'react'

/**
 * Whether the screen is being kept on (L6.4): `held`, `refused` by the
 * browser, `unsupported` where the API does not exist, or `off` when nothing
 * asked. The last two that are not `held` are the ones a player is told
 * about, because a screen that locks mid-analysis pauses it.
 */
export type WakeLockStatus = 'off' | 'held' | 'refused' | 'unsupported'

/**
 * Keep the screen on while `active`, and say whether it could.
 *
 * An analysis takes the better part of half a minute and a basket several
 * times that, and a phone's screen timeout is often thirty seconds. A screen
 * that locks mid-analysis backgrounds the tab, the browser stops giving it
 * frames, and the seek-and-detect loop waits until somebody unlocks it.
 *
 * The lock is dropped by the browser whenever the page is hidden, so it is
 * taken again when the page comes back. A refusal used to be swallowed, so a
 * player on low battery watched a bar that stopped whenever the screen went
 * dark and had no way to know why.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('off')
  useEffect(() => {
    if (!active) {
      setStatus('off')
      return
    }
    if (!('wakeLock' in navigator)) {
      setStatus('unsupported')
      return
    }
    let lock: WakeLockSentinel | undefined
    let live = true

    const take = async () => {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (live) {
          lock = next
          setStatus('held')
        } else void next.release()
      } catch {
        // Refused — low battery, a background tab, a permissions policy. The
        // analysis still runs; it may pause when the screen goes dark.
        if (live) setStatus('refused')
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
  return status
}

/** The one line a player needs when the screen may lock, or nothing. */
export function wakeLockLine(status: WakeLockStatus): string | undefined {
  return status === 'refused' || status === 'unsupported'
    ? 'Keep the screen on until this finishes. If it locks, the check pauses until you come back.'
    : undefined
}
