import { describe, expect, it } from 'vitest'
import { LM } from './types.ts'

describe('LM landmark topology', () => {
  it('matches the 33-point BlazePose / MediaPipe indexing', () => {
    const indices = Object.values(LM).filter((value): value is number => typeof value === 'number')

    expect(indices).toHaveLength(33)
    expect(indices).toEqual(Array.from({ length: 33 }, (_, i) => i))
    expect(LM.RIGHT_WRIST).toBe(16)
    expect(LM.RIGHT_FOOT_INDEX).toBe(32)
  })
})
