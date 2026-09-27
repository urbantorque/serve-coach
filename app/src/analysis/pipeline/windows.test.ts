import { describe, expect, it } from 'vitest'
import { servePoses } from './testPoses.ts'
import {
  activitySpans,
  ballIndices,
  forwardDirection,
  framesInSpans,
  frameAt,
  planWindows,
  poseIndices,
  provisionalContact,
  sparseStep,
  statureFromPoses,
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
})
