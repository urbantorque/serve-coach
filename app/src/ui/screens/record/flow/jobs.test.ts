import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../../../../data/db.ts'
import { getSession, getTally, useUiStore } from '../../../../data/index.ts'
import type { CaptureContext } from '../../../../analysis/types.ts'
import { setRunAnalysisForTests, type RunAnalysis } from './analysisAdapter.ts'
import { DEFAULT_BLOCK, resetRecordFlow, useRecordFlow } from './flowStore.ts'
import { cancelAnalysis, forgetAllJobs, hasHandle, JOB_ERROR_COPY, jobFile, resetJobsForTests, retryAnalysis, startAnalysis, useJobs } from './jobs.ts'
import { lintCopy } from '../../../copy/lint.ts'
import { importCapture, playerFacts, recordingCapture, saveNewSession, sessionFor, setupFor, type SessionInput } from './sessionFactory.ts'

const clip = { title: 'Sun 27 Sep, 0:05', line: 'Side view, deuce, first serves', tech: '1080p, 60 fps', orientation: 'portrait' as const }
const run = { profile: { heightM: 1.8, handedness: 'right' as const }, view: 'side' as const, capture: {} as CaptureContext }

beforeEach(async () => {
  await resetDbForTests()
  resetJobsForTests()
})
afterEach(() => setRunAnalysisForTests(undefined))

describe('analysis jobs', () => {
  it('follows progress (monotonic), counts ready serves, keeps notes and finishes', async () => {
    const runner: RunAnalysis = async (_f, o) => {
      o.onProgress({ type: 'progress', progress: { stage: 'sparse', label: 'Finding serves (2 found)', overall: 0.2 } })
      o.onProgress({ type: 'progress', progress: { stage: 'sparse', label: 'Finding serves (2 found)', overall: 0.1 } })
      o.onProgress({ type: 'serve-ready', jobId: 'j', serveId: 'a', index: 0 })
      o.onProgress({ type: 'warning', jobId: 'j', message: 'No copy kept.' })
      expect(useUiStore.getState().activeJob?.sessionId).toBe('s1')
      return { sessionId: 's1' }
    }
    const phase = await startAnalysis({ sessionId: 's1', file: new Blob(['x']), run, clip, runner })
    expect(phase).toBe('done')
    const job = useJobs.getState().jobs.s1
    expect(job.progress?.overall).toBe(1)
    expect(job.firstServe).toEqual({ serveId: 'a', index: 0 })
    expect(job.notes).toEqual(['No copy kept.'])
    expect(useUiStore.getState().activeJob).toBeNull()
    expect(hasHandle('s1')).toBe(true)
  })

  it('shows lint-clean copy for a pipeline failure and honours "recoverable"', async () => {
    const runner: RunAnalysis = async () => {
      throw Object.assign(new Error('Something went wrong'), { code: 'no-serves', recoverable: false })
    }
    expect(await startAnalysis({ sessionId: 's2', file: new Blob(['x']), run, clip, runner })).toBe('failed')
    const job = useJobs.getState().jobs.s2
    expect(job.error).toEqual({ code: 'no-serves', message: JOB_ERROR_COPY['no-serves'], recoverable: false })
    for (const copy of Object.values(JOB_ERROR_COPY)) expect(lintCopy(copy)).toEqual([])
  })

  it('cancels through the AbortSignal and can run again', async () => {
    const runner: RunAnalysis = (_f, o) =>
      new Promise((_resolve, reject) => {
        const stop = () => reject(new DOMException('stop', 'AbortError'))
        if (o.signal.aborted) stop()
        else o.signal.addEventListener('abort', stop)
      })
    const done = startAnalysis({ sessionId: 's3', file: new Blob(['x']), run, clip, runner })
    await Promise.resolve()
    cancelAnalysis('s3')
    expect(await done).toBe('cancelled')
    expect(useJobs.getState().jobs.s3.phase).toBe('cancelled')
    expect(retryAnalysis('s3', async () => ({ sessionId: 's3' }))).toBe(true)
    expect(retryAnalysis('nope')).toBe(false)
  })

  it('"Delete everything" forgets every job and its video, so Resume cannot bring a session back (finding 18)', async () => {
    const runner: RunAnalysis = (_f, o) =>
      new Promise((_resolve, reject) => {
        o.onProgress({ type: 'progress', progress: { stage: 'sparse', label: 'Finding serves', overall: 0.2 } })
        const stop = () => reject(new DOMException('stop', 'AbortError'))
        if (o.signal.aborted) stop()
        else o.signal.addEventListener('abort', stop)
      })
    const done = startAnalysis({ sessionId: 's5', file: new Blob(['x']), run, clip, runner })
    await vi.waitFor(() => expect(useUiStore.getState().activeJob?.sessionId).toBe('s5'))
    forgetAllJobs()
    expect(useJobs.getState().jobs).toEqual({})
    expect(useUiStore.getState().activeJob).toBeNull()
    expect(hasHandle('s5')).toBe(false)
    expect(jobFile('s5')).toBeUndefined()
    expect(retryAnalysis('s5', async () => ({ sessionId: 's5' }))).toBe(false)
    // The stopped run settles later and finds no job to bring back.
    expect(await done).toBe('cancelled')
    expect(useJobs.getState().jobs.s5).toBeUndefined()
  })

  it('"Delete everything" also starts the Record flow afresh (no re-test plan or body-check mark kept)', () => {
    useRecordFlow.getState().setPlan('retest')
    useRecordFlow.getState().markBodyChecked()
    useRecordFlow.getState().setBlock({ side: 'ad', light: 'lights' })
    resetRecordFlow()
    const s = useRecordFlow.getState()
    expect(s.plan).toBe('check-in')
    expect(s.bodyCheckedAt).toBeNull()
    expect(s.block.side).toBe(DEFAULT_BLOCK.side)
    expect(s.lightChosen).toBe(false)
  })

  it('says so plainly when the pipeline is not in this build', async () => {
    setRunAnalysisForTests(null)
    expect(await startAnalysis({ sessionId: 's4', file: new Blob(['x']), run, clip })).toBe('unavailable')
    expect(useJobs.getState().jobs.s4.error?.code).toBe('no-pipeline')
  })
})

describe('session factory', () => {
  const player = playerFacts({ heightM: 1.8, handedness: 'left' })

  it('uses the entered height, or flags the 1.75 m default', () => {
    expect(player).toEqual({ heightM: 1.8, heightSource: 'entered', handedness: 'left' })
    expect(playerFacts(null)).toEqual({ heightM: 1.75, heightSource: 'default', handedness: 'right' })
    expect(playerFacts({ heightM: 3, handedness: 'right' }).heightSource).toBe('default')
  })

  it('builds the in-app capture context: video only, D1 set-up, tilt samples, overrides', () => {
    const c = recordingCapture(
      player,
      { side: 'ad', serveNumber: 2, type: 'mixed', target: 'T', wind: 'breezy', light: 'lights' },
      {
        mimeType: 'video/mp4',
        durationS: 60,
        requested: { width: 1920, height: 1080, fps: 60 },
        delivered: { width: 1080, height: 1920, fps: 60 },
        orientation: 'portrait',
        setup: 'portrait',
        orientationSamples: [{ tMs: 0, pitchDeg: 0.4, rollDeg: -0.2 }],
        recordedAnyway: ['cq.camera-level'],
      },
      false,
    )
    expect(c).toMatchObject({ source: 'in-app-web', declaredView: 'side', serveSide: 'ad', serveNumber: 2, intendedTarget: 'T', setup: 'side-portrait', hitSoundTiming: false })
    expect(c.intendedType).toBeUndefined()
    expect(c.recordedAnyway).toEqual(['cq.camera-level'])
    expect(setupFor('fence')).toBe('side-landscape-fence')
  })

  it('builds the import capture context with no tilt samples (TILT_UNKNOWN downstream)', () => {
    const c = importCapture(player, { view: 'rear', side: 'both', serveNumber: 'mixed', slowMotionAnswer: 'slomo-240', hitSoundTiming: false }, { width: 3840, height: 2160, captureFps: 30 })
    expect(c).toMatchObject({ source: 'import', declaredView: 'rear', setup: 'rear-outcomes', orientation: 'landscape', slowMotionAnswer: 'slomo-240' })
    expect(c.orientationSamples).toBeUndefined()
  })

  it('saves the queued session with block defaults and the tally (the pipeline stores the video)', async () => {
    const capture = importCapture(player, { view: 'side', cameraSide: 'chest', side: 'deuce', serveNumber: 1, hitSoundTiming: false }, { width: 1080, height: 1920, captureFps: 60 })
    const input: SessionInput = { capture, view: 'side', cameraSide: 'chest', mode: 'technique', template: 'check-in', startedAt: '2026-09-27T01:00:00.000Z', block: { side: 'deuce', serveNumber: 1, type: 'flat', target: null } }
    expect(sessionFor(input)).toMatchObject({ status: 'queued', defaultSide: 'deuce', defaultServeNumber: 1, defaultIntendedType: 'flat', setup: 'side-portrait' })
    const { sessionId } = await saveNewSession({ session: input, tally: { serveNumber: 1, counts: { in: 9, total: 15, net: 3 } } })
    expect((await getSession(sessionId))?.status).toBe('queued')
    expect((await getTally(sessionId))?.firstServes).toEqual({ in: 9, total: 15, net: 3 })
  })
})
