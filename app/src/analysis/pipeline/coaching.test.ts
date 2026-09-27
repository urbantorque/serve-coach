import { describe, expect, it, vi } from 'vitest'
import type { SessionStats, ServeAnalysis } from '../../data/domain.ts'
import type { CaptureContext } from '../types.ts'
import { buildCoachingInput, runCoachingStep, type CoachingStepInput } from './coaching.ts'

const capture: CaptureContext = {
  source: 'import',
  declaredView: 'side',
  serveSide: 'deuce',
  serveNumber: 1,
  handedness: 'right',
  playerHeightM: 1.8,
  playerHeightSource: 'entered',
  hitSoundTiming: false,
}
const stats: SessionStats = { sessionId: 'S', inputsHash: '', computedAt: '', metrics: {}, strata: [], outcomeLink: null, outcomeLinkChecks: [], derivedPerServe: {} }
const input: CoachingStepInput = {
  sessionId: 'S',
  startedAt: '2026-09-27T00:00:00Z',
  view: 'side',
  capture,
  fpsClass: 'fps60',
  quality: { overall: 'good', checks: [] },
  serves: [{ id: 'a', index: 1, included: true, metrics: { 'toss-apex-height': { id: 'toss-apex-height', value: 3.1, unit: 'm', status: 'estimated', confidence: 0.8, basis: 'x' } } } as unknown as ServeAnalysis],
  stats,
  profile: undefined,
  heightM: 1.8,
  showExperimental: false,
}

describe('runCoachingStep', () => {
  it('skips gracefully when the coaching engine is not in the build', async () => {
    expect(await runCoachingStep(input, {})).toMatchObject({ status: 'skipped' })
    expect(await runCoachingStep(input, { a: async () => ({}) })).toMatchObject({ status: 'skipped' })
    expect(await runCoachingStep(input, { a: () => Promise.reject(new Error('load')) })).toMatchObject({ status: 'skipped' })
  })

  it('calls decideFocus with engine output only and reports failures', async () => {
    const decideFocus = vi.fn((_input: unknown) => ({ kind: 'focus' }))
    const r = await runCoachingStep(input, { a: async () => ({ decideFocus }) })
    expect(r).toMatchObject({ status: 'decided', decision: { kind: 'focus' } })
    const arg = decideFocus.mock.calls[0][0] as ReturnType<typeof buildCoachingInput>
    expect(arg).toMatchObject({ painFlag: false, session: { id: 'S', view: 'side', captureQuality: 'good', defaults: { courtSide: 'deuce', serveNumber: 1 } } })
    expect((arg.session as { serves: unknown[] }).serves).toEqual([{ id: 'a', index: 1, included: true, metrics: input.serves[0].metrics }])
    const failing = await runCoachingStep(input, { a: async () => ({ decideFocus: () => { throw new Error('bad input') } }) })
    expect(failing).toMatchObject({ status: 'failed', reason: 'bad input' })
  })

  it('passes the pain flag through so the safety gate runs first', () => {
    const withPain = buildCoachingInput({ ...input, profile: { comfort: { painFlag: 1 }, comfortRegions: ['shoulder'] } as never })
    expect(withPain.painFlag).toBe(true)
    expect((withPain.profile as { comfortRegions: string[] }).comfortRegions).toEqual(['shoulder'])
  })
})
