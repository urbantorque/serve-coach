import { describe, expect, it } from 'vitest'
import { ETA_MIN_OBSERVATION_MS, labelFor, ProgressReporter, stepSpans } from './progress.ts'
import type { PipelineEvent, PipelineProgress } from './types.ts'

function reporter(withAudio = false) {
  let t = 0
  const events: PipelineProgress[] = []
  const r = new ProgressReporter({
    jobId: 'job',
    withAudio,
    now: () => t,
    emit: (e: PipelineEvent) => {
      if (e.type === 'progress') events.push(e.progress)
    },
  })
  return { r, events, advance: (ms: number) => (t += ms) }
}

describe('stepSpans', () => {
  it('matches the Processing screen rows (0.32 / 0.92 / 0.96 / 1)', () => {
    for (const audio of [true, false]) {
      const s = stepSpans(audio)
      expect(s['finding-serves'][1]).toBe(0.32)
      expect(s['tracking-body']).toEqual([0.32, 0.92])
      expect(s.measuring).toEqual([0.92, 0.96])
      expect(s.saving[1]).toBe(1)
    }
    expect(stepSpans(true)['finding-serves'][0]).toBe(0.06)
    expect(stepSpans(false)['finding-serves'][0]).toBe(0.02)
  })
})

describe('labelFor', () => {
  it('starts with the UI row names and carries the specific detail in brackets', () => {
    expect(labelFor('finding-serves', { servesFound: 9 })).toBe('Finding serves (9 found)')
    expect(labelFor('tracking-body', { servesFound: 9, serveIndex: 3 })).toBe('Tracking the toss (serve 3 of 9)')
    expect(labelFor('tracking-ball', { servesFound: 2, serveIndex: 5 })).toBe('Tracking the toss (serve 2 of 2)')
    expect(labelFor('measuring', {})).toBe('Timing each phase')
    expect(labelFor('coaching', {}).startsWith('Choosing your focus')).toBe(true)
    expect(labelFor('saving', {}).startsWith('Choosing your focus')).toBe(true)
  })
})

describe('ProgressReporter', () => {
  it('is monotonic and maps steps to engine stages', () => {
    const { r, events, advance } = reporter()
    r.update('probe', 1)
    advance(300)
    r.update('finding-serves', 0.5)
    advance(300)
    r.update('finding-serves', 0.2) // late, smaller fraction: overall must not go back
    advance(300)
    r.update('tracking-body', 0.5, { servesFound: 4, serveIndex: 2 })
    r.finish()
    const overall = events.map((e) => e.overall)
    for (let i = 1; i < overall.length; i++) expect(overall[i]).toBeGreaterThanOrEqual(overall[i - 1])
    expect(events.map((e) => e.stage)).toContain('sparse')
    expect(events.find((e) => e.step === 'tracking-body')?.stage).toBe('dense')
    expect(events.at(-1)).toMatchObject({ stage: 'done', overall: 1 })
  })

  it('throttles updates within a step to one per 250 ms but always emits step changes', () => {
    const { r, events, advance } = reporter()
    r.update('finding-serves', 0.1)
    for (let i = 0; i < 10; i++) {
      advance(10)
      r.update('finding-serves', 0.1 + i * 0.01)
    }
    expect(events.length).toBe(1)
    advance(10)
    r.update('tracking-body', 0.1)
    expect(events.length).toBe(2)
    advance(300)
    r.update('tracking-body', 0.2)
    expect(events.length).toBe(3)
    r.update('tracking-body', 0.25)
    r.flush()
    expect(events.length).toBe(4)
  })

  it('gives no ETA before 5 s of throughput, then a positive one', () => {
    const { r, events, advance } = reporter()
    for (let i = 1; i <= 20; i++) {
      advance(400)
      r.update('finding-serves', i / 20)
    }
    const withEta = events.filter((e) => e.etaS !== undefined)
    expect(events.filter((e) => e.elapsedMs < ETA_MIN_OBSERVATION_MS).every((e) => e.etaS === undefined)).toBe(true)
    expect(withEta.length).toBeGreaterThan(0)
    expect(withEta.every((e) => (e.etaS ?? 0) >= 1)).toBe(true)
  })
})
