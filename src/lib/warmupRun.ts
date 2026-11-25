/**
 * The download behind "Download it now", Settings' offline button and the
 * first Film tap: every engine file on one bar, then the engines built from
 * what's kept.
 *
 * Its own chunk (2026-11-25), loaded on the tap: the entry bundle is at its
 * budget, and nobody needs this code until they ask for the download.
 */
import { DownloadStalled, downloadEngines } from './engineDownload'
import { ENGINE_MANIFEST } from './engineManifest'
import { putInEngineCache } from './engineKeep'
import { loadEngine } from './pose/poseEngine'
import { loadRefineEngine } from './pose/refineEngine'
import { loadObjectEngine } from './vision/objectEngine'
import type { OfflineWarmup } from '../components/useOfflineWarmup'

/** Download and start every engine, saying how it goes. Resolves `false` on a failure it has already said. */
export async function runWarmup(base: string, say: (w: OfflineWarmup) => void): Promise<boolean> {
  try {
    // Every engine file on one bar first (L6.1), through the service
    // worker's cache, then the engines built from what it holds. The bar
    // moves a megabyte at a time, not a chunk at a time, so the screen is
    // not redrawn hundreds of times a second.
    let shown = -1
    // A first visit's page isn't the worker's yet, so the page keeps the files itself.
    const controlled = typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller)
    await downloadEngines(ENGINE_MANIFEST, base, {
      ...(controlled ? {} : { store: (url: string, bytes: Uint8Array) => putInEngineCache(url, bytes) }),
      onProgress: ({ loaded, total }) => {
        const loadedMb = Math.floor(loaded / 1e6)
        if (loadedMb === shown) return
        shown = loadedMb
        say({ stage: 'downloading', ratio: total ? loaded / total : 0, loadedMb, totalMb: Math.round(total / 1e6) })
      },
    })
    say({ stage: 'starting' })
    await loadEngine()
    await loadObjectEngine()
    await loadRefineEngine()
    return true
  } catch (err) {
    say({ stage: 'failed', stalled: err instanceof DownloadStalled })
    return false
  }
}
