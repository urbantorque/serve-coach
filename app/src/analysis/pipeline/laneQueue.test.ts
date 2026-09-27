import { describe, expect, it } from 'vitest'
import { LaneQueue } from './laneQueue.ts'

/** A lane run that records what ran where and finishes when released. */
function harness() {
  const log: string[] = []
  const gates = new Map<string, () => void>()
  const run = (payload: string, lane: string) => {
    log.push(`${lane}:${payload}`)
    return new Promise<string>((resolve) => gates.set(payload, () => resolve(`${payload}@done`)))
  }
  const release = async (payload: string) => {
    for (let k = 0; k < 20 && !gates.has(payload); k++) await Promise.resolve()
    gates.get(payload)!()
    gates.delete(payload)
    await Promise.resolve()
  }
  return { log, run, release, tick: () => new Promise((r) => setTimeout(r, 0)) }
}

describe('LaneQueue', () => {
  it('runs one job per lane at a time and shares a job between requests for the same key', async () => {
    const h = harness()
    const q = new LaneQueue(['L1', 'L2'], h.run)
    const a = q.request('a', 'a', true)
    const again = q.request('a', 'ignored', true)
    const b = q.request('b', 'b', true)
    const c = q.request('c', 'c', true)
    await h.tick()
    expect(h.log).toEqual(['L1:a', 'L2:b'])
    await h.release('a')
    await h.tick()
    expect(h.log).toEqual(['L1:a', 'L2:b', 'L1:c'])
    await h.release('b')
    await h.release('c')
    expect(await a).toBe('a@done')
    expect(await again).toBe('a@done')
    expect(await c).toBe('c@done')
    expect(await b).toBe('b@done')
    await q.close()
  })

  it('takes final jobs before speculative ones and promotes a speculative job asked for as final', async () => {
    // One lane: s1 starts at once; s2 and s3 (speculative) and f1 (final) queue behind it.
    const h = harness()
    const q = new LaneQueue(['L1'], h.run)
    void q.request('s1', 's1', false)
    await h.tick() // the lane takes s1
    void q.request('s2', 's2', false)
    void q.request('s3', 's3', false)
    const f1 = q.request('f1', 'f1', true)
    await h.release('s1')
    await h.tick()
    expect(h.log).toEqual(['L1:s1', 'L1:f1']) // final before the speculative jobs queued earlier
    const s3 = q.request('s3', 's3', true) // promoted ahead of s2
    await h.release('f1')
    await h.tick()
    expect(h.log.at(-1)).toBe('L1:s3')
    await h.release('s3')
    await h.tick()
    expect(h.log.at(-1)).toBe('L1:s2')
    await h.release('s2')
    expect(await f1).toBe('f1@done')
    expect(await s3).toBe('s3@done')
    expect(q.wasted).toBe(2) // s1 and s2 ran and nobody needed them
    await q.close()
  })

  it('close() drops queued speculative jobs, finishes the final ones and refuses new keys', async () => {
    const h = harness()
    const q = new LaneQueue(['L1'], h.run)
    const running = q.request('r', 'r', false)
    await h.tick() // the lane takes r
    const dropped = q.request('d', 'd', false)
    const kept = q.request('k', 'k', true)
    await h.tick()
    const closed = q.close()
    await expect(dropped).rejects.toThrow('dropped')
    await h.release('r')
    await h.release('k')
    await closed
    expect(await running).toBe('r@done')
    expect(await kept).toBe('k@done')
    expect(h.log).toEqual(['L1:r', 'L1:k'])
    await expect(q.request('late', 'late', true)).rejects.toThrow('closed')
  })

  it('a failed job rejects only its own requests', async () => {
    const q = new LaneQueue(['L1'], async (payload: string) => {
      if (payload === 'bad') throw new Error('boom')
      return payload
    })
    await expect(q.request('bad', 'bad', true)).rejects.toThrow('boom')
    expect(await q.request('good', 'good', true)).toBe('good')
    await q.close()
  })
})

describe('LaneQueue.drop', () => {
  it('removes a queued job and leaves running ones alone', async () => {
    let release!: () => void
    const q = new LaneQueue(['L1'], (payload: string) => (payload === 'slow' ? new Promise<string>((r) => (release = () => r(payload))) : Promise.resolve(payload)))
    const slow = q.request('slow', 'slow', true)
    await new Promise((r) => setTimeout(r, 0))
    const queued = q.request('queued', 'queued', true)
    expect(q.drop('slow')).toBe(false)
    expect(q.drop('queued')).toBe(true)
    await expect(queued).rejects.toThrow('dropped')
    expect(q.has('queued')).toBe(false)
    release()
    expect(await slow).toBe('slow')
    await q.close()
  })
})
