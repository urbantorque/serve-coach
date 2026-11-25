/**
 * An engine cache that follows the version (L6.6): readiness is asked of this
 * build's cache alone, and the caches older builds left are deleted — driven
 * against a fake CacheStorage, since the suite has none.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { ENGINE_CACHE, ENGINE_CACHE_PREFIX, inEngineCache, pruneEngineCaches, type CacheStorageLike } from '../engineCache'
import { isCachedOffline } from '../pose/poseEngine'
import { isObjectModelCached } from '../vision/objectEngine'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string }

/** Caches by name, each a set of URLs, with a log of what was opened. */
function fakeCaches(contents: Record<string, string[]>) {
  const store = new Map(Object.entries(contents).map(([k, v]) => [k, new Set(v)]))
  const opened: string[] = []
  const cs: CacheStorageLike = {
    has: async (name) => store.has(name),
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    open: async (name) => {
      opened.push(name)
      if (!store.has(name)) store.set(name, new Set())
      const set = store.get(name)!
      return { match: async (u: RequestInfo | URL) => (set.has(String(u)) ? new Response('') : undefined) } as unknown as Cache
    },
  }
  return { cs, store, opened }
}

const OLD = `${ENGINE_CACHE_PREFIX}0.10.0-ort-1.18.0`
const PRECACHE = 'workbox-precache-v2-http://localhost/'
const MODEL = '/models/pose_landmarker_full.task'
const WASM = '/wasm/vision_wasm_internal.wasm'

heading('An engine cache that follows the version')

check("the cache the app asks is the one this build's worker fills", () => {
  const version = (pkg: string) => JSON.parse(fs.readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version
  const expected = `${ENGINE_CACHE_PREFIX}${version('@mediapipe/tasks-vision')}-ort-${version('onnxruntime-web')}`
  note(ENGINE_CACHE)
  assert(ENGINE_CACHE === expected, `the app asks ${ENGINE_CACHE}, the worker fills ${expected}`)
})

await check("readiness is this build's cache alone, and asking doesn’t create it", async () => {
  const stale = fakeCaches({ [OLD]: [MODEL, WASM], [PRECACHE]: ['/index.html'] })
  assert(!(await inEngineCache([MODEL, WASM], stale.cs)), "last version's files read as ready")
  assert(stale.opened.length === 0 && !stale.store.has(ENGINE_CACHE), 'asking created the cache it asked about')

  const fresh = fakeCaches({ [ENGINE_CACHE]: [MODEL, WASM] })
  assert(await inEngineCache([MODEL, WASM], fresh.cs), "this version's files didn’t read as ready")
  const half = fakeCaches({ [ENGINE_CACHE]: [MODEL] })
  assert(!(await inEngineCache([MODEL, WASM], half.cs)), 'half the files read as ready')
  assert(!(await inEngineCache([MODEL], undefined)), 'no cache storage read as ready')
})

await check("the engines' own checks ask the same cache", async () => {
  const g = globalThis as unknown as { caches?: CacheStorageLike }
  const saved = g.caches
  try {
    g.caches = fakeCaches({ [OLD]: [MODEL, WASM, '/models/efficientdet_lite0.tflite'] }).cs
    assert(!(await isCachedOffline()), 'the pose engine read an old cache as ready')
    assert(!(await isObjectModelCached()), 'the object engine read an old cache as ready')
    g.caches = fakeCaches({ [ENGINE_CACHE]: [MODEL, WASM, '/models/efficientdet_lite0.tflite'] }).cs
    assert(await isCachedOffline(), 'the pose engine missed its own cache')
    assert(await isObjectModelCached(), 'the object engine missed its own cache')
  } finally {
    g.caches = saved
  }
})

await check('older engine caches are deleted, and nothing else is', async () => {
  const older = `${ENGINE_CACHE_PREFIX}0.9.0-ort-1.17.0`
  const { cs, store } = fakeCaches({ [OLD]: [MODEL], [older]: [MODEL], [ENGINE_CACHE]: [MODEL], [PRECACHE]: ['/'] })
  const gone = await pruneEngineCaches(cs)
  note(`deleted ${gone.join(', ')}`)
  assert(gone.length === 2 && !store.has(OLD) && !store.has(older), 'an old engine cache survived')
  assert(store.has(ENGINE_CACHE), "this version's cache was deleted")
  assert(store.has(PRECACHE), "the app's own precache was deleted")
  assert((await pruneEngineCaches(cs)).length === 0, 'a second prune found more to delete')
})

report()
