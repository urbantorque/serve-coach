import { describe, expect, it } from 'vitest'
import { computeQuality, type QualityInput } from './checks.ts'
import { cameraModel } from '../serve/geometry.ts'
import { PLANNING_NOISE } from '../serve/events.ts'
import type { ServeCore } from '../serve/analyse.ts'

function core(index: number, extra: Partial<ServeCore> = {}): ServeCore {
  const ev = (t: number) => ({ frameIndex: Math.round(t * 60), tReal: t, uncertaintyS: 0.01, confidence: 0.9, method: 'x' })
  return {
    index,
    window: { start: 0, end: 4, anchor: 2.4, confidence: 0.9 },
    view: 'side',
    handedness: 'right',
    ref: { yFloor: 0.85, bodyHeightHU: 0.19 },
    refSource: 'setup-upright',
    uprightFrames: 20,
    netDir: 1,
    ball: { toss: null, tossTrack: null, outgoing: null, parabola: null, apexCase: 'bracketed', detections: 40, visibility: 0.95 },
    events: {
      tossRelease: { ...ev(1.45), used: [], dropped: [] },
      tossApex: ev(2.05),
      contact: { ...ev(2.4), used: [], dropped: [] },
    },
    releaseMethods: [],
    contactMethods: [],
    contactWristOnly: false,
    tossWrist: 'left',
    hitWrist: 'right',
    frontFoot: 'left',
    frontFootShare: 1,
    s0: { x: 0.5, y: 0.85 },
    classification: 'serve',
    noContact: false,
    relabel: null,
    trackingQuality: 0.9,
    cameraDistanceM: 7.2,
    noise: PLANNING_NOISE,
    notes: [],
    ...extra,
  }
}

function input(serves: ServeCore[], extra: Partial<QualityInput> = {}): QualityInput {
  return {
    serves,
    cam: cameraModel({ width: 1080, height: 1920 }, undefined, { pitchDeg: { value: 0, sigma: 1 }, rollDeg: { value: 0, sigma: 1 } }),
    captureFps: 60,
    timeBase: 'normal',
    displayedHeightPx: 1920,
    shortSidePx: 1080,
    condition: 'day',
    audio: { usable: false, on: false },
    view: { declared: 'side', mismatch: false, mismatchShare: 0 },
    framesMissing: serves.map(() => 0),
    hardRejects: serves.map(() => 0),
    framing: serves.map(() => 'ok' as const),
    lostTracking: serves.map(() => false),
    cameraBump: false,
    ...extra,
  }
}

describe('capture quality (§3.25)', () => {
  it('is Good when every check passes and reports the player size', () => {
    const q = computeQuality(input([core(1), core(2)]))
    expect(q.report.overall).toBe('good')
    expect(q.report.checks.find((c) => c.id === 'cq.player-size')?.value).toBeGreaterThan(300)
    expect(q.reasons).toHaveLength(0)
  })

  it('is Fair with a warning and ≥ 70% analysable', () => {
    const q = computeQuality(input([core(1), core(2, { ball: { ...core(2).ball, apexCase: 'fitted-above' } })]))
    expect(q.report.overall).toBe('usable')
    expect(q.report.checks.find((c) => c.id === 'cq.toss-headroom')?.severity).toBe('warn')
  })

  it('is Limited on a session-level block (view mismatch, unknown time base, < 30 fps)', () => {
    expect(computeQuality(input([core(1)], { view: { declared: 'side', mismatch: true, mismatchShare: 1 } })).report.overall).toBe('poor')
    expect(computeQuality(input([core(1)], { timeBase: 'unknown' })).report.overall).toBe('poor')
    expect(computeQuality(input([core(1)], { captureFps: 24 })).report.overall).toBe('poor')
  })

  it('warns at 30 fps and blocks serves with dropped frames above 10%', () => {
    const q = computeQuality(input([core(1), core(2)], { captureFps: 30, framesMissing: [0.15, 0] }))
    expect(q.report.checks.find((c) => c.id === 'cq.frame-rate')?.severity).toBe('warn')
    expect(q.blockedServeIds.has(1)).toBe(true)
    expect(q.blockedServeIds.has(2)).toBe(false)
  })

  it('flags an unknown tilt as info and a tilt over the cap as a block', () => {
    const unknown = computeQuality(input([core(1)], { cam: cameraModel({ width: 1080, height: 1920 }) }))
    expect(unknown.report.checks.find((c) => c.id === 'cq.camera-level')?.severity).toBe('info')
    const over = computeQuality(input([core(1)], { cam: cameraModel({ width: 1080, height: 1920 }, undefined, { pitchDeg: { value: 9, sigma: 1 } }) }))
    expect(over.report.checks.find((c) => c.id === 'cq.camera-level')?.severity).toBe('block')
  })

  it('caps pose readings under court lights (condition class)', () => {
    const q = computeQuality(input([core(1)], { condition: 'night-lights' }))
    expect(q.report.checks.find((c) => c.id === 'cq.condition')?.severity).toBe('warn')
  })
})
