import { useCallback, useEffect, useState } from 'react'
import { isCachedOffline } from '../lib/pose/poseEngine'
import { isRefineModelCached } from '../lib/pose/refineEngine'
import { isObjectModelCached } from '../lib/vision/objectEngine'
import { pruneEngineCaches } from '../lib/engineCache'

const BASE = import.meta.env?.BASE_URL || '/'

/**
 * The state of a warm-up. `unkept` is the case worth having a name for: the
 * engine downloaded and this session can analyse with it, but it is not in the
 * cache, so a reload starts from nothing.
 */
export type OfflineWarmup = {
  stage: 'downloading' | 'starting' | 'failed' | 'unkept'
  ratio?: number
  /** Whole megabytes in so far, and in all, on the one bar across every file (L6.1). */
  loadedMb?: number
  totalMb?: number
  /** Failed because nothing arrived for a while, rather than refused. */
  stalled?: boolean
}

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

  // Older versions' engine caches, deleted once per load (L6.6): every upgrade
  // used to leave the last 57 MB behind.
  useEffect(() => {
    void pruneEngineCaches()
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
    // The download itself loads on the tap (warmupRun): nobody needs it before.
    const { runWarmup } = await import('../lib/warmupRun')
    if (!(await runWarmup(BASE, setWarming))) return
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
