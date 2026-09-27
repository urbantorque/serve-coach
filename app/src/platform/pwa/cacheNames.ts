/**
 * Cache Storage names, shared by the service worker (sw.ts) and the data layer ("Delete everything"
 * clears the runtime caches but keeps the app shell, ARCHITECTURE §8.3). A leaf module: no imports.
 */
export const CACHE_PREFIX = 'serve-coach'
/** Precached app shell, pose models and the wasm variant the pose worker loads. One per build. */
export const PRECACHE_PREFIX = `${CACHE_PREFIX}-precache-`
/** Filled on demand: sample-session files, the main-thread wasm fallback, extra font subsets. */
export const RUNTIME_PREFIX = `${CACHE_PREFIX}-runtime-`
export const RUNTIME_CACHES = {
  demo: `${RUNTIME_PREFIX}demo`,
  assets: `${RUNTIME_PREFIX}assets`,
} as const

/** Removes the runtime caches (not the app shell). Resolves to how many were removed; never throws. */
export async function clearRuntimeCaches(): Promise<number> {
  try {
    const store = (globalThis as { caches?: CacheStorage }).caches
    if (!store) return 0
    const names = (await store.keys()).filter((n) => n.startsWith(RUNTIME_PREFIX))
    await Promise.all(names.map((n) => store.delete(n)))
    return names.length
  } catch {
    return 0
  }
}
