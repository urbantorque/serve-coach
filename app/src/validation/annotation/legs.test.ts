import { describe, expect, it } from 'vitest'
import type { MetricValue, ServeEvents } from '../../analysis/types.ts'
import { lintCopy } from '../../ui/copy/lint.ts'
import { appValueFor, compareWithMarks, deriveFromMarks, mechanicsOf, shoulderTiltDeg, type MarkContext, type Marks } from './agreement.ts'
import { evaluate, renderReport } from './evaluate.ts'
import { emptyDraft, MARK_STEPS, nextPointOf, progress, setPoint, stepById, stepDone } from './marks.ts'
import { syntheticExport } from './synthetic.ts'

const ctx: MarkContext = { clip: { width: 1080, height: 1920 }, timing: { nominalFps: 60, timeScale: 1 }, handedness: 'right', heightM: 1.75 }
const aspect = 1080 / 1920
const H = 0.2
const floorY = 0.8
const hipY = (ratio: number) => floorY - ratio * H

/** Shoulders at trophy for a given 2D tilt (front shoulder nearer the net, +x for a right-hander). */
function shoulders(tiltDeg: number, frame = 128, sign = 1) {
  const dxH = 0.05 // frame heights between the shoulders
  const dy = Math.tan((tiltDeg * Math.PI) / 180) * dxH
  return {
    shoulderFrontTrophy: { frameIndex: frame, x: 0.5 + (sign * dxH) / 2 / aspect, y: 0.5 - dy / 2 },
    shoulderBackTrophy: { frameIndex: frame, x: 0.5 - (sign * dxH) / 2 / aspect, y: 0.5 + dy / 2 },
  }
}

const marks: Marks = {
  events: {
    tossRelease: { frameIndex: 100, sure: true },
    trophy: { frameIndex: 128, sure: true },
    lowestHip: { frameIndex: 130, sure: true },
    contact: { frameIndex: 151, sure: true },
  },
  points: {
    headTopSetup: { frameIndex: 40, x: 0.49, y: floorY - H },
    floorSetup: { frameIndex: 40, x: 0.47, y: floorY },
    midHipRelease: { frameIndex: 100, x: 0.48, y: hipY(0.53) },
    midHipLowest: { frameIndex: 130, x: 0.48, y: hipY(0.47) },
    midHipContact: { frameIndex: 151, x: 0.5, y: hipY(0.59) },
    ...shoulders(20),
  },
}

const ev = (frameIndex: number) => ({ frameIndex, tReal: frameIndex / 60, uncertaintyS: 0.05, confidence: 0.8, method: 'test' })
const val = (id: string, value: number | null, unit: string, extra: Partial<MetricValue> = {}): MetricValue => ({ id, value, unit, status: 'estimated', confidence: 0.8, basis: 'test', ...extra })

describe('leg drive, loading, drive time and the shoulder line from the marks', () => {
  it('uses the engine formulas: hip heights in % of height, drive time from the lowest hip', () => {
    const d = deriveFromMarks(marks, ctx)
    // METRICS §3.27: 100 × (h_mid(contact) − h_mid(low)); §3.29: 100 × (h_mid(release) − h_mid(low)).
    expect(d.metrics['leg-drive']).toBeCloseTo(12, 6)
    expect(d.metrics['loading-depth']).toBeCloseTo(6, 6)
    // METRICS §3.28: (t_contact − t_low), 21 frames at 60 fps.
    expect(d.metrics['drive-time']).toBeCloseTo(350, 6)
    expect(d.metrics['shoulder-tilt-trophy']).toBeCloseTo(20, 6)
  })

  it('takes the front shoulder by geometry, not by its label, and mirrors for a left-hander', () => {
    const swapped = { shoulderFrontTrophy: marks.points.shoulderBackTrophy!, shoulderBackTrophy: marks.points.shoulderFrontTrophy! }
    expect(shoulderTiltDeg(swapped.shoulderFrontTrophy, swapped.shoulderBackTrophy, { aspect, handedness: 'right', standingNorm: H })).toBeCloseTo(20, 6)
    const left = shoulders(-10, 128, -1)
    expect(shoulderTiltDeg(left.shoulderFrontTrophy, left.shoulderBackTrophy, { aspect, handedness: 'left', standingNorm: H })).toBeCloseTo(-10, 6)
  })

  it('no angle when the shoulders are on frames far apart or too close to tell front from back', () => {
    const s = shoulders(20)
    expect(shoulderTiltDeg(s.shoulderFrontTrophy, { ...s.shoulderBackTrophy, frameIndex: 140 }, { aspect, handedness: 'right', standingNorm: H })).toBeNull()
    const close = { ...s.shoulderBackTrophy, x: s.shoulderFrontTrophy.x - 0.001 }
    expect(shoulderTiltDeg(s.shoulderFrontTrophy, close, { aspect, handedness: 'right', standingNorm: H })).toBeNull()
  })

  it('needs the standing marks for hip heights, but not for drive time', () => {
    const d = deriveFromMarks({ ...marks, points: { midHipLowest: marks.points.midHipLowest, midHipContact: marks.points.midHipContact } }, ctx)
    expect(d.metrics['leg-drive']).toBeUndefined()
    expect(d.metrics['drive-time']).toBeCloseTo(350, 6)
  })
})

describe('App vs you for the new rows', () => {
  const events: ServeEvents = { tossRelease: ev(100), trophy: ev(131), lowestHip: ev(131), contact: ev(151) }
  const metrics = {
    'leg-drive': val('leg-drive', 14, '% of height'),
    'loading-depth': val('loading-depth', 5, '% of height'),
    'drive-time': val('drive-time', 330, 'ms'),
    'shoulder-tilt-trophy': val('shoulder-tilt-trophy', null, 'band', { bandBasis: 'player-relative' }),
  }
  const mech = { hipRisePctH: 13.6, hipDropPctH: 5.2, driveTimeMs: 333.3, shoulderTiltDeg: 26 }
  const a = compareWithMarks({ marks, events, metrics, ctx, appMechanics: mech })
  const row = (id: string) => a.rows.find((r) => r.id === id)!

  it('judges leg drive and loading at 2.5% of height and drive time at 2 frames, on the unrounded values', () => {
    expect(row('metric:leg-drive').diff!.pctHeight).toBeCloseTo(1.6, 6)
    expect(row('metric:leg-drive').within).toBe(true)
    expect(row('metric:leg-drive').target!.text).toBe('2.5% of height target')
    expect(row('metric:loading-depth').diff!.pctHeight).toBeCloseTo(-0.8, 6)
    expect(row('metric:drive-time').diff!.frames).toBeCloseTo(-1, 1)
    expect(row('metric:drive-time').within).toBe(true)
    expect(row('metric:drive-time').target!.unit).toBe('frames')
  })

  it('the shoulder line has no target and no numbers on screen, only words', () => {
    const r = row('metric:shoulder-tilt-trophy')
    expect(r.within).toBeNull()
    expect(r.target).toBeNull()
    expect(r.you).toBeUndefined()
    expect(r.app).toBeUndefined()
    expect(r.diff!.deg).toBeCloseTo(6, 6)
    expect(r.sentence).toBe('The app has the front shoulder clearly higher than your marks.')
    expect(r.sentence + (r.note ?? '')).not.toMatch(/\d/)
  })

  it('trophy and lowest-hip frames are reported, not judged', () => {
    expect(row('event:trophy').within).toBeNull()
    expect(row('event:trophy').sentence).toBe('The app is 3 frames later (50 ms).')
    expect(row('event:lowestHip').within).toBeNull()
    expect(row('event:lowestHip').note).toMatch(/drive time/)
  })

  it('without the engine mechanics, the stored values are used (older exports)', () => {
    const b = compareWithMarks({ marks, events, metrics, ctx })
    expect(b.rows.find((r) => r.id === 'metric:leg-drive')!.diff!.pctHeight).toBeCloseTo(2, 6)
    expect(b.rows.find((r) => r.id === 'metric:shoulder-tilt-trophy')!.sentence).toMatch(/no value/)
    expect(appValueFor('leg-drive', { status: 'unavailable', value: null }, mech)).toBeNull()
  })

  it('every sentence passes the copy lint', () => {
    for (const r of a.rows) expect(lintCopy(`${r.label} ${r.sentence} ${r.note ?? ''}`), r.id).toEqual([])
  })

  it('reads the mechanics off a stored serve', () => {
    expect(
      mechanicsOf({
        legDrive: { hipRisePctH: { value: 11.2 }, hipDropPctH: { value: 4.1 }, driveTimeMs: { value: 360 } },
        shoulder: { trophyTilt2DDeg: { value: 18.5 } },
      }),
    ).toEqual({ hipRisePctH: 11.2, hipDropPctH: 4.1, driveTimeMs: 360, shoulderTiltDeg: 18.5 })
    expect(mechanicsOf({ legDrive: null, shoulder: null })).toEqual({})
  })
})

describe('marking steps for hips, shoulders and the trophy', () => {
  it('adds Trophy and Lowest hip as optional steps in serve order, and keeps 5 required marks', () => {
    expect(MARK_STEPS.map((s) => s.id)).toEqual(['standing', 'release', 'apex', 'trophy', 'hips', 'contact', 'landing', 'radar'])
    expect(progress(emptyDraft()).total).toBe(5)
    expect(stepById('trophy').optional).toBe(true)
    expect(stepById('hips').event).toBe('lowestHip')
  })

  it('the hip centre is an optional extra at release and contact; the ball stays first at contact', () => {
    const contact = stepById('contact')
    expect(nextPointOf(contact, emptyDraft())).toBe('ballAtContact')
    const d = setPoint(emptyDraft(), contact, 'ballAtContact', { frameIndex: 151, x: 0.5, y: 0.5 })
    expect(stepDone(contact, d)).toBe(true)
    expect(nextPointOf(contact, d)).toBe('midHipContact')
    const release = stepById('release')
    const r = setPoint(emptyDraft(), release, 'midHipRelease', { frameIndex: 100, x: 0.48, y: 0.69 })
    expect(r.events.tossRelease?.frameIndex).toBe(100)
  })

  it('the trophy step needs both shoulders; the marks stay on its frame', () => {
    const trophy = stepById('trophy')
    let d = setPoint(emptyDraft(), trophy, 'shoulderFrontTrophy', { frameIndex: 128, x: 0.52, y: 0.49 })
    expect(stepDone(trophy, d)).toBe(false)
    d = setPoint(d, trophy, 'shoulderBackTrophy', { frameIndex: 128, x: 0.48, y: 0.51 })
    expect(stepDone(trophy, d)).toBe(true)
    expect(d.events.trophy?.frameIndex).toBe(128)
  })

  it('every instruction passes the copy lint', () => {
    for (const s of MARK_STEPS) expect(lintCopy(`${s.title} ${s.instruction} ${s.points.map((p) => p.label).join(' ')}`), s.id).toEqual([])
  })
})

describe('pooled evaluation of the new metrics', () => {
  const file = syntheticExport({ seed: 13, players: 10, servesPerPlayer: 20, bias: { legDrivePct: 1.2, shoulderDeg: 3 } })
  const r = evaluate([file])
  const metric = (id: string) => r.metrics.find((m) => m.id === id)!

  it('recovers an injected leg-drive bias and judges it at 2.5% of height', () => {
    const legs = metric('leg-drive')
    expect(legs.unit).toBe('% of height')
    expect(legs.n).toBe(200)
    expect(legs.ba!.bias).toBeGreaterThan(0.8)
    expect(legs.ba!.bias).toBeLessThan(1.6)
    expect(legs.target!.max).toBe(2.5)
    expect(legs.verdict).toBe('Meets the V2 target')
    expect(legs.intervalCoverage!.n).toBe(200)
    const loading = metric('loading-depth')
    expect(Math.abs(loading.ba!.bias)).toBeLessThan(0.4)
  })

  it('judges drive time in frames against 2 frames', () => {
    const drive = metric('drive-time')
    expect(drive.target!.unit).toBe('frames')
    expect(drive.maeInTargetUnit!).toBeLessThan(2)
    expect(drive.verdict).toBe('Meets the V2 target')
  })

  it('reports the shoulder line in degrees without a pass or fail, even with labels swapped', () => {
    const tilt = metric('shoulder-tilt-trophy')
    expect(tilt.unit).toBe('degrees')
    expect(tilt.n).toBe(200)
    expect(tilt.ba!.bias).toBeGreaterThan(2)
    expect(tilt.ba!.bias).toBeLessThan(4)
    expect(tilt.target).toBeNull()
    expect(tilt.verdict).toMatch(/^Reported only: the band is judged by coach agreement/)
  })

  it('reports the trophy and lowest-hip frames without a target, and hip points between annotators', () => {
    for (const ev of ['trophy', 'lowestHip'] as const) {
      const e = r.events.find((x) => x.event === ev)!
      expect(e.dist!.n).toBe(200)
      expect(e.verdict).toMatch(/^Reported only/)
    }
    expect(r.interRater.points.map((p) => p.point)).toEqual(expect.arrayContaining(['midHipLowest', 'midHipContact', 'shoulderFrontTrophy']))
  })

  it('an older export without mechanics still pairs leg drive (stored values) but not the shoulder line', () => {
    const old = { ...file, entries: file.entries.map((e) => ({ ...e, app: { ...e.app, mechanics: undefined } })) }
    const o = evaluate([old])
    expect(o.metrics.find((m) => m.id === 'leg-drive')!.n).toBe(200)
    expect(o.metrics.find((m) => m.id === 'shoulder-tilt-trophy')!.n).toBe(0)
  })

  it('the report has the new rows and no missing numbers', () => {
    const md = renderReport(r, { generatedAt: '2026-09-28', files: ['synthetic.json'] })
    expect(md).toContain('| Leg drive (hip rise) | % of height | 200 (10) |')
    expect(md).toContain('| Drive time | ms | 200 (10) |')
    expect(md).toContain('| Shoulder line at the top | degrees | 200 (10) |')
    expect(md).toContain('| Hip centre at its lowest |')
    expect(md).not.toMatch(/NaN|undefined/)
  })
})
