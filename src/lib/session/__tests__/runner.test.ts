/**
 * Reading a practice session and keeping its place (L2.5).
 *
 * The runner is driven with a scripted reader in place of a video: real
 * analyses from the rig, a serve that cannot be read, a stop pressed between
 * serves and one pressed mid-serve, and a resume from the row a stop saved.
 */
import { runSession, type SessionIO } from '../runner'
import { lineOf } from '../line'
import { normalisePracticeSession, sessionIdFor, toRead, type PracticeSession } from '../session'
import { sampleServes } from '../plan'
import { watchWarmth } from '../warmth'
import { sampleAnalysis } from '../../../dev/sampleAnalysis'
import { NotAServeError, type Analysis } from '../../analysis/types'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const SERVE = sampleAnalysis()
const REFUSED: Analysis = { ...SERVE, triage: { ...SERVE.triage!, status: 'rejected', reason: 'too_blurry' } }

const fresh = (): PracticeSession => ({
  id: sessionIdFor('k1'),
  createdAt: 1000,
  updatedAt: 1000,
  fileName: 'session.mov',
  duration: 600,
  serveType: 'flat',
  handedness: 'right',
  mode: 'sample',
  lines: [],
  phase: 'locating',
})

/** A run against a scripted file: `count` serves, some unreadable, a stop where asked. */
async function run(opts: {
  start?: PracticeSession
  count: number
  unreadable?: number[]
  refused?: number[]
  stopAfterReads?: number
  stopDuring?: number
}) {
  const controller = new AbortController()
  const saved: PracticeSession[] = []
  const reads: number[] = []
  let locates = 0
  const io: SessionIO = {
    locate: async () => {
      locates++
      return Array.from({ length: opts.count }, (_, i) => 5 + i * 12)
    },
    read: async (index) => {
      reads.push(index)
      if (opts.stopDuring === reads.length) {
        controller.abort()
        throw Object.assign(new Error('stopped'), { name: 'Cancelled' })
      }
      if (opts.unreadable?.includes(index)) throw new NotAServeError('I could not find a serve there.', [])
      if (opts.refused?.includes(index)) return REFUSED
      return SERVE
    },
    choose: (n) => sampleServes(n),
    save: async (s) => {
      saved.push(s)
      if (opts.stopAfterReads !== undefined && s.lines.length === opts.stopAfterReads) controller.abort()
    },
    signal: controller.signal,
    now: () => 2000 + saved.length,
  }
  const result = await runSession(opts.start ?? fresh(), io)
  return { result, saved, reads, locates }
}

heading('A session read through')

await check('every chosen serve is read once, and the row is saved after each', async () => {
  const { result, saved, reads, locates } = await run({ count: 50 })
  assert(locates === 1, `scanned ${locates} times`)
  assert(result.phase === 'done', `ended ${result.phase}`)
  assert(result.found!.length === 50 && result.chosen!.length === 12, `found ${result.found?.length}, chose ${result.chosen?.length}`)
  assert(JSON.stringify(reads) === JSON.stringify(result.chosen), 'read something other than the chosen serves')
  assert(result.lines.length === 12 && result.lines.every((l) => l.status === 'read'), 'a chosen serve has no line')
  // Locating, the scan's result, one per serve, done.
  assert(saved.length === 1 + 1 + 12 + 1, `saved ${saved.length} times`)
  note(`one line: ${JSON.stringify(result.lines[0]).length} bytes`)
  assert(JSON.stringify(result.lines[0]).length < 1500, 'a line is past a kilobyte and a half')
})

await check('a serve that cannot be read, or is refused, costs that serve and nothing else', async () => {
  const chosen = sampleServes(50)
  const { result } = await run({ count: 50, unreadable: [chosen[2]], refused: [chosen[5]] })
  const unclear = result.lines.filter((l) => l.status === 'unclear').map((l) => l.number - 1)
  assert(result.phase === 'done', `ended ${result.phase}`)
  assert(JSON.stringify(unclear) === JSON.stringify([chosen[2], chosen[5]]), `unclear: ${unclear.join(', ')}`)
  assert(result.lines.length === 12, `${result.lines.length} lines`)
})

await check('every serve of a thirty-minute session is one row that grows a line at a time', async () => {
  /*
   * The footprint question, asked of what the runner keeps rather than of the
   * heap: an `Analysis` holds every frame, and the session must not. Each read
   * hands back a fresh analysis and the stored row is measured after every
   * serve, so a runner that kept frames, or an analysis, shows up as a row that
   * jumps by megabytes rather than by a line.
   */
  const controller = new AbortController()
  let largest = 0
  let previous = 0
  const io: SessionIO = {
    locate: async () => Array.from({ length: 120 }, (_, i) => 5 + i * 15),
    read: async () => sampleAnalysis({}, undefined, 32),
    choose: (n) => Array.from({ length: n }, (_, i) => i),
    save: async (s) => {
      const bytes = JSON.stringify(s).length
      largest = Math.max(largest, bytes - previous)
      previous = bytes
    },
    signal: controller.signal,
  }
  const result = await runSession({ ...fresh(), mode: 'every', duration: 1800 }, io)
  note(`120 serves: ${(previous / 1024).toFixed(0)} kB in one row, the largest step ${largest} bytes`)
  assert(result.phase === 'done' && result.lines.length === 120, `${result.lines.length} lines, ${result.phase}`)
  assert(largest < 1500, `one serve added ${largest} bytes to the row`)
  assert(previous < 200 * 1024, `the row is ${previous} bytes`)
})

await check('the overheads the scan was not sure of are kept with the session, and counted apart (L2.10)', async () => {
  const io: SessionIO = {
    locate: async () => ({ found: [5, 17, 29], unsure: [11.5] }),
    read: async () => SERVE,
    choose: (n) => sampleServes(n),
    save: async () => {},
  }
  const result = await runSession(fresh(), io)
  assert(JSON.stringify(result.unsure) === '[11.5]', `kept ${JSON.stringify(result.unsure)}`)
  assert(result.found!.length === 3 && result.lines.length === 3, 'a not-sure overhead was read as a serve')
  const back = normalisePracticeSession(JSON.parse(JSON.stringify(result)))!
  assert(JSON.stringify(back.unsure) === '[11.5]', 'the not-sure list did not survive the store')
})

heading('Stopping, and carrying on')

await check('a stop between serves keeps what was read and where it was', async () => {
  const { result } = await run({ count: 50, stopAfterReads: 4 })
  assert(result.phase === 'stopped', `ended ${result.phase}`)
  assert(result.lines.length === 4, `kept ${result.lines.length} lines`)
  assert(toRead(result).length === 8, `${toRead(result).length} left to read`)
})

await check('a stop mid-serve loses only the serve in flight, and is not called unclear', async () => {
  const { result } = await run({ count: 50, stopDuring: 3 })
  assert(result.phase === 'stopped', `ended ${result.phase}`)
  assert(result.lines.length === 2, `kept ${result.lines.length} lines`)
  assert(result.lines.every((l) => l.status === 'read'), 'the serve in flight was filed as unclear')
})

await check('running a stopped session again reads only what is left, without scanning again', async () => {
  const first = await run({ count: 50, stopAfterReads: 5 })
  const stored = normalisePracticeSession(JSON.parse(JSON.stringify(first.result)))!
  const second = await run({ start: stored, count: 50 })
  assert(second.locates === 0, 'the resumed session scanned the file again')
  assert(second.reads.length === 7, `read ${second.reads.length} serves on resume`)
  assert(second.result.phase === 'done' && second.result.lines.length === 12, 'the resumed session did not finish')
  assert(new Set(second.result.lines.map((l) => l.number)).size === 12, 'a serve was read twice')
})

heading('A phone running hot')

check('a critical reading stops the reading once, and anything less does not', () => {
  let tell: (records: { state: string }[]) => void = () => {}
  let source = ''
  let disconnected = false
  class FakeObserver {
    constructor(callback: (records: { state: string }[]) => void) {
      tell = callback
    }
    observe(s: string) {
      source = s
      return Promise.resolve()
    }
    disconnect() {
      disconnected = true
    }
  }
  let hot = 0
  const stop = watchWarmth(() => hot++, { PressureObserver: FakeObserver })
  assert(source === 'cpu', `watched ${source}`)
  tell([{ state: 'fair' }, { state: 'serious' }])
  assert(hot === 0, 'a phone working hard was treated as one too hot to go on')
  tell([{ state: 'critical' }])
  tell([{ state: 'critical' }])
  assert(hot === 1, `stopped ${hot} times`)
  stop()
  assert(disconnected, 'the watch outlived the reading')
})

check('a browser with no pressure signal reads on', () => {
  const stop = watchWarmth(() => {
    throw new Error('fired with nothing to watch')
  }, {})
  stop()
})

heading('What a line keeps')

check('a line keeps the graded readings, the faults, the toss and the footing', () => {
  const line = lineOf(SERVE, 3, 41.5)
  const graded = SERVE.fundamentals.flatMap((f) => f.metrics).length
  assert(Object.keys(line.readings!).length === graded, `kept ${Object.keys(line.readings!).length} of ${graded} readings`)
  assert(line.overall === SERVE.overall && line.number === 3 && line.t === 41.5, 'the line lost its place or its score')
  assert(Array.isArray(line.named) && Array.isArray(line.judged), 'the faults were not kept')
  assert(line.judged!.length >= line.named!.length, 'more faults named than judged')
  assert(line.scale !== undefined, 'the footing was not kept')
  assert(lineOf(REFUSED, 1, 0).status === 'unclear', 'a refused serve was filed as read')
})

check('a stored row is repaired rather than trusted', () => {
  assert(normalisePracticeSession({ id: 'serve-x', createdAt: 1, duration: 1 }) === undefined, 'a report row was taken for a session')
  const bad = normalisePracticeSession({
    id: sessionIdFor('k'),
    createdAt: 1,
    duration: 600,
    found: [5, 17, 29],
    chosen: [0, 2, 7, -1],
    lines: [{ number: 1, t: 5, status: 'read' }, { number: 'x' }, null],
    phase: 'nonsense',
  })!
  assert(JSON.stringify(bad.chosen) === JSON.stringify([0, 2]), `kept chosen ${JSON.stringify(bad.chosen)}`)
  assert(bad.lines.length === 1, `kept ${bad.lines.length} lines`)
  assert(bad.phase === 'stopped', `phase ${bad.phase}`)
})

report()
