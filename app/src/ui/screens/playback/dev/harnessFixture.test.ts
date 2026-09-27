import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { landmarksAt } from '../../../components/video/tracks.ts'
import { ballTrackFrom, fixtureServe, fixtureVideo, poseTrackFrom, type PlaybackFixture } from './harnessFixture.ts'

const load = (clip: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'src/ui/screens/playback/dev/fixtures', `${clip}.json`), 'utf8')) as PlaybackFixture

describe('dev playback fixture (real engine output on synthetic clips)', () => {
  const f = load('baseline-s1')

  it('packs poses as frames x 33 x (x, y, v) with the face left empty', () => {
    const pose = poseTrackFrom(f)
    expect(pose.frameIndices.length).toBe(f.pose.frames.length)
    expect(pose.xyv.length).toBe(pose.frameIndices.length * 33 * 3)
    const lm = landmarksAt(pose, 120)!
    expect(lm[0]).toBeNull() // nose: never drawn, never stored in the fixture
    expect(lm[11]).not.toBeNull()
    expect(pose.bodyHeightHU).toBeGreaterThan(0.2)
  })

  it('merges ball tracks in frame order with kinds and the toss fit', () => {
    const ball = ballTrackFrom(f)
    for (let i = 1; i < ball.frameIndices.length; i++) expect(ball.frameIndices[i]).toBeGreaterThanOrEqual(ball.frameIndices[i - 1])
    expect([...ball.kind]).toContain(0)
    expect(ball.tossFit).toBeDefined()
  })

  it('derives ordered events and seven contiguous phases around the engine events', () => {
    const { serve } = fixtureServe(f, { sessionId: 'dev-x', index: 1, videoId: 'dev-x-video', analysedAt: '2026-09-27T00:00:00Z' })
    const e = serve.events
    expect(e.tossRelease!.frameIndex).toBe(107)
    expect(e.tossApex!.frameIndex).toBe(144)
    expect(e.contact!.frameIndex).toBeGreaterThan(e.tossApex!.frameIndex)
    expect(e.trophy!.frameIndex).toBeGreaterThan(e.tossRelease!.frameIndex)
    expect(e.trophy!.frameIndex).toBeLessThan(e.contact!.frameIndex)
    expect(e.landing!.frameIndex).toBeGreaterThanOrEqual(e.contact!.frameIndex)
    expect(serve.phases.map((p) => p.phase)).toEqual(['setup', 'toss', 'loading', 'drive', 'contact', 'landing', 'recovery'])
    for (let i = 1; i < serve.phases.length; i++) expect(serve.phases[i].startFrame).toBeGreaterThan(serve.phases[i - 1].startFrame)
  })

  it('every per-serve value carries a status, and side-view band slots say why they are empty', () => {
    const { serve } = fixtureServe(f, { sessionId: 'dev-x', index: 1, videoId: 'dev-x-video', analysedAt: '2026-09-27T00:00:00Z' })
    for (const [id, v] of Object.entries(serve.metrics)) {
      expect(v!.status, id).toBeTruthy()
      if (v!.status === 'unavailable') expect(v!.reasonCode, id).toBeTruthy()
    }
    expect(serve.metrics['knee-bend-band']?.reasonCode).toBe('NEEDS_REAR_VIEW')
    expect(serve.metrics.spin?.status).toBe('unavailable')
    expect(serve.metrics['speed-experimental']?.status).toBe('unavailable')
    // Plausible values on a clean synthetic serve (METRICS plausibility bounds).
    const ratio = serve.metrics['contact-height-ratio']!.value as number
    expect(ratio).toBeGreaterThan(1.2)
    expect(ratio).toBeLessThan(1.62)
    const rhythm = serve.metrics['rhythm-release-to-contact']!.value as number
    expect(rhythm).toBeGreaterThan(600)
    expect(rhythm).toBeLessThan(1400)
  })

  it('a landscape clip and a deleted video keep their shape', () => {
    const land = load('fence9-s1')
    const v = fixtureVideo(land, { id: 'v', sessionId: 's', importedAt: '2026-09-01T00:00:00Z', sizeBytes: 1, storage: 'deleted' })
    expect(v.capture.orientation).toBe('landscape')
    expect(v.deletedReason).toBe('retention')
  })
})
