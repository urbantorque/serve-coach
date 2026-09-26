import { describe, expect, it } from 'vitest'
import type { Landmark } from '../types.ts'
import { localisePeople } from './localise.ts'
import { type FrameSize, type PixelRect, frameLandmarkToCrop } from './roi.ts'
import { buildServeFixture } from './servePoseFixture.ts'
import { ServerTracker, bodyBoxHU, type PoseCandidate } from './tracking.ts'

const PORTRAIT: FrameSize = { width: 1080, height: 1920 }

function person(heightHU: number, centreX: number, floorY: number, frameIndex = 0): Landmark[] {
  const fixture = buildServeFixture({ fps: 30, view: 'side', frameAspect: 9 / 16, heightHU, floorY, centreX, durationS: 1 })
  return fixture.frames[frameIndex].landmarks!.map((lm) => ({ ...lm, visibility: 0.9 }))
}

interface FakeWorld {
  people: Landmark[][]
  /** A bogus pose returned only for the full frame (a detector false positive). */
  spurious?: Landmark[]
  /** The detector finds a person only when its height is at least this fraction of the input's long side. */
  minRelativeHeight?: number
}

/**
 * Stand-in for MediaPipe: finds a person when at least 80% of its body box is inside the
 * rectangle and it is tall enough relative to the rectangle (the detector's scale limit),
 * and reports the exact landmarks in rectangle-normalised coordinates.
 */
function fakeDetector(world: FakeWorld, log: PixelRect[] = []) {
  return async (rect: PixelRect): Promise<PoseCandidate[]> => {
    log.push(rect)
    const out: PoseCandidate[] = []
    for (const lms of world.people) {
      const box = bodyBoxHU(lms, PORTRAIT.width / PORTRAIT.height, 0)!
      const px = { x0: (box.minX / (9 / 16)) * 1080, x1: (box.maxX / (9 / 16)) * 1080, y0: box.minY * 1920, y1: box.maxY * 1920 }
      const ix = Math.max(0, Math.min(px.x1, rect.x + rect.width) - Math.max(px.x0, rect.x))
      const iy = Math.max(0, Math.min(px.y1, rect.y + rect.height) - Math.max(px.y0, rect.y))
      const inside = (ix * iy) / ((px.x1 - px.x0) * (px.y1 - px.y0))
      const relativeHeight = (px.y1 - px.y0) / Math.max(rect.width, rect.height)
      if (inside >= 0.8 && relativeHeight >= (world.minRelativeHeight ?? 0.3)) {
        out.push({ landmarks: lms.map((lm) => frameLandmarkToCrop(lm, rect, PORTRAIT)) })
      }
    }
    if (world.spurious && rect.width === PORTRAIT.width && rect.height === PORTRAIT.height) out.push({ landmarks: world.spurious })
    return out
  }
}

describe('localisePeople', () => {
  it('finds a far (small) server that the full frame misses, via a level-1 tile, and returns its exact landmarks', async () => {
    const server = person(0.147, 0.5, 0.72) // ~282 px tall: 12 m in the feasibility renders
    const log: PixelRect[] = []
    // Detectable at >= 20% of the input's long side: missed in 1920 px, found in a 1080 px tile.
    const result = await localisePeople(PORTRAIT, fakeDetector({ people: [server], minRelativeHeight: 0.2 }, log))
    expect(result.people).toHaveLength(1)
    expect(result.levelReached).toBe(1)
    result.people[0].landmarks.forEach((lm, i) => {
      expect(lm.x).toBeCloseTo(server[i].x, 12)
      expect(lm.y).toBeCloseTo(server[i].y, 12)
    })
    // 1 full frame + 3 tiles + 1 verification crop (the three tile detections are one person).
    expect(result.detectorRuns).toBe(5)
    expect(log.at(-1)!.width).toBeLessThan(600)
  })

  it('rejects a spurious full-frame detection that is not found again in its own crop', async () => {
    const server = person(0.147, 0.5, 0.72)
    const spurious = person(0.1, 0.15, 0.2).map((lm) => ({ ...lm, visibility: 0.95 }))
    const result = await localisePeople(PORTRAIT, fakeDetector({ people: [server], spurious }))
    expect(result.people).toHaveLength(1)
    expect(result.people[0].landmarks[0].x).toBeCloseTo(server[0].x, 12)
  })

  it('stops after level 1 for a near player, and de-duplicates the overlapping detections', async () => {
    const server = person(0.4, 0.5, 0.85)
    const result = await localisePeople(PORTRAIT, fakeDetector({ people: [server] }))
    expect(result.people).toHaveLength(1)
    expect(result.levelReached).toBe(1)
  })

  it('goes to level 2 when the player is too small for the level-1 tiles, and gives up cleanly when nobody is there', async () => {
    for (const [heightHU, minRelativeHeight] of [[0.147, 0.3], [0.09, 0.25]]) {
      const small = person(heightHU, 0.5, 0.7)
      const found = await localisePeople(PORTRAIT, fakeDetector({ people: [small], minRelativeHeight }))
      expect(found.levelReached).toBe(2)
      expect(found.people).toHaveLength(1)
      expect(found.people[0].landmarks[0].y).toBeCloseTo(small[0].y, 12)
    }
    const none = await localisePeople(PORTRAIT, fakeDetector({ people: [] }))
    expect(none.people).toHaveLength(0)
    expect(none.detectorRuns).toBe(1 + 3 + 15)
  })

  it('returns both people so the tracker rule (nearest the baseline centre) picks the server', async () => {
    const server = person(0.15, 0.5, 0.72)
    const bystander = person(0.16, 0.85, 0.74)
    const result = await localisePeople(PORTRAIT, fakeDetector({ people: [bystander, server] }))
    expect(result.people).toHaveLength(2)
    const decision = new ServerTracker({ frameAspect: 9 / 16 }).peek(result.people, 0)
    const chosen = result.people[decision.index!]
    expect(chosen.landmarks[0].x).toBeCloseTo(server[0].x, 9)
  })
})
