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
import type { EngineInput } from '../engine.ts'
import { LUMA_GRID } from '../quality/light.ts'
import { MEMORY_BUDGET } from './budget.ts'
import { AnalysisError } from './errors.ts'
import { defaultDeps, DENSE_NUM_POSES, engineObservations, POSE_ROI_MAX_SIDE_PX, runAnalysis, type PipelineDeps } from './orchestrator.ts'
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
      if ('close' in image) image.close()
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
    // Decode-ahead queue, the frame the pose source holds and the next one handed over, one ball frame.
    expect(source.state.rawMaxOpen).toBeLessThanOrEqual(MEMORY_BUDGET.decodeAhead + 3)
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

  it('disposes the landmarker that was still loading when a run is cancelled before Pass A', async () => {
    // The landmarker starts loading at the probe; this one finishes loading after the cancel.
    const pose = fakePose()
    let created = 0
    const { deps } = makeDeps({
      createPoseSource: async () => {
        created++
        await new Promise((r) => setTimeout(r, 30))
        return pose
      },
    })
    const controller = new AbortController()
    const run = runAnalysis(file(), { ...baseOptions, signal: controller.signal }, deps)
    setTimeout(() => controller.abort(), 0)
    await expect(run).rejects.toMatchObject({ code: 'cancelled' })
    await new Promise((r) => setTimeout(r, 60))
    expect(created).toBe(1)
    expect(pose.disposed).toBe(true)
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

  it('Pass B: windows spread over the pose lanes and ball workers, the same poses whichever lane runs them, results in window order', async () => {
    const source = fakeSource({ frames: 60 * 12 })
    const clients: ReturnType<typeof fakeBall>[] = []
    const configured: { lane: number; settings: Parameters<NonNullable<PoseEstimator['configure']>>[0] }[] = []
    const streams: { lane: number; frames: number[] }[] = []
    let created = 0
    const lane = (id: number): PoseEstimator => ({
      ...fakePose(),
      configure: (settings) => configured.push({ lane: id, settings }),
      async *estimate(frames: AsyncIterable<PoseInputFrame>) {
        const seen: number[] = []
        streams.push({ lane: id, frames: seen })
        for await (const f of frames) {
          seen.push(f.frameIndex)
          yield { frameIndex: f.frameIndex, tReal: f.tReal, landmarks: servePoseAt(f.tReal % 6, CONTACT_T), score: 0.9, source: 'injected' } satisfies PoseFrame
        }
      },
    })
    const { deps } = makeDeps({
      source,
      createPoseSource: async () => lane(created++),
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
    const result = await runAnalysis(file(), { ...baseOptions, passB: { lanes: 2, poseLanes: 2 }, onProgress: (e) => events.push(e) }, deps)
    expect(result.servesFound).toBe(2)
    expect(result.timings.ballWorkers).toBe(2)
    expect(result.timings.poseLanes).toBe(2)
    // Pass A runs as before this round (no settings); Pass B sets every lane alike, with no seeds.
    expect(configured.filter((c) => c.lane === 0 && configured.indexOf(c) < 1).map((c) => c.settings)).toEqual([{ numPoses: DENSE_NUM_POSES, roiMaxSidePx: POSE_ROI_MAX_SIDE_PX }])
    expect(configured.map((c) => c.lane).sort()).toEqual([0, 1])
    for (const c of configured) expect(c.settings).toEqual({ numPoses: DENSE_NUM_POSES, roiMaxSidePx: POSE_ROI_MAX_SIDE_PX })
    expect(result.timings.seededWindows).toBe(0)
    // Pass A's coarse and fill streams on the first landmarker, then one window per lane.
    expect(streams.slice(0, 2).map((st) => st.lane)).toEqual([0, 0])
    const dense = streams.slice(2)
    expect(dense.map((st) => st.lane).sort()).toEqual([0, 1])
    // Two windows, one per ball worker.
    expect(clients.map((c) => c.log.begins)).toEqual([[0], [1]])
    // Each Pass B stream covers its window's core in full.
    for (const { frames } of dense) {
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

  it('Pass B pose on one lane or two gives the same serves, and optional seeds start each window from its Pass A pose', async () => {
    const run = async (passB: NonNullable<Parameters<typeof runAnalysis>[1]['passB']>) => {
      const configured: Parameters<NonNullable<PoseEstimator['configure']>>[0][] = []
      const firstFrames: number[] = []
      const pose = (): PoseEstimator => ({
        ...fakePose(),
        configure: (settings) => configured.push(settings),
        async *estimate(frames: AsyncIterable<PoseInputFrame>) {
          let first = true
          for await (const f of frames) {
            if (first) firstFrames.push(f.frameIndex)
            first = false
            yield { frameIndex: f.frameIndex, tReal: f.tReal, landmarks: servePoseAt(f.tReal % 6, CONTACT_T), score: 0.9, source: 'injected' } satisfies PoseFrame
          }
        },
      })
      const { deps } = makeDeps({
        source: fakeSource({ frames: 60 * 12 }),
        createPoseSource: async () => pose(),
        engine: {
          findServeWindows: () => [
            { startReal: 0, endReal: 3.8, confidence: 0.9 },
            { startReal: 6, endReal: 9.8, confidence: 0.9 },
          ],
          analyseSession: analyseSessionDouble,
        },
      })
      const result = await runAnalysis(file(), { ...baseOptions, persist: false, passB }, deps)
      return { result, configured, firstFrames }
    }
    const one = await run({ poseLanes: 1 })
    const two = await run({ poseLanes: 2 })
    expect(two.result.serveIds).toEqual(one.result.serveIds)
    expect(two.result.timings.poseFrames).toBe(one.result.timings.poseFrames)
    const seeded = await run({ poseLanes: 1, seedPose: true })
    expect(seeded.result.timings.seededWindows).toBe(2)
    const seeds = seeded.configured.filter((c) => c.seed)
    expect(seeds).toHaveLength(2)
    for (const [k, c] of seeds.entries()) {
      // Pass A's two streams come first; then one stream per window.
      const first = seeded.firstFrames[2 + k] / 60
      expect(c.seed!.tReal).toBeLessThanOrEqual(first + 1e-9)
      expect(first - c.seed!.tReal).toBeLessThan(0.5)
    }
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

  it('measures the light on the sparse pass (finding 21): a luma grid per decoded frame, before the pose source takes it, and hands the engine the evidence', async () => {
    const pose = fakePose()
    const seen: number[] = []
    let measuredBeforePose = true
    const grid = (sky: number, court: number) => {
      const g = new Uint8Array(LUMA_GRID * LUMA_GRID)
      for (let k = 0; k < g.length; k++) g[k] = k < (LUMA_GRID * LUMA_GRID) / 4 ? sky : court
      return g
    }
    let engineInput: EngineInput | undefined
    const { deps } = makeDeps({
      pose,
      createLumaMeasurer: () => (image) => {
        seen.push(image.width)
        if (pose.frames > seen.length) measuredBeforePose = false
        return grid(6, 170)
      },
      engine: {
        findServeWindows: () => [{ startReal: 0, endReal: 3.8, confidence: 0.9 }],
        analyseSession: (input) => {
          engineInput = input
          return analyseSessionDouble(input)
        },
      },
    })
    await runAnalysis(file(), { ...baseOptions, persist: false }, deps)
    expect(seen.length).toBeGreaterThan(8)
    expect(measuredBeforePose).toBe(true)
    expect(engineInput?.light?.frames).toBe(seen.length)
    expect(engineInput?.light?.dark).toBe(true)
  })

  it('without a measurer (Node, or a browser without OffscreenCanvas) the engine gets no light evidence', async () => {
    let engineInput: EngineInput | undefined
    const { deps } = makeDeps({
      createLumaMeasurer: () => undefined,
      engine: {
        findServeWindows: () => [{ startReal: 0, endReal: 3.8, confidence: 0.9 }],
        analyseSession: (input) => {
          engineInput = input
          return analyseSessionDouble(input)
        },
      },
    })
    await runAnalysis(file(), { ...baseOptions, persist: false }, deps)
    expect(engineInput).toBeDefined()
    expect(engineInput?.light).toBeUndefined()
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

describe('engineObservations', () => {
  it('passes every window candidate to the engine (as the offline validation input does), once, plus predicted track points', () => {
    const tracks = [
      {
        id: 1,
        kind: 'toss' as const,
        observations: [
          { frameIndex: 10, tReal: 10 / 60, x: 0.5, y: 0.4, radius: 0.003, score: 0.9, source: 'detected' as const },
          { frameIndex: 11, tReal: 11 / 60, x: 0.5, y: 0.39, radius: 0.003, score: 0, source: 'predicted' as const },
        ],
      },
    ]
    const windows = [
      {
        candidates: [
          { frameIndex: 9, tReal: 9 / 60, candidates: [{ x: 0.49, y: 0.45, radiusNorm: 0.003, score: 0.4 }] },
          { frameIndex: 10, tReal: 10 / 60, candidates: [{ x: 0.5, y: 0.4, radiusNorm: 0.003, score: 0.9 }, { x: 0.2, y: 0.7, radiusNorm: 0.004, score: 0.2 }] },
        ],
      },
    ]
    const obs = engineObservations(tracks, windows)
    expect(obs.map((o) => `${o.frameIndex}:${o.source}`)).toEqual(['9:detected', '10:detected', '10:detected', '11:predicted'])
    expect(obs.filter((o) => o.frameIndex === 10 && o.x === 0.5)).toHaveLength(1)
    expect(obs.find((o) => o.frameIndex === 9)?.radius).toBe(0.003)
    // Without windows it is the tracks' points alone (the old input).
    expect(engineObservations(tracks)).toHaveLength(2)
  })
})
