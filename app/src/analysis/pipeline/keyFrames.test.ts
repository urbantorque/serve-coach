import { describe, expect, it } from 'vitest'
import type { ServeAnalysis } from '../../data/domain.ts'
import type { EventEstimate } from '../types.ts'
import type { BitmapFrame, FrameSelection } from '../video/frameTypes.ts'
import { evidenceCrop, eventFrames, extractKeyFrames, outputSize, planKeyFrames, squareCrop } from './keyFrames.ts'
import { servePoses } from './testPoses.ts'

const ev = (frameIndex: number): EventEstimate => ({ frameIndex, tReal: frameIndex / 60, uncertaintyS: 0.01, confidence: 0.8, method: 'test' })

function serve(id: string, index: number, events: ServeAnalysis['events'], included = true): ServeAnalysis {
  return {
    id,
    index,
    events,
    phases: [{ phase: 'drive', startFrame: 125, endFrame: 131, keyFrame: 128, confidence: 0.8 }],
    included,
    toss: null,
    contact: null,
    window: { startFrame: 0, endFrame: 228, tStartReal: 0, tEndReal: 3.8 },
  } as unknown as ServeAnalysis
}

describe('eventFrames', () => {
  it('maps engine events to key-frame events and drops out-of-range frames', () => {
    const s = serve('a', 1, { motionStart: ev(40), tossRelease: ev(70), tossApex: ev(110), contact: ev(132), landing: ev(900) })
    expect(eventFrames(s, 240)).toEqual({ setup: 40, release: 70, apex: 110, contact: 132 })
  })
})

describe('planKeyFrames', () => {
  it('plans a thumb per event, evidence for apex/trophy/lowestHip/contact, and one session thumb', () => {
    const poses = servePoses()
    const a = serve('s1', 1, { tossRelease: ev(70), tossApex: ev(110), lowestHip: ev(128), contact: ev(132) })
    const b = serve('s2', 2, { contact: ev(150) }, false)
    const plan = planKeyFrames({ sessionId: 'sess', serves: [a, b], posesByServe: new Map([['s1', poses], ['s2', poses]]), frameCount: 240, aspect: 9 / 16, representativeServeId: 's1' })
    const roles = (serveId: string, role: string) => plan.requests.filter((r) => r.serveId === serveId && r.role === role).map((r) => r.event)
    expect(roles('s1', 'thumb')).toEqual(['release', 'apex', 'lowestHip', 'contact'])
    expect(roles('s1', 'evidence')).toEqual(['apex', 'lowestHip', 'contact'])
    expect(plan.byServe.get('s1')?.apex).toEqual({ thumbId: 's1-apex-thumb', evidenceId: 's1-apex-evidence' })
    expect(plan.byServe.get('s1')?.release).toEqual({ thumbId: 's1-release-thumb' })
    const sessionThumb = plan.requests.filter((r) => r.role === 'session-thumb')
    expect(sessionThumb).toHaveLength(1)
    expect(sessionThumb[0]).toMatchObject({ serveId: 's1', event: 'contact', square: true, id: 'sess-session-thumb' })
    expect(plan.requests.find((r) => r.id === 's1-lowestHip-thumb')?.phase).toBe('drive')
  })
})

describe('crops and sizes', () => {
  it('evidence crop includes the toss apex and pads the player', () => {
    const poses = servePoses()
    const crop = evidenceCrop({ toss: { apexXY: { x: 0.42, y: 0.05 } } as ServeAnalysis['toss'], contact: null }, poses, 9 / 16)!
    expect(crop.y).toBeLessThan(0.05) // above the apex, with head-room padding
    expect(crop.x).toBeLessThan(0.4)
    expect(crop.y + crop.h).toBeGreaterThan(0.77)
    expect(squareCrop(poses[0], 9 / 16)).toBeDefined()
  })

  it('output size caps the long side, never upscales, and squares on request', () => {
    expect(outputSize(undefined, 1080, 1920, 480)).toMatchObject({ width: 270, height: 480, sw: 1080, sh: 1920 })
    expect(outputSize({ x: 0, y: 0, w: 0.1, h: 0.1 }, 1080, 1920, 480)).toMatchObject({ width: 108, height: 192 })
    expect(outputSize({ x: 0.2, y: 0.2, w: 0.5, h: 0.3 }, 1080, 1920, 160, true)).toMatchObject({ width: 160, height: 160 })
  })
})

describe('extractKeyFrames', () => {
  it('decodes each frame once in order, encodes every request and closes bitmaps', async () => {
    const closed: number[] = []
    const selections: FrameSelection[] = []
    const source = {
      meta: {} as never,
      frameTimes: [],
      async *bitmaps(selection: FrameSelection = {}) {
        selections.push(selection)
        for (const index of (selection as { indices: number[] }).indices) {
          const bitmap = { width: 1080, height: 1920, close: () => closed.push(index) } as unknown as ImageBitmap
          yield { index, tMedia: index / 60, tReal: index / 60, bitmap, pendingRotationDeg: 0 } satisfies BitmapFrame
        }
      },
    }
    const encoded: string[] = []
    const plan = planKeyFrames({
      sessionId: 'sess',
      serves: [serve('s1', 1, { tossApex: ev(110), contact: ev(132) })],
      posesByServe: new Map([['s1', servePoses()]]),
      frameCount: 240,
      aspect: 9 / 16,
    })
    const records = await extractKeyFrames(source, plan.requests, {
      encoder: async (_image, region, quality) => {
        encoded.push(`${region.width}x${region.height}@${quality}`)
        return new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
      },
    })
    expect(selections).toEqual([{ indices: [110, 132] }])
    expect(closed).toEqual([110, 132])
    expect(records.map((r) => r.id).sort()).toEqual(['s1-apex-evidence', 's1-apex-thumb', 's1-contact-evidence', 's1-contact-thumb', 'sess-session-thumb'].sort())
    expect(records.every((r) => r.blob.type === 'image/jpeg' && r.width > 0)).toBe(true)
    expect(encoded).toContain('270x480@0.72')
  })
})
