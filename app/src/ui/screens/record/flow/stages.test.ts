import { describe, expect, it } from 'vitest'
import type { AnalysisProgress } from '../../../../data/index.ts'
import { normaliseEvent, simulatedRunner } from './analysisAdapter.ts'
import { activeRow, etaText, rowDetail, stagesFor } from './stages.ts'

const p = (patch: Partial<AnalysisProgress>): AnalysisProgress => ({ jobId: 'j', stage: 'sparse', label: '', overall: 0.1, ...patch })

describe('stage rows (DESIGN §8.18)', () => {
  it('picks the row from the label first, then the engine stage', () => {
    expect(activeRow(p({ label: 'Tracking the toss (serve 3 of 9)' }))).toBe(1)
    expect(activeRow(p({ stage: 'keyframes', label: '' }))).toBe(2)
    expect(activeRow(p({ stage: 'probe' }))).toBe(0)
    expect(activeRow(p({ stage: 'done' }))).toBe(4)
  })
  it('shows the bracketed detail, or builds it from the counts', () => {
    expect(rowDetail(p({ label: 'Finding serves (9 found)' }), 0)).toBe('9 found')
    expect(rowDetail(p({ servesFound: 12, servesDone: 6 }), 1)).toBe('serve 7 of 12')
  })
  it('marks earlier rows done, the active row with its own fraction, later rows waiting', () => {
    const rows = stagesFor(p({ stage: 'dense', overall: 0.62, servesFound: 10, servesDone: 5 }))
    expect(rows.map((r) => r.state)).toEqual(['done', 'active', 'waiting', 'waiting'])
    expect(rows[0].detail).toBe('10 found')
    expect(rows[1].fraction).toBeCloseTo(0.5, 5)
    expect(stagesFor(p({}), 'paused')[0].state).toBe('paused')
    expect(stagesFor(p({ stage: 'session', overall: 0.97 }), 'done').every((r) => r.state === 'done')).toBe(true)
  })
})

describe('ETA (only after 5 s of throughput)', () => {
  it('is hidden early, then rounded to calm words', () => {
    expect(etaText(p({ overall: 0.1 }), 0, 3000)).toBeUndefined()
    expect(etaText(p({ overall: 0.5 }), 0, 30_000)).toBe('About 30 seconds left')
    expect(etaText(p({ overall: 0.2 }), 0, 30_000)).toBe('About 2 minutes left')
    expect(etaText(p({ overall: 0.9 }), 0, 30_000)).toBe('Almost done')
    expect(etaText(p({ overall: 0.5, etaS: 70 }), 0, 1000)).toBe('About 1 minute left')
    expect(etaText(p({ overall: 1 }), 0, 30_000)).toBeUndefined()
  })
})

describe('pipeline events', () => {
  it('normalises progress, serve-ready and warning events and ignores the rest', () => {
    expect(normaliseEvent({ type: 'progress', progress: { stage: 'dense', label: 'x', overall: 1.4 } })).toMatchObject({ kind: 'progress', progress: { overall: 1 } })
    expect(normaliseEvent({ stage: 'sparse', label: 'y', overall: 0.2 })).toMatchObject({ kind: 'progress' })
    expect(normaliseEvent({ type: 'serve-ready', jobId: 'j', serveId: 's1', index: 0 })).toEqual({ kind: 'serve-ready', serveId: 's1', index: 0 })
    expect(normaliseEvent({ type: 'warning', jobId: 'j', message: 'No copy kept.' })).toEqual({ kind: 'warning', message: 'No copy kept.' })
    expect(normaliseEvent({ type: 'other' })).toBeNull()
    expect(normaliseEvent(null)).toBeNull()
  })
  it('the dev simulator reports monotonic progress and stops on abort', async () => {
    const run = simulatedRunner(50)
    const seen: number[] = []
    await run(new Blob(), {
      sessionId: 's',
      profile: { handedness: 'right' },
      view: 'side',
      capture: {} as never,
      signal: new AbortController().signal,
      onProgress: (e) => seen.push((e as AnalysisProgress).overall),
    })
    expect(seen.at(-1)).toBe(1)
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1])).toBe(true)
    const abort = new AbortController()
    abort.abort()
    await expect(simulatedRunner(50)(new Blob(), { sessionId: 's', profile: { handedness: 'right' }, view: 'side', capture: {} as never, signal: abort.signal, onProgress: () => undefined })).rejects.toThrow()
  })
})
