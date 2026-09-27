/**
 * Serve Coach service worker (hand-written; vite-plugin-pwa only injects the precache list at build time
 * as `self.__WB_MANIFEST`, no Workbox runtime). Registered by platform/pwa/register.ts, never in the
 * Capacitor shell (ARCHITECTURE §15.1).
 *
 * - Precache (install): the app shell (index.html, JS, CSS, fonts' latin subsets, icons, manifest), both
 *   pose models and only the MediaPipe wasm variant the pose worker loads (the module build). Files whose
 *   revision did not change are copied from the previous build's cache instead of downloaded again.
 * - Runtime (on first use): sample-session files, the main-thread wasm fallback and other font subsets.
 *   Runtime caches are dropped when a new build activates, so the sample never mixes two builds.
 * - Updates wait until the player taps Reload (the calm prompt in platform/ui); nothing reloads by itself.
 * - Never fetches another origin and never answers for one (routes.ts).
 */
import { CACHE_PREFIX, PRECACHE_PREFIX } from '../pwa/cacheNames.ts'
import { buildId, entryPath, route, type ManifestEntry } from './routes.ts'

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request
  respondWith(response: Response | Promise<Response>): void
}
interface MessageEventLike extends ExtendableEventLike {
  data: unknown
}
interface ServiceWorkerScopeLike {
  location: Location
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void
}

const scope = self as unknown as ServiceWorkerScopeLike
// The injection point must read exactly `self.__WB_MANIFEST` in the built file.
const MANIFEST: ManifestEntry[] = (self as unknown as { __WB_MANIFEST: ManifestEntry[] }).__WB_MANIFEST
const PRECACHE = `${PRECACHE_PREFIX}${buildId(MANIFEST)}`
const REVISIONS_KEY = '/__precache-revisions.json'
const PRECACHED = new Set(MANIFEST.map(entryPath))
const ORIGIN = scope.location.origin
const INSTALL_CONCURRENCY = 4

type Revisions = Record<string, string | null>

async function readRevisions(cache: Cache): Promise<Revisions> {
  try {
    const res = await cache.match(REVISIONS_KEY)
    return res ? ((await res.json()) as Revisions) : {}
  } catch {
    return {}
  }
}

/** A copy of an unchanged file from an earlier build's precache, if there is one. */
async function reusable(path: string, revision: string | null, previous: { cache: Cache; revisions: Revisions }[]): Promise<Response | undefined> {
  for (const p of previous) {
    if (!(path in p.revisions) || p.revisions[path] !== revision) continue
    const hit = await p.cache.match(path)
    if (hit) return hit
  }
  return undefined
}

async function install(): Promise<void> {
  const cache = await caches.open(PRECACHE)
  const names = (await caches.keys()).filter((n) => n.startsWith(PRECACHE_PREFIX) && n !== PRECACHE)
  const previous = await Promise.all(names.map(async (n) => ({ cache: await caches.open(n), revisions: await readRevisions(await caches.open(n)) })))
  const done = await readRevisions(cache)
  const queue = [...MANIFEST]
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      const path = entryPath(entry)
      if (path in done && done[path] === entry.revision && (await cache.match(path))) continue
      const copy = await reusable(path, entry.revision, previous)
      if (copy) {
        await cache.put(path, copy)
        continue
      }
      // Same origin only (the manifest lists this build's own files). 'no-store' skips the HTTP cache both
      // ways: a stale copy never lands under a new revision, and the install never writes the 9 MB model
      // into the HTTP cache while the pose worker fetches it (two writers of one entry gave Chromium's
      // net::ERR_CACHE_WRITE_FAILURE, analysis/pose/mediapipeCore.ts).
      const res = await fetch(new Request(new URL(path, ORIGIN).href, { cache: 'no-store', credentials: 'same-origin' }))
      if (!res.ok) throw new Error(`precache ${path}: HTTP ${res.status}`)
      await cache.put(path, res)
    }
  }
  await Promise.all(Array.from({ length: INSTALL_CONCURRENCY }, worker))
  const revisions: Revisions = Object.fromEntries(MANIFEST.map((e) => [entryPath(e), e.revision]))
  await cache.put(REVISIONS_KEY, new Response(JSON.stringify(revisions), { headers: { 'Content-Type': 'application/json' } }))
}

async function activate(): Promise<void> {
  // Old builds' precaches and every runtime cache go; the new build starts clean.
  const names = await caches.keys()
  await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== PRECACHE).map((n) => caches.delete(n)))
  await scope.clients.claim()
}

async function fromNetwork(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch {
    return Response.error()
  }
}

async function shell(request: Request): Promise<Response> {
  const hit = await (await caches.open(PRECACHE)).match('/index.html')
  return hit ?? fromNetwork(request)
}

async function precached(request: Request, path: string): Promise<Response> {
  const hit = await (await caches.open(PRECACHE)).match(path)
  return hit ?? fromNetwork(request)
}

async function runtime(event: FetchEventLike, cacheName: string): Promise<Response> {
  const url = new URL(event.request.url)
  const key = `${url.origin}${url.pathname}`
  const cache = await caches.open(cacheName)
  const hit = await cache.match(key)
  if (hit) return hit
  const res = await fromNetwork(event.request)
  if (res.ok && res.status === 200 && res.type === 'basic') event.waitUntil(cache.put(key, res.clone()))
  return res
}

scope.addEventListener('install', (event) => event.waitUntil(install()))
scope.addEventListener('activate', (event) => event.waitUntil(activate()))
scope.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null
  if (data?.type === 'SKIP_WAITING') event.waitUntil(scope.skipWaiting())
})
scope.addEventListener('fetch', (event) => {
  const r = event.request
  const decision = route({ url: r.url, method: r.method, mode: r.mode, range: r.headers.get('range') }, ORIGIN, PRECACHED)
  switch (decision.kind) {
    case 'pass':
      return
    case 'shell':
      event.respondWith(shell(r))
      return
    case 'precache':
      event.respondWith(precached(r, decision.path))
      return
    case 'runtime':
      event.respondWith(runtime(event, decision.cache))
      return
  }
})
