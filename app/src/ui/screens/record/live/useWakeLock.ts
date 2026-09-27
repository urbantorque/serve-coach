/**
 * Keeps the screen on during set-up and recording (CAPTURE §9.2). Returns false when the Screen Wake
 * Lock API is missing or refused, so the screen can show the Auto-Lock advice instead.
 */
import { useEffect, useState } from 'react'

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener?: (t: 'release', f: () => void) => void }
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> }

const wakeLockApi = (): WakeLockLike | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock

export function useWakeLock(active: boolean): boolean | null {
  const [held, setHeld] = useState<boolean | null>(null)
  const supported = wakeLockApi() !== undefined
  useEffect(() => {
    const api = wakeLockApi()
    if (!active || !api) return
    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false
    const acquire = () => {
      api
        .request('screen')
        .then((s) => {
          if (cancelled) {
            void s.release().catch(() => undefined)
            return
          }
          sentinel = s
          setHeld(true)
        })
        .catch(() => setHeld(false))
    }
    acquire()
    // The lock drops when the page is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
  return supported ? held : false
}
