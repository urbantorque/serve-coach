/**
 * One honest download (L6.1): every engine file, streamed, on one bar, and a
 * download that stops arriving is called stopped rather than waited on.
 *
 * Each engine used to fetch its own model with its own progress, one after
 * another, and the runtimes the libraries fetch for themselves had no progress
 * at all, so the bar ran to 100% three times and then sat on "Setting up" for
 * the largest file. And a fetch that never finished was awaited forever: the
 * engine's `pending` promise never settled, so every later attempt joined the
 * same dead one until the page was reloaded.
 *
 * DOM-free, with the fetch and the clock passed in, so the suite can drive it
 * with fake streams and fake timers.
 */
import type { EngineFile } from './engineManifest'
import { deviceNoun } from './device'

/** A download that has delivered nothing for this long is stalled. */
export const STALL_MS = 30_000

export class DownloadStalled extends Error {
  constructor(public readonly url: string) {
    super('The download stopped. Check your connection and try again.')
    this.name = 'DownloadStalled'
  }
}

export interface Clock {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

const REAL_CLOCK: Clock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export interface StreamOptions {
  fetch?: typeof fetch
  clock?: Clock
  stallMs?: number
  /** Called with each chunk's size as it lands. */
  onChunk?: (bytes: number) => void
  /** Keep the bytes and return them; a warm-up only wants them cached. */
  keep?: boolean
}

/**
 * Fetch one file as a stream, rejecting with `DownloadStalled` when nothing
 * arrives for `stallMs` — before the response, between chunks, or a fetch that
 * never answers at all. The watchdog is re-armed on every chunk, so a slow
 * connection that keeps delivering is never cut off.
 */
export async function fetchStreamed(url: string, opts: StreamOptions = {}): Promise<Uint8Array> {
  // Called as `fetch(` in so many letters, so the egress check sees it.
  const doFetch = opts.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init))
  const clock = opts.clock ?? REAL_CLOCK
  const stallMs = opts.stallMs ?? STALL_MS
  const abort = new AbortController()
  let timer: unknown
  let stalled: (err: Error) => void = () => {}
  const watchdog = new Promise<never>((_, reject) => {
    stalled = reject
  })
  // Kept from surfacing as an unhandled rejection when nothing is racing it.
  watchdog.catch(() => {})
  const arm = () => {
    if (timer !== undefined) clock.clearTimeout(timer)
    timer = clock.setTimeout(() => {
      abort.abort()
      stalled(new DownloadStalled(url))
    }, stallMs)
  }
  const race = <T>(p: Promise<T>) => Promise.race([p, watchdog])

  try {
    arm()
    const res = await race(doFetch(url, { signal: abort.signal }))
    if (!res.ok) throw new Error(`Couldn’t download ${url.split('/').pop()} (HTTP ${res.status}).`)
    if (!res.body) {
      const all = new Uint8Array(await race(res.arrayBuffer()))
      opts.onChunk?.(all.length)
      return opts.keep === false ? new Uint8Array(0) : all
    }
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      arm()
      const { done, value } = await race(reader.read())
      if (done) break
      loaded += value.length
      if (opts.keep !== false) chunks.push(value)
      opts.onChunk?.(value.length)
    }
    if (opts.keep === false) return new Uint8Array(0)
    const out = new Uint8Array(loaded)
    let at = 0
    for (const c of chunks) {
      out.set(c, at)
      at += c.length
    }
    return out
  } finally {
    if (timer !== undefined) clock.clearTimeout(timer)
  }
}

export interface DownloadProgress {
  /** Bytes in so far, across every file. */
  loaded: number
  /** Bytes in every file, from the build's manifest. */
  total: number
}

/**
 * Every engine file, one after another, on one bar.
 *
 * Fetched through the service worker, whose engine route caches what passes
 * (`vite.config.ts`), so this is the download and the engines then load from
 * the cache. The total is the manifest's, not each response's own length, so
 * the bar is one bar: it never runs to the end and starts again.
 */
export async function downloadEngines(
  files: readonly EngineFile[],
  base: string,
  opts: Omit<StreamOptions, 'onChunk' | 'keep'> & { onProgress?: (p: DownloadProgress) => void } = {},
): Promise<void> {
  const total = files.reduce((n, f) => n + f.bytes, 0)
  let loaded = 0
  opts.onProgress?.({ loaded, total })
  for (const f of files) {
    await fetchStreamed(`${base}${f.path}`, {
      ...opts,
      keep: false,
      onChunk: (bytes) => {
        // Never past the total: a server that compresses, or a file that grew
        // since the build, must not push the bar over its end.
        loaded = Math.min(total, loaded + bytes)
        opts.onProgress?.({ loaded, total })
      },
    })
  }
  opts.onProgress?.({ loaded: total, total })
}

/**
 * Whether the player is on a connection a 57 MB download costs money on: Save
 * Data turned on, or the browser saying the connection is cellular. Chrome on
 * Android reports both; Safari reports neither, and nothing is said there.
 */
export function meteredConnection(nav: {
  connection?: { saveData?: boolean; type?: string }
}): 'saveData' | 'cellular' | undefined {
  const c = nav.connection
  if (!c) return undefined
  if (c.saveData) return 'saveData'
  if (c.type === 'cellular') return 'cellular'
  return undefined
}

/* ------------------------------------------------- when the engine fails (L6.2) */

/** Why the coach could not be started, as the player needs to hear it. */
export type EngineFailure = 'offline' | 'stalled' | 'failed'

/**
 * Which of the three a failed engine load was: a download that stopped
 * arriving, no connection to download it over, or something else. By name as
 * well as class, for the reason `isNotAServeError` gives: a class duplicated
 * across chunks fails `instanceof` silently.
 */
export function engineFailureOf(cause: unknown, online: boolean): EngineFailure {
  if (cause instanceof DownloadStalled || (cause as { name?: unknown } | null)?.name === 'DownloadStalled') return 'stalled'
  if (!online) return 'offline'
  return 'failed'
}

const FAILURE_COPY: Record<EngineFailure, (mb: number) => { title: string; hints: string[] }> = {
  offline: (mb) => ({
    title: `The coach isn’t on this ${deviceNoun()} yet`,
    hints: [
      `Connect to the internet once, on Wi-Fi if you can, and the coach downloads (${mb} MB).`,
      'After that it works with no signal at all.',
    ],
  }),
  stalled: (mb) => ({
    title: "The coach's download stopped",
    hints: ['Check your connection and try again.', `On Wi-Fi the ${mb} MB takes a minute or two.`],
  }),
  failed: () => ({
    title: 'I couldn’t start the coach',
    hints: [
      'Reload the page and try again.',
      'If it happens again, check this browser is allowed to store data for this site.',
    ],
  }),
}

/**
 * An engine that would not load, carrying its own advice (L6.2).
 *
 * It used to reach the player as "Something went wrong reading that video",
 * with tips about MP4 files and the camera roll: the right advice for a file
 * the decoder refused, and no use at all to somebody whose phone has no signal
 * and no downloaded coach. `hints` is what `hintsOf` reads, so the error
 * screen shows this copy without knowing the class.
 */
export class EngineLoadError extends Error {
  readonly hints: string[]
  readonly kind: EngineFailure
  constructor(cause: unknown, online = globalThis.navigator?.onLine !== false, megabytes = 57) {
    const kind = engineFailureOf(cause, online)
    const copy = FAILURE_COPY[kind](megabytes)
    super(copy.title)
    this.name = 'EngineLoadError'
    this.kind = kind
    this.hints = copy.hints
    this.cause = cause
  }
}
