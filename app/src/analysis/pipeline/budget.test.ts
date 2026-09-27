import { describe, expect, it } from 'vitest'
import { ballQueuePerWorker, ballWorkerCount, checkClipBudget, checkStorage, densePoseLaneCount, MAX_FILE_BYTES, MEMORY_BUDGET } from './budget.ts'
import { AnalysisError } from './errors.ts'

const meta = (durationMediaS: number, captureFps: number, timeScale = 1) => ({ durationMediaS, captureFps, timeScale })

describe('checkClipBudget', () => {
  it('allows 10 minutes at 60 fps and 60 s at 120/240 fps (real time)', () => {
    expect(checkClipBudget(meta(600, 60), 1e6).limitS).toBe(600)
    expect(checkClipBudget(meta(60, 240), 1e6).limitS).toBe(60)
    // Rendered slow motion: 4 media minutes at 1/8 is 30 real seconds.
    expect(checkClipBudget(meta(240, 240, 0.125), 1e6).realDurationS).toBe(30)
  })

  it('refuses long clips and huge files with specific copy', () => {
    expect(() => checkClipBudget(meta(700, 60), 1e6)).toThrow(/10 minutes/)
    expect(() => checkClipBudget(meta(90, 120), 1e6)).toThrow(/1 minute/)
    try {
      checkClipBudget(meta(10, 60), MAX_FILE_BYTES + 1)
      expect.unreachable()
    } catch (e) {
      expect((e as AnalysisError).code).toBe('too-long')
      expect((e as AnalysisError).playerMessage).toMatch(/2 GB/)
    }
  })
})

describe('checkStorage', () => {
  it('needs 2.2x the file free and tolerates a missing API', async () => {
    expect(await checkStorage(100, { estimate: async () => ({ quota: 1000, usage: 700 }) })).toBe(true)
    expect(await checkStorage(200, { estimate: async () => ({ quota: 1000, usage: 700 }) })).toBe(false)
    expect(await checkStorage(200, undefined)).toBe(true)
    expect(await checkStorage(200, { estimate: async () => Promise.reject(new Error('x')) })).toBe(true)
  })
})

describe('workers and lanes', () => {
  it('sizes the ball pool and the Pass B pose lanes from the device', () => {
    expect(ballWorkerCount({ hardwareConcurrency: 8 })).toBe(2)
    expect(ballWorkerCount({ hardwareConcurrency: 12 })).toBe(3)
    expect(ballWorkerCount({ hardwareConcurrency: 4 })).toBe(1)
    expect(ballWorkerCount({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(1)
    expect(densePoseLaneCount({ hardwareConcurrency: 8 })).toBe(2)
    expect(densePoseLaneCount({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(2)
    expect(densePoseLaneCount({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(1)
    expect(densePoseLaneCount({ hardwareConcurrency: 6 })).toBe(1)
    expect(densePoseLaneCount({})).toBe(1)
    expect(ballQueuePerWorker(2) * 2).toBeLessThanOrEqual(MEMORY_BUDGET.ballQueue)
    expect(ballQueuePerWorker(3)).toBe(4)
  })
})
