import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyseSession, findServeWindows, missingShare, sessionEvidence, type EngineInput } from './engine.ts'
import { LM, METRIC_IDS, REAR_ONLY_METRIC_IDS, type BallObservation, type BallTrack, type CaptureContext, type MetricValue, type PhoneMount, type PoseFrame, type VideoMeta } from './types.ts'
import { buildServeFixture } from './pose/servePoseFixture.ts'

const FPS = 60
const H_M = 1.8
const HEIGHT_HU = 0.19
const FLOOR_Y = 0.85
const CONTACT_T = 2.4

/** A fixture serve (exact kinematic pose) with a physically consistent toss and outgoing ball. */
function syntheticSession(
  opts: {
    fps?: number
    view?: 'side' | 'rear'
    pitch?: number | null
    heightHU?: number
    mount?: PhoneMount
    rollDeg?: number
    /** The toss track ends this long before contact, with no outgoing ball (a search that lost the ball, as the production pipeline did on dist12-s1). */
    tossCutS?: number
    /** Toss detections only from this many seconds after release, and none at or above the apex (a toss half seen). */
    tossOnlyRising?: boolean
    /** A hit-sound contact onset at this real time (hit-sound timing on). */
    onsetT?: number
    /** Remove every ball detection (a shadow swing). */
    noBall?: boolean
    /** Every ball detection this many frames later (the ball says contact is later than the swing). */
    ballShiftFrames?: number
    /** The light answer ('none': no answer, as an import without the question). Default 'day'. */
    light?: 'day' | 'lights' | 'indoor' | 'none'
    /** A caught toss: the hitting arm never swings and the tossing hand catches the ball at about 1.06 BH. */
    caught?: boolean
    /** A swing and miss: the ball keeps falling on its path past the hitting arm to the ground. */
    miss?: boolean
    /** Phone orientation samples (tMs from the start of recording) instead of the one level sample. */
    orientation?: { tMs: number; pitchDeg: number; rollDeg: number }[]
    /** Real frame rate declared on the meta (fpsSource, timeScale, timeBaseStatus) for time-base tests. */
    metaPatch?: Partial<VideoMeta>
  } = {},
): { input: EngineInput; truth: { tRelease: number; tApex: number; apexRatio: number } } {
  const fps = opts.fps ?? FPS
  const heightHU = opts.heightHU ?? HEIGHT_HU
  const fx = buildServeFixture({ fps, durationS: 4.5, heightHU, floorY: FLOOR_Y, contactT: CONTACT_T, view: opts.view ?? 'side', swing: !opts.caught, tossArm: opts.caught ? 'catch' : 'serve' })
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
  // A caught toss ends at the tossing hand (the first frame after the apex where the falling ball
  // reaches it), drifting forward to it; a missed ball falls on its path to 0.3 BH above the floor.
  const catchFrame = opts.caught ? fx.frames.find((f) => f.tReal > tApex && y(f.tReal) >= f.landmarks![LM.LEFT_WRIST].y - 0.004) : undefined
  const catchT = catchFrame?.tReal
  const xAt = (t: number) => (catchFrame ? x0 + ((catchFrame.landmarks![LM.LEFT_WRIST].x - x0) * (t - tRelease)) / (catchFrame.tReal - tRelease) : x0 + 0.01 * (t - tRelease))
  const yAt = (t: number) => (catchFrame && t >= catchFrame.tReal ? catchFrame.landmarks![LM.LEFT_WRIST].y - 0.004 : y(t))
  const missEnd = tApex + Math.sqrt((FLOOR_Y - 0.3 * heightHU - yApex) / a)
  const tossEnd = catchT !== undefined ? catchT + 1e-6 : opts.miss ? missEnd : CONTACT_T - (opts.tossCutS ?? 0)
  const obs: BallObservation[] = []
  const toss: BallObservation[] = []
  const outgoing: BallObservation[] = []
  for (const f of fx.frames) {
    const t = f.tReal
    if (opts.noBall) continue
    if (opts.tossOnlyRising && t > tApex - 0.12) continue
    if (t >= tRelease - 0.05 && t < tossEnd) {
      const wrist = f.landmarks![LM.LEFT_WRIST]
      const o: BallObservation = t < tRelease ? { frameIndex: f.frameIndex, tReal: t, x: wrist.x, y: wrist.y - 0.004, radius: 0.004, score: 0.9, source: 'detected' } : { frameIndex: f.frameIndex, tReal: t, x: xAt(t), y: yAt(t), radius: 0.004, score: 0.95, source: 'detected' }
      obs.push(o)
      if (t >= tRelease) toss.push(o)
    } else if (opts.tossCutS === undefined && !opts.tossOnlyRising && !opts.caught && !opts.miss && t > CONTACT_T && t < CONTACT_T + 3.5 / fps) {
      const dt = t - CONTACT_T
      const o: BallObservation = { frameIndex: f.frameIndex, tReal: t, x: x0 + 0.01 * (CONTACT_T - tRelease) + (5 / aspect) * dt, y: y(CONTACT_T) + 0.3 * dt, radius: 0.004, score: 0.9, source: 'detected' }
      obs.push(o)
      outgoing.push(o)
    }
  }
  const shift = opts.ballShiftFrames ?? 0
  const moved = (o: BallObservation): BallObservation => (shift ? { ...o, frameIndex: o.frameIndex + shift, tReal: fx.frames[o.frameIndex + shift].tReal } : o)
  const tracks: BallTrack[] = [
    { id: 1, kind: 'toss', observations: toss.map(moved) },
    { id: 2, kind: 'outgoing', observations: outgoing.map(moved) },
  ]
  if (shift) obs.splice(0, obs.length, ...obs.map(moved))
  const meta: VideoMeta = {
    fileName: 'fixture', durationMediaS: 4.5, width: 1080, height: 1920, rotationDeg: 0, hasAudio: opts.onsetT !== undefined, nominalFps: fps, captureFps: fps,
    timeScale: 1, fpsSource: 'container', isVariableFrameRate: false, frameCount: fx.frames.length,
    ...opts.metaPatch,
  }
  const capture: CaptureContext = {
    source: 'in-app-native', declaredView: opts.view ?? 'side', cameraSide: 'chest', serveSide: 'deuce', serveNumber: 1, intendedType: 'flat',
    handedness: 'right', playerHeightM: H_M, playerHeightSource: 'entered', hitSoundTiming: opts.onsetT !== undefined, ...(opts.light === 'none' ? {} : { conditions: { light: opts.light ?? 'day' } }),
    ...(opts.pitch === null ? {} : { orientationSamples: opts.orientation ?? [{ tMs: 0, pitchDeg: opts.pitch ?? 0, rollDeg: 0 }] }),
    ...(opts.mount ? { source: 'import' as const, mount: opts.mount } : {}),
  }
  const poses = opts.rollDeg ? rollFrames(fx.frames, opts.rollDeg, aspect) : fx.frames
  return {
    input: {
      meta,
      view: opts.view ?? 'side',
      capture,
      profile: { heightM: H_M, handedness: 'right' },
      poses,
      ball: { observations: obs, tracks: tracks.filter((tr) => tr.observations.length > 0) },
      // The engine removes the sound's travel time (distance / 343 m/s) from an onset.
      onsets: opts.onsetT !== undefined ? [{ tReal: opts.onsetT + (0.751 * H_M) / heightHU / 343, strength: 30, sharpness: 0.9, kind: 'contact' }] : [],
      ids: { sessionId: 'fixture', videoId: 'fixture-video' },
    },
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
  })

  it('labels capture quality experimental, from the catalogue, and says it is an automatic check (D2 addendum)', () => {
    const cq = out.stats.metrics['capture-quality']!
    expect(cq.status).toBe('experimental')
    expect(cq.reasonCode).toBe('VALIDATION_PENDING')
    expect(cq.validationLevel).toBe('V0')
    expect(['good', 'usable', 'poor']).toContain(cq.value)
    expect(cq.basis).toMatch(/^Automatic check, experimental/)
  })
})

/** Values that depend on the contact time (METRICS §3.5, §3.8, §3.11, §3.27–§3.29). */
const CONTACT_TIMED = ['toss-drop', 'rhythm-release-to-contact', 'leg-drive', 'loading-depth', 'contact-height-ratio'] as const

describe('fused-event disagreement (D2 addendum): one wrong event never gives a confident value', () => {
  // The production failure on dist12-s1 / default75-s1 (2026-09-28): the ball search lost the toss
  // 0.27 s before contact, so `ball-bracket` put contact where the ball vanished, and `wrist-apex`,
  // searched only ±0.15 s around that estimate, agreed with it: toss drop 7 cm (truth 75), rhythm
  // 730 ms (truth ~1000), all `estimated`.
  const cut = analyseSession(syntheticSession({ tossCutS: 0.27 }).input)
  const s = cut.serves[0]

  it('reproduces the failure mode: the ball alone would place contact 0.27 s early', () => {
    const ballOnly = s.events.contact!
    expect(ballOnly.method).toBe('disputed')
    // The event keeps a time (for the key frame) but not a confident one.
    expect(ballOnly.confidence).toBeLessThan(0.5)
    expect(ballOnly.uncertaintyS).toBeGreaterThanOrEqual(0.1)
  })

  it('withholds every contact-timed value when the ball track and the swing peak disagree with no third signal', () => {
    for (const id of CONTACT_TIMED) {
      const m = s.metrics[id]!
      expect(m.status, id).toBe('unavailable')
      expect(m.reasonCode, id).toBe('CONTACT_NOT_FOUND')
      expect(m.basis, id).toMatch(/contact timing signals disagreed \(ball track 2\.1\d s, wrist peak 2\.4\d s\)/)
    }
    // Nothing that depends on contact is left `estimated` or `measured`.
    for (const [id, m] of Object.entries(s.metrics)) {
      if (!m || !['toss-drop', 'rhythm-release-to-contact', 'leg-drive', 'loading-depth', 'contact-height-ratio', 'drive-time', 'landing-distance', 'shoulder-tilt-trophy', 'deep-bend-flag', 'trophy-pause', 'contact-forward'].includes(id)) continue
      expect(['unavailable', 'experimental'], id).toContain(m.status)
    }
  })

  it('keeps what does not depend on contact, and still counts the serve', () => {
    expect(s.detection.kind).toBe('serve')
    expect(s.included).toBe(true)
    expect(cut.stats.metrics['serve-count']?.value).toBe(1)
    expect(s.metrics['toss-apex-height']?.status).toBe('estimated')
  })

  it('with the hit sound agreeing with the swing peak, the ball is outvoted: contact is right, dependent values experimental', () => {
    const out = analyseSession(syntheticSession({ tossCutS: 0.27, onsetT: CONTACT_T }).input)
    const v = out.serves[0]
    expect(Math.abs(v.events.contact!.tReal - CONTACT_T)).toBeLessThan(0.02)
    const drop = v.metrics['toss-drop']!
    expect(drop.status).toBe('experimental')
    expect(drop.reasonCode).toBe('CONTACT_NOT_FOUND')
    expect(Math.abs((drop.value as number) - 0.5 * 9.81 * 0.35 ** 2 * 100)).toBeLessThan(5)
    expect(drop.basis).toMatch(/ball track left out/)
    for (const id of ['rhythm-release-to-contact', 'leg-drive', 'loading-depth'] as const) {
      expect(v.metrics[id]?.status, id).toBe('experimental')
      expect(v.metrics[id]?.reasonCode, id).toBe('CONTACT_NOT_FOUND')
    }
  })

  it('an observed ball departure against a disagreeing swing peak: contact from the ball, dependent values experimental', () => {
    // The ball (toss and outgoing track meeting) says contact 0.25 s after the swing peak.
    const out = analyseSession(syntheticSession({ ballShiftFrames: 15 }).input)
    const v = out.serves[0]
    expect(Math.abs(v.events.contact!.tReal - (CONTACT_T + 0.25))).toBeLessThan(0.02)
    expect(v.events.contact!.confidence).toBeGreaterThanOrEqual(0.5)
    for (const id of ['toss-drop', 'rhythm-release-to-contact'] as const) {
      expect(v.metrics[id]?.status, id).toBe('experimental')
      expect(v.metrics[id]?.reasonCode, id).toBe('CONTACT_NOT_FOUND')
      expect(v.metrics[id]?.basis, id).toMatch(/wrist peak left out/)
    }
    // The toss apex does not depend on contact.
    expect(v.metrics['toss-apex-height']?.status).toBe('estimated')
  })

  it('leaves agreeing signals alone: the clean serve keeps its estimated values and no dispute note', () => {
    const clean = analyseSession(syntheticSession().input).serves[0]
    expect(clean.events.contact!.method).not.toBe('disputed')
    for (const id of ['toss-drop', 'rhythm-release-to-contact'] as const) {
      expect(clean.metrics[id]?.status, id).toBe('estimated')
      expect(clean.metrics[id]?.basis, id).not.toMatch(/disagreed/)
    }
  })
})

describe('serve counting from pose and toss evidence', () => {
  it('counts a serve whose toss was only seen rising (apex and fall not tracked); ball values say why', () => {
    const out = analyseSession(syntheticSession({ tossOnlyRising: true }).input)
    expect(out.serves).toHaveLength(1)
    const s = out.serves[0]
    expect(s.detection.kind).toBe('serve')
    expect(out.stats.metrics['serve-count']?.value).toBe(1)
    for (const id of ['toss-apex-height', 'toss-drop'] as const) {
      expect(s.metrics[id]?.status, id).toBe('unavailable')
      expect(s.metrics[id]?.reasonCode, id).toBeTruthy()
    }
  })

  it('does not count a shadow swing (the same motion with no ball at all)', () => {
    const out = analyseSession(syntheticSession({ noBall: true }).input)
    expect(out.stats.metrics['serve-count']?.value).toBe(0)
    for (const s of out.serves) expect(s.detection.kind).not.toBe('serve')
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

  it('an import with a level mount (pitch 0 ± 2°) keeps contact height estimated with a wider range (§1.1.3a)', () => {
    const level = analyseSession(syntheticSession({ pitch: null, mount: 'level-mount' }).input)
    const sensor = analyseSession(syntheticSession().input)
    const m = level.serves[0].metrics['contact-height-ratio']!
    expect(level.serves[0].rectification.status).toBe('assumed-level')
    expect(m.status).toBe('estimated')
    expect(m.reasonCode).toBe('TILT_UNKNOWN')
    // The mount's tilt prior widens the range (the next test compares level with roughly level).
    expect(m.uncertainty!.high - m.uncertainty!.low).toBeGreaterThan(0)
    // Toss height's V1 pass rests on two biases cancelling; its method-only p95 (5.6%) is over the
    // budget, so an assumed level never keeps it estimated (catalogue ASSUMED_LEVEL_HEIGHT_BUDGET).
    const apex = level.serves[0].metrics['toss-apex-height']!
    expect(apex.status).toBe('experimental')
    expect(apex.reasonCode).toBe('PITCH_UNKNOWN')
    expect(sensor.serves[0].metrics['toss-apex-height']!.status).toBe('estimated')
    expect(level.quality.checks.find((c) => c.id === 'cq.camera-level')?.pass).toBe(true)
    // Spreads and timing are unaffected by a shared tilt.
    expect(level.serves[0].metrics['toss-drop']!.status).toBe(sensor.serves[0].metrics['toss-drop']!.status)
  })

  it('"roughly level" (± 4°) widens further, and the p95 budget decides its status', () => {
    const width = (v: MetricValue) => v.uncertainty!.high - v.uncertainty!.low
    const level = analyseSession(syntheticSession({ pitch: null, mount: 'level-mount' }).input).serves[0].metrics['contact-height-ratio']!
    const rough = analyseSession(syntheticSession({ pitch: null, mount: 'roughly-level' }).input).serves[0].metrics['contact-height-ratio']!
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
    expect(tilted.serves[0].metrics['contact-height-ratio']!.status).toBe('experimental')
    expect(tilted.warnings.join(' ')).toMatch(/leans .* from the picture's vertical/)
    const check = tilted.quality.checks.find((c) => c.id === 'cq.camera-level')
    expect(check?.pass).toBe(false)
    expect(check?.message).not.toMatch(/\d\s*°/)
    // Under the 3° limit the answer stands.
    const slight = analyseSession(syntheticSession({ pitch: null, mount: 'level-mount', rollDeg: 1.5 }).input)
    expect(slight.serves[0].metrics['contact-height-ratio']!.status).toBe('estimated')
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

/** What each serve's outgoing ball does: as served, mirrored, climbing steeply (45° in front), or not tracked. */
type OutgoingKind = 'normal' | 'reversed' | 'rising' | 'none'

/**
 * A session of the fixture serve repeated back to back (4.5 s apart), each with its own outgoing
 * ball. The fixture serve has no landing step, so the served ball is each serve's only netDir evidence.
 */
function multiServeSession(outs: readonly OutgoingKind[], opts: { cameraSide?: 'chest' | 'back'; strayT?: number } = {}): EngineInput {
  const { input } = syntheticSession()
  const seg = input.meta.durationMediaS
  const n = input.poses.length
  const aspect = input.meta.width / input.meta.height
  const toss = input.ball.tracks.find((t) => t.kind === 'toss')!
  const out = input.ball.tracks.find((t) => t.kind === 'outgoing')!
  const tossObs = input.ball.observations.filter((o) => !out.observations.includes(o))
  const o0 = out.observations[0]
  const outgoingOf = (kind: OutgoingKind): BallObservation[] =>
    kind === 'none'
      ? []
      : kind === 'reversed'
        ? out.observations.map((o) => ({ ...o, x: o0.x - (o.x - o0.x) }))
        : kind === 'rising'
          ? out.observations.map((o) => ({ ...o, x: o0.x + (o.x - o0.x) / 5, y: o0.y - 4 * (o.tReal - o0.tReal) }))
          : out.observations
  const at = (k: number) => (o: BallObservation): BallObservation => ({ ...o, frameIndex: o.frameIndex + k * n, tReal: o.tReal + k * seg })
  const poses: PoseFrame[] = []
  const observations: BallObservation[] = []
  const tracks: BallTrack[] = []
  outs.forEach((kind, k) => {
    for (const p of input.poses) poses.push({ ...p, frameIndex: p.frameIndex + k * n, tReal: p.tReal + k * seg })
    const outgoing = outgoingOf(kind).map(at(k))
    observations.push(...tossObs.map(at(k)), ...outgoing)
    tracks.push({ id: tracks.length + 1, kind: 'toss', observations: toss.observations.map(at(k)) })
    if (outgoing.length) tracks.push({ id: tracks.length + 1, kind: 'outgoing', observations: outgoing })
  })
  if (opts.strayT !== undefined) {
    // A fast ball crossing the picture the other way (another court), outside every serve's contact.
    const stray = [0, 1, 2].map((j): BallObservation => ({ frameIndex: Math.round(opts.strayT! * FPS) + j, tReal: opts.strayT! + j / FPS, x: 0.8 - (3 / aspect) * (j / FPS), y: 0.8, radius: 0.004, score: 0.9, source: 'detected' }))
    observations.push(...stray)
    tracks.push({ id: tracks.length + 1, kind: 'outgoing', observations: stray })
  }
  return {
    ...input,
    meta: { ...input.meta, durationMediaS: seg * outs.length, frameCount: poses.length },
    capture: { ...input.capture!, cameraSide: opts.cameraSide ?? 'chest' },
    poses,
    ball: { observations, tracks },
  }
}

describe('session evidence rule (netDir §1.1, view check §2.3.7): one vote per serve, never one stray track', () => {
  it('needs 3 serves with evidence (every counted serve in a shorter clip) and ≥ 70% contradicting', () => {
    const none = null
    // One contradicting serve of ten: not enough evidence, whatever its share.
    expect(sessionEvidence([true, none, none, none, none, none, none, none, none, none], 10)).toMatchObject({ decided: 1, share: 1, enough: false, contradicted: false })
    expect(sessionEvidence([true, true, none, none], 4)).toMatchObject({ enough: false, contradicted: false })
    expect(sessionEvidence([true, true, true], 3)).toMatchObject({ enough: true, contradicted: true })
    expect(sessionEvidence([true, true, true, false, none, none, none, none, none, none], 10)).toMatchObject({ enough: true, share: 0.75, contradicted: true })
    // Mixed evidence below 70% keeps what was declared.
    expect(sessionEvidence([true, true, true, true, false, false], 6).contradicted).toBe(false)
    // A clip of one or two serves: the evidence of every counted serve is all there is.
    expect(sessionEvidence([true], 1).contradicted).toBe(true)
    expect(sessionEvidence([true, none], 2).contradicted).toBe(false)
    expect(sessionEvidence([true, true], 2).contradicted).toBe(true)
    expect(sessionEvidence([], 0)).toMatchObject({ decided: 0, share: 0, enough: false, contradicted: false })
  })
})

describe('netDir data check (§1.1): per-serve evidence', () => {
  const fwd = (out: ReturnType<typeof analyseSession>) => out.serves.map((s) => s.metrics['toss-forward']?.value)
  const flipNote = (out: ReturnType<typeof analyseSession>) => out.warnings.filter((w) => /other side of the picture/.test(w))
  const normal = analyseSession(multiServeSession(['normal', 'normal', 'normal', 'normal']))

  it('a normal session keeps the prior and says nothing', () => {
    expect(normal.serves.map((s) => s.detection.kind)).toEqual(['serve', 'serve', 'serve', 'serve'])
    expect(flipNote(normal)).toEqual([])
  })

  it('one reversed ball in a 4-serve session does not mirror the forward metrics (prior kept, info note)', () => {
    const out = analyseSession(multiServeSession(['reversed', 'none', 'none', 'none']))
    expect(fwd(out)).toEqual(fwd(normal))
    const notes = flipNote(out)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/on 1 of 1 serve where it could be seen \(info\)\. Not enough to override your entries/)
    expect(notes[0]).not.toMatch(/VIEW_MISMATCH/)
  })

  it('a stray ball track outside every serve is never evidence', () => {
    const out = analyseSession(multiServeSession(['none', 'none', 'none'], { strayT: 0.3 }))
    expect(fwd(out)).toEqual(fwd(normal).slice(0, 3))
    expect(flipNote(out)).toEqual([])
    const single = analyseSession(multiServeSession(['none'], { strayT: 0.3 }))
    expect(fwd(single)).toEqual(fwd(normal).slice(0, 1))
    expect(flipNote(single)).toEqual([])
  })

  it('3 of 3 serves going the other way override the prior (VIEW_MISMATCH info)', () => {
    const out = analyseSession(multiServeSession(['reversed', 'reversed', 'reversed']))
    expect(flipNote(out)[0]).toMatch(/on 3 of 3 serves where it could be seen \(VIEW_MISMATCH, info\)\. Using the direction they showed/)
    expect(fwd(out)).not.toEqual(fwd(normal).slice(0, 3))
    // A wrong camera-side entry is corrected the same way: the data put the net back on the right.
    const back = analyseSession(multiServeSession(['normal', 'normal', 'normal'], { cameraSide: 'back' }))
    expect(flipNote(back)[0]).toMatch(/VIEW_MISMATCH, info/)
    const backTooFew = analyseSession(multiServeSession(['normal', 'normal', 'none', 'none'], { cameraSide: 'back' }))
    expect(flipNote(backTooFew)[0]).toMatch(/on 2 of 2 serves where it could be seen \(info\)/)
    expect(fwd(back)).not.toEqual(fwd(backTooFew).slice(0, 3))
  })
})

describe('view check (§2.3.7): one vote per serve', () => {
  const viewCheck = (out: ReturnType<typeof analyseSession>) => out.quality.checks.find((c) => c.id === 'cq.view')!

  it('one steeply climbing ball in a 4-serve session does not withhold view-specific values', () => {
    const out = analyseSession(multiServeSession(['rising', 'none', 'none', 'none']))
    expect(viewCheck(out).pass).toBe(true)
    expect(viewCheck(out).severity).toBe('info')
    expect(viewCheck(out).message).toMatch(/on 1 of 1 checked serve; not enough to change anything/)
    expect(out.warnings.join(' ')).not.toMatch(/does not look like the view/)
    for (const s of out.serves) expect(s.metrics['toss-forward']?.reasonCode).not.toBe('VIEW_MISMATCH')
    expect(out.quality.overall).not.toBe('poor')
  })

  it('3 of 3 climbing balls raise VIEW_MISMATCH; so does the one serve of a one-serve clip (the front45 controls)', () => {
    for (const outs of [['rising', 'rising', 'rising'], ['rising']] as OutgoingKind[][]) {
      const out = analyseSession(multiServeSession(outs))
      expect(viewCheck(out).pass).toBe(false)
      expect(out.quality.overall).toBe('poor')
      for (const s of out.serves) expect(s.metrics['toss-forward']?.reasonCode).toBe('VIEW_MISMATCH')
    }
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
      capture: { source: 'in-app-native', declaredView: 'side', cameraSide: 'chest', serveSide: 'deuce', serveNumber: 1, intendedType: 'flat', handedness: 'right', playerHeightM: 1.8, playerHeightSource: 'entered', hitSoundTiming: false, conditions: { light: 'day' }, orientationSamples: [{ tMs: 0, pitchDeg: 0, rollDeg: 0 }] },
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
