/**
 * Request routing for the service worker (sw.ts), kept pure so it is unit-tested. The worker only ever
 * answers same-origin GET requests; everything else (other origins, POSTs, ranged video reads, the dev
 * corpus) is left to the browser, and the worker itself never fetches another origin. The page CSP
 * (connect-src 'self') already blocks cross-origin requests before they reach the worker.
 */
import { RUNTIME_CACHES } from '../pwa/cacheNames.ts'

export type Route =
  /** Not handled: the browser does the request as if there were no worker. */
  | { kind: 'pass' }
  /** An app route: the precached index.html (the app shell), then the network. */
  | { kind: 'shell' }
  /** A precached file, looked up by path (query ignored: the MediaPipe loader adds ?load=N). */
  | { kind: 'precache'; path: string }
  /** Cached the first time it is fetched (sample files, the main-thread wasm fallback, extra fonts). */
  | { kind: 'runtime'; cache: string }

export interface RouteRequest {
  url: string
  method: string
  mode: string
  /** The Range header, when present. */
  range: string | null
}

/** Paths under these prefixes are cached on first use (not precached). */
const RUNTIME_PREFIXES: readonly [string, string][] = [
  ['/demo/', RUNTIME_CACHES.demo],
  ['/mediapipe/', RUNTIME_CACHES.assets],
  ['/models/', RUNTIME_CACHES.assets],
  ['/assets/', RUNTIME_CACHES.assets],
  ['/icons/', RUNTIME_CACHES.assets],
]

export function route(req: RouteRequest, origin: string, precached: ReadonlySet<string>): Route {
  if (req.method !== 'GET') return { kind: 'pass' }
  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return { kind: 'pass' }
  }
  if (url.origin !== origin) return { kind: 'pass' }
  // Ranged reads (video elements) stream from the network or a blob URL; a cached whole body would break them.
  if (req.range) return { kind: 'pass' }
  const path = url.pathname
  // Dev-only middleware (the synthetic corpus) and the worker script itself are never cached.
  if (path.startsWith('/__') || path === '/sw.js') return { kind: 'pass' }
  if (req.mode === 'navigate') {
    // A file opened directly (a demo clip, the manifest) is not an app route.
    const last = path.split('/').pop() ?? ''
    return last.includes('.') && !last.endsWith('.html') ? { kind: 'pass' } : { kind: 'shell' }
  }
  if (precached.has(path)) return { kind: 'precache', path }
  for (const [prefix, cache] of RUNTIME_PREFIXES) if (path.startsWith(prefix)) return { kind: 'runtime', cache }
  return { kind: 'pass' }
}

/** Precache manifest entry, as vite-plugin-pwa injects it (`url` is relative to the scope, e.g. "assets/x.js"). */
export interface ManifestEntry {
  url: string
  revision: string | null
}

/** "/assets/x.js" for "assets/x.js" or "./assets/x.js". */
export function entryPath(entry: ManifestEntry): string {
  const u = entry.url.replace(/^\.\//, '')
  return u.startsWith('/') ? u : `/${u}`
}

/** A stable name for this build's precache, from every entry's path and revision (FNV-1a). */
export function buildId(entries: readonly ManifestEntry[]): string {
  let h = 0x811c9dc5
  const text = entries
    .map((e) => `${entryPath(e)}@${e.revision ?? ''}`)
    .sort()
    .join('|')
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
