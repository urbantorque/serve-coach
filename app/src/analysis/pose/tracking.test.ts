import { describe, expect, it } from 'vitest'
import type { Landmark } from '../types.ts'
import { buildServeFixture } from './servePoseFixture.ts'
import { ServerTracker, bodyBoxHU, iou, trackServer, type PoseCandidate } from './tracking.ts'

const aspect = 16 / 9
const server = buildServeFixture({ fps: 30, view: 'rear', frameAspect: aspect, centreX: 0.5, heightHU: 0.5 })

/** The same serve, moved and scaled in the frame (a second person). */
function person(dx: number, scale = 1, anchorY = 0.85): (i: number) => PoseCandidate {
  return (i) => ({
    landmarks: server.frames[i].landmarks!.map(
      (lm): Landmark => ({ ...lm, x: 0.5 + (lm.x - 0.5) * scale + dx, y: anchorY + (lm.y - 0.85) * scale }),
    ),
  })
}

const theServer = person(0)

describe('boxes', () => {
  it('computes IoU', () => {
    const a = { minX: 0, minY: 0, maxX: 2, maxY: 2 }
    expect(iou(a, a)).toBe(1)
    expect(iou(a, { minX: 1, minY: 0, maxX: 3, maxY: 2 })).toBeCloseTo(1 / 3, 12)
    expect(iou(a, { minX: 5, minY: 5, maxX: 6, maxY: 6 })).toBe(0)
  })

  it('excludes the arms so the box barely changes during the swing', () => {
    const setup = bodyBoxHU(server.frames[10].landmarks!, aspect)!
    const contact = bodyBoxHU(server.frames[60].landmarks!, aspect)!
    expect(iou(setup, contact)).toBeGreaterThan(0.8)
  })
})

describe('ServerTracker', () => {
  it('acquires the person nearest the baseline centre, not the bigger bystander at the side', () => {
    const bystander = person(0.33, 1.3)
    const decisions = trackServer(
      server.frames.slice(0, 20).map((f, i) => ({ tReal: f.tReal, candidates: [bystander(i), theServer(i)] })),
      { frameAspect: aspect },
    )
    expect(decisions[0]).toMatchObject({ index: 1, reason: 'acquired' })
    expect(decisions.every((d) => d.index === 1)).toBe(true)
  })

  it('ignores a small far-away person standing exactly at the centre', () => {
    const farPlayer = person(0, 0.3, 0.4)
    const nearServer = person(0.12)
    const d = new ServerTracker({ frameAspect: aspect }).update([farPlayer(0), nearServer(0)], 0)
    expect(d.index).toBe(1)
  })

  it('uses an explicit baseline hint when given', () => {
    const left = person(-0.25)
    const right = person(0.25)
    const d = new ServerTracker({ frameAspect: aspect, baselineCentre: { x: 0.75 } }).update([left(0), right(0)], 0)
    expect(d.index).toBe(1)
  })

  it('follows the server through the whole serve when detection order flips', () => {
    const bystander = person(-0.3)
    const decisions = trackServer(
      server.frames.map((f, i) => ({
        tReal: f.tReal,
        candidates: i % 3 === 0 ? [theServer(i), bystander(i)] : [bystander(i), theServer(i)],
      })),
      { frameAspect: aspect },
    )
    decisions.forEach((d, i) => expect(d.index).toBe(i % 3 === 0 ? 0 : 1))
    expect(decisions.slice(1).every((d) => d.reason === 'continued')).toBe(true)
  })

  it('reports the server lost instead of switching to a bystander, then re-acquires', () => {
    const bystander = person(-0.3)
    const tracker = new ServerTracker({ frameAspect: aspect, reacquireAfterS: 0.3 })
    const frames = server.frames
    const results = frames.slice(0, 40).map((f, i) => {
      const missing = i >= 10 && i < 20 // server not detected for 10 frames (0.33 s)
      return tracker.update(missing ? [bystander(i)] : [bystander(i), theServer(i)], f.tReal)
    })
    expect(results[5]).toMatchObject({ index: 1, reason: 'continued' })
    // Lost for the whole gap, including after reacquireAfterS: the bystander is far away.
    for (let i = 10; i < 20; i++) expect(results[i]).toMatchObject({ index: null, reason: 'lost' })
    expect(results[20]).toMatchObject({ index: 1, reason: 'reacquired' })
    expect(results.slice(21).every((r) => r.index === 1 && r.reason === 'continued')).toBe(true)
  })

  it('starts over from the baseline hint after forgetAfterS', () => {
    const bystander = person(-0.3)
    const tracker = new ServerTracker({ frameAspect: aspect, forgetAfterS: 1 })
    expect(tracker.update([theServer(0)], 0).index).toBe(0)
    expect(tracker.update([bystander(1)], 0.9).reason).toBe('lost')
    const fresh = tracker.update([bystander(2)], 1.2)
    expect(fresh).toMatchObject({ index: 0, reason: 'reacquired' })
  })

  it('handles frames with no candidates', () => {
    const tracker = new ServerTracker({ frameAspect: aspect })
    expect(tracker.update([], 0)).toMatchObject({ index: null, reason: 'no-candidates' })
    expect(tracker.update([theServer(0)], 0.033)).toMatchObject({ index: 0, reason: 'acquired', confidence: 1 })
  })

  it('peek() gives the decision update() would make, without changing the track', () => {
    const bystander = person(0.33, 1.3)
    const tracker = new ServerTracker({ frameAspect: aspect })
    const candidates = [bystander(0), theServer(0)]
    expect(tracker.peek(candidates, 0)).toMatchObject({ index: 1, reason: 'acquired' })
    expect(tracker.peek(candidates, 0)).toMatchObject({ index: 1, reason: 'acquired' }) // still not acquired
    expect(tracker.update(candidates, 0)).toMatchObject({ index: 1, reason: 'acquired' })
    // After a gap the peek is a re-acquisition near the last position, and the bystander alone is refused.
    expect(tracker.peek([bystander(30)], 1)).toMatchObject({ index: null, reason: 'lost' })
    expect(tracker.peek([bystander(30), theServer(30)], 1)).toMatchObject({ index: 1, reason: 'reacquired' })
    expect(tracker.update([theServer(1)], 0.033)).toMatchObject({ index: 0, reason: 'continued' })
  })
})
