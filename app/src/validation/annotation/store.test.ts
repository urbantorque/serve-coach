import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ServeAnalysis } from '../../data/domain.ts'
import { getDb, resetDbForTests } from '../../data/db.ts'
import { deleteServe } from '../../data/deletion.ts'
import { buildExportJSON } from '../../data/export.ts'
import type { SessionRecord, VideoRecord } from '../../data/records.ts'
import { buildValidationExport, validationFileName } from './export.ts'
import { emptyDraft, setEvent, setPoint, stepById, toAnnotation } from './marks.ts'
import { deleteCheck, gatherChecks, getCheck, listChecks, listChecksForServe, markRevealed, saveCheck } from './store.ts'

const NOW = '2026-09-27T01:00:00.000Z'

function serve(id: string, sessionId: string): ServeAnalysis {
  return {
    schemaVersion: 1,
    id,
    sessionId,
    videoId: `${sessionId}-video`,
    index: 1,
    mode: 'practice',
    view: 'side',
    handedness: 'right',
    window: { startFrame: 0, endFrame: 300, tStartReal: 0, tEndReal: 5 },
    detection: { confidence: 0.9, cues: {}, kind: 'serve', anchor: 'contact' },
    events: {
      tossRelease: { frameIndex: 101, tReal: 101 / 60, uncertaintyS: 0.01, confidence: 0.9, method: 't' },
      contact: { frameIndex: 158, tReal: 158 / 60, uncertaintyS: 0.01, confidence: 0.9, method: 't' },
    },
    phases: [],
    rectification: { status: 'level', source: 'none', orientation: 'portrait', fovDeg: 60, fovSource: 'lens-default' },
    toss: null,
    contact: null,
    legDrive: null,
    shoulder: null,
    rear: null,
    landing: null,
    audio: { usable: false },
    speed: null,
    metrics: { 'rhythm-release-to-contact': { id: 'rhythm-release-to-contact', value: 950, unit: 'ms', status: 'measured', confidence: 0.9, basis: 't' } },
    quality: {} as ServeAnalysis['quality'],
    plausibility: { hardRejects: [], softFlags: [] },
    included: true,
    exclusions: [],
    keyFrames: {},
    engine: { engineVersion: 'e1', contract: 1, catalogueVersion: '1.1.0', poseModel: 'm', poseBackend: 'cpu', decodePath: 'webcodecs', analysedAt: NOW, durationMs: 1, paramsHash: 'p', bandsVersion: 'b' },
  } as unknown as ServeAnalysis
}

async function seed(sessionId: string, isDemo: 0 | 1) {
  const db = getDb()
  const s = serve(`${sessionId}-serve-1`, sessionId)
  await db.sessions.put({ id: sessionId, createdAt: NOW, startedAt: NOW, visitId: '2026-09-27', status: 'analysed', mode: 'practice', view: 'side', isRetest: 0, isDemo } as unknown as SessionRecord)
  await db.serves.put({ ...s, includedFlag: 1 })
  await db.videos.put({
    id: s.videoId,
    sessionId,
    role: 'primary',
    source: 'file-import',
    capture: { source: 'import', declaredView: 'side', serveSide: 'deuce', serveNumber: 1, handedness: 'right', playerHeightM: 1.8, playerHeightSource: 'entered', conditions: { light: 'lights' } },
    fileName: 'x.mp4',
    sizeBytes: 1,
    fingerprint: 'fp-1',
    meta: { fileName: 'x.mp4', durationMediaS: 5, width: 1080, height: 1920, rotationDeg: 0, hasAudio: false, nominalFps: 60, captureFps: 60, timeScale: 1, fpsSource: 'container', isVariableFrameRate: false, frameCount: 300 },
    importedAt: NOW,
    storage: 'idb',
    retention: { policy: 'keep', pinned: 0 },
    audio: 'removed',
    isDemo,
  } as VideoRecord)
  let d = setEvent(emptyDraft(), 'tossRelease', 100)
  d = setEvent(d, 'contact', 157)
  d = setPoint(d, stepById('standing'), 'headTopSetup', { frameIndex: 20, x: 0.5, y: 0.6 })
  d = setPoint(d, stepById('standing'), 'floorSetup', { frameIndex: 20, x: 0.5, y: 0.8 })
  const a = toAnnotation(d, { serveId: s.id, sessionId, videoId: s.videoId, initials: 'RD', role: 'player', captureFps: 60, now: NOW })
  await saveCheck(a)
  return { serve: s, annotation: a }
}

beforeEach(async () => {
  await resetDbForTests()
})

describe('check storage', () => {
  it('saves, lists, marks the reveal once, and deletes', async () => {
    const { serve: s, annotation } = await seed('real', 0)
    expect(await getCheck(annotation.id)).toEqual(annotation)
    expect((await listChecksForServe(s.id)).map((a) => a.id)).toEqual([annotation.id])
    await markRevealed(annotation.id, '2026-09-27T02:00:00.000Z')
    await markRevealed(annotation.id, '2026-09-27T03:00:00.000Z')
    expect((await getCheck(annotation.id))!.revealedAt).toBe('2026-09-27T02:00:00.000Z')
    // Other annotation rows (not from Check this serve) are ignored.
    await getDb().annotations.put({ id: 'other', sessionId: 'real', videoId: 'v', annotator: 'X', createdAt: NOW, tool: 'in-app@1', captureFps: 60, events: {}, points: {} })
    expect((await listChecks()).map((a) => a.id)).toEqual([annotation.id])
    await deleteCheck(annotation.id)
    expect(await listChecks()).toEqual([])
  })

  it('deleting the serve removes its checks; the player export already includes them', async () => {
    const { serve: s, annotation } = await seed('real', 0)
    const exported = await buildExportJSON({ now: new Date(NOW) } as never).catch(() => null)
    if (exported) expect(JSON.stringify(exported)).toContain(annotation.id)
    await deleteServe(s.id)
    expect(await listChecks()).toEqual([])
  })

  it('gathers what the validation export needs and leaves sample sessions out of the file', async () => {
    await seed('real', 0)
    await seed('demo', 1)
    const gathered = await gatherChecks()
    expect(gathered).toHaveLength(2)
    const file = buildValidationExport(
      gathered.map((g) => ({ ...g, appPoints: {}, appStandingNorm: 0.205 })),
      { now: new Date(NOW), subjectKey: 'abc123' },
    )
    expect(file.counts).toEqual({ entries: 1, annotators: 1, sampleLeftOut: 1 })
    const e = file.entries[0]
    expect(e.subject).toEqual({ key: 'abc123', handedness: 'right', heightM: 1.8, heightSource: 'entered' })
    expect(e.clip).toMatchObject({ fingerprint: 'fp-1', width: 1080, height: 1920, nominalFps: 60, light: 'lights', orientation: 'portrait' })
    expect(e.app.events.tossRelease.frameIndex).toBe(101)
    expect(e.app.metrics['rhythm-release-to-contact'].status).toBe('measured')
    expect(e.derived.you.metrics['rhythm-release-to-contact']).toBeCloseTo(57 * (1000 / 60), 6)
    expect(e.derived.rows.find((r) => r.id === 'event:tossRelease')!.diff).toEqual({ frames: 1, ms: expect.closeTo(16.67, 1) })
    // Nothing identifying: no file names, no profile, no notes about the body.
    const text = JSON.stringify(file.entries)
    expect(text).not.toContain('x.mp4')
    expect(text).not.toMatch(/comfort|pain/i)
    expect(validationFileName(new Date(2026, 8, 27, 10))).toBe('serve-coach-validation@1-2026-09-27.json')
  })
})
