/**
 * DEV ONLY. Converts a trimmed validation-harness run (real engine output on a synthetic clip:
 * cleaned MediaPipe poses, ball tracks, toss events, the audio contact onset) into the stored-track
 * format the playback screens read (ARCHITECTURE §6.3, §7.1): a ServeAnalysis, its TrackRecord and a
 * VideoRecord. The serve-finding and metrics modules (analysis/serve, analysis/metrics) are not built
 * yet, so the events the engine does not produce (trophy, lowest hip, landing, recovery) and the
 * per-serve values are derived here with the METRICS §2.4 rules in simplified form, each tagged
 * `dev-fixture-*` in `method`/`basis`. Nothing here ships (imported only behind import.meta.env.DEV).
 */
import {
  LM,
  type CameraView,
  type EventEstimate,
  type Handedness,
  type MetricId,
  type MetricValue,
  type PhaseSpan,
  type ServeEvents,
  type ServeSide,
  type TargetZone,
  type VideoMeta,
} from '../../../../analysis/types.ts'
import type { BallTrackCompact, PoseTrackCompact, ServeAnalysis, SessionStats } from '../../../../data/domain.ts'
import type { SessionRecord, TrackRecord, VideoRecord } from '../../../../data/records.ts'
import { ballNear, forwardSign, frontToeOf, landmarksAt, midHipAt, standingRef, tossPeak, type Pt } from '../../../components/video/index.ts'

type Obs = [frame: number, tReal: number, x: number, y: number, r: number, score: number, predicted: 0 | 1]

export interface PlaybackFixture {
  format: 'playback-fixture/1'
  clip: string
  clipUrl: string
  source: string
  inputs: { view: CameraView; playerHeightM: number; handedness: Handedness; targetTag?: TargetZone; servedFrom?: ServeSide }
  meta: VideoMeta
  pose: {
    firstLandmark: number
    bodyHeightHU: number
    bodyHeightSource: string
    frames: [number, number, (number | null)[] | null][]
  }
  ball: {
    setup: { body?: { heightNorm: number; groundY: number; headTopY: number } }
    contactFromAudioTReal: number | null
    tracks: { id: number; kind: 'toss' | 'outgoing' | 'bounce' | 'unknown'; fit: BallTrackCompact['tossFit'] | null; obs: Obs[] }[]
    toss?: { fit?: { a: number; b: number; c: number; rmse: number; tStart: number; tEnd: number } } | null
    events: Partial<Record<'tossRelease' | 'tossApex' | 'contact', EventEstimate>>
    metrics: MetricValue[]
  }
}

export interface FixtureServeOptions {
  sessionId: string
  /** 1-based order in the session. */
  index: number
  videoId: string
  analysedAt: string
}

const LANDMARKS = 33
const KIND = { toss: 0, outgoing: 1, bounce: 2, unknown: 3 } as const
const BASIS = 'Dev fixture: engine poses, ball track and toss events on a synthetic clip; value derived with the METRICS rule in simplified form.'

export function poseTrackFrom(f: PlaybackFixture): PoseTrackCompact {
  const n = f.pose.frames.length
  const frameIndices = new Int32Array(n)
  const tReal = new Float64Array(n)
  const xyv = new Float32Array(n * LANDMARKS * 3).fill(Number.NaN)
  const flags = new Uint8Array(n)
  f.pose.frames.forEach(([frame, t, flat], i) => {
    frameIndices[i] = frame
    tReal[i] = t
    if (!flat) return
    const count = flat.length / 3
    for (let k = 0; k < count; k++) {
      const o = (i * LANDMARKS + f.pose.firstLandmark + k) * 3
      xyv[o] = flat[k * 3] ?? Number.NaN
      xyv[o + 1] = flat[k * 3 + 1] ?? Number.NaN
      xyv[o + 2] = flat[k * 3 + 2] ?? 0
    }
  })
  return {
    frameIndices,
    tReal,
    xyv,
    flags,
    source: 'mediapipe',
    frameAspect: f.meta.width / f.meta.height,
    bodyHeightHU: f.pose.bodyHeightHU,
    pitchDeg: new Float32Array(0),
    rollDeg: new Float32Array(0),
  }
}

export function ballTrackFrom(f: PlaybackFixture): BallTrackCompact {
  const rows = f.ball.tracks.flatMap((t) => t.obs.map((o) => ({ o, kind: KIND[t.kind] ?? 3 }))).sort((a, b) => a.o[0] - b.o[0])
  const tossTrack = f.ball.tracks.find((t) => t.kind === 'toss')
  const fit = tossTrack?.fit ?? f.ball.toss?.fit
  return {
    frameIndices: Int32Array.from(rows.map((r) => r.o[0])),
    tReal: Float64Array.from(rows.map((r) => r.o[1])),
    x: Float32Array.from(rows.map((r) => r.o[2])),
    y: Float32Array.from(rows.map((r) => r.o[3])),
    r: Float32Array.from(rows.map((r) => r.o[4])),
    score: Float32Array.from(rows.map((r) => r.o[5])),
    kind: Uint8Array.from(rows.map((r) => r.kind)),
    predicted: Uint8Array.from(rows.map((r) => r.o[6])),
    ...(fit ? { tossFit: { a: fit.a, b: fit.b, c: fit.c, rmse: fit.rmse, tStart: fit.tStart, tEnd: fit.tEnd } } : {}),
  }
}

const ev = (frameIndex: number, fps: number, method: string, confidence: number, uncertaintyS: number): EventEstimate => ({
  frameIndex,
  tReal: frameIndex / fps,
  uncertaintyS,
  confidence,
  method,
})

/** Lowest point of the lowest visible foot landmark (largest y), or null. */
function footLowY(lm: (Pt | null)[] | null): number | null {
  if (!lm) return null
  const ys = [LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]
    .map((k) => lm[k])
    .filter((p): p is Pt => p !== null && p.v >= 0.5)
    .map((p) => p.y)
  return ys.length ? Math.max(...ys) : null
}

/** Events and phases (METRICS §2.4, §2.6), engine events first, the rest by the simplified rules. */
export function deriveEvents(f: PlaybackFixture, pose: PoseTrackCompact): { events: ServeEvents; phases: PhaseSpan[]; window: { startFrame: number; endFrame: number } } {
  const fps = f.meta.nominalFps
  const first = pose.frameIndices[0] ?? 0
  const last = pose.frameIndices[pose.frameIndices.length - 1] ?? f.meta.frameCount - 1
  const bh = f.pose.bodyHeightHU
  const release = f.ball.events.tossRelease
  const apex = f.ball.events.tossApex
  const contact =
    f.ball.events.contact ??
    (f.ball.contactFromAudioTReal !== null ? ev(Math.round(f.ball.contactFromAudioTReal * fps), fps, 'audio-onset', 0.8, 0.006) : undefined)
  const events: ServeEvents = {}
  if (release) events.tossRelease = release
  if (apex) events.tossApex = apex
  if (contact) events.contact = contact
  if (!release || !contact) return { events, phases: [], window: { startFrame: first, endFrame: last } }

  // setupStart / motionStart (§2.4.1): the clip starts settled; motion starts 0.8 s before release (fallback).
  events.setupStart = ev(first, fps, 'dev-fixture-clip-start', 0.6, 0.12)
  const motion = Math.max(first + 1, release.frameIndex - Math.round(0.8 * fps))
  events.motionStart = ev(motion, fps, 'dev-fixture-release-minus-0.8s', 0.4, 0.06)

  // trophy = lowest mid-hip in [release, contact − 0.08 s] (§2.4.4 pelvis-min); also the leg-drive low point.
  const endLow = contact.frameIndex - Math.round(0.08 * fps)
  let low = release.frameIndex
  let lowY = -Infinity
  for (let fr = release.frameIndex; fr <= endLow; fr++) {
    const h = midHipAt(pose, fr)
    if (h && h.y > lowY) {
      lowY = h.y
      low = fr
    }
  }
  events.trophy = ev(low, fps, 'dev-fixture-pelvis-min', 0.75, 0.045)
  events.lowestHip = ev(low, fps, 'dev-fixture-pelvis-min', 0.75, 0.045)

  // landing (§2.4.6, simplified): after an airborne stretch, the first frame a foot is back on the floor row.
  const stand = standingRef(pose, f.inputs.handedness, first, Math.max(first + 1, motion - 1))
  let landing = contact.frameIndex
  if (stand) {
    let airborne = false
    for (let fr = low; fr <= Math.min(last, contact.frameIndex + Math.round(1.0 * fps)); fr++) {
      const y = footLowY(landmarksAt(pose, fr))
      if (y === null) continue
      if (y < stand.groundY - 0.06 * bh) airborne = true
      else if (airborne && fr > contact.frameIndex && y >= stand.groundY - 0.03 * bh) {
        landing = fr
        break
      }
    }
    if (landing === contact.frameIndex) landing = Math.min(last, contact.frameIndex + Math.round(0.15 * fps))
  }
  events.landing = ev(landing, fps, 'dev-fixture-foot-contact', 0.7, 0.035)
  const recovery = Math.min(last, landing + Math.round(1.0 * fps))
  events.recoveryEnd = ev(recovery, fps, 'timeout', 0.3, 0.12)

  const c = contact.frameIndex
  const span = (phase: PhaseSpan['phase'], a: number, b: number, key: number, confidence: number): PhaseSpan => ({
    phase,
    startFrame: a,
    endFrame: Math.max(a, b),
    keyFrame: Math.min(Math.max(a, key), Math.max(a, b)),
    confidence,
  })
  const phases: PhaseSpan[] = [
    span('setup', first, motion - 1, Math.max(first, motion - Math.round(0.1 * fps)), 0.4),
    span('toss', motion, release.frameIndex - 1, release.frameIndex - 1, 0.4),
    span('loading', release.frameIndex, low - 1, low, 0.7),
    span('drive', low, c - 2, Math.round((low + c) / 2), 0.75),
    span('contact', c - 1, c + 1, c, contact.confidence),
    span('landing', c + 2, landing, landing, 0.7),
    span('recovery', landing + 1, recovery, recovery, 0.3),
  ]
  return { events, phases, window: { startFrame: first, endFrame: last } }
}

function mv(id: MetricId, value: number | string | null, unit: string, extra: Partial<MetricValue> = {}): MetricValue {
  return { id, value, unit, status: 'estimated', confidence: 0.8, basis: BASIS, validationLevel: 'V1', provenance: 'engine', ...extra }
}
function unavailable(id: MetricId, unit: string, reasonCode: MetricValue['reasonCode']): MetricValue {
  return { id, value: null, unit, status: 'unavailable', confidence: 0, basis: BASIS, reasonCode }
}
const round = (x: number, step: number) => Math.round(x / step) * step
const r2 = (x: number) => Math.round(x * 100) / 100

/** Per-serve values from the tracked data (METRICS §3, simplified). */
export function deriveMetrics(f: PlaybackFixture, pose: PoseTrackCompact, ball: BallTrackCompact, events: ServeEvents): Partial<Record<MetricId, MetricValue>> {
  const m: Partial<Record<MetricId, MetricValue>> = {}
  const heightM = f.inputs.playerHeightM
  const bh = f.pose.bodyHeightHU
  const aspect = f.meta.width / f.meta.height
  const fwd = forwardSign(f.inputs.handedness)
  const toCm = (hu: number) => (hu / bh) * heightM * 100
  const stand = standingRef(pose, f.inputs.handedness, pose.frameIndices[0] ?? 0, (events.motionStart?.frameIndex ?? 30) - 1)
  const apex = tossPeak(ball)
  const contactF = events.contact?.frameIndex
  const cb = contactF !== undefined ? ballNear(ball, contactF, 2) : null

  const engineApex = f.ball.metrics.find((x) => x.id === 'toss-apex-height')
  if (engineApex && typeof engineApex.value === 'number' && engineApex.status !== 'unavailable') {
    const v = engineApex.value
    const lo = engineApex.uncertainty?.low ?? v - 0.1
    const hi = engineApex.uncertainty?.high ?? v + 0.1
    m['toss-apex-height'] = mv('toss-apex-height', r2(v / heightM), 'ratio-of-height', {
      uncertainty: { kind: 'range', low: r2(lo / heightM), high: r2(hi / heightM) },
      secondary: { cm: Math.round(v * 100) },
      basis: engineApex.basis,
    })
  }
  if (apex && stand?.toe) {
    const cm = fwd * toCm((apex.x - stand.toe.x) * aspect)
    m['toss-forward'] = mv('toss-forward', Math.round(cm), 'cm', { uncertainty: { kind: 'ci95', low: Math.round(cm - 7), high: Math.round(cm + 7) } })
  }
  if (apex && cb) {
    const cm = toCm(cb.y - apex.y)
    m['toss-drop'] = mv('toss-drop', Math.round(cm), 'cm', { uncertainty: { kind: 'ci95', low: Math.round(cm - 9), high: Math.round(cm + 9) } })
  }
  if (cb && stand) {
    const ratio = (stand.groundY - cb.y) / bh
    m['contact-height-ratio'] = mv('contact-height-ratio', r2(ratio), 'ratio-of-height', {
      uncertainty: { kind: 'ci95', low: r2(ratio - 0.03), high: r2(ratio + 0.03) },
      secondary: { cm: Math.round(ratio * heightM * 100) },
    })
    if (stand.toe) {
      const cm = fwd * toCm((cb.x - stand.toe.x) * aspect)
      m['contact-forward'] = mv('contact-forward', Math.round(cm), 'cm', { uncertainty: { kind: 'ci95', low: Math.round(cm - 8), high: Math.round(cm + 8) } })
    }
  } else {
    m['contact-height-ratio'] = unavailable('contact-height-ratio', 'ratio-of-height', 'CONTACT_NOT_FOUND')
  }
  if (events.tossRelease && events.contact) {
    const ms = (events.contact.tReal - events.tossRelease.tReal) * 1000
    m['rhythm-release-to-contact'] = mv('rhythm-release-to-contact', round(ms, 10), 'ms', {
      uncertainty: { kind: 'ci95', low: round(ms - 50, 10), high: round(ms + 50, 10) },
    })
  }
  const low = events.lowestHip
  if (low && events.contact && events.tossRelease) {
    const hLow = midHipAt(pose, low.frameIndex)
    const hContact = midHipAt(pose, events.contact.frameIndex)
    const hRelease = midHipAt(pose, events.tossRelease.frameIndex)
    if (hLow && hContact) {
      const pct = (100 * (hLow.y - hContact.y)) / bh
      m['leg-drive'] = mv('leg-drive', Math.round(pct), '% of height', {
        uncertainty: { kind: 'ci95', low: Math.round(pct - 3), high: Math.round(pct + 3) },
        secondary: { cm: Math.round((pct / 100) * heightM * 100) },
      })
      const ms = (events.contact.tReal - low.tReal) * 1000
      m['drive-time'] = mv('drive-time', round(ms, 10), 'ms', { uncertainty: { kind: 'ci95', low: round(ms - 90, 10), high: round(ms + 90, 10) } })
    }
    if (hLow && hRelease) {
      const pct = (100 * (hLow.y - hRelease.y)) / bh
      m['loading-depth'] = mv('loading-depth', Math.round(pct), '% of height', { uncertainty: { kind: 'ci95', low: Math.round(pct - 3), high: Math.round(pct + 3) } })
    }
  }
  if (events.landing && stand?.toe) {
    const toe = frontToeOf(landmarksAt(pose, events.landing.frameIndex), f.inputs.handedness)
    if (toe) {
      const cm = fwd * toCm((toe.x - stand.toe.x) * aspect)
      m['landing-distance'] = mv('landing-distance', Math.round(cm), 'cm', { uncertainty: { kind: 'ci95', low: Math.round(cm - 12), high: Math.round(cm + 12) } })
    }
  }
  // One serve cannot set a player-relative band (METRICS §3.15): it needs the player's own reference.
  m['shoulder-tilt-trophy'] = unavailable('shoulder-tilt-trophy', 'band', 'TOO_FEW_SERVES')
  m['knee-bend-band'] = unavailable('knee-bend-band', 'band', 'NEEDS_REAR_VIEW')
  m['shoulder-over-shoulder-contact'] = unavailable('shoulder-over-shoulder-contact', 'band', 'NEEDS_REAR_VIEW')
  const speed = f.ball.metrics.find((x) => x.id === 'speed-experimental')
  m['speed-experimental'] =
    speed && speed.status !== 'unavailable'
      ? { ...speed, id: 'speed-experimental' }
      : unavailable('speed-experimental', 'km/h', /frame rate/i.test(speed?.unavailableReason ?? '') ? 'FPS_TOO_LOW' : 'TARGET_NOT_TAGGED')
  m.spin = unavailable('spin', 'rpm', 'NOT_MEASURABLE')
  return m
}

export interface FixtureServe {
  serve: ServeAnalysis
  track: TrackRecord
}

export function fixtureServe(f: PlaybackFixture, o: FixtureServeOptions): FixtureServe {
  const pose = poseTrackFrom(f)
  const ball = ballTrackFrom(f)
  const { events, phases, window } = deriveEvents(f, pose)
  const metrics = deriveMetrics(f, pose, ball, events)
  const fps = f.meta.nominalFps
  const id = `${o.sessionId}-serve-${String(o.index).padStart(2, '0')}`
  const orientation = f.meta.height > f.meta.width ? 'portrait' : 'landscape'
  const serve: ServeAnalysis = {
    schemaVersion: 1,
    id,
    sessionId: o.sessionId,
    videoId: o.videoId,
    index: o.index,
    mode: 'technique',
    view: f.inputs.view,
    handedness: f.inputs.handedness,
    window: { ...window, tStartReal: window.startFrame / fps, tEndReal: window.endFrame / fps },
    detection: { confidence: 0.9, cues: ['audio-contact', 'toss-arm', 'ball-above-head'], kind: 'serve', anchor: 'audio-contact' },
    events,
    phases,
    rectification: { status: 'unknown', source: 'none', orientation, fovDeg: 64, fovSource: 'lens-default' },
    toss: null,
    contact: null,
    legDrive: null,
    shoulder: null,
    rear: null,
    landing: null,
    audio: { usable: true, reason: 'Synthetic clip audio (timestamps only).' },
    speed: null,
    metrics,
    quality: { overall: 'good', checks: [] },
    plausibility: { hardRejects: [], softFlags: [] },
    included: true,
    exclusions: [],
    keyFrames: {},
    engine: {
      engineVersion: '0.0.0-dev-fixture',
      contract: 1,
      catalogueVersion: '1.1.0',
      poseModel: 'mediapipe-full',
      poseBackend: 'gpu',
      decodePath: 'webcodecs',
      analysedAt: o.analysedAt,
      durationMs: 0,
      paramsHash: 'dev-fixture',
      bandsVersion: 'bands_v1_provisional',
    },
  }
  return { serve, track: { serveId: id, sessionId: o.sessionId, pose, ball } }
}

export function fixtureVideo(
  f: PlaybackFixture,
  o: { id: string; sessionId: string; importedAt: string; sizeBytes: number; storage: VideoRecord['storage']; deletedReason?: VideoRecord['deletedReason'] },
): VideoRecord {
  const orientation = f.meta.height > f.meta.width ? 'portrait' : 'landscape'
  const retainUntil = new Date(o.importedAt).getTime() + 30 * 86_400_000
  return {
    id: o.id,
    sessionId: o.sessionId,
    role: 'primary',
    source: 'file-import',
    capture: {
      source: 'import',
      declaredView: f.inputs.view,
      cameraSide: 'chest',
      serveSide: f.inputs.servedFrom ?? 'deuce',
      serveNumber: 1,
      handedness: f.inputs.handedness,
      playerHeightM: f.inputs.playerHeightM,
      playerHeightSource: 'entered',
      orientation,
      setup: orientation === 'portrait' ? 'side-portrait' : 'side-landscape-fence',
      hitSoundTiming: false,
    },
    fileName: `${f.clip}.mp4`,
    mimeType: 'video/mp4',
    sizeBytes: o.sizeBytes,
    fingerprint: `dev-fixture-${f.clip}`,
    meta: f.meta,
    importedAt: o.importedAt,
    storage: o.storage,
    retention: { policy: 'auto-delete-days', pinned: 0, retainUntil },
    retainUntil,
    ...(o.storage === 'deleted' ? { deletedAt: new Date(retainUntil).toISOString(), deletedReason: o.deletedReason ?? 'retention' } : {}),
    audio: 'removed',
    isDemo: 1,
  }
}

export function fixtureSession(
  f: PlaybackFixture,
  o: { id: string; startedAt: string; label: string; videoIds: string[]; serveIds: string[] },
): SessionRecord {
  const orientation = f.meta.height > f.meta.width ? 'portrait' : 'landscape'
  return {
    id: o.id,
    createdAt: o.startedAt,
    startedAt: o.startedAt,
    visitId: o.startedAt.slice(0, 10),
    status: 'ready',
    mode: 'technique',
    view: f.inputs.view,
    cameraSide: 'chest',
    fpsClass: f.meta.captureFps >= 110 ? 'fps120plus' : f.meta.captureFps >= 50 ? 'fps60' : 'fps30',
    setup: orientation === 'portrait' ? 'side-portrait' : 'side-landscape-fence',
    tiltStatus: 'unknown',
    orientation,
    template: 'import',
    isRetest: 0,
    defaultSide: f.inputs.servedFrom ?? 'deuce',
    defaultServeNumber: 1,
    defaultIntendedType: 'flat',
    ...(f.inputs.targetTag ? { defaultTarget: f.inputs.targetTag } : {}),
    label: o.label,
    isDemo: 1,
  }
}

export function fixtureStats(sessionId: string, serveIds: string[], computedAt: string, bestServeId?: string): SessionStats {
  return {
    sessionId,
    inputsHash: `dev-fixture-${sessionId}`,
    computedAt,
    metrics: {},
    strata: [],
    outcomeLink: null,
    outcomeLinkChecks: [],
    derivedPerServe: {},
    representativeServeId: serveIds[0],
    ...(bestServeId ? { bestServeId } : {}),
  }
}
