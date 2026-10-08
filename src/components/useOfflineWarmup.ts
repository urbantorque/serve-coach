import { useCallback, useEffect, useState } from 'react'
import { isCachedOffline, loadEngine } from '../lib/pose/poseEngine'
import { isRefineModelCached, loadRefineEngine } from '../lib/pose/refineEngine'
import { isObjectModelCached, loadObjectEngine } from '../lib/vision/objectEngine'
import type { OfflineWarmup } from '../screens/Home'

/**
 * Whether the *whole* offline footprint is in the cache — the pose model and
 * its WASM runtime, the object model the racket detector needs, and the swing
 * refinement.
 *
 * Separate cache checks because the engines vendor into separate `caches.match`
 * entries; the WASM runtime is not checked twice, since the engines load it
 * from the same URL and `isCachedOffline` already covers it (see the note on
 * `isObjectModelCached`).
 */
function checkOfflineReady(): Promise<boolean> {
  return Promise.all([isCachedOffline(), isObjectModelCached(), isRefineModelCached()]).then(
    ([pose, object, refine]) => pose && object && refine,
  )
}

/**
 * The offline badge and the download behind it (W5.2): whether every engine is
 * cached, and the warm-up that puts them there. Out of `App.tsx`, where it was
 * two pieces of state and two callbacks with nothing else in the app reading
 * them.
 */
export function useOfflineWarmup() {
  /** `undefined` until the cache has been asked, so the badge does not flash "Download now" at a player who already has. */
  const [offlineReady, setOfflineReady] = useState<boolean>()
  const [warming, setWarming] = useState<OfflineWarmup>()

  /** Ask the cache again: on opening, and after an analysis has loaded whatever it needed. */
  const recheck = useCallback(() => {
    void checkOfflineReady().then(setOfflineReady)
  }, [])

  useEffect(() => recheck(), [recheck])

  /**
   * Fetch every engine now rather than during the first analysis.
   *
   * The same `loadEngine`/`loadObjectEngine`/`loadRefineEngine` every analysis
   * calls, so this is a warm-up and not a second download path: whatever it
   * caches is what the next analysis skips. The cache is re-read afterwards
   * rather than assumed, because a browser that declined to store 57 MB should
   * leave the badge saying so.
   */
  const makeOffline = useCallback(async () => {
    setWarming({ stage: 'downloading', ratio: 0 })
    try {
      await loadEngine((p) => {
        if (p.stage === 'downloading') setWarming({ stage: 'downloading', ratio: p.ratio })
        else if (p.stage === 'starting') setWarming({ stage: 'starting' })
      })
      // Sequential, not `Promise.all`, so the progress bar reads as one
      // download finishing after another rather than two competing ratios
      // fighting over the same number.
      await loadObjectEngine((p) => {
        if (p.stage === 'downloading') setWarming({ stage: 'downloading', ratio: p.ratio })
        else if (p.stage === 'starting') setWarming({ stage: 'starting' })
      })
      // The swing refinement, last and largest. No byte progress of its own:
      // it reports as setting up, which is what the player needs to know.
      setWarming({ stage: 'starting' })
      await loadRefineEngine()
    } catch {
      setWarming({ stage: 'failed' })
      return
    }
    // Downloading and keeping are separate questions, and only the cache
    // answers the second one. A browser that will not store the download —
    // an iOS private window, service workers turned off — has just loaded
    // every engine for this session and will have nothing after a reload.
    const cached = await checkOfflineReady()
    setOfflineReady(cached)
    setWarming(cached ? undefined : { stage: 'unkept' })
  }, [])

  return { offlineReady, warming, makeOffline, recheck }
}
