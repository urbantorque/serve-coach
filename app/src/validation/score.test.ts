import { describe, expect, it } from 'vitest'
import type { Landmark, VideoMeta } from '../analysis/types.ts'
import type { HarnessBallPass, HarnessResult } from './result.ts'
import { scoreAudio, scoreBallPass, scoreHarnessRun } from './score.ts'
import { playerInputsFromTruth, truthStaturePx, type SynthTruth } from './truth.ts'

const W = 1080
const H = 1920

function standingLandmarks(dx = 0): Landmark[] {
  // A 1000 px tall figure, feet at y = 1500 px: every landmark on a vertical line.
  return Array.from({ length: 33 }, (_, i) => ({ x: (540 + dx) / W, y: (500 + (1000 * i) / 32) / H, z: 0, visibility: 1 }))
}

/** 20 frames at 30 fps media; timeScale 0.125 makes it 240 fps slow motion (tReal = tMedia / 8). */
function makeTruth(timeScale = 1): SynthTruth {
  const fps = 30
  const frames = Array.from({ length: 20 }, (_, i) => ({
    frameIndex: i,
    tMedia: i / fps,
    tReal: (i / fps) * timeScale,
    landmarks: standingLandmarks(),
    balls: [{ state: i < 15 ? 'toss' : 'flight', x: 0.5, y: 0.2 + 0.01 * i, radius: 0.005, inFrame: true, occluded: false, held: false }],
  }))
  const at = (i: number) => ({ tReal: (i / fps) * timeScale, tMedia: i / fps, frameIndex: i, inClip: true })
  return {
    format: 'serve-synth-truth/1',
    clipId: 'unit',
    video: { width: W, height: H, fps, captureFps: fps / timeScale, timeScale, frameCount: 20, durationMediaS: 20 / fps },
    settings: {
      view: 'side',
      distanceM: 5,
      orientation: 'portrait',
      intrinsics: { fxPx: 1000, fyPx: 1000, cxPx: 540, cyPx: 960, width: W, height: H },
      extrinsics: { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 5] },
    },
    player: { heightM: 1.8, handedness: 'right' },
    serves: [{ courtSide: 'deuce', direction: 'T', events: { tossApex: at(10), tossRelease: at(4), contact: at(15) }, metrics: { tossApexHeightM: 3.4, ballSpeedAtContactKmh: 150 } }],
    audio: {
      sampleRate: 48000,
      events: [
        { kind: 'contact', serveIndex: 0, emitTReal: at(15).tReal, arrivalTReal: at(15).tReal + 0.015, arrivalTMedia: at(15).tMedia + 0.015 / timeScale, distanceM: 5, peakDbfs: -12 },
        { kind: 'footstep', serveIndex: 0, emitTReal: 0, arrivalTReal: 0.3 * timeScale, arrivalTMedia: 0.3, distanceM: 5, peakDbfs: -36 },
      ],
    },
    frames,
  }
}

function pass(truth: SynthTruth, metaTimeScale: number, apexShiftRealS: number): HarnessBallPass {
  const toApp = (tReal: number) => (tReal * metaTimeScale) / truth.video.timeScale
  const apexReal = (10 / 30) * truth.video.timeScale + apexShiftRealS
  return {
    label: metaTimeScale === 1 ? 'initial' : 'after-time-scale-correction',
    metaTimeScale,
    captureFps: 30 / metaTimeScale,
    timeBaseKnown: metaTimeScale !== 1,
    tossRoiUntilTReal: null,
    audioUsed: false,
    contactOnset: null,
    contactFromAudioTReal: toApp((15 / 30) * truth.video.timeScale + 0.002),
    frames: truth.frames.map((f) => ({
      frameIndex: f.frameIndex,
      tReal: toApp(f.tReal),
      // One candidate 1 px right of the ball, one far away.
      candidates: [
        [f.balls[0].x + 1 / W, f.balls[0].y, 0.005, 0.9, 0.8, 0.5, 0],
        [0.1, 0.9, 0.005, 0.2, 0.1, 0, 0],
      ],
    })),
    setup: { expectedRadiusNorm: 0.005, tossRoi: null, scale: null, body: null, notes: [] },
    tracks: [],
    tossTrack: {
      id: 1,
      kind: 'toss',
      observations: truth.frames.slice(0, 15).map((f) => ({ frameIndex: f.frameIndex, tReal: toApp(f.tReal), x: f.balls[0].x, y: f.balls[0].y, radius: 0.005, score: 1, source: 'detected' })),
    },
    outgoingTrack: null,
    toss: {
      status: 'ok',
      gravity: { status: 'ok', timeScaleFactor: truth.video.timeScale / metaTimeScale, low: 0.9 * (truth.video.timeScale / metaTimeScale), high: 1.1 * (truth.video.timeScale / metaTimeScale) },
      confidence: 1,
    },
    events: { tossApex: { frameIndex: 10, tReal: toApp(apexReal), uncertaintyS: toApp(0.001), confidence: 1, method: 'ball-apex-fit' } },
    timeBase: { status: metaTimeScale === 1 && truth.video.timeScale !== 1 ? 'apply-correction' : 'consistent', timeScale: truth.video.timeScale / metaTimeScale, basis: 'unit' },
    speedFromTrack: { status: 'experimental', quantity: 'launch', lowKmh: 120, highKmh: 175 } as unknown as HarnessBallPass['speedFromTrack'],
    averageSpeedRear: { status: 'unavailable', reason: 'side', unlockHint: '' },
    bounce: { status: 'unavailable', reason: 'side' },
    placement: { status: 'unavailable', reason: 'side' },
    metrics: [{ id: 'toss-apex-height', value: 3.5, unit: 'm', status: 'estimated', uncertainty: { kind: 'range', low: 3.3, high: 3.6 }, confidence: 1, basis: '' }],
  }
}

describe('validation scoring', () => {
  it('reads player stand-ins and the stature in pixels from truth', () => {
    const truth = makeTruth()
    expect(playerInputsFromTruth(truth)).toEqual({ view: 'side', playerHeightM: 1.8, handedness: 'right', targetTag: 'T', servedFrom: 'deuce' })
    // No world joints: head-to-heel span / 0.88.
    const expected = ((standingLandmarks()[30].y - standingLandmarks()[0].y) / 0.88) * H
    expect(truthStaturePx(truth)).toBeCloseTo(expected, 6)
  })

  it('scores ball detection and toss timing in real time, before and after a slow-motion correction', () => {
    const truth = makeTruth(0.125)
    for (const metaTimeScale of [1, 0.125]) {
      const s = scoreBallPass(pass(truth, metaTimeScale, 0.0005), truth)
      expect(s.detection.recallToss).toBe(1)
      expect(s.detection.precision).toBeCloseTo(0.5, 9)
      expect(s.detection.errorMedianPx).toBeCloseTo(1, 6)
      expect(s.toss.trackPrecision).toBe(1)
      expect(s.toss.coverage).toBe(1)
      expect(s.toss.apexErrorMs).toBeCloseTo(0.5, 6)
      expect(s.toss.apexZ).toBeCloseTo(0.5, 6)
      expect(s.toss.apexHeight).toMatchObject({ errorM: expect.closeTo(0.1, 9), covered: true })
      expect(s.gravity.expected).toBeCloseTo(0.125 / metaTimeScale, 9)
      expect(s.gravity.covered).toBe(true)
      expect(s.speed.covered).toBe(true)
      expect(s.contactFromAudioErrorMs).toBeCloseTo(2, 6)
    }
  })

  it('matches audio onsets to the truth sound arrivals in media time', () => {
    const truth = makeTruth(0.125)
    const pop = truth.audio!.events[0].arrivalTMedia
    const audio = {
      status: 'ok' as const,
      timing: { usable: true, reason: '' },
      onsets: [
        { tMedia: pop + 0.0004, tReal: pop + 0.0004, strength: 30, sharpness: 0.5, kind: 'unknown' as const, riseTimeMs: 1, hfRatio: 0.5, peakDbfs: -12 },
        { tMedia: 0.301, tReal: 0.301, strength: 10, sharpness: 0.9, kind: 'contact' as const, riseTimeMs: 1, hfRatio: 0.5, peakDbfs: -36 },
      ],
    }
    const s = scoreAudio({ audio }, truth)!
    expect(s.contact.nearestErrorMediaMs).toBeCloseTo(0.4, 6)
    expect(s.contact.nearestErrorRealMs).toBeCloseTo(0.05, 6)
    expect(s.contact.nearestKind).toBe('unknown')
    expect(s.contact.strongestIsContact).toBe(true)
    expect(s.contact.labelledContact).toBe(false)
    expect(s.events.find((e) => e.kind === 'footstep')?.onset?.kind).toBe('contact')
  })

  it('scores pose in statures and checks frame counts and the final time base', () => {
    const truth = makeTruth()
    const staturePx = truthStaturePx(truth)
    const shiftPx = 0.05 * staturePx
    const rows = (dx: number) => standingLandmarks(dx).map((l) => [l.x, l.y, 0, 1])
    const meta: VideoMeta = {
      fileName: 'unit.mp4',
      durationMediaS: 20 / 30,
      width: W,
      height: H,
      rotationDeg: 0,
      hasAudio: true,
      nominalFps: 30,
      captureFps: 30,
      timeScale: 1,
      fpsSource: 'container',
      isVariableFrameRate: false,
      frameCount: 20,
    }
    const result = {
      meta: { probe: meta, final: meta, timeBase: { status: 'unknown', kind: 'normal' }, decode: { pose: { missingIndices: [] } } },
      pose: {
        frames: truth.frames.map((f) => ({ frameIndex: f.frameIndex, landmarks: f.frameIndex === 3 ? null : rows(shiftPx) })),
        clean: { frames: truth.frames.map((f) => ({ frameIndex: f.frameIndex, landmarks: rows(0) })) },
      },
      ball: { passes: [pass(truth, 1, 0)], finalPass: 0 },
      audio: null,
    } as unknown as HarnessResult
    const s = scoreHarnessRun(result, truth)
    expect(s.frames).toMatchObject({ truth: 20, probe: 20, decodedPose: 20, decodedBall: 20, match: true })
    expect(s.pose!.raw.detectionRate).toBeCloseTo(19 / 20, 9)
    expect(s.pose!.raw.medianErrorBH).toBeCloseTo(0.05, 6)
    expect(s.pose!.clean.medianErrorBH).toBeCloseTo(0, 9)
    expect(s.timeBase.final.matchesTruth).toBe(true)
    expect(s.timeBase.fpsErrorPct).toBe(0)
  })
})
