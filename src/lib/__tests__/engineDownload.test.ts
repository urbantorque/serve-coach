/**
 * One honest download (L6.1): every engine file on one bar, sized from the
 * files themselves, and a download that stops arriving rejected rather than
 * waited on — with the engine left able to try again.
 *
 * Driven with fake streaming fetches and a fake clock, so nothing here
 * touches the network or waits in real time.
 */
import { DEFAULTS } from '../storage/prefs'
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import {
  DownloadStalled,
  STALL_MS,
  downloadEngines,
  fetchStreamed,
  meteredConnection,
  type Clock,
  type DownloadProgress,
} from '../engineDownload'
import { ENGINE_FILES, ENGINE_MANIFEST, engineBytes, engineMegabytes } from '../engineManifest'
import { loadEngine } from '../pose/poseEngine'
import Home from '../../screens/Home'
import { OfflineRow } from '../../components/AppSheets'
import type { OfflineWarmup } from '../../components/useOfflineWarmup'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { statSync: (p: string) => { size: number } }
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }

/** Timers that only fire when told to. */
function fakeClock() {
  let now = 0
  let next = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const clock: Clock & { advance: (ms: number) => Promise<void>; pending: () => number } = {
    setTimeout: (fn, ms) => {
      const id = ++next
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimeout: (id) => {
      timers.delete(id as number)
    },
    advance: async (ms) => {
      now += ms
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id)
          t.fn()
        }
      }
      await settle()
    },
    pending: () => timers.size,
  }
  return clock
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

/** A response whose body hands out `chunks` one read at a time, or holds when told. */
function streamed(chunks: number[], opts: { holdAfter?: number } = {}) {
  let i = 0
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  return {
    response: {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (opts.holdAfter !== undefined && i >= opts.holdAfter) await held
            if (i >= chunks.length) return { done: true, value: undefined }
            return { done: false, value: new Uint8Array(chunks[i++]) }
          },
        }),
      },
    } as unknown as Response,
    release,
  }
}

heading('One honest download')

check('the manifest is the files on disk, and the size the home screen says is theirs', () => {
  assert(ENGINE_MANIFEST.length === ENGINE_FILES.length, `the manifest has ${ENGINE_MANIFEST.length} of ${ENGINE_FILES.length} files`)
  for (const f of ENGINE_MANIFEST) {
    const size = fs.statSync(path.join(process.cwd(), 'public', f.path)).size
    assert(size === f.bytes, `${f.path}: the manifest says ${f.bytes}, the file is ${size}`)
  }
  note(`${ENGINE_MANIFEST.length} files, ${(engineBytes() / 1e6).toFixed(1)} MB, said as ${engineMegabytes()} MB`)
  assert(engineMegabytes() === 57, `the download is ${engineMegabytes()} MB, and the copy around it says 57`)
})

await check('every file on one bar, in order, never past its end', async () => {
  const files = [
    { path: 'models/a.task', bytes: 300 },
    { path: 'wasm/b.wasm', bytes: 500 },
    { path: 'ort/c.wasm', bytes: 200 },
  ]
  const asked: string[] = []
  const bodies: Record<string, number[]> = {
    '/app/models/a.task': [100, 100, 100],
    '/app/wasm/b.wasm': [250, 250],
    // A server that sent more than the build measured: the bar stops at its end.
    '/app/ort/c.wasm': [150, 150],
  }
  const seen: DownloadProgress[] = []
  await downloadEngines(files, '/app/', {
    fetch: (async (url: string) => {
      asked.push(url)
      return streamed(bodies[url]).response
    }) as unknown as typeof fetch,
    clock: fakeClock(),
    onProgress: (p) => seen.push(p),
  })
  note(seen.map((p) => p.loaded).join(' → ') + ` of ${seen[0].total}`)
  assert(asked.join() === Object.keys(bodies).join(), `fetched ${asked.join()}`)
  assert(seen.every((p) => p.total === 1000), 'the total moved during the download')
  for (let i = 1; i < seen.length; i++) assert(seen[i].loaded >= seen[i - 1].loaded, 'the bar went backwards')
  assert(seen.every((p) => p.loaded <= p.total), 'the bar ran past its end')
  assert(seen[seen.length - 1].loaded === 1000, 'the bar didn’t finish')
})

await check('a fetch that never answers is rejected as stalled, and its request aborted', async () => {
  const clock = fakeClock()
  let signal: AbortSignal | undefined
  let caught: unknown
  const done = fetchStreamed('/models/x.task', {
    clock,
    fetch: ((_: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    }) as unknown as typeof fetch,
  }).catch((e) => (caught = e))
  await clock.advance(STALL_MS - 1)
  assert(caught === undefined, 'gave up before the stall limit')
  await clock.advance(1)
  await done
  assert(caught instanceof DownloadStalled, `rejected with ${String(caught)}`)
  assert(signal?.aborted === true, 'the request was left running')
  assert(clock.pending() === 0, 'a timer was left behind')
})

await check('a stream that stops mid-file is stalled; one that keeps arriving slowly isn’t', async () => {
  const clock = fakeClock()
  const stuck = streamed([10, 10, 10], { holdAfter: 2 })
  let caught: unknown
  const done = fetchStreamed('/wasm/y.wasm', { clock, fetch: (async () => stuck.response) as unknown as typeof fetch }).catch(
    (e) => (caught = e),
  )
  await settle()
  await clock.advance(STALL_MS)
  await done
  assert(caught instanceof DownloadStalled, 'a stream that stopped after two chunks was waited on')

  // Slow: every chunk lands just inside the limit, ten times over.
  const slowClock = fakeClock()
  let k = 0
  const reads: (() => void)[] = []
  const slow = {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () =>
          new Promise((resolve) => {
            if (k >= 10) return resolve({ done: true, value: undefined })
            reads.push(() => {
              k++
              resolve({ done: false, value: new Uint8Array(5) })
            })
          }),
      }),
    },
  } as unknown as Response
  let got: Uint8Array | undefined
  let failed: unknown
  const slowDone = fetchStreamed('/ort/z.wasm', { clock: slowClock, fetch: (async () => slow) as unknown as typeof fetch })
    .then((b) => (got = b))
    .catch((e) => (failed = e))
  for (let i = 0; i < 10; i++) {
    await settle()
    await slowClock.advance(STALL_MS - 1)
    reads.shift()?.()
  }
  await settle()
  await slowDone
  assert(failed === undefined, `a slow, steady download was cut off: ${String(failed)}`)
  assert(got?.length === 50, `kept ${got?.length} of 50 bytes`)
})

await check('a stalled engine download clears the way for the next attempt', async () => {
  // The pose engine itself, with the global fetch and clock swapped out.
  const g = globalThis as unknown as { fetch: unknown; setTimeout: unknown; clearTimeout: unknown }
  const saved = { fetch: g.fetch, setTimeout: g.setTimeout, clearTimeout: g.clearTimeout }
  const clock = fakeClock()
  let calls = 0
  g.fetch = () => {
    calls++
    return new Promise(() => {})
  }
  g.setTimeout = clock.setTimeout
  g.clearTimeout = clock.clearTimeout
  try {
    let first: unknown
    const one = loadEngine().catch((e) => (first = e))
    await settle()
    await clock.advance(STALL_MS)
    await one
    assert(first instanceof DownloadStalled, `the first attempt ended with ${String(first)}`)
    const two = loadEngine().catch(() => {})
    await settle()
    assert(calls === 2, `the second attempt fetched ${calls - 1} times instead of starting again`)
    await clock.advance(STALL_MS)
    await two
  } finally {
    g.fetch = saved.fetch
    g.setTimeout = saved.setTimeout
    g.clearTimeout = saved.clearTimeout
  }
})

check('a metered connection is named only when the browser says so', () => {
  assert(meteredConnection({}) === undefined, 'no connection information read as metered')
  assert(meteredConnection({ connection: { type: 'wifi' } }) === undefined, 'wifi read as metered')
  assert(meteredConnection({ connection: { type: 'cellular' } }) === 'cellular', 'cellular missed')
  assert(meteredConnection({ connection: { saveData: true, type: 'wifi' } }) === 'saveData', 'Data Saver missed')
})

check('settings says the size, the bar in megabytes, and the warning before the tap, and the first run says it too', () => {
  const noop = () => {}
  const row = (ready: boolean, warming?: OfflineWarmup, metered?: 'saveData' | 'cellular') =>
    renderToStaticMarkup(createElement(OfflineRow, { ready, warming, metered, onDownload: noop }))
  assert(row(false).includes('Download to use with no signal, 57\u00a0MB'), 'the button lost its size')
  assert(row(false, { stage: 'downloading', ratio: 0.4, loadedMb: 23, totalMb: 57 }).includes('Downloading, 23 of 57\u00a0MB'), 'the bar isn’t in megabytes')
  assert(row(false, { stage: 'failed', stalled: true }).includes('The download stopped. Try again'), 'a stall reads as a refusal')
  assert(row(false, undefined, 'cellular').includes('wait for Wi-Fi'), 'no warning on mobile data')
  assert(row(true).includes('Ready to use with no signal'), 'a downloaded coach doesn’t say so')
  const first = renderToStaticMarkup(
    createElement(Home, { sessions: [], offlineReady: false, sessionsLoaded: true, prefs: DEFAULTS, onPrefs: noop, onFilm: noop, onOpen: noop, onShowHistory: noop, onShowSettings: noop, onShowProgress: noop, onShowExample: noop }),
  )
  assert(first.includes('needs a one-time download of 57\u00a0MB'), 'a new player isn’t told the size before the first serve')
})

report()
