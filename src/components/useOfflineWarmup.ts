import { useCallback, useEffect, useState } from 'react'
import { isCachedOffline, loadEngine } from '../lib/pose/poseEngine'
import { isRefineModelCached, loadRefineEngine } from '../lib/pose/refineEngine'
import { isObjectModelCached, loadObjectEngine } from '../lib/vision/objectEngine'
import type { OfflineWarmup } from '../screens/Home'
import { DownloadStalled, downloadEngines } from '../lib/engineDownload'
import { ENGINE_MANIFEST } from '../lib/engineManifest'

const BASE = import.meta.env?.BASE_URL || '/'

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
      // Every engine file on one bar first (L6.1), through the service
      // worker's cache, then the engines built from what it holds. The bar
      // moves a megabyte at a time, not a chunk at a time, so the screen is
      // not redrawn hundreds of times a second.
      let shown = -1
      await downloadEngines(ENGINE_MANIFEST, BASE, {
        onProgress: ({ loaded, total }) => {
          const loadedMb = Math.floor(loaded / 1e6)
          if (loadedMb === shown) return
          shown = loadedMb
          setWarming({ stage: 'downloading', ratio: total ? loaded / total : 0, loadedMb, totalMb: Math.round(total / 1e6) })
        },
      })
      setWarming({ stage: 'starting' })
      await loadEngine()
      await loadObjectEngine()
      await loadRefineEngine()
    } catch (err) {
      setWarming({ stage: 'failed', stalled: err instanceof DownloadStalled })
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
