/**
 * Keeping the engine files from the page, for a first visit (2026-11-25).
 *
 * Its own module, loaded only when a download runs on a page no service
 * worker controls yet: the entry bundle is at its budget, and most visits
 * never need this.
 */
import { ENGINE_CACHE, type CacheStorageLike } from './engineCache'

/** What each engine file is served as, so a kept copy loads like the original (a wasm compiles streaming only as application/wasm). */
const ENGINE_TYPES: Record<string, string> = { wasm: 'application/wasm', js: 'text/javascript', mjs: 'text/javascript' }

const pageCaches = (): CacheStorageLike | undefined =>
  'caches' in globalThis ? (globalThis as unknown as { caches: CacheStorageLike }).caches : undefined

/**
 * Keep one engine file in this build's engine cache, from the page.
 *
 * For a page no service worker controls yet (`downloadEngines`' `store`):
 * the worker's engine route reads this same cache, so what's kept here is
 * what the next visit loads with no signal. A refusal (a full disk, a private
 * window) is left for the cache check afterwards to report.
 */
export async function putInEngineCache(url: string, bytes: Uint8Array, cs: CacheStorageLike | undefined = pageCaches()): Promise<void> {
  if (!cs) return
  try {
    const cache = await cs.open(ENGINE_CACHE)
    const type = ENGINE_TYPES[url.split('.').pop() ?? ''] ?? 'application/octet-stream'
    await cache.put(url, new Response(bytes as BodyInit, { headers: { 'Content-Type': type, 'Content-Length': String(bytes.length) } }))
  } catch {
    // Reported by the check that follows, not here.
  }
}
