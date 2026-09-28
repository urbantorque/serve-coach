import { describe, expect, it } from 'vitest'
import type { ServeCore } from '../serve/analyse.ts'
import type { CameraModel } from '../serve/geometry.ts'
import { PLANNING_NOISE } from '../serve/events.ts'
import type { PoseTrack } from '../serve/track.ts'
import { computeServeMetrics, type MetricContext } from './perServe.ts'

// A mocked serve (no landmarks needed for the ball heights): the toss parabola has its vertex at
// t = 1.0 s; the stored apex point sits 0.06 HU below it (as a gravity-prior apex against the
// data-only fit can), so a contact near the vertex reads above the apex.
const N = 120
const dt = 1 / 60
const track: PoseTrack = {
  aspect: 16 / 9,
  t: Float64Array.from({ length: N }, (_, i) => i * dt),
  frameIndex: Int32Array.from({ length: N }, (_, i) => i),
  x: new Float64Array(N * 33).fill(Number.NaN),
  y: new Float64Array(N * 33).fill(Number.NaN),
  vis: new Float64Array(N * 33),
  interpolated: new Uint8Array(N * 33),
  has: new Uint8Array(N).fill(1),
  dt,
}
const cam: CameraModel = {
  aspect: 16 / 9,
  orientation: 'landscape',
  fHU: 1.5,
  fovLongDeg: 60,
  fovSource: 'lens-default',
  tiltStatus: 'measured-level',
  tiltSource: 'motion-sensor',
  pitch: { value: 0, sigma: 0.5 },
  roll: { value: 0, sigma: 0.5 },
  rectified: true,
  R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
}
const ctx: MetricContext = {
  view: 'side',
  viewMismatch: false,
  cam,
  captureFps: 60,
  timeBase: 'proven',
  timeScaleRelSigma: 0.003,
  condition: 'day',
  playerHeightM: 1.8,
  heightEntered: true,
  intendedType: 'flat',
  cameraSide: 'chest',
}
const A = 0.9
const T_VERTEX = 1.0
const Y_VERTEX = 0.135
const parabola = { a: A, b: -2 * A * T_VERTEX, c: A * T_VERTEX * T_VERTEX + Y_VERTEX, xa: 0, xb: 0, xc: 0.5 }

function core(opts: { apexY: number; contactT: number; dispute?: ServeCore['contactDispute']; lastOnT?: number; wristOnly?: boolean }): ServeCore {
  return {
    index: 1,
    window: { start: 0, end: 2, anchor: 1.2, confidence: 0.9 },
    view: 'side',
    handedness: 'right',
    ref: { yFloor: 0.9, bodyHeightHU: 0.45 },
    refSource: 'setup-upright',
    uprightFrames: 10,
    netDir: 1,
    ball: {
      toss: {
        status: 'ok',
        apex: { tReal: T_VERTEX, frameIndex: 60, uncertaintyS: 0.01, x: 0.5, y: opts.apexY, yUncertaintyNorm: 0.002, confidence: 0.9, method: 'parabola-vertex' },
        release: { tReal: 0.6, frameIndex: 36, confidence: 0.9, uncertaintyS: 0.01, x: 0.5, y: 0.4, method: 'ball-hinge' },
        fit: { rmse: 0.001 },
        gravity: { status: 'unavailable' },
        confidence: 0.9,
      } as unknown as NonNullable<ServeCore['ball']['toss']>,
      tossTrack: null,
      outgoing: null,
      parabola,
      apexCase: 'bracketed',
      detections: 20,
      lastOnT: opts.lastOnT ?? opts.contactT,
    },
    events: {
      tossRelease: { frameIndex: 36, tReal: 0.6, confidence: 0.9, uncertaintyS: 0.01, method: 'ball', used: [] } as unknown as ServeCore['events']['tossRelease'],
      tossApex: { frameIndex: 60, tReal: T_VERTEX, confidence: 0.9, uncertaintyS: 0.01, method: 'parabola-vertex' },
      contact: { frameIndex: Math.round(opts.contactT * 60), tReal: opts.contactT, confidence: 0.8, uncertaintyS: 0.01, method: 'fused', used: [] } as unknown as ServeCore['events']['contact'],
    },
    releaseMethods: [],
    contactMethods: [],
    contactWristOnly: opts.wristOnly ?? false,
    contactDispute: opts.dispute,
    tossWrist: 'left',
    hitWrist: 'right',
    frontFoot: null,
    frontFootShare: 0,
    s0: null,
    classification: 'serve',
    noContact: false,
    relabel: null,
    trackingQuality: 0.9,
    cameraDistanceM: 8,
    noise: PLANNING_NOISE,
    notes: [],
  }
}

const APEX_BELOW_VERTEX = Y_VERTEX + 0.06
const majority: ServeCore['contactDispute'] = {
  resolution: 'majority',
  signals: [
    { name: 'ball', t: 1.3, sigma: 0.01 },
    { name: 'audio', t: 1.02, sigma: 0.01 },
    { name: 'wrist', t: 1.03, sigma: 0.02 },
  ],
  dropped: 'ball',
  spreadS: 0.28,
}

describe('apex below contact − 0.10 m (§4.2): only a trusted contact can reject the apex (finding 36)', () => {
  it('a trusted contact above the apex still rejects it', () => {
    const r = computeServeMetrics(core({ apexY: APEX_BELOW_VERTEX, contactT: 1.02 }), track, ctx)
    expect(r.metrics['toss-apex-height']?.status).toBe('unavailable')
    expect(r.metrics['toss-apex-height']?.reasonCode).toBe('IMPLAUSIBLE_VALUE')
    expect(r.hardRejects).toContain('apexHeightM')
  })

  it('a D2 majority (disputed) contact never rejects the apex, and adds no hard reject', () => {
    const r = computeServeMetrics(core({ apexY: APEX_BELOW_VERTEX, contactT: 1.02, dispute: majority }), track, ctx)
    expect(r.metrics['contact-height-ratio']?.status).toBe('experimental')
    expect(r.metrics['toss-apex-height']?.status).not.toBe('unavailable')
    expect(r.hardRejects).not.toContain('apexHeightM')
  })

  it('dropped frames keep the apex its own reason (FRAMES_DROPPED), not IMPLAUSIBLE_VALUE', () => {
    const r = computeServeMetrics(core({ apexY: APEX_BELOW_VERTEX, contactT: 1.02 }), track, { ...ctx, framesMissingShare: 0.2 })
    expect(r.metrics['toss-apex-height']?.reasonCode).toBe('FRAMES_DROPPED')
    expect(r.hardRejects).not.toContain('apexHeightM')
  })

  it('a contact cut at the frame edge (framing gate) never rejects the apex', () => {
    const r = computeServeMetrics(core({ apexY: APEX_BELOW_VERTEX, contactT: 1.02 }), track, { ...ctx, contactCut: true })
    expect(r.metrics['toss-apex-height']?.status).not.toBe('unavailable')
    expect(r.hardRejects).not.toContain('apexHeightM')
  })

  it('a contact the ball was last seen 80 ms before (extrapolated) never rejects the apex', () => {
    const r = computeServeMetrics(core({ apexY: APEX_BELOW_VERTEX, contactT: 1.02, lastOnT: 0.94 }), track, ctx)
    expect(r.metrics['toss-apex-height']?.status).not.toBe('unavailable')
    expect(r.hardRejects).not.toContain('apexHeightM')
  })

  it('under court lights (a calibration cap both heights share) a trusted contact still rejects an apex below it', () => {
    const r = computeServeMetrics(core({ apexY: APEX_BELOW_VERTEX, contactT: 1.02 }), track, { ...ctx, condition: 'night-lights' })
    expect(r.metrics['contact-height-ratio']?.reasonCode).toBe('CONDITION_NOT_VALIDATED')
    expect(r.metrics['toss-apex-height']?.reasonCode).toBe('IMPLAUSIBLE_VALUE')
  })

  it('an apex at the parabola vertex is never rejected by a contact on the same parabola', () => {
    for (const tc of [0.95, 1.0, 1.02, 1.1, 1.3]) {
      const r = computeServeMetrics(core({ apexY: Y_VERTEX, contactT: tc }), track, ctx)
      expect(r.hardRejects).not.toContain('apexHeightM')
    }
  })
})
