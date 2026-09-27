import { describe, expect, it } from 'vitest'
import { prefetch } from './prefetch.ts'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A source of n numbered items; records how far it has produced and whether it was returned. */
function source(n: number, options: { failAt?: number } = {}) {
  const log = { produced: 0, returned: false }
  async function* gen() {
    try {
      for (let i = 0; i < n; i++) {
        await tick()
        if (options.failAt === i) throw new Error(`failed at ${i}`)
        log.produced++
        yield i
      }
    } finally {
      log.returned = true
    }
  }
  return { iterable: gen(), log }
}

describe('prefetch', () => {
  it('yields every item in order and decodes ahead while the consumer is busy, never more than depth', async () => {
    const { iterable, log } = source(10)
    const seen: number[] = []
    let maxAhead = 0
    for await (const item of prefetch(iterable, 3, () => undefined)) {
      seen.push(item)
      // The consumer is slow: meanwhile the producer fills the queue, but only up to the depth.
      for (let k = 0; k < 6; k++) await tick()
      maxAhead = Math.max(maxAhead, log.produced - seen.length)
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(maxAhead).toBeGreaterThanOrEqual(2)
    expect(maxAhead).toBeLessThanOrEqual(3)
    expect(log.returned).toBe(true)
  })

  it('releases queued items and returns the source when the consumer stops early', async () => {
    const { iterable, log } = source(10)
    const released: number[] = []
    const seen: number[] = []
    for await (const item of prefetch(iterable, 4, (i) => released.push(i))) {
      seen.push(item)
      for (let k = 0; k < 8; k++) await tick()
      if (item === 2) break
    }
    expect(seen).toEqual([0, 1, 2])
    // Every produced item was either consumed or released, exactly once.
    expect([...seen, ...released].sort((a, b) => a - b)).toEqual(Array.from({ length: log.produced }, (_, i) => i))
    expect(released.length).toBeGreaterThan(0)
    expect(log.returned).toBe(true)
  })

  it('hands over the items produced before a source error, then throws it', async () => {
    const { iterable } = source(10, { failAt: 4 })
    const seen: number[] = []
    await expect(
      (async () => {
        for await (const item of prefetch(iterable, 2, () => undefined)) seen.push(item)
      })(),
    ).rejects.toThrow('failed at 4')
    expect(seen).toEqual([0, 1, 2, 3])
  })

  it('releases queued items when the consumer throws', async () => {
    const { iterable, log } = source(6)
    const released: number[] = []
    await expect(
      (async () => {
        for await (const item of prefetch(iterable, 3, (i) => released.push(i))) {
          for (let k = 0; k < 8; k++) await tick()
          if (item === 1) throw new Error('consumer failed')
        }
      })(),
    ).rejects.toThrow('consumer failed')
    expect(released.length).toBe(log.produced - 2)
    expect(log.returned).toBe(true)
  })
})
