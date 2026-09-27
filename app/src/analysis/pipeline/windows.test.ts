import { describe, expect, it } from 'vitest'
import { servePoses } from './testPoses.ts'
import {
  activitySpans,
  ballIndices,
  BALL_CONTACT_DOUBT_S,
  ballSearchCrop,
  ballSearchDoubtS,
  CONTACT_SEARCH_S,
  forwardDirection,
  FULL_RATE_AFTER_S,
  FULL_RATE_BEFORE_S,
  framesInSpans,
  frameAt,
  planWindows,
  poseIndices,
  provisionalContact,
  sparseStep,
  statureFromPoses,
  TOSS_BAND_FORWARD_REACH,
  tossSearchBand,
  wristPeak,
} from './windows.ts'

const FPS = 60
const times = (n: number) => Float64Array.from({ length: n }, (_, i) => i / FPS)

describe('frameAt', () => {
  it('finds the nearest frame and clamps', () => {
    const t = times(100)
    expect(frameAt(t, -1)).toBe(0)
    expect(frameAt(t, 0.5)).toBe(30)
    expect(frameAt(t, 0.5 + 0.4 / FPS)).toBe(30)
    expect(frameAt(t, 0.5 + 0.6 / FPS)).toBe(31)
    expect(frameAt(t, 99)).toBe(99)
    expect(frameAt([], 1)).toBe(0)
  })
})

describe('wristPeak', () => {
  it('finds the hitting-arm peak (end of the last above-head run), not the toss arm', () => {
    const peak = wristPeak(servePoses({ contactT: 2.2 }), 'right')
    expect(peak).not.toBeNull()
    expect(Math.abs(peak!.tReal - 2.2)).toBeLessThan(0.05)
  })

  it('does not depend on left/right labels (side-view mirror)', () => {
    const peak = wristPeak(servePoses({ contactT: 2.2, mirrored: true }), 'right')
    expect(Math.abs(peak!.tReal - 2.2)).toBeLessThan(0.05)
  })

  it('ignores a lone noisy above-head sample after contact (seen on the session clip: 0.5 s late)', () => {
    const poses = servePoses({ contactT: 2.2 })
    const late = poses.findIndex((p) => p.tReal >= 2.7)
    poses[late] = { ...poses[late], landmarks: poses[late].landmarks!.map((l, k) => (k === 15 ? { ...l, y: 0.28 } : l)) }
    const peak = wristPeak(poses, 'right')
    expect(Math.abs(peak!.tReal - 2.2)).toBeLessThan(0.05)
  })

  it('is not fooled by the tossing arm held higher than the blurred hitting wrist (session serve 7: 0.54 s early)', () => {
    // Production Pass A poses of the session clip, serve 7: the tossing wrist stayed above the head
    // (and higher than the hitting wrist's 15 Hz samples) until 0.2 s before contact.
    const contactT = 2.2
    const poses = servePoses({ contactT }).map((p) => {
      if (!p.landmarks) return p
      const l = p.landmarks.map((x) => ({ ...x }))
      if (p.tReal >= contactT - 0.9 && p.tReal <= contactT - 0.2) l[15] = { x: l[15].x, y: 0.11, visibility: 0.95 }
      return { ...p, landmarks: l }
    })
    expect(CONTACT_SEARCH_S).toBeLessThanOrEqual(0.3)
    const peak = wristPeak(poses, 'right')
    expect(Math.abs(peak!.tReal - contactT)).toBeLessThan(0.08)
  })

  it('returns null when no wrist rises above the head', () => {
    const poses = servePoses().map((p) => ({ ...p, landmarks: p.landmarks!.map((l, k) => (k === 15 || k === 16 ? { ...l, y: 0.6 } : l)) }))
    expect(wristPeak(poses, 'right')).toBeNull()
  })
})

describe('provisionalContact', () => {
  const window = { startReal: 0, endReal: 3.8, confidence: 0.9 }
  const base = { frameTimes: times(240), handedness: 'right' as const, view: 'side' as const, aspect: 9 / 16 }

  it('uses the pose peak, then a hit sound within 0.4 s when there is one', () => {
    const poses = servePoses({ contactT: 2.2 })
    const pose = provisionalContact(window, poses, { ...base, sparsePoses: poses })
    expect(pose.source).toBe('pose')
    expect(pose.uncertaintyS).toBeGreaterThan(0.05)
    const audio = provisionalContact(window, poses, {
      ...base,
      sparsePoses: poses,
      soundDelayS: 0.02,
      onsets: [
        { tReal: 2.25, strength: 30, sharpness: 0.9, kind: 'unknown' },
        { tReal: 2.5, strength: 10, sharpness: 0.9, kind: 'bounce' },
        { tReal: 1.0, strength: 50, sharpness: 0.9, kind: 'unknown' },
      ],
    })
    expect(audio.source).toBe('audio')
    expect(audio.tReal).toBeCloseTo(2.23, 5)
  })

  it('falls back to 58% of the window', () => {
    const c = provisionalContact(window, [], { ...base, sparsePoses: [] })
    expect(c.source).toBe('window')
    expect(c.tReal).toBeCloseTo(0.58 * 3.8)
  })
})

describe('planWindows', () => {
  it('builds frame ranges, core and ball ranges around contact, crop and corridor', () => {
    const poses = servePoses({ contactT: 2.2 })
    const [w] = planWindows([{ startReal: 0, endReal: 3.8, confidence: 0.8 }], {
      frameTimes: times(240),
      sparsePoses: poses,
      handedness: 'right',
      view: 'side',
      aspect: 9 / 16,
    })
    expect(w.startFrame).toBe(0)
    expect(w.endFrame).toBe(228)
    expect(w.coreStartFrame).toBe(frameAt(times(240), 2.2 - 1.6))
    expect(w.ballStartFrame).toBeLessThan(w.coreStartFrame)
    expect(w.ballEndFrame).toBe(w.coreEndFrame)
    expect(w.forward).toBe(1)
    expect(w.statureNorm).toBeGreaterThan(0.45)
    expect(w.crop.y).toBe(0) // up to the frame top for the toss
    expect(w.crop.x + w.crop.w).toBeGreaterThan(0.6) // extended into the court
    expect(w.corridor).not.toBeNull()
    expect(w.corridor!.x1).toBe(1)
  })

  it('splits overlapping windows at the overlap midpoint and drops empty ones', () => {
    const planned = planWindows(
      [
        { startReal: 0, endReal: 2, confidence: 1 },
        { startReal: 1.5, endReal: 3.5, confidence: 1 },
        { startReal: 3.6, endReal: 3.6, confidence: 1 },
      ],
      { frameTimes: times(240), sparsePoses: [], handedness: 'right', view: 'rear', aspect: 16 / 9 },
    )
    expect(planned).toHaveLength(2)
    expect(planned[0].endFrame).toBe(frameAt(times(240), 1.75))
    expect(planned[1].startFrame).toBe(planned[0].endFrame)
    expect(planned[1].index).toBe(1)
    expect(planned[0].corridor).toBeNull() // no corridor outside the side view
  })
})

describe('forwardDirection', () => {
  it('reads the court side from hip travel and the contact point', () => {
    expect(forwardDirection(servePoses({ forward: 1 }), { x: 0.45 }, 0.5, 9 / 16)).toBe(1)
    expect(forwardDirection(servePoses({ forward: -1 }), { x: 0.35 }, 0.5, 9 / 16)).toBe(-1)
    expect(forwardDirection([], undefined, 0.5, 1)).toBe(0)
  })
})

describe('two-level Pass A', () => {
  it('activity spans surround arm-above-head samples and merge', () => {
    const coarse = servePoses({ hz: 4, contactT: 2.2 })
    const spans = activitySpans(coarse)
    expect(spans).toHaveLength(1)
    const [a, b] = spans[0]
    expect(a).toBeLessThanOrEqual(2.2 - 2.2) // covers the window start (anchor - 2.2 s)
    expect(b).toBeGreaterThanOrEqual(2.2 + 1.6)
    const still = coarse.map((p) => ({ ...p, landmarks: p.landmarks!.map((l, k) => (k === 15 || k === 16 ? { ...l, y: 0.6 } : l)) }))
    expect(activitySpans(still)).toEqual([])
  })

  it('fill frames lie on the fine grid inside the spans, skipping frames already done', () => {
    const t = times(600)
    const out = framesInSpans(t, [[1, 2], [1.9, 2.5]], 4, new Set([64]))
    expect(out[0]).toBe(60)
    expect(out.every((f) => f % 4 === 0)).toBe(true)
    expect(out).not.toContain(64)
    expect(out.at(-1)).toBe(148)
    expect(new Set(out).size).toBe(out.length)
  })
})

describe('sampling', () => {
  it('poses: every core frame, every 3rd outside; every 2nd in the core at 240 fps', () => {
    const w = { startFrame: 0, endFrame: 30, coreStartFrame: 10, coreEndFrame: 20 }
    const idx = poseIndices(w, 60)
    for (let f = 10; f <= 20; f++) expect(idx).toContain(f)
    expect(idx).toContain(0)
    expect(idx).toContain(30)
    expect(idx).not.toContain(1)
    const hfr = poseIndices(w, 240)
    expect(hfr).toContain(10)
    expect(hfr).not.toContain(11)
    expect(ballIndices({ ballStartFrame: 5, ballEndFrame: 8 })).toEqual([5, 6, 7, 8])
    expect(sparseStep(60)).toBe(4)
    expect(sparseStep(240)).toBe(16)
    expect(sparseStep(10)).toBe(1)
    expect(statureFromPoses([])).toBe(0)
  })

  it('poses: context frames Pass A already covers are not estimated again; the core always is', () => {
    const w = { startFrame: 0, endFrame: 240, coreStartFrame: 60, coreEndFrame: 190 }
    const all = poseIndices(w, 60)
    // Pass A at 15 Hz (every 4th frame) over the whole window.
    const passA = new Set(Array.from({ length: 61 }, (_, k) => 4 * k))
    const reused = poseIndices(w, 60, passA)
    for (let f = 60; f <= 190; f++) expect(reused).toContain(f) // core: all of it, even frames Pass A has
    expect(reused.filter((f) => f < 60 || f > 190)).toEqual([0, 240]) // context: only the window ends
    expect(all.filter((f) => f < 60).length).toBe(20) // without Pass A: the 20 Hz grid
    // Pass A covering only the start: the context after the core keeps its grid.
    const early = poseIndices(w, 60, new Set([0, 4, 8, 12]))
    expect(early.filter((f) => f > 190)).toEqual(all.filter((f) => f > 190))
    expect(early.filter((f) => f > 0 && f < 12)).toEqual([])
  })

  it('ball: full rate up to 120 fps; at 240 fps the toss phase keeps every 2nd frame', () => {
    const w = { ballStartFrame: 0, ballEndFrame: 599, contact: { frameIndex: 455, uncertaintyS: 0.08 } }
    expect(ballIndices(w, 60)).toHaveLength(600)
    expect(ballIndices(w, 120)).toHaveLength(600)
    const hfr = ballIndices(w, 240)
    const fullFrom = 455 - Math.ceil((0.08 + 0.1) * 240) // 411
    expect(hfr.filter((f) => f < fullFrom).every((f) => f % 2 === 0)).toBe(true)
    for (let f = fullFrom; f <= 599; f++) expect(hfr).toContain(f)
    expect(hfr.length).toBe(206 + 189) // 0, 2, ..., 410 then 411..599
    // Without a contact estimate the whole range stays at full rate.
    expect(ballIndices({ ballStartFrame: 0, ballEndFrame: 99 }, 240)).toHaveLength(100)
  })
})

describe('pose thinning and the ball crop', () => {
  it('slowCoreHz thins only the slow parts of the core; the span around the provisional contact keeps every frame', () => {
    const w = { startFrame: 0, endFrame: 252, coreStartFrame: 60, coreEndFrame: 192, contact: { frameIndex: 156, uncertaintyS: 0.1 } }
    const full = poseIndices(w, 60)
    const thin = poseIndices(w, 60, undefined, { slowCoreHz: 30 })
    const fullFrom = 156 - Math.ceil(FULL_RATE_BEFORE_S * 60) - 6 // 117
    const fullTo = 156 + Math.ceil(FULL_RATE_AFTER_S * 60) + 6 // 189
    for (let f = fullFrom; f <= fullTo; f++) expect(thin).toContain(f)
    const slow = thin.filter((f) => f >= 60 && f < fullFrom)
    expect(slow.every((f) => (f - 60) % 2 === 0)).toBe(true)
    expect(thin.length).toBeLessThan(full.length)
    // Outside the core nothing changes; without a contact nothing is thinned.
    expect(thin.filter((f) => f < 60 || f > 192)).toEqual(full.filter((f) => f < 60 || f > 192))
    expect(poseIndices({ ...w, contact: undefined }, 60, undefined, { slowCoreHz: 30 })).toEqual(full)
  })

  it('ballSearchDoubtS: the ball search keeps the band and corridor open well beyond the contact estimate', () => {
    expect(ballSearchDoubtS({ source: 'pose', uncertaintyS: 0.13 })).toBe(BALL_CONTACT_DOUBT_S.pose)
    expect(ballSearchDoubtS({ source: 'pose', uncertaintyS: 0.13 })).toBeGreaterThanOrEqual(0.4)
    expect(ballSearchDoubtS({ source: 'audio', uncertaintyS: 0.05 })).toBe(BALL_CONTACT_DOUBT_S.audio)
    expect(ballSearchDoubtS({ source: 'window', uncertaintyS: 0.9 })).toBe(0.9)
  })

  it('tossSearchBand: reaches towards the court and covers the contact column (dist12-s1 lost the ball at the old edge)', () => {
    const band = { x0: 0.347, y0: 0, x1: 0.559, y1: 0.556 }
    const aspect = 0.5625
    const statureNorm = 0.26
    const reach = (TOSS_BAND_FORWARD_REACH * statureNorm) / aspect
    const contact = { tReal: 2.8, frameIndex: 168, uncertaintyS: 0.11, source: 'pose' as const, wrist: { x: 0.53, y: 0.37 } }
    const crop = { x: 0.31, y: 0, w: 0.69, h: 0.58 }
    const fwd = tossSearchBand(band, { forward: 1, statureNorm, crop, contact }, 'side', aspect)!
    expect(fwd.x0).toBe(band.x0)
    expect(fwd.x1).toBeCloseTo(band.x1 + reach, 9)
    // The ball at contact on dist12-s1 was at x 0.566, past the old edge (0.559).
    expect(fwd.x1).toBeGreaterThan(0.6)
    expect(fwd.y0).toBe(band.y0)
    expect(fwd.y1).toBe(band.y1)
    const back = tossSearchBand(band, { forward: -1, statureNorm, crop, contact }, 'side', aspect)!
    expect(back.x0).toBeCloseTo(band.x0 - reach, 9)
    expect(back.x1).toBeGreaterThanOrEqual(band.x1)
    const unknown = tossSearchBand(band, { forward: 0, statureNorm, crop, contact }, 'side', aspect)!
    expect(unknown.x0).toBeCloseTo(band.x0 - reach, 9)
    expect(unknown.x1).toBeCloseTo(band.x1 + reach, 9)
    // A contact wrist outside the band is always covered.
    const far = tossSearchBand(band, { forward: -1, statureNorm, crop, contact: { ...contact, wrist: { x: 0.8, y: 0.37 } } }, 'side', aspect)!
    expect(far.x1).toBeGreaterThanOrEqual(0.8)
    // Other views keep the setup band.
    expect(tossSearchBand(band, { forward: 1, statureNorm, crop, contact }, 'rear', aspect)).toBe(band)
    expect(tossSearchBand(null, { forward: 1, statureNorm, crop, contact }, 'rear', aspect)).toBeNull()
    // No setup band in the side view: the whole window crop, never the corridor alone (the ball
    // was lost at its apex on 6 of 45 serves when the band-plus-corridor phase had no band).
    const whole = tossSearchBand(null, { forward: 1, statureNorm, crop, contact }, 'side', aspect)!
    expect(whole.x0).toBeCloseTo(crop.x, 9)
    expect(whole.x1).toBeCloseTo(crop.x + crop.w, 9)
    expect(whole.y0).toBe(0)
    expect(whole.y1).toBeCloseTo(crop.h, 9)
  })

  it('ballSearchCrop: the side view crops to the toss band and corridor plus a margin, never beyond the window crop', () => {
    const crop = { x: 0.1, y: 0, w: 0.8, h: 0.7 }
    const toss = { x0: 0.3, y0: 0, x1: 0.55, y1: 0.5 }
    const corridor = { x0: 0.45, y0: 0.3, x1: 0.95, y1: 0.55 }
    const tight = ballSearchCrop(crop, toss, corridor, 'side', 0.5625, 0.02)
    expect(tight.x).toBeCloseTo(0.3 - 0.02 / 0.5625, 9)
    expect(tight.y).toBe(0)
    expect(tight.x + tight.w).toBeCloseTo(0.9, 9) // clipped to the window crop
    expect(tight.y + tight.h).toBeCloseTo(0.57, 9)
    // Other views, or a missing band or corridor, keep the window crop.
    expect(ballSearchCrop(crop, toss, corridor, 'rear', 0.5625, 0.02)).toBe(crop)
    expect(ballSearchCrop(crop, null, corridor, 'side', 0.5625, 0.02)).toBe(crop)
    expect(ballSearchCrop(crop, toss, null, 'side', 0.5625, 0.02)).toBe(crop)
  })
})
