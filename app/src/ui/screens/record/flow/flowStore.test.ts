import { afterEach, describe, expect, it } from 'vitest'
import { lightForClock, useRecordFlow } from './flowStore.ts'

const at = (h: number) => new Date(2026, 8, 28, h, 30)

describe('the Light chip never assumes daylight after dark (finding 21)', () => {
  afterEach(() => useRecordFlow.setState({ lightChosen: false }))

  it('starts from the local clock: 6 pm to 7 am is court lights', () => {
    expect(lightForClock(at(10))).toBe('day')
    expect(lightForClock(at(17))).toBe('day')
    expect(lightForClock(at(18))).toBe('lights')
    expect(lightForClock(at(21))).toBe('lights')
    expect(lightForClock(at(6))).toBe('lights')
    expect(lightForClock(at(7))).toBe('day')
  })

  it('follows the clock until the player picks, then keeps their answer', () => {
    const flow = useRecordFlow.getState()
    flow.syncLightToClock(at(20))
    expect(useRecordFlow.getState().block.light).toBe('lights')
    flow.syncLightToClock(at(11))
    expect(useRecordFlow.getState().block.light).toBe('day')
    useRecordFlow.getState().setBlock({ light: 'lights' })
    useRecordFlow.getState().syncLightToClock(at(11))
    expect(useRecordFlow.getState().block.light).toBe('lights')
    expect(useRecordFlow.getState().lightChosen).toBe(true)
  })

  it('other block changes do not count as a light answer', () => {
    useRecordFlow.getState().setBlock({ side: 'ad' })
    expect(useRecordFlow.getState().lightChosen).toBe(false)
  })
})
