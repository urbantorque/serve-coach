import { describe, expect, it } from 'vitest'
import type { MetricValue, ServeEvents } from '../../analysis/types.ts'
import { lintCopy } from '../../ui/copy/lint.ts'
import { compareWithMarks, deriveFromMarks, msPerFrame, radarInRange, type MarkContext, type Marks } from './agreement.ts'
import {
  annotationId,
  cleanInitials,
  cleanSubjectCode,
  emptyDraft,
  fromAnnotation,
  MARK_STEPS,
  nextPointOf,
  nudgePoint,
  progress,
  radarKmh,
  setPoint,
  setEvent,
  setSure,
  stepById,
  stepDone,
  toAnnotation,
} from './marks.ts'

const ctx: MarkContext = { clip: { width: 1080, height: 1920 }, timing: { nominalFps: 60, timeScale: 1 }, handedness: 'right', heightM: 1.75 }
const aspect = 1080 / 1920
const H = 0.2
const floorY = 0.8
/** Normalised x offset for a forward distance in cm (right-hander: into the court is +x). */
const dx = (cm: number, sign = 1) => ((cm / 175) * H * sign) / aspect

const marks: Marks = {
  events: {
    tossRelease: { frameIndex: 100, sure: true },
    tossApex: { frameIndex: 136, sure: true },
    contact: { frameIndex: 157, sure: false },
    landing: { frameIndex: 181, sure: true },
  },
  points: {
    headTopSetup: { frameIndex: 40, x: 0.49, y: floorY - H },
    floorSetup: { frameIndex: 40, x: 0.47, y: floorY },
    frontToeSetup: { frameIndex: 40, x: 0.5, y: floorY },
    ballAtApex: { frameIndex: 136, x: 0.5 + dx(30), y: floorY - 1.9 * H },
    ballAtContact: { frameIndex: 157, x: 0.5 + dx(35), y: floorY - 1.5 * H },
    frontToeLanding: { frameIndex: 181, x: 0.5 + dx(40), y: floorY },
  },
  reference: { radarKmh: 151, radarDevice: 'pocket-radar', radarQuantity: 'peak' },
}

const ev = (frameIndex: number) => ({ frameIndex, tReal: frameIndex / 60, uncertaintyS: 0.01, confidence: 0.9, method: 'test' })
const val = (id: string, value: number, unit: string): MetricValue => ({ id, value, unit, status: 'estimated', confidence: 0.8, basis: 'test' })

describe('values from the marks', () => {
  it('heights, drop, forward distances and rhythm in the app units', () => {
    const d = deriveFromMarks(marks, ctx)
    expect(d.standingNorm).toBeCloseTo(0.2, 10)
    expect(d.metrics['toss-apex-height']).toBeCloseTo(1.9, 10)
    expect(d.metrics['contact-height-ratio']).toBeCloseTo(1.5, 10)
    expect(d.metrics['toss-drop']).toBeCloseTo(70, 6)
    expect(d.metrics['toss-forward']).toBeCloseTo(30, 6)
    expect(d.metrics['contact-forward']).toBeCloseTo(35, 6)
    expect(d.metrics['landing-distance']).toBeCloseTo(40, 6)
    expect(d.metrics['rhythm-release-to-contact']).toBeCloseTo(57 * (1000 / 60), 6)
    expect(d.radarKmh).toBe(151)
  })

  it('a left-hander faces the other way; rendered slow motion uses real time', () => {
    const left = { ...marks, points: { ...marks.points, ballAtApex: { frameIndex: 136, x: 0.5 + dx(30, -1), y: floorY - 1.9 * H } } }
    expect(deriveFromMarks(left, { ...ctx, handedness: 'left' }).metrics['toss-forward']).toBeCloseTo(30, 6)
    // 240 fps rendered as 30 fps: 8 real frames per media frame.
    expect(msPerFrame({ nominalFps: 30, timeScale: 0.125 })).toBeCloseTo(1000 / 240, 10)
  })

  it('no standing marks, no heights (but timing still works)', () => {
    const d = deriveFromMarks({ ...marks, points: { ballAtApex: marks.points.ballAtApex } }, ctx)
    expect(d.standingNorm).toBeNull()
    expect(d.metrics['toss-apex-height']).toBeUndefined()
    expect(d.metrics['rhythm-release-to-contact']).toBeDefined()
  })
})

describe('App vs you', () => {
  const events: ServeEvents = { tossRelease: ev(101), tossApex: ev(136), contact: ev(155) }
  const metrics = {
    'toss-apex-height': val('toss-apex-height', 1.925, 'ratio-of-height'),
    'contact-height-ratio': val('contact-height-ratio', 1.53, 'ratio-of-height'),
    'rhythm-release-to-contact': val('rhythm-release-to-contact', 900, 'ms'),
    'toss-forward': val('toss-forward', 34, 'cm'),
    'landing-distance': { id: 'landing-distance', value: null, unit: 'cm', status: 'unavailable', confidence: 0, basis: 'test', reasonCode: 'LANDING_NOT_FOUND' } as MetricValue,
  }
  const a = compareWithMarks({ marks, events, metrics, ctx, appStandingNorm: 0.206 })
  const row = (id: string) => a.rows.find((r) => r.id === id)!

  it('timing rows in frames and ms, in plain language', () => {
    expect(row('event:tossRelease').diff).toEqual({ frames: 1, ms: expect.closeTo(16.67, 1) })
    expect(row('event:tossRelease').sentence).toBe('The app is 1 frame later (17 ms).')
    expect(row('event:tossRelease').within).toBe(true)
    expect(row('event:tossApex').sentence).toBe('Same frame as your mark.')
    expect(row('event:contact').sentence).toBe('The app is 2 frames earlier (33 ms).')
    expect(row('event:contact').within).toBe(false)
    expect(row('event:contact').unsure).toBe(true)
    expect(row('event:landing').within).toBeNull()
    expect(row('event:landing').sentence).toMatch(/did not find/)
  })

  it('height rows in cm and % of height against the METRICS targets', () => {
    const toss = row('metric:toss-apex-height')
    expect(toss.diff!.pctHeight).toBeCloseTo(2.5, 6)
    expect(toss.diff!.cm).toBeCloseTo(4.375, 6)
    expect(toss.within).toBe(true)
    expect(toss.sentence).toBe('The app reads 4 cm higher (2.5% of height).')
    expect(toss.you!.status).toBe('player-entered')
    const contact = row('metric:contact-height-ratio')
    expect(contact.within).toBe(false)
    expect(row('metric:toss-forward').sentence).toBe('The app reads 4 cm further forward.')
    expect(row('metric:toss-forward').within).toBe(true)
    expect(row('metric:rhythm-release-to-contact').within).toBe(false)
    expect(row('metric:landing-distance').within).toBeNull()
    expect(row('scale:standing').sentence).toMatch(/3% taller/)
    expect(row('speed:radar').you!.status).toBe('player-entered')
  })

  it('counts rows judged against a target, and every sentence passes the copy lint', () => {
    expect(a.checked).toBe(7)
    expect(a.withinTarget).toBe(4)
    for (const r of a.rows) expect(lintCopy(r.sentence), r.id).toEqual([])
  })

  it('radar inside the experimental range', () => {
    const speed: MetricValue = { id: 'speed-experimental', value: null, unit: 'km/h', status: 'experimental', confidence: 0.4, basis: 't', uncertainty: { kind: 'range', low: 140, high: 160 } }
    expect(radarInRange(151, speed)).toBe(true)
    expect(radarInRange(170, speed)).toBe(false)
    expect(radarInRange(151, undefined)).toBeNull()
  })
})

describe('marks draft', () => {
  it('a point on an event step also marks that frame; progress counts required steps', () => {
    let d = emptyDraft()
    const apex = stepById('apex')
    expect(nextPointOf(apex, d)).toBe('ballAtApex')
    d = setPoint(d, apex, 'ballAtApex', { frameIndex: 136, x: 0.6, y: 1.2 })
    expect(d.points.ballAtApex).toEqual({ frameIndex: 136, x: 0.6, y: 1 })
    expect(d.events.tossApex).toEqual({ frameIndex: 136, sure: true })
    expect(stepDone(apex, d)).toBe(true)
    expect(progress(d)).toEqual({ done: 1, total: MARK_STEPS.filter((s) => !s.optional).length })
    const standing = stepById('standing')
    d = setPoint(d, standing, 'headTopSetup', { frameIndex: 30, x: 0.5, y: 0.6 })
    expect(nextPointOf(standing, d)).toBe('floorSetup')
    expect(stepDone(standing, d)).toBe(false)
    d = setPoint(d, standing, 'floorSetup', { frameIndex: 30, x: 0.5, y: 0.8 })
    expect(stepDone(standing, d)).toBe(true)
    expect(nextPointOf(standing, d)).toBe('frontToeSetup')
    d = setSure(setEvent(d, 'tossRelease', 100), 'tossRelease', false)
    expect(d.events.tossRelease).toEqual({ frameIndex: 100, sure: false })
    d = nudgePoint(d, 'floorSetup', 0, 2, { width: 1080, height: 1920 })
    expect(d.points.floorSetup!.y).toBeCloseTo(0.8 + 2 / 1920, 10)
  })

  it('radar entry: mph converts, typing slips are refused', () => {
    expect(radarKmh(90, 'mph')).toEqual({ kmh: 144.8 })
    expect(radarKmh(1500, 'km/h')).toHaveProperty('error')
    expect(radarKmh(Number.NaN, 'km/h')).toHaveProperty('error')
  })

  it('initials only, upper case; ids per serve and annotator', () => {
    expect(cleanInitials('r. d-90x y')).toBe('RDXY')
    expect(annotationId('s1', 'RD')).toBe('check:s1:RD')
    expect(annotationId('s1', '')).toBe('check:s1:ANON')
  })

  it('a study code is a short pseudonym, saved on the check; adding it later keeps the marks blind', () => {
    expect(cleanSubjectCode(' p-07 (Jane) ')).toBe('P-07JANE')
    expect(cleanSubjectCode('p07')).toBe('P07')
    const meta = { serveId: 's1', sessionId: 'x', videoId: 'v', initials: 'RD', role: 'team' as const, captureFps: 60, now: '2026-09-27T01:00:00Z' }
    const d = setEvent(emptyDraft(), 'contact', 150)
    expect(toAnnotation(d, meta)).not.toHaveProperty('subjectCode')
    const revealed = { ...toAnnotation(d, meta), revealedAt: '2026-09-27T01:05:00Z' }
    const coded = toAnnotation(d, { ...meta, previous: revealed, subjectCode: 'p07' })
    expect(coded.subjectCode).toBe('P07')
    expect(coded.blind).toBe(true)
  })

  it('blinding: marks changed after the comparison was shown are no longer blind', () => {
    const meta = { serveId: 's1', sessionId: 'x', videoId: 'v', initials: 'RD', role: 'player' as const, captureFps: 60, now: '2026-09-27T01:00:00Z' }
    let d = setEvent(emptyDraft(), 'contact', 150)
    d = { ...d, radar: { value: 90, unit: 'mph', device: 'pocket-radar' } }
    const first = toAnnotation(d, meta)
    expect(first.blind).toBe(true)
    expect(first.reference).toEqual({ radarKmh: 144.8, radarDevice: 'pocket-radar', radarQuantity: 'peak', radarUnit: 'mph', radarEntered: 90 })
    expect(fromAnnotation(first).radar).toEqual({ value: 90, unit: 'mph', device: 'pocket-radar' })
    // Saved again before seeing the comparison: still blind.
    expect(toAnnotation(setEvent(d, 'contact', 151), { ...meta, previous: first }).blind).toBe(true)
    const revealed = { ...first, revealedAt: '2026-09-27T01:05:00Z' }
    // Unchanged after the reveal: still blind. Changed: not blind, and the reveal time is kept.
    expect(toAnnotation(d, { ...meta, previous: revealed }).blind).toBe(true)
    const edited = toAnnotation(setEvent(d, 'contact', 151), { ...meta, previous: revealed, now: '2026-09-27T02:00:00Z' })
    expect(edited.blind).toBe(false)
    expect(edited.revealedAt).toBe('2026-09-27T01:05:00Z')
    expect(edited.createdAt).toBe('2026-09-27T01:00:00Z')
  })

  it('every instruction passes the copy lint', () => {
    for (const s of MARK_STEPS) expect(lintCopy(`${s.title} ${s.instruction} ${s.points.map((p) => p.label).join(' ')}`)).toEqual([])
  })
})
