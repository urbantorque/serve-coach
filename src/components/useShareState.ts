import { useEffect, useRef, useState } from 'react'

export type SharingState = 'idle' | 'working' | 'done'

/**
 * The idle/working/done cycle every share button in this app goes through,
 * and the 2.5s "Saved" confirmation window before it reverts to idle.
 *
 * Extracted after three call sites — `Report`, `ConsistencyPanel`,
 * `SeasonShareButton` — turned out to carry this verbatim, not just a
 * similar shape: the same state, the same cleanup-timer dance, the same
 * "cancelled/failed both read as nothing happened, only shared/downloaded
 * count as done" rule. A different question from the `*EverLine` family
 * (declined a shared helper): those three functions shared a sentence
 * *shape* with genuinely different verbs and clauses underneath; these
 * three shared the exact same *logic*, with only which card gets rendered
 * differing between them.
 *
 * The timer is held rather than left to fire blind, for the same reason
 * each call site already held it: a share is often the last thing a player
 * does before leaving the screen it was rendered from, and a `setState`
 * firing after that screen is gone is exactly the kind of warning this
 * pattern exists to avoid.
 */
export function useShareState(share: () => Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'>) {
  const [sharing, setSharing] = useState<SharingState>('idle')
  const sharedTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(sharedTimer.current), [])

  const trigger = async () => {
    setSharing('working')
    const outcome = await share()
    const done = outcome === 'shared' || outcome === 'downloaded'
    setSharing(done ? 'done' : 'idle')
    if (done) {
      clearTimeout(sharedTimer.current)
      sharedTimer.current = setTimeout(() => setSharing('idle'), 2500)
    }
  }

  return { sharing, trigger }
}
