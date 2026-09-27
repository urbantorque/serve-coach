import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyseSession, findServeWindows, missingShare, type EngineInput } from './engine.ts'
import { LM, METRIC_IDS, REAR_ONLY_METRIC_IDS, type BallObservation, type BallTrack, type CaptureContext, type MetricValue, type PhoneMount, type PoseFrame, type VideoMeta } from './types.ts'
import { buildServeFixture } from './pose/servePoseFixture.ts'

const FPS = 60
const H_M = 1.8
const HEIGHT_HU = 0.19
const FLOOR_Y = 0.85
const CONTACT_T = 2.4

/** A fixture serve (exact kinematic pose) with a physically consistent toss and outgoing ball. */
function syntheticSession(opts: { fps?: number; view?: 'side' | 'rear'; pitch?: number | null; heightHU?: number; mount?: PhoneMount; rollDeg?: number } = {}): { input: EngineInput; truth: { tRelease: number; tApex: number; apexRatio: number } } {
  const fps = opts.fps ?? FPS
  const heightHU = opts.heightHU ?? HEIGHT_HU
  const fx = buildServeFixture({ fps, durationS: 4.5, heightHU, floorY: FLOOR_Y, contactT: CONTACT_T, view: opts.view ?? 'side' })
  const aspect = fx.frameAspect
  const unitsPerM = heightHU / H_M
  const a = 0.5 * 9.81 * unitsPerM
  const tRelease = CONTACT_T - 0.95
  const tApex = CONTACT_T - 0.35
  const rel = fx.frames.reduce((best, f) => (Math.abs(f.tReal - tRelease) < Math.abs(best.tReal - tRelease) ? f : best))
  const hand = rel.landmarks![LM.LEFT_WRIST]
  const yApex = hand.y - a * (tRelease - tApex) ** 2
  const x0 = hand.x
  const y = (t: number) => yApex + a * (t - tApex) ** 2
  const obs: BallObservation[] = []
  const toss: BallObservation[] = []
  const outgoing: BallObservation[] = []
  for (const f of fx.frames) {
    const t = f.tReal
    if (t >= tRelease - 0.05 && t < CONTACT_T) {
      const wrist = f.landmarks![LM.LEFT_WRIST]
      const o: BallObservation = t < tRelease ? { frameIndex: f.frameIndex, tReal: t, x: wrist.x, y: wrist.y - 0.004, radius: 0.004, score: 0.9, source: 'detected' } : { frameIndex: f.frameIndex, tReal: t, x: x0 + 0.01 * (t - tRelease), y: y(t), radius: 0.004, score: 0.95, source: 'detected' }
      obs.push(o)
      if (t >= tRelease) toss.push(o)
    } else if (t > CONTACT_T && t < CONTACT_T + 3.5 / fps) {
      const dt = t - CONTACT_T
      const o: BallObservation = { frameIndex: f.frameIndex, tReal: t, x: x0 + 0.01 * (CONTACT_T - tRelease) + (5 / aspect) * dt, y: y(CONTACT_T) + 0.3 * dt, radius: 0.004, score: 0.9, source: 'detected' }
      obs.push(o)
      outgoing.push(o)
    }
  }
  const tracks: BallTrack[] = [
    { id: 1, kind: 'toss', observations: toss },
    { id: 2, kind: 'outgoing', observations: outgoing },
  ]
  const meta: VideoMeta = {
    fileName: 'fixture', durationMediaS: 4.5, width: 1080, height: 1920, rotationDeg: 0, hasAudio: false, nominalFps: fps, captureFps: fps,
    timeScale: 1, fpsSource: 'container', isVariableFrameRate: false, frameCount: fx.frames.length,
  }
  const capture: CaptureContext = {
    source: 'in-app-native', declaredView: opts.view ?? 'side', cameraSide: 'chest', serveSide: 'deuce', serveNumber: 1, intendedType: 'flat',
    handedness: 'right', playerHeightM: H_M, playerHeightSource: 'entered', hitSoundTiming: false,
    ...(opts.pitch === null ? {} : { orientationSamples: [{ tMs: 0, pitchDeg: opts.pitch ?? 0, rollDeg: 0 }] }),
    ...(opts.mount ? { source: 'import' as const, mount: opts.mount } : {}),
  }
  const poses = opts.rollDeg ? rollFrames(fx.frames, opts.rollDeg, aspect) : fx.frames
  return {
    input: { meta, view: opts.view ?? 'side', capture, profile: { heightM: H_M, handedness: 'right' }, poses, ball: { observations: obs, tracks }, onsets: [], ids: { sessionId: 'fixture', videoId: 'fixture-video' } },
    truth: { tRelease, tApex, apexRatio: (FLOOR_Y - yApex) / heightHU },
  }
}

/** The same poses seen by a phone rolled by `deg` (rotation about the picture centre, in HU). */
function rollFrames(frames: readonly PoseFrame[], deg: number, aspect: number): PoseFrame[] {
  const a = (deg * Math.PI) / 180
  const cx = 0.5 * aspect
  const rot = (x: number, y: number) => {
    const u = x * aspect - cx
    const v = y - 0.5
    return { x: (cx + u * Math.cos(a) - v * Math.sin(a)) / aspect, y: 0.5 + u * Math.sin(a) + v * Math.cos(a) }
  }
  return frames.map((f) => (f.landmarks ? { ...f, landmarks: f.landmarks.map((l) => ({ ...l, ...rot(l.x, l.y) })) } : f))
}

describe('engine contract', () => {
  it('findServeWindows returns real-time spans with a confidence', () => {
    const { input } = syntheticSession()
    const w = findServeWindows(input.poses, input.meta, 'right')
    expect(w).toHaveLength(1)
    expect(Object.keys(w[0]).sort()).toEqual(['confidence', 'endReal', 'startReal'])
    expect(w[0].startReal).toBeLessThan(CONTACT_T)
    expect(w[0].endReal).toBeGreaterThan(CONTACT_T)
  })

  it('returns no serves (and says so) without poses', () => {
    const { input } = syntheticSession()
    const out = analyseSession({ ...input, poses: [], ball: { observations: [], tracks: [] } })
    expect(out.serves).toHaveLength(0)
    expect(out.warnings.join(' ')).toMatch(/No serve/)
    expect(out.stats.metrics['serve-count']?.value).toBe(0)
  })
})

describe('analyseSession on a synthetic serve (side view, D1 distance, 60 fps)', () => {
  const { input, truth } = syntheticSession()
  const out = analyseSession(input)
  const serve = out.serves[0]

  it('finds one serve with release, apex and contact near the truth', () => {
    expect(out.serves).toHaveLength(1)
    expect(serve.detection.kind).toBe('serve')
    expect(Math.abs(serve.events.tossApex!.tReal - truth.tApex)).toBeLessThan(0.005)
    expect(Math.abs(serve.events.contact!.tReal - CONTACT_T)).toBeLessThan(0.02)
    expect(Math.abs(serve.events.tossRelease!.tReal - truth.tRelease)).toBeLessThan(0.06)
    expect(serve.phases.map((p) => p.phase)).toEqual(expect.arrayContaining(['setup', 'toss', 'loading', 'drive', 'contact']))
  })

  it('labels every value (D2): numbers carry a status and an interval or n; unavailable values carry a reason', () => {
    const all: MetricValue[] = [...Object.values(serve.metrics), ...Object.values(out.stats.metrics)].filter((m): m is MetricValue => !!m)
    for (const m of all) {
      expect(['measured', 'estimated', 'player-entered', 'experimental', 'unavailable']).toContain(m.status)
      if (m.status === 'unavailable') {
        expect(m.value, m.id).toBeNull()
        expect(m.reasonCode, m.id).toBeTruthy()
      }
      if (typeof m.value === 'number' && m.status !== 'unavailable' && !['serve-count', 'retoss-count', 'repeatability'].includes(m.id)) {
        expect(m.uncertainty !== undefined || m.n !== undefined, m.id).toBe(true)
      }
    }
    for (const id of METRIC_IDS) expect(out.stats.metrics[id], id).toBeDefined()
  })

  it('keeps D1/D4 rules: spin never, rear-only metrics never from the side, no speed at 60 fps', () => {
    expect(out.stats.metrics.spin?.reasonCode).toBe('NOT_MEASURABLE')
    for (const id of REAR_ONLY_METRIC_IDS) {
      const m = serve.metrics[id] ?? out.stats.metrics[id]
      expect(m?.status, id).toBe('unavailable')
    }
    expect(serve.metrics['knee-bend-band']?.reasonCode).toBe('NEEDS_REAR_VIEW')
    expect(serve.metrics['speed-experimental']?.status).toBe('unavailable')
    expect(serve.metrics['speed-experimental']?.reasonCode).toBe('FPS_TOO_LOW')
  })

  it('measures toss height and drop against the fixture truth', () => {
    const apex = serve.metrics['toss-apex-height']!
    expect(apex.status).toBe('estimated')
    // Fixture heights are exact; the depth prior (§3.2) lowers the value by (ratio − r_h)·δ/D.
    expect(Math.abs((apex.value as number) - truth.apexRatio)).toBeLessThan(0.15)
    expect(apex.uncertainty!.low).toBeLessThan(apex.value as number)
    const drop = serve.metrics['toss-drop']!
    const expectedDropCm = 0.5 * 9.81 * 0.35 ** 2 * 100
    expect(Math.abs((drop.value as number) - expectedDropCm)).toBeLessThan(5)
    expect(drop.secondary?.timeMs).toBeCloseTo(350, -1)
  })

  it('never lets experimental or unavailable values into session centres', () => {
    const tp = out.stats.metrics['trophy-pause']
    expect(tp?.status === 'experimental' || tp?.status === 'unavailable').toBe(true)
    expect(out.stats.metrics['toss-height-spread']?.reasonCode).toBe('TOO_FEW_SERVES')
    expect(out.stats.metrics['capture-quality']?.status).toBe('measured')
  })
})

describe('status downgrades', () => {
  it('unknown pitch makes absolute heights experimental with PITCH_UNKNOWN (§1.1.3)', () => {
    const out = analyseSession(syntheticSession({ pitch: null }).input)
    const m = out.serves[0].metrics['toss-apex-height']!
    expect(m.status).toBe('experimental')
    expect(m.reasonCode).toBe('PITCH_UNKNOWN')
    // Timing is unaffected.
    expect(out.serves[0].metrics['toss-drop']!.status).toBe('estimated')
  })

  it('an import with a level mount (pitch 0 ± 2°) keeps heights estimated with a wider range (§1.1.3a)', () => {
    const level = analyseSession(syntheticSession({ pitch: null, mount: 'level-mount' }).input)
    const sensor = analyseSession(syntheticSession().input)
    const m = level.serves[0].metrics['toss-apex-height']!
    expect(level.serves[0].rectification.status).toBe('assumed-level')
    expect(m.status).toBe('estimated')
    expect(m.reasonCode).toBe('TILT_UNKNOWN')
    const width = (v: MetricValue) => v.uncertainty!.high - v.uncertainty!.low
    expect(width(m)).toBeGreaterThan(width(sensor.serves[0].metrics['toss-apex-height']!))
    expect(level.quality.checks.find((c) => c.id === 'cq.camera-level')?.pass).toBe(true)
    // Spreads and timing are unaffected by a shared tilt.
    expect(level.serves[0].metrics['toss-drop']!.status).toBe(sensor.serves[0].metrics['toss-drop']!.status)
  })

  it('"roughly level" (± 4°) widens further, and the p95 budget decides its status', () => {
    const width = (v: MetricValue) => v.uncertainty!.high - v.uncertainty!.low
    const level = analyseSession(syntheticSession({ pitch: null, mount: 'level-mount' }).input).serves[0].metrics['toss-apex-height']!
    const rough = analyseSession(syntheticSession({ pitch: null, mount: 'roughly-level' }).input).serves[0].metrics['toss-apex-height']!
    expect(width(rough)).toBeGreaterThan(width(level))
    expect(['estimated', 'experimental']).toContain(rough.status)
    expect(rough.status === 'experimental' ? rough.reasonCode : 'TILT_UNKNOWN').toBe(rough.status === 'experimental' ? 'PITCH_UNKNOWN' : rough.reasonCode)
  })

  it('"tilted or not sure" leaves the pitch unknown, and a rear clip never assumes level', () => {
    const unsure = analyseSession(syntheticSession({ pitch: null, mount: 'tilted-or-unsure' }).input)
    expect(unsure.serves[0].metrics['toss-apex-height']!.status).toBe('experimental')
    expect(unsure.serves[0].rectification.status).toBe('unknown')
    const rear = analyseSession(syntheticSession({ pitch: null, mount: 'level-mount', view: 'rear' }).input)
    for (const s of rear.serves) expect(s.rectification.status).not.toBe('assumed-level')
  })

  it('roll sanity check: a player leaning 5° in the picture contradicts "level mount" (heights experimental)', () => {
    const tilted = analyseSession(syntheticSession({ pitch: null, mount: 'level-mount', rollDeg: 5 }).input)
    expect(tilted.serves[0].metrics['toss-apex-height']!.status).toBe('experimental')
    expect(tilted.warnings.join(' ')).toMatch(/leans .* from the picture's vertical/)
    const check = tilted.quality.checks.find((c) => c.id === 'cq.camera-level')
    expect(check?.pass).toBe(false)
    expect(check?.message).not.toMatch(/\d\s*°/)
    // Under the 3° limit the answer stands.
    const slight = analyseSession(syntheticSession({ pitch: null, mount: 'level-mount', rollDeg: 1.5 }).input)
    expect(slight.serves[0].metrics['toss-apex-height']!.status).toBe('estimated')
  })

  it('a camera closer than the validated distances caps heights at experimental', () => {
    const out = analyseSession(syntheticSession({ heightHU: 0.3 }).input)
    expect(out.serves[0].metrics['toss-apex-height']!.status).toBe('experimental')
  })

  it('30 fps: rhythm is experimental (release not resolved)', () => {
    const out = analyseSession(syntheticSession({ fps: 30 }).input)
    const r = out.serves[0]?.metrics['rhythm-release-to-contact']
    expect(r?.status === 'experimental' || r?.status === 'unavailable').toBe(true)
    expect(out.quality.checks.find((c) => c.id === 'cq.frame-rate')?.severity).toBe('warn')
  })

  it('rear view: side-only metrics say NEEDS_SIDE_VIEW', () => {
    const out = analyseSession(syntheticSession({ view: 'rear' }).input)
    const s = out.serves[0]
    if (s) {
      expect(s.metrics['leg-drive']?.reasonCode).toBe('NEEDS_SIDE_VIEW')
      expect(s.metrics['toss-forward']?.reasonCode).toBe('NEEDS_SIDE_VIEW')
    }
    expect(out.stats.metrics['speed-experimental']?.reasonCode).toBe('NEEDS_SIDE_VIEW')
  })
})

// Runs on a real pipeline dump of the synthetic corpus when present (validation/results/**/full is git-ignored).
const dumpPath = fileURLToPath(new URL('../../../validation/results/metrics/pipeline/full/default75-s1.json', import.meta.url))
describe.skipIf(!existsSync(dumpPath))('analyseSession on a real pipeline dump (default75-s1)', () => {
  it('reproduces the truth within the V1 thresholds', () => {
    const d = JSON.parse(readFileSync(dumpPath, 'utf8'))
    const pass = d.ball.passes[d.ball.finalPass ?? 0]
    const observations: BallObservation[] = []
    for (const f of pass.frames) for (const c of f.candidates) observations.push({ frameIndex: f.frameIndex, tReal: f.tReal, x: c[0], y: c[1], radius: c[2], score: c[3], source: 'detected' })
    const poses = d.pose.clean.frames.map((f: { frameIndex: number; tReal: number; landmarks: number[][] | null }) => ({
      frameIndex: f.frameIndex, tReal: f.tReal, score: 1, source: 'mediapipe' as const,
      landmarks: f.landmarks ? f.landmarks.map((r) => ({ x: r[0], y: r[1], visibility: r[3] })) : null,
    }))
    const out = analyseSession({
      meta: { ...d.meta.final, timeBaseStatus: 'unknown', timeBaseKind: 'normal' },
      view: 'side',
      capture: { source: 'in-app-native', declaredView: 'side', cameraSide: 'chest', serveSide: 'deuce', serveNumber: 1, intendedType: 'flat', handedness: 'right', playerHeightM: 1.8, playerHeightSource: 'entered', hitSoundTiming: false, orientationSamples: [{ tMs: 0, pitchDeg: 0, rollDeg: 0 }] },
      profile: { heightM: 1.8, handedness: 'right' },
      poses,
      ball: { observations, tracks: pass.tracks, toss: [pass.toss] },
      onsets: [],
    })
    const s = out.serves[0]
    expect(Math.abs((s.metrics['toss-apex-height']!.value as number) - 1.9205)).toBeLessThan(0.025)
    expect(Math.abs((s.metrics['contact-height-ratio']!.value as number) - 1.5028)).toBeLessThan(0.03)
    expect(Math.abs((s.metrics['rhythm-release-to-contact']!.value as number) - 997.7)).toBeLessThan(30)
    expect(Math.abs((s.metrics['toss-drop']!.value as number) - 75.19)).toBeLessThan(5)
  })
})

describe('missingShare (dropped frames)', () => {
  const track = (frames: [number, number][]) => ({ t: Float64Array.from(frames.map((f) => f[1])), frameIndex: Int32Array.from(frames.map((f) => f[0])) })
  it('does not count frames the pipeline skipped or where no body was found', () => {
    // Every 3rd frame at 60 fps: indices step by 3 as time steps by 3 frames.
    const sparse = track(Array.from({ length: 20 }, (_, k) => [k * 3, (k * 3) / 60] as [number, number]))
    expect(missingShare(sparse, 0, 57 / 60, 60)).toBe(0)
  })
  it('counts time gaps the frame numbers do not account for', () => {
    // Frames 0..59 at 60 fps, but the clock jumps 6 frames between frame 29 and 30 (5 dropped).
    const frames = Array.from({ length: 60 }, (_, k) => [k, (k + (k >= 30 ? 5 : 0)) / 60] as [number, number])
    const share = missingShare(track(frames), 0, 64 / 60, 60)
    expect(share).toBeCloseTo(5 / 65, 3)
  })
})
