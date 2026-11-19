/** A whole practice recorded in the app, written out as it goes (N4.4). */
import { MAX_PRACTICE_SECONDS, PRACTICE_SLICE_MS, recordPractice, type ChunkSink, type SlicingRecorder } from '../practice'
import { MAX_RECORDING_SECONDS } from '../record'
import { SESSION_SECONDS } from '../../session/length'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

/** A recorder that does what the browser's does when told, and records the slice it was asked for. */
class FakeRecorder implements SlicingRecorder {
  static last: FakeRecorder
  state = 'inactive'
  slice?: number
  ondataavailable: SlicingRecorder['ondataavailable'] = null
  onstop: SlicingRecorder['onstop'] = null
  onerror: SlicingRecorder['onerror'] = null
  constructor() {
    FakeRecorder.last = this
  }
  start(timeslice?: number) {
    this.state = 'recording'
    this.slice = timeslice
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
  deliver(bytes: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) })
  }
}

/** A sink in memory, slow on purpose, that can be told to fail. */
function memorySink(failOn = -1) {
  const got: number[] = []
  const timed: number[] = []
  let discarded = false
  const sink: ChunkSink = {
    async write(chunk) {
      await new Promise((r) => setTimeout(r, 2))
      if (got.length === failOn) throw new Error('disk full')
      got.push(chunk.size)
    },
    async finish(type, name, durationMs) {
      timed.push(durationMs)
      return new File(got.map((n) => new Uint8Array(n)), name, { type })
    },
    async discard() {
      discarded = true
    },
  }
  return { sink, got, timed, discarded: () => discarded }
}

const stream = { getVideoTracks: () => [{ getSettings: () => ({ width: 1920, height: 1080, frameRate: 60 }) }] }

heading('Written out as it is recorded')

/**
 * Waits for the recording to finish its writes, rather than for a fixed 50 ms that
 * a machine running other suites overruns: the writes are async, and only their
 * outcome is under test. Gives up after three seconds, which is a failure.
 */
const settled = async (done: () => boolean, ms = 3000) => {
  const t0 = Date.now()
  while (!done() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 10))
}

await check('a chunk a second, each written in order, and the file waits for the last write', async () => {
  let clock = 0
  const mem = memorySink()
  let file: File | undefined
  let chunks = 0
  recordPractice(stream, 'video/webm', FakeRecorder as never, mem.sink, {
    stopped: (f, n) => {
      file = f
      chunks = n
    },
    failed: () => {},
  }, () => {
    // Started at 17:05:01, stopped at 17:05:09: eight seconds of practice.
    clock += 1
    return new Date(2026, 10, 19, 17, 5, clock === 1 ? 1 : 9)
  })
  const rec = FakeRecorder.last
  assert(rec.slice === PRACTICE_SLICE_MS, `asked for a chunk every ${rec.slice} ms`)
  for (const n of [10, 20, 30, 40]) rec.deliver(n)
  rec.stop()
  await settled(() => file !== undefined)
  assert(file !== undefined, 'no file after the stop')
  assert(mem.got.join() === '10,20,30,40', `written out of order: ${mem.got.join()}`)
  assert(file!.size === 100 && chunks === 4, `${file!.size} bytes from ${chunks} chunks`)
  assert(/^practice-2026-11-19-170509\.webm$/.test(file!.name), file!.name)
  assert(mem.timed[0] === 8000, `the file was timed at ${mem.timed[0]} ms, not the eight seconds recorded`)
})

await check('a write that fails throws the file away rather than hand over a basket with a hole', async () => {
  const mem = memorySink(1)
  let failed = false
  let file: File | undefined
  recordPractice(stream, 'video/webm', FakeRecorder as never, mem.sink, {
    stopped: (f) => (file = f),
    failed: () => (failed = true),
  })
  const rec = FakeRecorder.last
  for (const n of [10, 20, 30]) rec.deliver(n)
  rec.stop()
  await settled(() => failed)
  assert(failed && file === undefined, 'a broken write still produced a file')
  assert(mem.discarded(), 'the broken file was left behind')
})

heading('Long enough to be a practice, bounded all the same')

check('the cap is a practice, well past the session line and the single-serve cap', () => {
  assert(MAX_PRACTICE_SECONDS > SESSION_SECONDS * 4, `${MAX_PRACTICE_SECONDS} s is not a basket`)
  assert(MAX_PRACTICE_SECONDS > MAX_RECORDING_SECONDS, 'a practice is capped shorter than a serve')
  assert(MAX_PRACTICE_SECONDS <= 30 * 60, 'no cap worth the name')
})

report()
