import { describe, expect, it } from 'vitest'
import type { ImageDataLike } from '../types.ts'
import { BallWorkerClient } from './workerClient.ts'
import type { WindowAnalyseOptions, WindowBallConfig } from './workerCore.ts'
import type { FromBallWorker, ToBallWorker } from './workerProtocol.ts'

const config: WindowBallConfig = { crop: { x: 0, y: 0, w: 1, h: 1 }, frameAspect: 9 / 16, tossRoi: null, corridor: null, cameraView: 'side' }
const options: WindowAnalyseOptions = {
  setup: { aspect: 9 / 16, scale: null, expectedRadiusNorm: undefined, body: null },
  captureFps: 60,
  timeBaseKnown: true,
  cameraView: 'side',
}
const blank = (): ImageDataLike => ({ width: 32, height: 56, data: new Uint8ClampedArray(32 * 56 * 4).fill(40) })

/** A fake Worker whose replies the test controls. */
class FakeWorker {
  sent: ToBallWorker[] = []
  terminated = false
  onmessage: ((e: MessageEvent<FromBallWorker>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage(message: ToBallWorker): void {
    this.sent.push(message)
    if (message.type === 'begin') this.reply({ type: 'ready', id: message.id })
  }
  reply(message: FromBallWorker): void {
    queueMicrotask(() => this.onmessage?.({ data: message } as MessageEvent<FromBallWorker>))
  }
  terminate(): void {
    this.terminated = true
  }
}

describe('BallWorkerClient (main-thread fallback)', () => {
  it('runs the same core without a worker and reports acks', async () => {
    const acks: number[] = []
    const client = await BallWorkerClient.create({ useWorker: false, onAck: (a) => acks.push(a.frameIndex) })
    expect(client.backend).toBe('main-thread')
    await client.begin(0, config)
    for (let f = 0; f < 3; f++) await client.pushFrame(0, f, f / 60, blank())
    const result = await client.end(0, options)
    expect(acks).toEqual([0, 1, 2])
    expect(result.framesProcessed).toBe(3)
    expect(client.totals.frames).toBe(3)
    client.dispose()
    await expect(client.pushFrame(0, 3, 0.05, blank())).rejects.toThrow(/disposed/)
  })
})

describe('BallWorkerClient (worker)', () => {
  it('applies backpressure at maxQueue and waits for the last ack before end()', async () => {
    const worker = new FakeWorker()
    const client = await BallWorkerClient.create({ maxQueue: 3, createWorker: () => worker as unknown as Worker })
    expect(client.backend).toBe('worker')
    await client.begin(1, config)
    await client.pushFrame(1, 0, 0, blank())
    await client.pushFrame(1, 1, 0.01, blank())
    let third = false
    const p = client.pushFrame(1, 2, 0.02, blank()).then(() => (third = true))
    await Promise.resolve()
    expect(third).toBe(false) // 3 queued = maxQueue: no room until an ack
    worker.reply({ type: 'ack', id: 0, windowId: 1, frameIndex: 0, detectMs: 1, readbackMs: 1 })
    await p
    expect(third).toBe(true)
    const ending = client.end(1, options)
    await Promise.resolve()
    expect(worker.sent.some((m) => m.type === 'end')).toBe(false) // frames still in flight
    worker.reply({ type: 'ack', id: 0, windowId: 1, frameIndex: 1, detectMs: 1, readbackMs: 1 })
    worker.reply({ type: 'ack', id: 0, windowId: 1, frameIndex: 2, detectMs: 1, readbackMs: 1 })
    await new Promise((r) => setTimeout(r, 0))
    const end = worker.sent.find((m) => m.type === 'end')!
    const result = { windowId: 1 } as never
    worker.reply({ type: 'result', id: end.id, windowId: 1, result })
    await expect(ending).resolves.toBe(result)
  })

  it('dispose terminates the worker and rejects waiters', async () => {
    const worker = new FakeWorker()
    const client = await BallWorkerClient.create({ maxQueue: 1, createWorker: () => worker as unknown as Worker })
    await client.begin(0, config)
    // With a queue of one, the first frame fills it: the push waits for an ack that never comes.
    const waiting = client.pushFrame(0, 0, 0, blank())
    await Promise.resolve()
    client.dispose()
    await expect(waiting).rejects.toThrow(/disposed/)
    expect(worker.terminated).toBe(true)
  })
})
