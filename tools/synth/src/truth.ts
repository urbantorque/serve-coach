import { LM } from '../../../app/src/analysis/types.ts'
import { BALL, G } from './ball.ts'
import { extrinsicsMatrix, project, projectedRadiusPx, type Camera } from './camera.ts'
import { COURT } from './court.ts'
import { cameraAt } from './frames.ts'
import type { ServePlan } from './kinematics/motion.ts'
import type { PosePoints } from './kinematics/skeleton.ts'
import { kneeFlexion3DDeg, kneeMaxima, kneeMaximaAtFrames, legLandmarks, serveMetrics, trunkInclination2D, trunkInclination3DDeg, type KneeSeries, type ServeMetrics } from './metrics.ts'
import { ballOccluded, bodyVolumes, landmarkOcclusion } from './occlusion.ts'
import { VARIED_PARAMS, LIMITS, effectiveMeans } from './params.ts'
import { mid, sub, type Vec3 } from './math/vec.ts'
import type { BuiltScenario, OutputSpec } from './setup.ts'
import type { SoundEvent } from './audio.ts'
import { toDbfs } from './audio.ts'

export const TRUTH_FORMAT = 'serve-synth-truth/1'

/** Realised SD of a normal truncated at +/-2.5 SD, as a fraction of the nominal SD. */
export const TRUNCATION_SD_FACTOR = (() => {
  const k = 2.5
  const phi = Math.exp((-k * k) / 2) / Math.sqrt(2 * Math.PI)
  // 2*Phi(k) - 1 via erf, with a high-accuracy rational approximation of erf (Abramowitz-Stegun 7.1.26 is too coarse).
  const erf = (x: number) => {
    // Series expansion converges quickly for |x| < 3.
    let sum = x
    let term = x
    for (let n = 1; n < 60; n++) {
      term *= (-x * x) / n
      sum += term / (2 * n + 1)
    }
    return (2 / Math.sqrt(Math.PI)) * sum
  }
  const mass = erf(k / Math.SQRT2)
  return Math.sqrt(1 - (2 * k * phi) / mass)
})()

const r = (x: number, d: number): number => {
  const f = 10 ** d
  return Math.round(x * f) / f
}
const r3v = (v: Vec3, d: number): [number, number, number] => [r(v[0], d), r(v[1], d), r(v[2], d)]

/** Top of the skull (hair excluded, like a stadiometer reading), court coordinates. */
export function headTop(b: BuiltScenario, pose: PosePoints): Vec3 {
  const s = b.clip.anthro.s
  const up = sub(pose.headUpPt, pose.headCentre).map((x) => x / 0.1) as Vec3
  const fwd = sub(pose.headForwardPt, pose.headCentre).map((x) => x / 0.1) as Vec3
  return [0, 1, 2].map((k) => pose.headCentre[k] + up[k] * 0.138 * s - fwd[k] * 0.005 * s) as Vec3
}

/** The player's posture in the setup stance of the first serve (for scale-calibration checks). */
function setupStance(b: BuiltScenario): Record<string, number> {
  const t = b.clip.plans[0].times.setupStartS + 0.2
  const pose = b.clip.pose(t)
  const legs = legLandmarks(b.clip.handedness)
  const eyes = (pose.lm[LM.LEFT_EYE][2] + pose.lm[LM.RIGHT_EYE][2]) / 2
  return {
    tReal: r(t - b.t0S, 6),
    headTopHeightM: r(headTop(b, pose)[2], 4),
    eyeHeightM: r(eyes, 4),
    frontKneeFlexionDeg: r(kneeFlexion3DDeg(pose, legs.front), 2),
    backKneeFlexionDeg: r(kneeFlexion3DDeg(pose, legs.back), 2),
    trunkInclinationDeg: r(trunkInclination3DDeg(pose), 2),
  }
}

/** How one output clip samples the render and maps frames to media time. */
export interface OutputPlan {
  spec: OutputSpec
  decimate: number
  mediaFps: number
  /** Real seconds per media second. */
  timeScale: number
  /** Output frames per real second. */
  realFps: number
  frameCount: number
  durationMediaS: number
}

export function planOutput(b: BuiltScenario, spec: OutputSpec): OutputPlan {
  const decimate = spec.decimate ?? 1
  const realFps = b.scenario.video.fps / decimate
  const mediaFps = spec.mediaFps ?? realFps
  const frameCount = Math.floor((b.frameCount - 1) / decimate) + 1
  // One output frame lasts 1/realFps real seconds and 1/mediaFps media seconds.
  const timeScale = mediaFps / realFps
  return { spec, decimate, mediaFps, timeScale, realFps, frameCount, durationMediaS: frameCount / mediaFps }
}

export interface LandmarkTruth {
  x: number
  y: number
  z: number
  visibility: number
}

export interface BallTruth {
  id: number
  serve: number
  state: string
  /** Ball centre, court coordinates (m). */
  p: [number, number, number]
  /** Velocity (m/s). */
  v: [number, number, number]
  x: number
  y: number
  /** Projected radius / frame height. */
  radius: number
  inFrame: boolean
  occluded: boolean
  held: boolean
  /** Centre at exposure start and end, normalised (motion-blur streak). */
  streak: [number, number, number, number]
}

export interface FrameTruth {
  frameIndex: number
  tReal: number
  tMedia: number
  landmarks: LandmarkTruth[] | null
  /** Court-coordinate 3D landmarks (m), MediaPipe order. */
  world: [number, number, number][]
  /** 33 chars: '1' where the landmark projects inside the frame. */
  inFrame: string
  /** 33 chars: '1' where the landmark is hidden by another body part. */
  occluded: string
  balls: BallTruth[]
  racket: { head: [number, number, number]; x: number; y: number; inFrame: boolean }
  camera?: { position: [number, number, number]; R: number[] }
}

/** Per-render-frame truth, shared by all outputs of a job. */
export class FrameTruthSource {
  private cache = new Map<number, Omit<FrameTruth, 'frameIndex' | 'tMedia'>>()

  constructor(private readonly b: BuiltScenario) {}

  camAt = (tAbs: number): Camera => cameraAt(this.b.setup, tAbs)

  renderFrame(i: number): Omit<FrameTruth, 'frameIndex' | 'tMedia'> {
    const hit = this.cache.get(i)
    if (hit) return hit
    const b = this.b
    const clip = b.clip
    const I = b.setup.intrinsics
    const tAbs = b.t0S + i / b.scenario.video.fps
    const cam = this.camAt(tAbs)
    const eye = cam.extrinsics.position
    const pose = clip.pose(tAbs)
    const vols = bodyVolumes(clip.anthro, pose)
    const occl = landmarkOcclusion(clip.anthro, pose, eye, vols)
    const hipMid = mid(pose.lm[LM.LEFT_HIP], pose.lm[LM.RIGHT_HIP])
    const hipDepth = project(cam, hipMid).depthM
    const proj = pose.lm.map((p) => project(cam, p))
    const inFrame = proj.map((q) => q.inFrame)
    const landmarks: LandmarkTruth[] | null = inFrame.some(Boolean)
      ? proj.map((q, k) => ({
          x: r(q.x, 5),
          y: r(q.y, 5),
          z: r(((q.depthM - hipDepth) * I.fxPx) / (hipDepth * I.widthPx), 5),
          visibility: !q.inFrame ? 0 : occl[k] ? 0.4 : 1,
        }))
      : null

    const S = b.setup.shutterS
    const heldBy = clip.handedness === 'right' ? 'left' : 'right'
    const balls: BallTruth[] = clip.ballsAt(tAbs, undefined).map((ball) => {
      const q = project(cam, ball.p)
      // Velocity by finite differences that stay inside the ball's current state (one-sided at
      // release, contact and bounce, where the velocity is discontinuous).
      const h = 0.0005
      const before = clip.ballsAt(tAbs - h).find((x) => x.id === ball.id)
      const after = clip.ballsAt(tAbs + h).find((x) => x.id === ball.id)
      const sameBefore = before !== undefined && before.state === ball.state
      const sameAfter = after !== undefined && after.state === ball.state
      const v: Vec3 =
        sameBefore && sameAfter
          ? (sub(after.p, before.p).map((x) => x / (2 * h)) as Vec3)
          : sameAfter
            ? (sub(after.p, ball.p).map((x) => x / h) as Vec3)
            : sameBefore
              ? (sub(ball.p, before.p).map((x) => x / h) as Vec3)
              : [0, 0, 0]
      const s0 = clip.ballsAt(tAbs - S / 2).find((x) => x.id === ball.id)?.p ?? ball.p
      const s1 = clip.ballsAt(tAbs + S / 2).find((x) => x.id === ball.id)?.p ?? ball.p
      const q0 = project(cam, s0)
      const q1 = project(cam, s1)
      const held = ball.state === 'in-hand'
      return {
        id: ball.id,
        serve: ball.id,
        state: ball.state,
        p: r3v(ball.p, 4),
        v: r3v(v, 3),
        x: r(q.x, 5),
        y: r(q.y, 5),
        radius: r(projectedRadiusPx(cam, ball.p, BALL.radiusM) / I.heightPx, 6),
        inFrame: q.inFrame,
        occluded: ballOccluded(eye, ball.p, BALL.radiusM, vols, held ? heldBy : null),
        held,
        streak: [r(q0.x, 5), r(q0.y, 5), r(q1.x, 5), r(q1.y, 5)],
      }
    })
    const head = pose.racketStringCentre
    const rq = project(cam, head)
    const out: Omit<FrameTruth, 'frameIndex' | 'tMedia'> = {
      tReal: r(i / b.scenario.video.fps, 6),
      landmarks,
      world: pose.lm.map((p) => r3v(p, 4)),
      inFrame: inFrame.map((f) => (f ? '1' : '0')).join(''),
      occluded: occl.map((f) => (f ? '1' : '0')).join(''),
      balls,
      racket: { head: r3v(head, 4), x: r(rq.x, 5), y: r(rq.y, 5), inFrame: rq.inFrame },
    }
    if (b.setup.shake) {
      const m = extrinsicsMatrix(cam.extrinsics)
      out.camera = { position: r3v(cam.extrinsics.position, 5), R: m.R.map((x) => r(x, 7)) }
    }
    this.cache.set(i, out)
    return out
  }

  /** Continuous-time knee maxima per serve (camera-dependent, output-independent). */
  private knees = new Map<number, KneeSeries>()
  kneeSeries(plan: ServePlan): KneeSeries {
    let k = this.knees.get(plan.index)
    if (!k) {
      k = kneeMaxima(this.b.clip, plan, this.camAt)
      this.knees.set(plan.index, k)
    }
    return k
  }
}

interface EventTruth {
  tReal: number
  tMedia: number
  /** Nearest output frame. */
  frameIndex: number
  /** Fractional output frame position (tReal * output fps). */
  frame: number
  inClip: boolean
}

function eventTruth(tAbs: number, b: BuiltScenario, o: OutputPlan): EventTruth {
  const tReal = tAbs - b.t0S
  const frame = tReal * o.realFps
  const frameIndex = Math.round(frame)
  return {
    tReal: r(tReal, 6),
    tMedia: r(tReal / o.timeScale, 6),
    frameIndex,
    frame: r(frame, 4),
    inClip: frameIndex >= 0 && frameIndex < o.frameCount,
  }
}

/** Metric fields that are instants (absolute motion time); written as clip-relative tReal. */
const METRIC_INSTANTS = new Set(['maxFrontKneeFlexion3DTimeS', 'maxFrontKneeFlexion2DTimeS'])

function roundMetrics(m: ServeMetrics, t0S: number): Record<string, number | string | boolean | null> {
  const out: Record<string, number | string | boolean | null> = {}
  for (const [k, v] of Object.entries(m)) {
    if (typeof v !== 'number') out[k] = v as string | boolean | null
    else if (METRIC_INSTANTS.has(k)) out[k.replace(/TimeS$/, 'TReal')] = r(v - t0S, 6)
    else out[k] = r(v, k.endsWith('Deg') ? 3 : k.endsWith('Kmh') ? 2 : 4)
  }
  return out
}

export interface TruthInputs {
  b: BuiltScenario
  output: OutputPlan
  source: FrameTruthSource
  files: { container: string; file: string; codec: string; crf: number; audioCodec: string }[]
  sounds: SoundEvent[]
  audio: { sampleRate: number; backgroundDbfs: number; hum: boolean }
  groups: string[]
  generator: Record<string, unknown>
}

export function buildTruth(inp: TruthInputs): Record<string, unknown> {
  const { b, output: o, source } = inp
  const sc = b.scenario
  const clip = b.clip
  const I = b.setup.intrinsics
  const baseM = extrinsicsMatrix(b.setup.baseExtrinsics)
  const camAt = source.camAt

  // Frames.
  const frames: FrameTruth[] = []
  for (let j = 0; j < o.frameCount; j++) {
    const f = source.renderFrame(j * o.decimate)
    frames.push({ frameIndex: j, tMedia: r(j / o.mediaFps, 6), ...f })
  }
  const frameTimesAbs = frames.map((_, j) => b.t0S + (j * o.decimate) / sc.video.fps)

  // Serves.
  const serves = clip.plans.map((plan) => {
    const T = plan.times
    const knees = source.kneeSeries(plan)
    const m = serveMetrics(clip, plan, camAt, knees)
    const atFrames = kneeMaximaAtFrames(clip, plan, camAt, frameTimesAbs)
    const contactEv = eventTruth(T.contactS, b, o)
    const contactFrameT = b.t0S + contactEv.frameIndex / o.realFps
    const trunkAtContactFrame = contactEv.inClip ? trunkInclination2D(camAt(contactFrameT), clip.pose(contactFrameT)).deg : null
    const racketLow = racketLowPoint(b, plan)
    const inView = (p: Vec3, t: number) => project(camAt(t), p).inFrame
    const w = (p: Vec3) => clip.toWorld(p)
    const release = w(plan.release)
    const v0 = w(plan.tossV0)
    const tUp = v0[2] / G
    const apex: Vec3 = [release[0] + v0[0] * tUp, release[1] + v0[1] * tUp, m.tossApexHeightM]
    const contact = w(plan.contact)
    const bounce = w(plan.flight.bounce)
    const ev = (t: number) => eventTruth(t, b, o)
    const phases = [
      ['setup', T.setupStartS, T.motionStartS],
      ['toss', T.motionStartS, T.tossReleaseS],
      ['loading', T.tossReleaseS, T.trophyEndS],
      ['drive', T.trophyEndS, T.contactS],
      ['contact', T.contactS, T.contactS],
      ['landing', T.contactS, T.landingAbsorbEndS],
      ['recovery', T.landingAbsorbEndS, T.recoveryEndS],
    ].map(([phase, t0, t1]) => {
      const a = ev(t0 as number)
      const z = ev(t1 as number)
      return { phase, startTReal: a.tReal, endTReal: z.tReal, startFrame: a.frameIndex, endFrame: z.frameIndex }
    })
    return {
      index: plan.index,
      sampledIndex: b.serveIndices[plan.index],
      courtSide: plan.params.courtSide,
      direction: plan.params.direction,
      style: plan.params.style,
      stance: plan.params.stance,
      events: {
        tossRelease: ev(T.tossReleaseS),
        tossApex: ev(T.tossApexS),
        trophy: ev((T.trophyStartS + T.trophyEndS) / 2),
        contact: contactEv,
        landing: ev(T.landingS),
        motionStart: ev(T.motionStartS),
        trophyStart: ev(T.trophyStartS),
        trophyEnd: ev(T.trophyEndS),
        maxKneeFlexion: ev(knees.max3D.tS),
        racketLowPoint: ev(racketLow),
        takeoff: ev(T.takeoffS),
        bounce: ev(T.bounceS),
        recoveryEnd: ev(T.recoveryEndS),
        dribbleFloorContacts: plan.dribbles.map((d) => ev(d.tFloorS)),
      },
      phases,
      metrics: {
        ...roundMetrics(m, b.t0S),
        maxFrontKneeFlexion3DAtFramesDeg: atFrames ? r(atFrames.max3D.deg, 3) : null,
        maxFrontKneeFlexion2DAtFramesDeg: atFrames ? r(atFrames.max2D.deg, 3) : null,
        trunkInclinationContact2DAtContactFrameDeg: trunkAtContactFrame === null ? null : r(trunkAtContactFrame, 3),
      },
      ball: {
        release: r3v(release, 4),
        apex: r3v(apex, 4),
        contact: r3v(contact, 4),
        contactVelocity: r3v(w(plan.flight.v0), 3),
        bounce: r3v(bounce, 4),
        velocityBeforeBounce: r3v(w(plan.flight.vBeforeBounce), 3),
        spinRpm: plan.params.spinRpm,
        target: r3v(w(plan.target), 3),
      },
      visibility: {
        tossReleaseInFrame: inView(release, T.tossReleaseS),
        tossApexInFrame: inView(apex, T.tossApexS),
        contactInFrame: inView(contact, T.contactS),
        bounceInFrame: inView(bounce, T.bounceS),
        playerInFrameAtContact: clip.pose(T.contactS).lm.every((p) => project(camAt(T.contactS), p).inFrame),
      },
      params: roundParams(plan.params as unknown as Record<string, unknown>),
      design: { releaseReachable: plan.releaseReachable, reachAngleDeg: r(plan.reachAngleDeg, 3), jumpDesignM: r(plan.jumpDesignM, 4) },
    }
  })

  const prof = b.profile
  const sdScale = sc.serves.sdScale ?? 1
  const styles = [...new Set(b.serves.map((s) => s.style))]
  const variability = Object.fromEntries(
    styles.map((style) => {
      const means = effectiveMeans(prof, style)
      return [
        style,
        Object.fromEntries(
          VARIED_PARAMS.map((k) => [
            k,
            {
              mean: r(means[k], 5),
              sd: r(prof.sds[k] * sdScale, 5),
              sdEffective: r(prof.sds[k] * sdScale * TRUNCATION_SD_FACTOR, 5),
              limits: LIMITS[k] ?? null,
            },
          ]),
        ),
      ]
    }),
  )

  const a = clip.anthro
  const L = b.setup.look
  return {
    format: TRUTH_FORMAT,
    clipId: o.spec.id,
    job: sc.id,
    groups: inp.groups,
    tags: o.spec.tags,
    description: sc.description,
    generator: inp.generator,
    video: {
      width: I.widthPx,
      height: I.heightPx,
      fps: o.mediaFps,
      captureFps: o.realFps,
      timeScale: o.timeScale,
      frameCount: o.frameCount,
      durationMediaS: r(o.durationMediaS, 6),
      rotationDeg: 0,
      files: inp.files,
      pixelFormat: 'yuv420p',
      colour: 'BT.709 limited range',
    },
    settings: {
      fps: o.realFps,
      mediaFps: o.mediaFps,
      timeScale: o.timeScale,
      renderFps: sc.video.fps,
      decimate: o.decimate,
      resolution: [I.widthPx, I.heightPx],
      orientation: sc.video.orientation,
      view: sc.camera.view,
      distanceM: sc.camera.distanceM,
      cameraHeightM: sc.camera.heightM,
      lookAtHeightM: sc.camera.lookAtHeightM ?? 1.45,
      focal35mmEquivMm: sc.camera.focal35mmEquivMm,
      intrinsics: { model: 'pinhole + radial k1,k2 (OpenCV)', fxPx: r(I.fxPx, 4), fyPx: r(I.fyPx, 4), cxPx: I.cxPx, cyPx: I.cyPx, k1: I.k1, k2: I.k2, width: I.widthPx, height: I.heightPx },
      extrinsics: {
        note: 'X_cam = R * X_court + t; camera axes x right, y down, z forward (OpenCV). Per-frame values are in frames[].camera when shake is on.',
        R: baseM.R.map((x) => r(x, 8)),
        t: r3v(baseM.t, 6),
        position: r3v(b.setup.baseExtrinsics.position, 5),
      },
      shutterS: b.setup.shutterS,
      exposureTiming: 'frame time = centre of a global-shutter exposure (no rolling shutter)',
      crf: o.spec.crf,
      lighting: { preset: sc.look.lighting, flickerHz: L.flickerAmplitude > 0 ? L.flickerHz : null, flickerAmplitude: L.flickerAmplitude },
      sensorNoise: { readNoiseCodeValues: L.post.readNoise, shotNoisePerCodeValue: L.post.shotNoise },
      motionBlur: { bodySubframes: b.setup.bodyBlurSamples, ball: 'continuous streak over the shutter time' },
      shake: sc.camera.shake ?? null,
      surface: sc.look.surface,
      t0MotionS: r(b.t0S, 6),
    },
    coordinateSystems: {
      court: 'metres; origin at the centre mark on the outer edge of the server\'s baseline; +x toward the net, +y to the server\'s left when facing the net, +z up',
      image: 'x, y normalised to [0,1] with origin at the top-left of the displayed frame; landmark z = MediaPipe-style depth relative to the hip midpoint in the same scale as x (negative = closer to the camera)',
      time: 'tReal = real seconds since the centre of frame 0\'s exposure; tMedia = container time = tReal / timeScale',
    },
    player: {
      profile: prof.id,
      label: prof.label,
      heightM: prof.heightM,
      handedness: prof.handedness,
      stance: prof.stance,
      outfit: sc.player.outfit ?? 'red',
      setupStance: setupStance(b),
      anthropometry: {
        thighM: r(a.thighM, 4), shankM: r(a.shankM, 4), upperArmM: r(a.upperArmM, 4), forearmM: r(a.forearmM, 4), handM: r(a.handM, 4),
        trunkM: r(a.trunkM, 4), shoulderWidthM: r(2 * a.shoulderHalfWidthM, 4), hipJointWidthM: r(2 * a.hipHalfWidthM, 4), footLengthM: r(a.footLengthM, 4),
      },
      variability: { sdScale, truncatedAtSd: 2.5, truncationSdFactor: r(TRUNCATION_SD_FACTOR, 5), byStyle: variability },
    },
    court: { baselineWidthM: COURT.baselineWidthM, serviceLineFromNetM: COURT.serviceLineFromNetM, netXM: COURT.netXM },
    serves,
    audio: {
      sampleRate: inp.audio.sampleRate,
      channels: 1,
      backgroundDbfs: inp.audio.backgroundDbfs,
      floodlightHum: inp.audio.hum,
      speedOfSoundMs: 343,
      note: 'Each sound is placed at arrivalTMedia = (emit time + distance / 343 m/s) / timeScale; shapes are not time-stretched in slow-motion media.',
      events: inp.sounds
        .map((e) => ({
          kind: e.kind,
          serveIndex: e.serveIndex,
          emitTReal: r(e.emitS - b.t0S, 6),
          arrivalTReal: r(e.arrivalS - b.t0S, 6),
          arrivalTMedia: r((e.arrivalS - b.t0S) / o.timeScale, 6),
          distanceM: r(e.distanceM, 3),
          peakDbfs: r(toDbfs(e.peak), 2),
          position: r3v(e.position, 3),
        }))
        .filter((e) => e.arrivalTMedia >= 0 && e.arrivalTMedia < o.durationMediaS),
    },
    frames,
  }
}

function roundParams(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) out[k] = typeof v === 'number' ? r(v, 5) : Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? r(x, 5) : x)) : v
  return out
}

/** Time of the lowest racket-tip height between the end of the trophy pause and contact. */
function racketLowPoint(b: BuiltScenario, plan: ServePlan): number {
  const T = plan.times
  let best = T.trophyEndS
  let bestZ = Infinity
  for (let t = T.trophyEndS; t <= T.contactS; t += 0.001) {
    const z = b.clip.pose(t).racketTip[2]
    if (z < bestZ) {
      bestZ = z
      best = t
    }
  }
  return best
}
