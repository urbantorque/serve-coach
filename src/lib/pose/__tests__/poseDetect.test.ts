/** The switch between reading poses on the main thread and in a worker (M1.2). */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { mainThread, poseDetector, workerSupported, workerWanted } from '../poseDetect'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: string) => string }

const pose = { landmarks: [[{ x: 0.5, y: 0.4, z: 0 }]], worldLandmarks: [[{ x: 0, y: 0, z: 0 }]] }
const fake = () => {
  const calls: number[] = []
  return { calls, landmarker: { detectForVideo: (_s: unknown, ts: number) => (calls.push(ts), pose) } as never }
}

heading('Poses are read on the main thread unless the worker is asked for and can run')

check('the worker is wanted on ?worker=1 only', () => {
  assert(workerWanted('?worker=1'), '?worker=1 not read')
  assert(!workerWanted(''), 'wanted with no query')
  assert(!workerWanted('?worker=0') && !workerWanted('?fixture=1'), 'wanted on another query')
})

check('the worker needs Worker, OffscreenCanvas and createImageBitmap', () => {
  const f = () => {}
  assert(workerSupported({ Worker: f, OffscreenCanvas: f, createImageBitmap: f }), 'all three present and not supported')
  assert(!workerSupported({ Worker: f, OffscreenCanvas: f }), 'supported without createImageBitmap')
  assert(!workerSupported({}), 'supported with nothing')
})

await check('the main-thread reader is the landmarker, answer and timestamp unchanged', async () => {
  const { calls, landmarker } = fake()
  const res = await mainThread(landmarker)({} as never, 1234)
  assert(res === pose && calls.join() === '1234', `calls ${calls.join()}`)
})

await check('off by default, and asked for without support, the main thread reads', async () => {
  for (const env of [{ wanted: false, supported: true }, { wanted: true, supported: false }]) {
    const { calls, landmarker } = fake()
    const detect = await poseDetector(landmarker, env)
    await detect({} as never, 50)
    assert(calls.join() === '50', `${JSON.stringify(env)} did not read on the main thread`)
  }
})

check('every pose read in extract goes through the switch', () => {
  const src = fs.readFileSync('src/lib/pose/extract.ts', 'utf8')
  assert(!src.includes('landmarker.detectForVideo('), 'extract still calls the landmarker directly')
  const uses = src.split('await detectPose(').length - 1
  assert(uses >= 4, `${uses} reads through the switch`)
})

report()
