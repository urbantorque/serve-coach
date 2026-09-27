// A session deleted while it is being analysed (Profile > Storage > Delete session) leaves nothing
// behind: the run neither writes its results nor recreates the session (ARCHITECTURE §8.3; D8).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyseWindow, type BallWindowResult } from '../analysis/ball/workerCore.ts'
import { analyseSessionDouble } from '../analysis/pipeline/e2e/testDoubleEngine.ts'
import { defaultDeps, runAnalysis, type PipelineDeps } from '../analysis/pipeline/orchestrator.ts'
import type { BallClient, PoseEstimator } from '../analysis/pipeline/passes.ts'
import { servePoseAt } from '../analysis/pipeline/testPoses.ts'
import type { PoseInputFrame } from '../analysis/pose/poseSource.ts'
import type { PoseFrame, VideoMeta } from '../analysis/types.ts'
import type { BitmapFrame, FrameSelection, FrameSource, RawFrame } from '../analysis/video/frameTypes.ts'
import { getDb, resetDbForTests } from '../data/db.ts'
import { deleteSession } from '../data/deletion.ts'
import { createSession } from '../data/repos/sessions.ts'

const CONTACT_T = 2.2

function indicesOf(sel: FrameSelection = {}, n: number): number[] {
  if ('indices' in sel) return [...sel.indices]
  if ('startReal' in sel) throw new Error('not used')
  const out: number[] = []
  for (let i = sel.startIndex ?? 0; i <= (sel.endIndex ?? n - 1); i += sel.step ?? 1) out.push(i)
  return out
}

function fakeSource(): FrameSource {
  const n = 240
  const fps = 60
  let meta: VideoMeta = { fileName: 'clip.mp4', durationMediaS: n / fps, width: 1080, height: 1920, rotationDeg: 0, hasAudio: false, nominalFps: fps, captureFps: fps, timeScale: 1, fpsSource: 'timestamps', isVariableFrameRate: false, frameCount: n }
  const frameTimes = Array.from({ length: n }, (_, index) => ({ index, tMedia: index / fps }))
  return {
    path: 'webcodecs',
    pathReason: 'test',
    frameTimes,
    get meta() {
      return meta
    },
    setMeta(m) {
      meta = m
    },
    async *rawFrames(sel) {
      for (const index of indicesOf(sel, n)) {
        const frame: RawFrame = { index, tMedia: index / fps, tReal: (index / fps) * meta.timeScale, image: { displayWidth: 1080, displayHeight: 1920 } as unknown as VideoFrame, width: 1080, height: 1920, pendingRotationDeg: 0, close: () => undefined }
        yield frame
        await Promise.resolve()
      }
    },
    // eslint-disable-next-line require-yield
    async *frames() {
      throw new Error('not used')
    },
    async *bitmaps(sel) {
      for (const index of indicesOf(sel, n)) {
        const bitmap = { width: 1080, height: 1920, close: () => undefined } as unknown as ImageBitmap
        yield { index, tMedia: index / fps, tReal: (index / fps) * meta.timeScale, bitmap, pendingRotationDeg: 0 } satisfies BitmapFrame
      }
    },
    close() {},
  }
}

function fakePose(): PoseEstimator {
  return {
    async init() {},
    async *estimate(frames: AsyncIterable<PoseInputFrame>) {
      for await (const f of frames) {
        const pose: PoseFrame = { frameIndex: f.frameIndex, tReal: f.tReal, landmarks: servePoseAt(f.tReal, CONTACT_T), score: 0.9, source: 'injected' }
        yield pose
      }
    },
    async dispose() {},
    stats: () => ({ backend: 'test', detectErrors: [] }),
  } as unknown as PoseEstimator
}

function fakeBall(): BallClient {
  return {
    backend: 'main-thread',
    async begin() {},
    async pushFrame(_w, _f, _t, image) {
      if ('close' in image) image.close()
    },
    async end(windowId, options) {
      const r: BallWindowResult = analyseWindow(windowId, [], options)
      return {
        ...r,
        toss: {
          status: 'ok',
          confidence: 0.8,
          gravity: { status: 'ok' } as never,
          release: { tReal: 1.2, frameIndex: 72, uncertaintyS: 0.01, x: 0.43, y: 0.3, confidence: 0.8, method: 'test' },
          apex: { tReal: 1.8, frameIndex: 108, uncertaintyS: 0.004, x: 0.43, y: 0.05, confidence: 0.8 } as never,
        },
        events: {
          tossRelease: { frameIndex: 72, tReal: 1.2, uncertaintyS: 0.01, confidence: 0.8, method: 'test' },
          tossApex: { frameIndex: 108, tReal: 1.8, uncertaintyS: 0.004, confidence: 0.8, method: 'test' },
          contact: { frameIndex: 132, tReal: 2.2, uncertaintyS: 0.005, confidence: 0.8, method: 'test' },
        },
        timeBase: { status: 'consistent', timeScale: 1, basis: 'test' },
      }
    },
    dispose() {},
  } as BallClient
}

const deps: PipelineDeps = {
  ...defaultDeps,
  probe: async () => undefined,
  openFrameSource: async () => fakeSource(),
  createPoseSource: async () => fakePose(),
  createBallClient: async () => fakeBall(),
  engine: { findServeWindows: () => [{ startReal: 0, endReal: 3.8, confidence: 0.9 }], analyseSession: analyseSessionDouble },
  encoder: async () => new Blob([new Uint8Array(64)], { type: 'image/jpeg' }),
  coaching: async () => ({ status: 'skipped', reason: 'test' }),
  now: () => performance.now(),
}

beforeEach(async () => {
  await resetDbForTests()
  vi.stubGlobal('createImageBitmap', async () => ({ width: 64, height: 64, close: () => undefined }))
})

async function rowsFor(sessionId: string) {
  const db = getDb()
  const count = (t: { where: (k: string) => { equals: (v: string) => { count: () => Promise<number> } } }) => t.where('sessionId').equals(sessionId).count()
  return {
    session: (await db.sessions.get(sessionId)) ? 1 : 0,
    serves: await count(db.serves as never),
    tracks: await count(db.tracks as never),
    keyFrames: await count(db.keyFrames as never),
    stats: (await db.sessionStats.get(sessionId)) ? 1 : 0,
    coaching: await count(db.coaching as never),
    videos: await count(db.videos as never),
    videoBlobs: await db.videoBlobs.count(),
    jobs: await count(db.jobs as never),
  }
}

const NOTHING = { session: 0, serves: 0, tracks: 0, keyFrames: 0, stats: 0, coaching: 0, videos: 0, videoBlobs: 0, jobs: 0 }

describe('deleting a session while it is analysing', () => {
  it('mid-run: the run stops as cancelled and writes no serves, tracks, key frames, stats, video or job', async () => {
    await createSession({ id: 'S1', startedAt: new Date().toISOString(), status: 'queued', mode: 'technique', view: 'side' } as never)
    let deletion = null as Promise<{ removed: boolean }> | null
    const file = new File([new Uint8Array(4096)], 'serve.mp4', { type: 'video/mp4' })
    const run = runAnalysis(
      file,
      {
        sessionId: 'S1',
        profile: { heightM: 1.8, handedness: 'right' },
        view: 'side',
        onProgress: (e) => {
          // The player taps Delete session in Profile > Storage while the body is being tracked.
          if (!deletion && e.type === 'progress' && e.progress.step === 'tracking-body') deletion = deleteSession('S1')
        },
      },
      deps,
    )
    await expect(run).rejects.toMatchObject({ code: 'cancelled' })
    expect((await deletion)?.removed).toBe(true)
    expect(await rowsFor('S1')).toEqual(NOTHING)
  })

  it('while queued: the run never recreates the deleted session', async () => {
    await createSession({ id: 'S2', startedAt: new Date().toISOString(), status: 'queued', mode: 'technique', view: 'side' } as never)
    await deleteSession('S2')
    const file = new File([new Uint8Array(4096)], 'serve.mp4', { type: 'video/mp4' })
    await expect(runAnalysis(file, { sessionId: 'S2', profile: { heightM: 1.8, handedness: 'right' }, view: 'side' }, deps)).rejects.toMatchObject({ code: 'cancelled' })
    expect(await rowsFor('S2')).toEqual(NOTHING)
  })
})
