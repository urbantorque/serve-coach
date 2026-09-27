import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, resetDbForTests } from '../../data/db.ts'
import { getStats } from '../../data/repos/coaching.ts'
import { listKeyFramesForServe, getSessionThumb } from '../../data/repos/keyFrames.ts'
import { getTrack, listServesBySession } from '../../data/repos/serves.ts'
import { createSession, getSession } from '../../data/repos/sessions.ts'
import { listVideosBySession } from '../../data/repos/videos.ts'
import { mp4WithAudio } from '../../data/mp4Fixture.ts'
import { analyseWindow, type BallWindowResult } from '../ball/workerCore.ts'
import type { TimeBaseSuggestion } from '../ball/analyse.ts'
import type { PoseInputFrame } from '../pose/poseSource.ts'
import type { PoseFrame, VideoMeta } from '../types.ts'
import type { BitmapFrame, FrameSelection, FrameSource, RawFrame } from '../video/frameTypes.ts'
import { analyseSessionDouble } from './e2e/testDoubleEngine.ts'
import { AnalysisError } from './errors.ts'
import { defaultDeps, runAnalysis, type PipelineDeps } from './orchestrator.ts'
import type { BallClient, PoseEstimator } from './passes.ts'
import { servePoseAt } from './testPoses.ts'
import type { PipelineEvent, PipelineProgress } from './types.ts'

const CONTACT_T = 2.2

function indicesOf(sel: FrameSelection = {}, n: number): number[] {
  if ('indices' in sel) return [...sel.indices]
  if ('startReal' in sel) throw new Error('not used')
  const out: number[] = []
  for (let i = sel.startIndex ?? 0; i <= (sel.endIndex ?? n - 1); i += sel.step ?? 1) out.push(i)
  return out
}

function fakeSource(options: { frames?: number; fps?: number; hasAudio?: boolean } = {}) {
  const n = options.frames ?? 240
  const fps = options.fps ?? 60
  let meta: VideoMeta = {
    fileName: 'clip.mp4',
    durationMediaS: n / fps,
    width: 1080,
    height: 1920,
    rotationDeg: 0,
    hasAudio: options.hasAudio ?? false,
    nominalFps: fps,
    captureFps: fps,
    timeScale: 1,
    fpsSource: 'timestamps',
    isVariableFrameRate: false,
    frameCount: n,
  }
  const state = { rawOpen: 0, rawMaxOpen: 0, closed: false, decoded: 0 }
  const frameTimes = Array.from({ length: n }, (_, index) => ({ index, tMedia: index / fps }))
  const source: FrameSource = {
    path: 'webcodecs',
    pathReason: 'test',
    frameTimes,
    get meta() {
      return meta
    },
    setMeta(m) {
      meta = m
    },
    async *rawFrames(sel, opts) {
      for (const index of indicesOf(sel, n)) {
        if (opts?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        state.decoded++
        state.rawOpen++
        state.rawMaxOpen = Math.max(state.rawMaxOpen, state.rawOpen)
        let open = true
        const frame: RawFrame = {
          index,
          tMedia: index / fps,
          tReal: (index / fps) * meta.timeScale,
          image: { displayWidth: 1080, displayHeight: 1920 } as unknown as VideoFrame,
          width: 1080,
          height: 1920,
          pendingRotationDeg: 0,
          close: () => {
            if (open) state.rawOpen--
            open = false
          },
        }
        yield frame
        await Promise.resolve()
      }
    },
    // oxlint-disable-next-line require-yield -- the fake source must satisfy the async-generator signature
    async *frames() {
      throw new Error('not used')
    },
    async *bitmaps(sel, opts) {
      for (const index of indicesOf(sel, n)) {
        if (opts?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        const bitmap = { width: 1080, height: 1920, close: () => undefined } as unknown as ImageBitmap
        yield { index, tMedia: index / fps, tReal: (index / fps) * meta.timeScale, bitmap, pendingRotationDeg: 0 } satisfies BitmapFrame
      }
    },
    close() {
      state.closed = true
    },
  }
  return { source, state }
}

function fakePose(): PoseEstimator & { disposed: boolean; frames: number } {
  return {
    disposed: false,
    frames: 0,
    async init() {},
    async *estimate(frames: AsyncIterable<PoseInputFrame>) {
      for await (const f of frames) {
        this.frames++
        const pose: PoseFrame = { frameIndex: f.frameIndex, tReal: f.tReal, landmarks: servePoseAt(f.tReal, CONTACT_T), score: 0.9, source: 'injected' }
        yield pose
      }
    },
    async dispose() {
      this.disposed = true
    },
    stats: () => ({ backend: 'test', detectErrors: [] }),
  }
}

function fakeBall(timeBase: TimeBaseSuggestion = { status: 'consistent', timeScale: 1, basis: 'test' }) {
  const log = { begins: [] as number[], frames: 0, disposed: false }
  const client: BallClient = {
    backend: 'main-thread',
    async begin(windowId) {
      log.begins.push(windowId)
    },
    async pushFrame(_w, _f, _t, image) {
      log.frames++
      image.close()
    },
    async end(windowId, options) {
      const r: BallWindowResult = analyseWindow(windowId, [], options)
      return {
        ...r,
        toss: { status: 'ok', confidence: 0.8, gravity: { status: 'ok' } as never, release: { tReal: 1.2, frameIndex: 72, uncertaintyS: 0.01, x: 0.43, y: 0.3, confidence: 0.8, method: 'test' }, apex: { tReal: 1.8, frameIndex: 108, uncertaintyS: 0.004, x: 0.43, y: 0.05, confidence: 0.8 } as never },
        events: {
          tossRelease: { frameIndex: 72, tReal: 1.2, uncertaintyS: 0.01, confidence: 0.8, method: 'test' },
          tossApex: { frameIndex: 108, tReal: 1.8, uncertaintyS: 0.004, confidence: 0.8, method: 'test' },
          contact: { frameIndex: 132, tReal: 2.2, uncertaintyS: 0.005, confidence: 0.8, method: 'test' },
        },
        timeBase,
      }
    },
    dispose() {
      log.disposed = true
    },
  }
  return { client, log }
}

function makeDeps(overrides: Partial<PipelineDeps> & { source?: ReturnType<typeof fakeSource>; pose?: ReturnType<typeof fakePose>; ball?: ReturnType<typeof fakeBall> } = {}) {
  const source = overrides.source ?? fakeSource()
  const pose = overrides.pose ?? fakePose()
  const ball = overrides.ball ?? fakeBall()
  const encoded: string[] = []
  const deps: PipelineDeps = {
    ...defaultDeps,
    probe: async () => undefined,
    openFrameSource: async () => source.source,
    createPoseSource: async () => pose,
    createBallClient: async () => ball.client,
    engine: { findServeWindows: () => [{ startReal: 0, endReal: 3.8, confidence: 0.9 }], analyseSession: analyseSessionDouble },
    encoder: async (_img, region) => {
      encoded.push(`${region.width}x${region.height}`)
      return new Blob([new Uint8Array(64)], { type: 'image/jpeg' })
    },
    coaching: async () => ({ status: 'skipped', reason: 'test' }),
    now: () => performance.now(),
    ...overrides,
  }
  return { deps, source, pose, ball, encoded }
}

const file = () => new File([new Uint8Array(4096)], 'serve.mp4', { type: 'video/mp4' })
const baseOptions = { sessionId: 'S1', profile: { heightM: 1.8, handedness: 'right' as const }, view: 'side' as const }

beforeEach(async () => {
  await resetDbForTests()
  vi.stubGlobal('createImageBitmap', async () => ({ width: 64, height: 64, close: () => undefined }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runAnalysis', () => {
  it('runs every stage, reports determinate progress and commits one consistent result', async () => {
    const { deps, source, pose, ball, encoded } = makeDeps()
    const events: PipelineEvent[] = []
    const result = await runAnalysis(file(), { ...baseOptions, onProgress: (e) => events.push(e) }, deps)

    expect(result).toMatchObject({ sessionId: 'S1', servesFound: 1, servesIncluded: 1 })
    expect(result.timeBase.status).toBe('physics') // the toss proved real time
    expect(result.keyFrames).toBeGreaterThan(3)
    expect(result.timings.windows).toBe(1)

    const progress = events.filter((e): e is { type: 'progress'; progress: PipelineProgress } => e.type === 'progress').map((e) => e.progress)
    for (let i = 1; i < progress.length; i++) expect(progress[i].overall).toBeGreaterThanOrEqual(progress[i - 1].overall)
    expect(new Set(progress.map((p) => p.stage))).toEqual(new Set(['probe', 'sparse', 'dense', 'keyframes', 'session', 'done']))
    expect(new Set(progress.map((p) => p.step))).toEqual(new Set(['probe', 'finding-serves', 'tracking-body', 'tracking-ball', 'measuring', 'coaching', 'saving', 'done']))
    expect(progress.some((p) => p.label === 'Finding serves (1 found)')).toBe(true)
    expect(progress.at(-1)?.overall).toBe(1)
    expect(events.some((e) => e.type === 'serve-ready' && e.index === 1)).toBe(true)

    // Persistence: session, serve, track, key frames, stats, job and video with retention.
    const session = await getSession('S1')
    expect(session?.status).toBe('ready')
    expect(session?.analysis?.counts).toMatchObject({ candidates: 1, analysed: 1, included: 1 })
    const serves = await listServesBySession('S1')
    expect(serves).toHaveLength(1)
    expect(serves[0]).toMatchObject({ sessionId: 'S1', id: 'S1-s01', index: 1, includedFlag: 1 })
    expect(Object.values(serves[0].metrics).every((m) => !!m?.status)).toBe(true)
    expect(serves[0].keyFrames.contact?.thumbId).toBe('S1-s01-contact-thumb')
    const track = await getTrack('S1-s01')
    expect(track?.pose.frameIndices.length).toBeGreaterThan(50)
    expect((await listKeyFramesForServe('S1-s01')).map((k) => k.event)).toContain('contact')
    expect(await getSessionThumb('S1')).toBeDefined()
    expect(await getStats('S1')).toBeDefined()
    const job = (await getDb().jobs.toArray())[0]
    expect(job).toMatchObject({ state: 'done', completedWindows: [0] })
    expect(job.windows?.[0].candidate.anchor).toBe('pose-arm-run')
    const [video] = await listVideosBySession('S1')
    expect(video).toMatchObject({ storage: 'idb', audio: 'never-recorded', retention: { policy: 'auto-delete-days' } })
    expect(video.retainUntil).toBeGreaterThan(Date.now())

    // Resources: decoder frames closed promptly, workers and sources released.
    expect(source.state.rawOpen).toBe(0)
    expect(source.state.rawMaxOpen).toBeLessThanOrEqual(3)
    expect(source.state.closed).toBe(true)
    expect(pose.disposed).toBe(true)
    expect(ball.log.disposed).toBe(true)
    expect(encoded).toContain('270x480')
  })

  it('cancels mid-pass: session and job marked, nothing half-saved, workers stopped', async () => {
    const { deps, source, ball, pose } = makeDeps()
    const controller = new AbortController()
    const run = runAnalysis(
      file(),
      {
        ...baseOptions,
        signal: controller.signal,
        onProgress: (e) => {
          if (e.type === 'progress' && e.progress.step === 'tracking-body') controller.abort()
        },
      },
      deps,
    )
    await expect(run).rejects.toMatchObject({ code: 'cancelled' })
    expect((await getSession('S1'))?.status).toBe('cancelled')
    expect((await getDb().jobs.toArray())[0].state).toBe('cancelled')
    expect(await listServesBySession('S1')).toHaveLength(0)
    expect(await getStats('S1')).toBeUndefined()
    expect(ball.log.disposed).toBe(true)
    expect(pose.disposed).toBe(true)
    expect(source.state.rawOpen).toBe(0)
  })

  it('cancels promptly even when the pose source never settles after abort', async () => {
    // Seen in the browser: a pose request left pending by a disposed worker kept the run alive ~48 s.
    let calls = 0
    const hanging: PoseEstimator = {
      async init() {},
      async *estimate(frames: AsyncIterable<PoseInputFrame>) {
        const pass = ++calls // 1-2: Pass A (coarse, fill); 3: Pass B
        for await (const f of frames) {
          yield { frameIndex: f.frameIndex, tReal: f.tReal, landmarks: servePoseAt(f.tReal, CONTACT_T), score: 0.9, source: 'injected' } satisfies PoseFrame
          if (pass >= 3 && f.tReal > 1) await new Promise(() => undefined) // never settles
        }
      },
      dispose: () => new Promise(() => undefined), // never settles either
    }
    const { deps } = makeDeps({ createPoseSource: async () => hanging })
    const controller = new AbortController()
    const started = performance.now()
    const run = runAnalysis(file(), {
      ...baseOptions,
      signal: controller.signal,
      onProgress: (e) => {
        if (e.type === 'progress' && e.progress.step === 'tracking-body') setTimeout(() => controller.abort(), 20)
      },
    }, deps)
    await expect(run).rejects.toMatchObject({ code: 'cancelled' })
    expect(performance.now() - started).toBeLessThan(3000)
    expect((await getSession('S1'))?.status).toBe('cancelled')
  })

  it('no serve found: a player-facing error and a failed session', async () => {
    const { deps } = makeDeps({ engine: { findServeWindows: () => [], analyseSession: analyseSessionDouble } })
    const error = await runAnalysis(file(), baseOptions, deps).catch((e) => e)
    expect(error).toBeInstanceOf(AnalysisError)
    expect(error).toMatchObject({ code: 'no-serves', message: "We couldn't find a serve in this video.", recoverable: false })
    expect((await getSession('S1'))?.error?.code).toBe('no-serves')
  })

  it('marks a session the Record flow created when the clip is too long', async () => {
    await createSession({ id: 'S1', startedAt: new Date().toISOString(), status: 'queued', mode: 'technique', view: 'side' })
    const { deps } = makeDeps({ source: fakeSource({ frames: 60 * 60 * 11 }) })
    await expect(runAnalysis(file(), baseOptions, deps)).rejects.toMatchObject({ code: 'too-long' })
    expect((await getSession('S1'))?.status).toBe('failed')
  })

  it('corrects a slow-motion time base from the toss and re-runs that window’s ball pass', async () => {
    const ball = fakeBall({ status: 'apply-correction', timeScale: 0.125, captureFpsFactor: 8, basis: 'falls too slowly' })
    const warnings: string[] = []
    const { deps } = makeDeps({ source: fakeSource({ fps: 30, frames: 240 }), ball })
    const result = await runAnalysis(file(), { ...baseOptions, onProgress: (e) => e.type === 'warning' && warnings.push(e.message) }, deps)
    expect(result.timeBase).toMatchObject({ status: 'physics', captureFps: 240, timeScale: 0.125, fpsSource: 'physics' })
    // The window's ball detection ran again, under a fresh job id (a stale job can never feed it).
    expect(ball.log.begins).toEqual([0, 150_000])
    expect(warnings.join(' ')).toMatch(/slow motion/)
  })

  it('Pass B: pose with numPoses 1 on the pose worker, ball windows spread over the ball workers, results in window order', async () => {
    const source = fakeSource({ frames: 60 * 12 })
    const clients: ReturnType<typeof fakeBall>[] = []
    const configured: { numPoses?: number }[] = []
    const pose = fakePose()
    const poseFrames: number[][] = []
    const trackedPose: PoseEstimator = {
      ...pose,
      configure: (settings) => configured.push(settings),
      async *estimate(frames: AsyncIterable<PoseInputFrame>) {
        const seen: number[] = []
        poseFrames.push(seen)
        for await (const f of frames) {
          seen.push(f.frameIndex)
          yield { frameIndex: f.frameIndex, tReal: f.tReal, landmarks: servePoseAt(f.tReal % 6, CONTACT_T), score: 0.9, source: 'injected' } satisfies PoseFrame
        }
      },
    }
    const { deps } = makeDeps({
      source,
      createPoseSource: async () => trackedPose,
      createBallClient: async () => {
        const b = fakeBall()
        clients.push(b)
        return b.client
      },
      engine: {
        findServeWindows: () => [
          { startReal: 0, endReal: 3.8, confidence: 0.9 },
          { startReal: 6, endReal: 9.8, confidence: 0.9 },
        ],
        analyseSession: analyseSessionDouble,
      },
    })
    const events: PipelineEvent[] = []
    const result = await runAnalysis(file(), { ...baseOptions, passB: { lanes: 2 }, onProgress: (e) => events.push(e) }, deps)
    expect(result.servesFound).toBe(2)
    expect(result.timings.ballWorkers).toBe(2)
    expect(configured).toContainEqual({ numPoses: 1 })
    // Two windows, one per ball worker.
    expect(clients.map((c) => c.log.begins)).toEqual([[0], [1]])
    // Pass B pose streams (after Pass A's coarse and fill streams) cover each window's core in full.
    const dense = poseFrames.slice(-2)
    for (const frames of dense) {
      const sorted = [...frames].sort((a, b) => a - b)
      expect(frames).toEqual(sorted)
      let run = 0
      let longest = 0
      for (let k = 1; k < sorted.length; k++) {
        run = sorted[k] === sorted[k - 1] + 1 ? run + 1 : 0
        longest = Math.max(longest, run)
      }
      expect(longest).toBeGreaterThan(100) // 2.2 s at 60 fps, every frame
    }
    const progress = events.filter((e): e is { type: 'progress'; progress: PipelineProgress } => e.type === 'progress').map((e) => e.progress)
    for (let i = 1; i < progress.length; i++) expect(progress[i].overall).toBeGreaterThanOrEqual(progress[i - 1].overall)
    expect(progress.some((p) => p.label === 'Tracking the toss (serve 2 of 2)')).toBe(true)
    expect(source.state.rawOpen).toBe(0)
    expect(clients.every((c) => c.log.disposed)).toBe(true)
  })

  it('Pass B reuses Pass A poses for the context outside the core', async () => {
    const counts: Record<string, number> = {}
    for (const reuse of [true, false]) {
      const pose = fakePose()
      const { deps } = makeDeps({ source: fakeSource({ frames: 60 * 5 }), pose })
      const result = await runAnalysis(file(), { ...baseOptions, persist: false, passB: { reuseSparse: reuse } }, deps)
      counts[String(reuse)] = result.timings.poseFrames
    }
    expect(counts.true).toBeLessThan(counts.false)
  })

  it('does not keep a copy of a clip whose sound cannot be removed', async () => {
    const { deps } = makeDeps({ source: fakeSource({ hasAudio: true }) })
    const warnings: string[] = []
    await runAnalysis(file(), { ...baseOptions, onProgress: (e) => e.type === 'warning' && warnings.push(e.message) }, deps)
    const [video] = await listVideosBySession('S1')
    expect(video).toMatchObject({ storage: 'not-kept', audio: 'removed' })
    expect(await getDb().videoBlobs.count()).toBe(0)
    expect(warnings).toContain("We couldn't remove the sound from this video, so we didn't keep a copy. Your original is unchanged.")
  })

  it('keeps a copy with the sound removed, and a second run of the same clip reuses its video row', async () => {
    const { deps } = makeDeps({ source: fakeSource({ hasAudio: true }) })
    const clip = new File([mp4WithAudio()], 'serve.mp4', { type: 'video/mp4' })
    await runAnalysis(clip, baseOptions, deps)
    const [video] = await listVideosBySession('S1')
    expect(video).toMatchObject({ storage: 'idb', audio: 'removed' })
    const kept = new Uint8Array(await (await getDb().videoBlobs.get(video.id))!.blob.arrayBuffer())
    expect(kept.byteLength).toBe(clip.size)
    expect([...kept.slice(34, 40), ...kept.slice(50, 54)].every((b) => b === 0)).toBe(true)
    // "Analyse again" from the kept copy (same size and length): one video row, serves point at it.
    await runAnalysis(new File([kept], 'serve.mp4', { type: 'video/mp4' }), baseOptions, deps)
    const videos = await listVideosBySession('S1')
    expect(videos.map((v) => v.id)).toEqual([video.id])
    expect((await listServesBySession('S1')).every((s) => s.videoId === video.id)).toBe(true)
  })

  it('persist: false writes nothing and passes a coaching decision through', async () => {
    const decide = vi.fn(async () => ({ status: 'decided' as const, decision: { kind: 'focus' } }))
    const { deps } = makeDeps({ coaching: decide })
    const result = await runAnalysis(file(), { ...baseOptions, persist: false }, deps)
    expect(result.coaching).toMatchObject({ status: 'decided', kind: 'focus' })
    expect(decide).toHaveBeenCalledOnce()
    expect(await getDb().sessions.count()).toBe(0)
    expect(await getDb().serves.count()).toBe(0)
  })
})
