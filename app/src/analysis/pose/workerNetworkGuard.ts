/**
 * Same-origin fetch guard for the pose worker (defence in depth for DECISIONS D8).
 *
 * tasks-vision 1.0.1 POSTs usage logs to https://odml.pa.googleapis.com/v1/log with `fetch`
 * from wherever the landmarker runs (here: the worker), on close and every 60 s, with no off
 * switch. The page CSP (connect-src 'self') is the primary control and reaches the worker
 * through its blob: bootstrap (mediapipeSource.ts, createPoseWorker). This guard also refuses
 * cross-origin fetches inside the worker, so the telemetry stays on the device in a browser
 * that does not pass the page policy on to blob workers. Same-origin, blob: and data: URLs
 * (the wasm runtime and model files) pass through untouched.
 */

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface FetchGuardScope {
  fetch: FetchLike
  location: { href: string; origin: string }
}

export interface FetchGuardOptions {
  /** Called with origin + path of every refused request. */
  onBlocked?: (url: string) => void
}

export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * The URL the scope's own origin comes from. A worker started from a blob: URL has
 * location.href 'blob:<creator URL>'; its origin is the creator's.
 */
export function selfBaseUrl(location: FetchGuardScope['location']): string {
  return location.href.startsWith('blob:') ? location.href.slice('blob:'.length) : location.href
}

/**
 * True when the URL may be fetched: the scope's own scheme and host, or a blob: / data: URL.
 * Scheme + host is compared rather than URL.origin, because a custom scheme such as Capacitor's
 * capacitor://localhost has an opaque ("null") URL origin.
 */
export function isAllowedUrl(raw: string, location: FetchGuardScope['location']): boolean {
  let url: URL
  let self: URL
  try {
    self = new URL(selfBaseUrl(location))
    url = new URL(raw, self)
  } catch {
    return true // not a URL fetch can load either; let fetch raise its own error
  }
  if (url.protocol === 'blob:' || url.protocol === 'data:') return true
  return url.protocol === self.protocol && url.host === self.host
}

/** Replaces scope.fetch with the guarded version. Returns a function that restores the original. */
export function installSameOriginFetchGuard(scope: FetchGuardScope, options: FetchGuardOptions = {}): () => void {
  const original = scope.fetch
  const guarded: FetchLike = (input, init) => {
    const raw = requestUrl(input)
    if (isAllowedUrl(raw, scope.location)) return original.call(scope, input, init)
    let shown = raw
    try {
      const url = new URL(raw, selfBaseUrl(scope.location))
      shown = `${url.origin}${url.pathname}`
    } catch {
      // keep the raw string
    }
    options.onBlocked?.(shown)
    return Promise.reject(new TypeError(`Blocked on-device: cross-origin request to ${shown} (privacy guard)`))
  }
  scope.fetch = guarded
  return () => {
    if (scope.fetch === guarded) scope.fetch = original
  }
}
