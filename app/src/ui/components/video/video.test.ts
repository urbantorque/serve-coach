import { describe, expect, it } from 'vitest'
import { LM, type EventEstimate, type MetricValue, type PhaseSpan, type ServeEvents } from '../../../analysis/types.ts'
import type { BallTrackCompact, PoseTrackCompact } from '../../../data/domain.ts'
import { fitTransform, ghostMapper, panLimits, playerRegion, regionTransform, rulerLabel, rulerTicks, toBox, clampLabel } from './geometry.ts'
import { currentItem, stripItems } from './keyFrames.ts'
import { buildScene, chipForFocus, forwardSign, overlayUnavailableReason } from './overlayScene.ts'
import { anchorPairs, frameToReal, phaseAt, realToFrame, secondsAfterRelease, syncedFrame, warpTime } from './phaseSync.ts'
import { clampFrame, frameToMediaTime, mediaTimeToFrame, nextRate, rateLabel } from './playhead.ts'
import { boneTier, jointTier } from './skeleton.ts'
import { sliderText } from './timeline.ts'
import { ballPoints, frontToeOf, landmarksAt, sampleIndexAt, standingRef, tossPeak } from './tracks.ts'

const ev = (frameIndex: number, fps = 60, confidence = 0.9): EventEstimate => ({ frameIndex, tReal: frameIndex / fps, uncertaintyS: 0.01, confidence, method: 'test' })

/** A standing player: feet at y 0.74, hips at 0.62, shoulders at 0.52, height 0.27 of the frame. */
function makePose(frames: number[], opts: { toeX?: number; hipDrop?: (f: number) => number } = {}): PoseTrackCompact {
  const n = frames.length
  const xyv = new Float32Array(n * 33 * 3).fill(Number.NaN)
  frames.forEach((f, i) => {
    const set = (k: LM, x: number, y: number, v = 0.95) => {
      const o = (i * 33 + k) * 3
      xyv[o] = x
      xyv[o + 1] = y
      xyv[o + 2] = v
    }
    const dy = opts.hipDrop?.(f) ?? 0
    set(LM.LEFT_SHOULDER, 0.49, 0.52 + dy)
    set(LM.RIGHT_SHOULDER, 0.51, 0.52 + dy)
    set(LM.LEFT_ELBOW, 0.48, 0.57 + dy)
    set(LM.RIGHT_ELBOW, 0.52, 0.57 + dy, 0.6)
    set(LM.LEFT_WRIST, 0.48, 0.61 + dy)
    set(LM.RIGHT_WRIST, 0.52, 0.45 + dy, 0.3)
    set(LM.LEFT_HIP, 0.495, 0.62 + dy)
    set(LM.RIGHT_HIP, 0.505, 0.62 + dy)
    set(LM.LEFT_KNEE, 0.5, 0.68)
    set(LM.RIGHT_KNEE, 0.5, 0.68)
    set(LM.LEFT_ANKLE, 0.49, 0.735)
    set(LM.RIGHT_ANKLE, 0.51, 0.735)
    set(LM.LEFT_HEEL, 0.48, 0.74)
    set(LM.RIGHT_HEEL, 0.47, 0.74)
    // Labels swapped on purpose: the "right" toe is the one further into the court (image right).
    set(LM.LEFT_FOOT_INDEX, 0.49, 0.74)
    set(LM.RIGHT_FOOT_INDEX, opts.toeX ?? 0.53, 0.74)
  })
  return {
    frameIndices: Int32Array.from(frames),
    tReal: Float64Array.from(frames.map((f) => f / 60)),
    xyv,
    flags: new Uint8Array(n),
    source: 'injected',
    frameAspect: 9 / 16,
    bodyHeightHU: 0.27,
    pitchDeg: new Float32Array(0),
    rollDeg: new Float32Array(0),
  }
}

function makeBall(): BallTrackCompact {
  const frames = [100, 101, 102, 103, 104, 105, 130, 131]
  const ys = [0.55, 0.45, 0.38, 0.35, 0.38, 0.45, 0.3, 0.28]
  return {
    frameIndices: Int32Array.from(frames),
    tReal: Float64Array.from(frames.map((f) => f / 60)),
    x: Float32Array.from(frames.map((_, i) => (i < 6 ? 0.56 : 0.62))),
    y: Float32Array.from(ys),
    r: new Float32Array(frames.length).fill(0.005),
    score: new Float32Array(frames.length).fill(0.9),
    kind: Uint8Array.from([0, 0, 0, 0, 0, 0, 1, 1]),
    predicted: Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0]),
  }
}

const events: ServeEvents = {
  setupStart: ev(0),
  motionStart: ev(60),
  tossRelease: ev(100),
  tossApex: ev(103),
  trophy: ev(110),
  lowestHip: ev(110),
  contact: ev(125),
  landing: ev(135),
  recoveryEnd: ev(180),
}

const estimate = (id: string, value: number, unit: string): MetricValue => ({ id, value, unit, status: 'estimated', confidence: 0.8, basis: 'test' })

describe('geometry', () => {
  const clip = { width: 1080, height: 1920 }
  const box = { width: 390, height: 380 }

  it('fits a portrait clip into the box, pillarboxed and centred, aspect kept', () => {
    const t = fitTransform(clip, box)
    expect(clip.height * t.scale).toBeCloseTo(380)
    expect(clip.width * t.scale).toBeCloseTo(213.75)
    expect(t.ox).toBeCloseTo((390 - 213.75) / 2)
    expect(toBox(t, clip, 0.5, 0.5)).toEqual({ x: 195, y: 190 })
  })

  it('zooms to the player region and never pans past the clip edge', () => {
    const region = playerRegion({ groundY: 0.74, bodyHeightNorm: 0.27, heightM: 1.8, columnX: 0.5, peakY: 0.22 })
    expect(region.top).toBeLessThan(0.22)
    expect(region.bottom).toBeGreaterThan(0.74)
    const t = regionTransform(clip, box, region)
    expect(t.scale).toBeGreaterThan(fitTransform(clip, box).scale * 1.5)
    // Zoomed 1.7×: still narrower than the box, so it stays centred and cannot pan.
    expect(clip.width * t.scale).toBeLessThan(390)
    expect(panLimits(clip, box, region)).toEqual({ min: 0, max: 0 })
    // A tighter region overfills the width: panning is clamped at both edges.
    const tight = playerRegion({ groundY: 0.74, bodyHeightNorm: 0.27, heightM: 1.8, columnX: 0.5, peakY: 0.5 })
    const lim = panLimits(clip, box, tight)
    expect(lim.max).toBeGreaterThan(0)
    const far = regionTransform(clip, box, tight, 10_000)
    expect(far.ox).toBeLessThanOrEqual(0)
    const farLeft = regionTransform(clip, box, tight, -10_000)
    expect(farLeft.ox + clip.width * farLeft.scale).toBeGreaterThanOrEqual(390 - 1e-6)
  })

  it('ruler ticks are multiples of standing height inside the frame, labelled with ×', () => {
    const ticks = rulerTicks(0.74, 0.27, [0.5, 1, 2, 3])
    expect(ticks.map((t) => t.k)).toEqual([0.5, 1, 2])
    expect(rulerLabel(1)).toBe('1×')
    expect(rulerLabel(1.5)).toBe('1.5×')
  })

  it('maps a ghost pose by standing height, anchored at the toe', () => {
    const map = ghostMapper(
      { toe: { x: 0.5, y: 0.74 }, bodyHeightNorm: 0.27, clip },
      { toe: { x: 0.4, y: 0.7 }, bodyHeightNorm: 0.135, clip },
    )
    expect(map({ x: 0.4, y: 0.7 })).toEqual({ x: 0.5, y: 0.74 })
    const up = map({ x: 0.4, y: 0.7 - 0.135 })
    expect(up.y).toBeCloseTo(0.74 - 0.27)
  })

  it('keeps labels inside the box', () => {
    expect(clampLabel(380, -5, 100, 20, { width: 390, height: 219 })).toEqual({ x: 282, y: 8 })
  })
})

describe('phase sync and timing', () => {
  const timing = { nominalFps: 60, timeScale: 1 }
  it('converts frames and real time, including rendered slow motion', () => {
    expect(frameToReal(120, timing)).toBe(2)
    expect(realToFrame(2, timing)).toBe(120)
    expect(frameToReal(240, { nominalFps: 30, timeScale: 0.125 })).toBe(1)
  })
  it('warps time piecewise so release, trophy, contact and landing coincide', () => {
    const other: ServeEvents = { tossRelease: ev(50), trophy: ev(70), contact: ev(80), landing: ev(90) }
    const pairs = anchorPairs(events, other)
    expect(pairs).toHaveLength(4)
    expect(warpTime(events.contact!.tReal, pairs)).toBeCloseTo(other.contact!.tReal)
    expect(syncedFrame(125, { timing, events }, { timing, events: other, window: { startFrame: 0, endFrame: 200 } })).toBe(80)
    // Before release: slope 1 from the first anchor.
    expect(syncedFrame(90, { timing, events }, { timing, events: other, window: { startFrame: 0, endFrame: 200 } })).toBe(40)
    expect(secondsAfterRelease(160, timing, events)).toBeCloseTo(1)
  })
  it('finds the phase at a frame and speaks it for the slider', () => {
    const phases: PhaseSpan[] = [
      { phase: 'setup', startFrame: 0, endFrame: 59, keyFrame: 50, confidence: 1 },
      { phase: 'toss', startFrame: 60, endFrame: 99, keyFrame: 99, confidence: 1 },
      { phase: 'loading', startFrame: 100, endFrame: 109, keyFrame: 110, confidence: 1 },
    ]
    expect(phaseAt(phases, 105)?.phase).toBe('loading')
    expect(sliderText(105, phases, { startFrame: 0, endFrame: 199 })).toBe('Loading, frame 106 of 200')
  })
})

describe('playhead', () => {
  it('seeks to the middle of a frame and reads frames back from media time', () => {
    expect(frameToMediaTime(10, 60)).toBeCloseTo(10.5 / 60)
    expect(mediaTimeToFrame(frameToMediaTime(10, 60), 60)).toBe(10)
    expect(mediaTimeToFrame(10 / 60, 60)).toBe(10)
    expect(clampFrame(500, { startFrame: 0, endFrame: 289 })).toBe(289)
  })
  it('cycles 1×, ½×, ¼×', () => {
    expect(nextRate(1)).toBe(0.5)
    expect(nextRate(0.25)).toBe(1)
    expect(rateLabel(0.25)).toBe('¼×')
  })
})

describe('tracks and skeleton', () => {
  const pose = makePose([0, 10, 20, 100, 110, 125, 135])
  it('finds samples within tolerance and reads landmarks', () => {
    expect(sampleIndexAt(pose.frameIndices, 11)).toBe(1)
    expect(sampleIndexAt(pose.frameIndices, 50)).toBe(-1)
    expect(landmarksAt(pose, 10)?.[LM.LEFT_SHOULDER]?.x).toBeCloseTo(0.49)
    expect(landmarksAt(pose, 10)?.[LM.NOSE]).toBeNull()
  })
  it('identifies the front toe by position, not by its (possibly swapped) label', () => {
    expect(frontToeOf(landmarksAt(pose, 10), 'right')?.x).toBeCloseTo(0.53)
    expect(frontToeOf(landmarksAt(pose, 10), 'left')?.x).toBeCloseTo(0.49)
    const ref = standingRef(pose, 'right', 0, 20)
    expect(ref?.groundY).toBeCloseTo(0.74)
    expect(ref?.toe?.x).toBeCloseTo(0.53)
  })
  it('reads ball samples by kind and the toss peak', () => {
    const ball = makeBall()
    expect(ballPoints(ball, { kind: 'toss' })).toHaveLength(6)
    expect(ballPoints(ball, { kind: 'outgoing' })).toHaveLength(2)
    expect(tossPeak(ball)?.frame).toBe(103)
  })
  it('fades joints between 0.5 and 0.7 and hides them below 0.5 with their bones', () => {
    expect(jointTier(0.9)).toBe('full')
    expect(jointTier(0.6)).toBe('faded')
    expect(jointTier(0.3)).toBe('hidden')
    expect(jointTier(undefined)).toBe('hidden')
    expect(boneTier(0.9, 0.6)).toBe('faded')
    expect(boneTier(0.9, 0.4)).toBe('hidden')
  })
})

describe('overlay scenes', () => {
  const pose = makePose([0, 10, 20, 60, 100, 103, 105, 110, 115, 120, 125, 135], { hipDrop: (f) => (f >= 100 && f <= 115 ? 0.02 : 0) })
  const ball = makeBall()
  const standing = standingRef(pose, 'right', 0, 59)
  const base = {
    pose,
    ball,
    events,
    handedness: 'right' as const,
    standing,
    bodyHeightNorm: 0.27,
    aspect: 9 / 16,
    metrics: {
      'toss-apex-height': estimate('toss-apex-height', 1.94, 'ratio-of-height'),
      'contact-height-ratio': estimate('contact-height-ratio', 1.5, 'ratio-of-height'),
      'leg-drive': estimate('leg-drive', 9, '% of height'),
      'landing-distance': { id: 'landing-distance', value: null, unit: 'cm', status: 'unavailable', confidence: 0, basis: 't', reasonCode: 'FEET_NOT_VISIBLE' } as MetricValue,
    },
  }

  it('Body draws only confident joints: a 0.3 wrist and its bone are hidden, a 0.6 elbow is faded', () => {
    const s = buildScene({ ...base, overlay: 'body', frame: 10 })
    const dots = s.prims.filter((p) => p.kind === 'dot')
    expect(dots.length).toBe(15) // 16 body joints minus the hidden right wrist
    const faded = s.prims.filter((p) => p.kind === 'segment' && p.alpha !== undefined && p.alpha < 1)
    expect(faded.length).toBeGreaterThan(0)
    expect(s.labels).toHaveLength(0)
  })

  it('Toss grows the trail with the playhead, marks the peak with its value and data state', () => {
    const early = buildScene({ ...base, overlay: 'toss', frame: 101 })
    expect(early.labels).toHaveLength(0)
    const atApex = buildScene({ ...base, overlay: 'toss', frame: 103 })
    const label = atApex.labels.find((l) => l.id === 'apex')!
    expect(label.metric?.value.status).toBe('estimated')
    expect(label.side).toBe('right') // away from the body, into the court for a right-hander
    expect(atApex.prims.some((p) => p.kind === 'text' && p.text === '1×')).toBe(true)
  })

  it('Contact marks the ball at contact and the toe line; Legs brackets the hip rise; unavailable values get no label', () => {
    const c = buildScene({ ...base, overlay: 'contact', frame: 125 })
    expect(c.labels.map((l) => l.id)).toContain('contact')
    const legs = buildScene({ ...base, overlay: 'legs', frame: 135 })
    expect(legs.labels.find((l) => l.id === 'rise')?.metric?.id).toBe('leg-drive')
    expect(legs.labels.find((l) => l.id === 'landing')).toBeUndefined()
    for (const l of [...c.labels, ...legs.labels]) if (l.metric) expect(l.metric.value.status).not.toBe('unavailable')
  })

  it('never draws an experimental number with the experimental toggle off (D2)', () => {
    const exp = (id: string, value: number, unit: string): MetricValue => ({ ...estimate(id, value, unit), status: 'experimental', uncertainty: { kind: 'range', low: value - 5, high: value + 5 } })
    const metrics = {
      ...base.metrics,
      'toss-apex-height': exp('toss-apex-height', 1.94, 'ratio-of-height'),
      'toss-forward': exp('toss-forward', 30, 'cm'),
      'contact-forward': exp('contact-forward', 30, 'cm'),
      'landing-distance': exp('landing-distance', 40, 'cm'),
      'leg-drive': exp('leg-drive', 9, '% of height'),
    }
    const scenes = (experimentalOn: boolean) => [
      buildScene({ ...base, metrics, experimentalOn, overlay: 'toss', frame: 125, focus: 'apex-vs-toe' }),
      buildScene({ ...base, metrics, experimentalOn, overlay: 'contact', frame: 125 }),
      buildScene({ ...base, metrics, experimentalOn, overlay: 'legs', frame: 135 }),
    ]
    const off = scenes(false).flatMap((s) => s.labels)
    expect(off.filter((l) => l.metric?.value.status === 'experimental')).toEqual([])
    // Labels with a word keep it; the "From your toe" labels are numbers only, so they go.
    expect(off.map((l) => l.id)).toContain('apex')
    expect(off.map((l) => l.id)).not.toContain('contact-toe')
    const on = scenes(true).flatMap((s) => s.labels)
    expect(on.find((l) => l.id === 'contact-toe')?.metric?.value.status).toBe('experimental')
  })

  it('None draws nothing; ghost adds a dashed comparison skeleton', () => {
    expect(buildScene({ ...base, overlay: 'none', frame: 10 }).prims).toHaveLength(0)
    const g = buildScene({ ...base, overlay: 'none', frame: 10, ghost: { pose, frame: 10, map: (p) => p } })
    expect(g.prims.every((p) => p.kind === 'segment' && p.ink === 'ghost' && p.dash)).toBe(true)
  })

  it('disables a chip with a reason when its data is missing', () => {
    expect(overlayUnavailableReason('toss', { pose, events })).toBe('Ball not tracked on this serve')
    expect(overlayUnavailableReason('body', { events })).toBe('Body not tracked on this serve')
    expect(overlayUnavailableReason('none', { events })).toBeNull()
  })

  it('opens on the focus overlay chip and knows which way is into the court', () => {
    expect(chipForFocus('apex-scatter')).toBe('toss')
    expect(chipForFocus('hip-rise')).toBe('legs')
    expect(chipForFocus('timing-strip')).toBe('body')
    expect(chipForFocus(null)).toBe('body')
    expect(forwardSign('right')).toBe(1)
    expect(forwardSign('left')).toBe(-1)
  })
})

describe('key-frame strip model', () => {
  it('lists the six core events, Setup and Recovery when found, and marks unclear ones', () => {
    const items = stripItems({ ...events, landing: ev(135, 60, 0.3) })
    expect(items.map((i) => i.event)).toEqual(['setup', 'release', 'apex', 'trophy', 'lowestHip', 'contact', 'landing', 'recovery'])
    expect(items.find((i) => i.event === 'landing')?.clear).toBe(false)
    expect(currentItem(items, 112)).toBe('lowestHip')
    expect(stripItems({ contact: ev(10) }).map((i) => i.event)).toEqual(['release', 'apex', 'trophy', 'lowestHip', 'contact', 'landing'])
  })
})
