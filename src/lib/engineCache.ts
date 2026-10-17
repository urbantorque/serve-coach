/**
 * The engine cache, by its own name (L6.6).
 *
 * The service worker keeps the models and runtimes in a cache named for the
 * library versions they belong to (\`vite.config.ts\`), so an upgrade fetches a
 * runtime that matches its JavaScript. But the readiness check asked
 * \`caches.match\`, which searches every cache the origin has: after an
 * upgrade, last version's files answered "ready to use offline" for an app
 * that would fetch this version's on first use with no signal. And the old
 * caches were never removed, so every upgrade left the last 57 MB behind.
 *
 * The name now comes in at build time as \`__ENGINE_CACHE__\`, the readiness
 * check opens that cache only, and caches from older versions are deleted.
 * The cache storage is passed in, so a test can hand over a fake one.
 */

declare const __ENGINE_CACHE__: string | undefined

/** Every engine cache this app has ever named starts with this. */
export const ENGINE_CACHE_PREFIX = 'serve-coach-pose-engine-'

/** This build's engine cache. A build without the define names none that exists. */
export const ENGINE_CACHE: string =
  typeof __ENGINE_CACHE__ !== 'undefined' ? __ENGINE_CACHE__ : `${ENGINE_CACHE_PREFIX}unbuilt`

export type CacheStorageLike = Pick<CacheStorage, 'has' | 'open' | 'keys' | 'delete'>

const pageCaches = (): CacheStorageLike | undefined =>
  'caches' in globalThis ? (globalThis as unknown as { caches: CacheStorageLike }).caches : undefined

/**
 * Whether every one of `urls` is in this build's engine cache. Asked with
 * \`has\` first, because \`open\` would create the cache it was asked about.
 */
export async function inEngineCache(urls: readonly string[], cs: CacheStorageLike | undefined = pageCaches()): Promise<boolean> {
  if (!cs) return false
  try {
    if (!(await cs.has(ENGINE_CACHE))) return false
    const cache = await cs.open(ENGINE_CACHE)
    const hits = await Promise.all(urls.map((u) => cache.match(u)))
    return hits.every(Boolean)
  } catch {
    return false
  }
}

/** Delete the engine caches older builds left, and say which. */
export async function pruneEngineCaches(cs: CacheStorageLike | undefined = pageCaches()): Promise<string[]> {
  if (!cs) return []
  try {
    const stale = (await cs.keys()).filter((k) => k.startsWith(ENGINE_CACHE_PREFIX) && k !== ENGINE_CACHE)
    await Promise.all(stale.map((k) => cs.delete(k)))
    return stale
  } catch {
    return []
  }
}
