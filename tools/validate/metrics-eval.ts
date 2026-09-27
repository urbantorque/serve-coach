/**
 * Offline metric validation (METRICS §5): runs the engine (app/src/analysis/engine.ts) on REAL
 * pipeline outputs of the synthetic corpus (per-frame cleaned poses, ball candidates and tracks,
 * the ball layer's toss analysis and audio onsets, dumped by `smoke.mjs --full`) and compares
 * every metric and event with the generator's truth (truth.json, truth-extra.json).
 *
 * Variants per clip:
 *   default   hit sound off (the D1 default), camera pitch from the truth camera (in-app sensor);
 *   audio     hit sound on (opt-in);
 *   injected  the clip's truth landmarks with InjectedPoseSource noise (METRICS §1.2 planning
 *             values) + MediaPipe-style persistent mirrors, cleaned like the app, with the SAME
 *             ball data: separates pose error from method error.
 *
 * Output: validation/results/metrics/<clip>.json and validation/results/metrics/SUMMARY.md.
 *
 *   app/node_modules/.bin/tsx tools/validate/metrics-eval.ts [--clips a,b] [--dump DIR] [--no-injected]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyseSession, type EngineInput, type EngineOutput } from '../../app/src/analysis/engine.ts'
import type { AudioOnset, BallObservation, BallTrack, CaptureContext, Landmark, MetricValue, PoseFrame, VideoMeta } from '../../app/src/analysis/types.ts'
import { applyPoseNoise, truthToPoseFrames } from '../../app/src/analysis/pose/injected.ts'
import { cleanPoseFrames } from '../../app/src/analysis/pose/smoothing.ts'
import { MIRROR_INDEX } from '../../app/src/analysis/pose/landmarks.ts'
import { mulberry32 } from '../../app/src/analysis/pose/rng.ts'
import { analyseBall, ballSetupFromPoses } from '../../app/src/analysis/ball/analyse.ts'
import type { FrameCandidates } from '../../app/src/analysis/ball/tracker.ts'
import { findServeWindows } from '../../app/src/analysis/engine.ts'
import { summariseSpread } from '../../app/src/analysis/stats/aggregate.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const flag = (name: string) => args.includes(name)
const dumpDir = resolve(option('--dump', join(repoRoot, 'validation/results/metrics/pipeline/full')))
const corpus = join(repoRoot, 'validation/synthetic')
const outDir = join(repoRoot, 'validation/results/metrics')
mkdirSync(outDir, { recursive: true })

// ---------- inputs ----------

interface Truth {
  settings: { view: string; orientation: string; fps: number; extrinsics: { R: number[] }; intrinsics: { fxPx: number; height: number }; lighting?: { preset?: string } }
  player: { heightM: number; handedness: 'right' | 'left'; profile: string }
  serves: { courtSide: 'deuce' | 'ad'; direction: 'T' | 'body' | 'wide'; style: 'flat' | 'slice' | 'kick'; events: Record<string, { tReal: number; inClip?: boolean }> }[]
  frames: { frameIndex: number; tReal: number; landmarks: { x: number; y: number; z?: number; visibility?: number }[] | null }[]
  video: { fps: number; captureFps: number; timeScale: number; width: number; height: number }
}

interface Canon {
  value: number | string | boolean | null
  alt?: Record<string, number | string>
  availability?: { supported: boolean; reason?: string }
}

interface Extra {
  serves: { canonical: Record<string, Canon>; continuous?: { events?: { hipLowest?: { tReal: number } } } }[]
}

type Dump = {
  ok: boolean
  inputs: { view: string; playerHeightM: number; handedness: 'right' | 'left'; targetTag: string; servedFrom: 'deuce' | 'ad' }
  meta: { final: VideoMeta; timeBase: { status: string; kind: string } }
  pose: { frames: { frameIndex: number; tReal: number; landmarks: number[][] | null }[]; clean: { frames: { frameIndex: number; tReal: number; landmarks: number[][] | null }[] } }
  audio: { onsets: AudioOnset[]; timing: { usable: boolean } } | null
  ball: { finalPass: number; passes: { frames: { frameIndex: number; tReal: number; candidates: number[][] }[]; tracks: { id: number; kind: string; observations: BallObservation[] }[]; toss: unknown }[] }
}

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

function posesFromDump(d: Dump): PoseFrame[] {
  // The dump keeps the cleaned poses in media time; after a slow-motion correction the app
  // re-cleans the raw poses on the real time axis (harness.ts), so do the same here.
  const scale = d.meta.final.timeScale ?? 1
  if (Math.abs(scale - 1) > 1e-6) {
    const raw: PoseFrame[] = d.pose.frames.map((f) => ({
      frameIndex: f.frameIndex,
      tReal: f.tReal * scale,
      landmarks: f.landmarks ? f.landmarks.map((r): Landmark => ({ x: r[0], y: r[1], z: r[2], visibility: r[3] })) : null,
      score: f.landmarks ? 1 : 0,
      source: 'mediapipe',
    }))
    return cleanPoseFrames(raw, { frameAspect: d.meta.final.width / d.meta.final.height }).frames
  }
  return d.pose.clean.frames.map((f) => ({
    frameIndex: f.frameIndex,
    tReal: f.tReal,
    landmarks: f.landmarks ? f.landmarks.map((r): Landmark => ({ x: r[0], y: r[1], z: r[2], visibility: r[3] })) : null,
    score: f.landmarks ? 1 : 0,
    source: 'mediapipe',
  }))
}

/** Camera pitch/roll from the truth extrinsics (rows = camera axes in court coordinates, z up). */
function truthPitchRoll(t: Truth): { pitchDeg: number; rollDeg: number } {
  const R = t.settings.extrinsics.R
  const pitchDeg = (Math.asin(Math.max(-1, Math.min(1, R[8]))) * 180) / Math.PI
  // Roll: the camera x axis's vertical component (positive when the right edge of the picture is up).
  const rollDeg = (Math.asin(Math.max(-1, Math.min(1, R[2]))) * 180) / Math.PI
  return { pitchDeg, rollDeg: Math.abs(rollDeg) < 1e-6 ? 0 : -rollDeg }
}

function buildInput(clip: string, d: Dump, t: Truth, variant: 'default' | 'audio' | 'injected', poses?: PoseFrame[]): EngineInput {
  const pass = d.ball.passes[d.ball.finalPass ?? 0]
  const observations: BallObservation[] = []
  for (const f of pass.frames) for (const c of f.candidates) observations.push({ frameIndex: f.frameIndex, tReal: f.tReal, x: c[0], y: c[1], radius: c[2], score: c[3], source: 'detected' })
  let tracks: BallTrack[] = pass.tracks.map((tr) => ({ id: tr.id, kind: tr.kind as BallTrack['kind'], observations: tr.observations }))
  let tossEntries: unknown[] = pass.toss ? [pass.toss] : []
  const allPoses = poses ?? posesFromDump(d)
  if (!tracks.length && t.serves.length > 1) {
    // Multi-serve clip: the single-serve harness did not track; track per window like the app's
    // pipeline does (engine windows → ball layer per window).
    const aspect = d.meta.final.width / d.meta.final.height
    const windows = findServeWindows(allPoses, d.meta.final, d.inputs.handedness)
    tossEntries = []
    tracks = []
    let id = 1
    for (const w of windows) {
      const frames: FrameCandidates[] = pass.frames
        .filter((f) => f.tReal >= w.startReal && f.tReal <= w.endReal)
        .map((f) => ({ frameIndex: f.frameIndex, tReal: f.tReal, candidates: f.candidates.map((c) => ({ x: c[0], y: c[1], radiusNorm: c[2], score: c[3], streakLengthNorm: Number.isFinite(c[6]) ? c[6] : undefined })) }))
      const wp = allPoses.filter((p) => p.tReal >= w.startReal && p.tReal <= w.endReal)
      const setup = ballSetupFromPoses(wp, { aspect, handedness: d.inputs.handedness, playerHeightM: d.inputs.playerHeightM })
      const a = analyseBall(frames, { setup, captureFps: d.meta.final.captureFps, timeBaseKnown: false, cameraView: d.inputs.view === 'rear' ? 'rear' : 'side' })
      for (const tr of a.tracks) tracks.push({ ...tr, id: id++ })
      tossEntries.push({ startReal: w.startReal, endReal: w.endReal, toss: a.toss })
    }
  }
  const tv = t.settings.view
  const declared = tv === 'rear' ? 'rear' : 'side'
  const pr = truthPitchRoll(t)
  const serve = t.serves[0]
  const multi = t.serves.length > 1
  const lighting = t.settings.lighting?.preset ?? ''
  const meta: VideoMeta = {
    ...d.meta.final,
    timeBaseStatus: d.meta.timeBase.status === 'proven' ? 'proven' : 'unknown',
    timeBaseKind: d.meta.timeBase.kind as VideoMeta['timeBaseKind'],
  }
  const capture: CaptureContext = {
    source: 'in-app-native',
    declaredView: declared,
    cameraSide: 'chest',
    serveSide: multi ? 'both' : serve?.courtSide ?? d.inputs.servedFrom ?? 'deuce',
    serveNumber: 1,
    intendedType: serve?.style,
    intendedTarget: multi ? 'mixed' : serve?.direction,
    handedness: d.inputs.handedness,
    playerHeightM: d.inputs.playerHeightM,
    playerHeightSource: 'entered',
    orientation: meta.width < meta.height ? 'portrait' : 'landscape',
    orientationSamples: [{ tMs: 0, pitchDeg: pr.pitchDeg, rollDeg: pr.rollDeg }],
    conditions: { light: /night/.test(lighting) ? 'lights' : 'day' },
    hitSoundTiming: variant === 'audio',
  }
  return {
    meta,
    view: declared,
    capture,
    profile: { heightM: d.inputs.playerHeightM, handedness: d.inputs.handedness },
    poses: allPoses,
    ball: { observations, tracks, toss: tossEntries },
    onsets: d.audio?.onsets ?? [],
    targetTags: serve ? Object.fromEntries(t.serves.map((sv, k) => [k + 1, sv.direction])) : undefined,
    ids: { sessionId: clip, videoId: clip },
    heightEntered: true,
  }
}

/** Truth landmarks with planning noise (§1.2: 0.02–0.03 BH per joint) and persistent mirrors (S11). */
function injectedPoses(t: Truth, seed: number): PoseFrame[] {
  const aspect = t.video.width / t.video.height
  // Truth visibility marks self-occluded far-side joints (0.4); MediaPipe reports them visible in side
  // views, so the injected poses use a uniform base visibility (noise and dropouts come from the model).
  const clean = truthToPoseFrames(t.frames.map((f) => ({ frameIndex: f.frameIndex, tReal: f.tReal, landmarks: f.landmarks ? f.landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z })) : null })), 0.95)
  const noisy = applyPoseNoise(clean, { seed, jitterSigmaBodyHeights: 0.02, speedJitterS: 0.006, swapProb: 0.01, swapMeanFrames: 4 }, { frameAspect: aspect })
  // A persistent whole-body mirror over the setup (as MediaPipe does in side views), then correct.
  const rng = mulberry32(seed + 17)
  const cut = Math.floor(noisy.frames.length * (0.3 + 0.15 * rng()))
  const frames = noisy.frames.map((f, i) => (i < cut && f.landmarks ? { ...f, landmarks: MIRROR_INDEX.map((j) => f.landmarks![j]) } : f))
  return cleanPoseFrames(frames, { frameAspect: aspect }).frames
}

// ---------- comparisons ----------

interface Row {
  clip: string
  set: string
  variant: string
  metric: string
  status: string
  reason?: string
  value?: number | string | null
  truth?: number | string | boolean | null
  error?: number
  covered?: boolean
  low?: number
  high?: number
}

interface EventRow {
  clip: string
  set: string
  variant: string
  event: string
  errorMs: number | null
  method?: string
  sigmaMs?: number
  fps: number
}

const setOf = (clip: string) => clip.replace(/-s\d+$/, '')

const NUMERIC: Record<string, { scale: number; truthScale: number; label: string }> = {
  'toss-apex-height': { scale: 1, truthScale: 1, label: 'ratio' },
  'toss-forward': { scale: 1, truthScale: 100, label: 'cm' },
  'toss-lateral': { scale: 1, truthScale: 100, label: 'cm' },
  'toss-drop': { scale: 1, truthScale: 100, label: 'cm' },
  'contact-height-ratio': { scale: 1, truthScale: 1, label: 'ratio' },
  'contact-forward': { scale: 1, truthScale: 100, label: 'cm' },
  'rhythm-release-to-contact': { scale: 1, truthScale: 1000, label: 'ms' },
  'trophy-pause': { scale: 1, truthScale: 1000, label: 'ms' },
  'leg-drive': { scale: 1, truthScale: 1, label: '% H' },
  'drive-time': { scale: 1, truthScale: 1000, label: 'ms' },
  'loading-depth': { scale: 1, truthScale: 1, label: '% H' },
  'landing-distance': { scale: 1, truthScale: 100, label: 'cm' },
}

/** Unrounded engine values where the MetricValue is display-rounded. */
function exactValue(s: EngineOutput['serves'][number] | undefined, id: string): number | undefined {
  if (!s) return undefined
  const m = s.metrics[id as keyof typeof s.metrics]
  if (!m || typeof m.value !== 'number') return undefined
  switch (id) {
    case 'toss-apex-height':
      return m.value as number
    case 'contact-height-ratio':
      return s.contact?.heightOverStature?.value ?? (m.value as number)
    case 'leg-drive':
      return s.legDrive?.hipRisePctH?.value ?? (m.value as number)
    case 'loading-depth':
      return s.legDrive?.hipDropPctH?.value ?? (m.value as number)
    case 'drive-time':
      return s.legDrive?.driveTimeMs?.value ?? (m.value as number)
    default:
      return m.value as number
  }
}

function compare(clip: string, variant: string, out: EngineOutput, extra: Extra, truth: Truth): { rows: Row[]; events: EventRow[] } {
  const rows: Row[] = []
  const events: EventRow[] = []
  const set = setOf(clip)
  const found = out.serves.filter((x) => x.detection.kind === 'serve')
  rows.push({ clip, set, variant, metric: 'serve-count', status: String(out.stats.metrics['serve-count']?.status), value: found.length, truth: truth.serves.length, error: found.length - truth.serves.length })
  truth.serves.forEach((ts, k) => {
    const tc = ts.events.contact?.tReal
    const s = truth.serves.length === 1 ? out.serves[0] : out.serves.find((x) => x.events.contact && tc !== undefined && Math.abs(x.events.contact.tReal - tc) < 0.3)
    const r = compareServe(clip, variant, s, extra.serves[k]?.canonical ?? {}, extra.serves[k], ts, truth)
    rows.push(...r.rows)
    events.push(...r.events)
  })
  // Spreads (multi-serve clips): the engine's noise-corrected SD over the matched serves vs the SD of
  // the realised truth values over the same serves (§5.2). Strata split by court side in the
  // session output; here all serves are pooled to test the per-serve noise and the correction.
  if (truth.serves.length >= 8) {
    const H = truth.player.heightM
    const specs: [string, string, number, number][] = [
      ['toss-height-spread (pooled)', 'toss-apex-height', H * 100, H * 100],
      ['toss-forward-spread (pooled)', 'toss-forward', 1, 100],
      ['contact-height-spread (pooled)', 'contact-height-ratio', H * 100, H * 100],
      ['rhythm-spread (pooled)', 'rhythm-release-to-contact', 1, 1000],
    ]
    for (const [label, id, scale, truthScale] of specs) {
      const pairs: { v: number; sr: number; tv: number }[] = []
      truth.serves.forEach((ts, k) => {
        const tc = ts.events.contact?.tReal
        const sv = out.serves.find((x) => x.events.contact && tc !== undefined && Math.abs(x.events.contact.tReal - tc) < 0.3)
        const m = sv?.metrics[id as keyof typeof sv.metrics]
        const c = extra.serves[k]?.canonical[id]
        if (m && typeof m.value === 'number' && m.status !== 'unavailable' && typeof c?.value === 'number') {
          const v = exactValue(sv, id) ?? m.value
          pairs.push({ v: v * scale, sr: (m.sigmaRandom ?? 0) * scale, tv: c.value * truthScale })
        }
      })
      if (pairs.length < 8) continue
      const sp = summariseSpread(pairs.map((p) => ({ value: p.v, sigmaRandom: p.sr })))
      const tm = pairs.reduce((a, p) => a + p.tv, 0) / pairs.length
      const tsd = Math.sqrt(pairs.reduce((a, p) => a + (p.tv - tm) ** 2, 0) / (pairs.length - 1))
      rows.push({ clip, set, variant, metric: label, status: 'pooled', value: sp.value, truth: tsd, error: sp.value !== null ? sp.value - tsd : undefined, low: sp.ci95?.[0], high: sp.ci95?.[1], covered: sp.ci95 ? tsd >= sp.ci95[0] && tsd <= sp.ci95[1] : undefined })
    }
    for (const id of ['toss-height-spread', 'toss-forward-spread', 'contact-height-spread', 'rhythm-spread']) {
      const m = out.stats.metrics[id as keyof typeof out.stats.metrics]
      if (m) rows.push({ clip, set, variant, metric: `${id} (session headline stratum)`, status: m.status, reason: m.reasonCode, value: m.value as number | null })
    }
  }
  return { rows, events }
}

function compareServe(clip: string, variant: string, s: EngineOutput['serves'][number] | undefined, canon: Record<string, Canon>, extraServe: Extra['serves'][number] | undefined, truthServe: Truth['serves'][number], truth: Truth): { rows: Row[]; events: EventRow[] } {
  const rows: Row[] = []
  const events: EventRow[] = []
  const set = setOf(clip)
  if (!s) return { rows, events }
  for (const [id, cfg] of Object.entries(NUMERIC)) {
    const m = s.metrics[id as keyof typeof s.metrics] as MetricValue | undefined
    const c = canon[id]
    const truthVal = typeof c?.value === 'number' ? c.value * cfg.truthScale : null
    if (!m) continue
    const row: Row = { clip, set, variant, metric: id, status: m.status, reason: m.reasonCode, value: m.value as number | null, truth: truthVal }
    if (m.status !== 'unavailable' && typeof m.value === 'number' && truthVal !== null) {
      const v = exactValue(s, id) ?? m.value
      row.value = v
      row.error = v - truthVal
      if (m.uncertainty) {
        row.low = m.uncertainty.low
        row.high = m.uncertainty.high
        row.covered = truthVal >= m.uncertainty.low && truthVal <= m.uncertainty.high
      }
    }
    rows.push(row)
  }
  // Shoulder tilt: internal φ vs the level-corrected 2D truth at the lowest hip, and 3D.
  const phi = s.shoulder?.trophyTilt2DDeg?.value
  const st = canon['shoulder-tilt-trophy']
  if (st) {
    const t2 = Number(st.alt?.atHipLowest2DLevel ?? st.alt?.deg2DLevel)
    rows.push({ clip, set, variant, metric: 'shoulder-tilt-trophy (2D level, deg)', status: String(s.metrics['shoulder-tilt-trophy']?.status), reason: s.metrics['shoulder-tilt-trophy']?.reasonCode, value: phi ?? null, truth: t2, error: phi !== undefined ? phi - t2 : undefined })
    rows.push({ clip, set, variant, metric: 'shoulder-tilt-trophy (3D, deg)', status: String(s.metrics['shoulder-tilt-trophy']?.status), value: phi ?? null, truth: Number(st.value), error: phi !== undefined ? phi - Number(st.value) : undefined })
  }
  const db = canon['deep-bend-flag']
  const m = s.metrics['deep-bend-flag']
  if (db && m) rows.push({ clip, set, variant, metric: 'deep-bend-flag', status: m.status, reason: m.reasonCode, value: m.status === 'unavailable' ? null : String(m.flag), truth: String(db.value), error: m.status === 'unavailable' ? undefined : m.flag === db.value ? 0 : 1 })
  const kb = canon['knee-bend-band']
  const km = s.metrics['knee-bend-band']
  if (kb && km) {
    const map: Record<string, string> = { little: 'low', moderate: 'typical', deep: 'high' }
    rows.push({ clip, set, variant, metric: 'knee-bend-band', status: km.status, reason: km.reasonCode, value: km.band ?? null, truth: map[String(kb.value)] ?? String(kb.value), error: km.status === 'unavailable' ? undefined : km.band === 'unclear' ? undefined : km.band === map[String(kb.value)] ? 0 : 1 })
  }
  const sp = canon['speed-experimental']
  const sm = s.metrics['speed-experimental']
  if (sp && sm) rows.push({ clip, set, variant, metric: 'speed-experimental', status: sm.status, reason: sm.reasonCode, value: sm.value as string, truth: Number(sp.value), covered: sm.uncertainty ? Number(sp.value) >= sm.uncertainty.low && Number(sp.value) <= sm.uncertainty.high : undefined, low: sm.uncertainty?.low, high: sm.uncertainty?.high, error: sm.uncertainty ? (sm.uncertainty.low + sm.uncertainty.high) / 2 - Number(sp.value) : undefined })
  // Events.
  const te = truthServe?.events ?? {}
  const hipLowest = extraServe?.continuous?.events?.hipLowest?.tReal
  const pairs: [string, string, number | undefined][] = [
    ['tossRelease', 'tossRelease', te.tossRelease?.tReal],
    ['tossApex', 'tossApex', te.tossApex?.tReal],
    ['trophy (lowest hip)', 'lowestHip', hipLowest],
    ['contact', 'contact', te.contact?.tReal],
    ['landing', 'landing', te.landing?.tReal],
    ['recoveryEnd', 'recoveryEnd', te.recoveryEnd?.tReal],
    ['motionStart', 'motionStart', te.motionStart?.tReal],
  ]
  for (const [label, key, tt] of pairs) {
    const e = (s.events as Record<string, { tReal: number; uncertaintyS: number; method: string } | undefined>)[key]
    events.push({ clip, set, variant, event: label, errorMs: e && tt !== undefined ? (e.tReal - tt) * 1000 : null, method: e?.method, sigmaMs: e ? e.uncertaintyS * 1000 : undefined, fps: truth.video.captureFps })
  }
  return { rows, events }
}

// ---------- summary statistics ----------

function stats(xs: number[]): { n: number; bias: number; mae: number; max: number; p95: number } {
  const n = xs.length
  if (!n) return { n: 0, bias: NaN, mae: NaN, max: NaN, p95: NaN }
  const abs = xs.map(Math.abs).sort((a, b) => a - b)
  return {
    n,
    bias: xs.reduce((a, b) => a + b, 0) / n,
    mae: abs.reduce((a, b) => a + b, 0) / n,
    max: abs[n - 1],
    p95: abs[Math.min(n - 1, Math.ceil(0.95 * n) - 1)],
  }
}

const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–')

// ---------- run ----------

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()

function main(): void {

const wanted = option('--clips', '')
const available = existsSync(dumpDir) ? readdirSync(dumpDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : []
const clips = (wanted ? wanted.split(',') : available).filter((c) => available.includes(c) && existsSync(join(corpus, 'clips', c, 'truth.json')))
const allRows: Row[] = []
const allEvents: EventRow[] = []
const perClip: Record<string, unknown> = {}
const audioLabels: Record<string, number> = {}
const t0 = Date.now()
for (const clip of clips) {
  const d = readJson<Dump>(join(dumpDir, `${clip}.json`))
  if (!d.ok || !d.pose || !d.ball) continue
  const truth = readJson<Truth>(join(corpus, 'clips', clip, 'truth.json'))
  const extraPath = join(corpus, 'clips', clip, 'truth-extra.json')
  const extra: Extra = existsSync(extraPath) ? readJson<Extra>(extraPath) : { serves: [] }
  // Audio labeller check: onset labels against the rendered sound kinds.
  for (const ev of (truth as unknown as { audio?: { events?: { kind: string; arrivalTMedia: number }[] } }).audio?.events ?? []) {
    const o = d.audio?.onsets.find((x) => Math.abs((x.tMedia ?? x.tReal) - ev.arrivalTMedia) < 0.005)
    const k = `${ev.kind} → ${o ? o.kind : '(no onset)'}`
    audioLabels[k] = (audioLabels[k] ?? 0) + 1
  }
  const variants: ('default' | 'audio' | 'injected')[] = ['default', 'audio', ...(flag('--no-injected') ? [] : (['injected'] as const))]
  const clipOut: Record<string, unknown> = {}
  for (const variant of variants) {
    let out: EngineOutput
    try {
      const poses = variant === 'injected' ? injectedPoses(truth, 1000 + clips.indexOf(clip)) : undefined
      out = analyseSession(buildInput(clip, d, truth, variant, poses))
    } catch (error) {
      console.error(`${clip} ${variant}: ${(error as Error).stack}`)
      continue
    }
    const { rows, events } = compare(clip, variant, out, extra, truth)
    allRows.push(...rows)
    allEvents.push(...events)
    clipOut[variant] = {
      rows,
      events,
      warnings: out.warnings,
      quality: out.quality.overall,
      qualityChecks: out.quality.checks.filter((c) => !c.pass).map((c) => `${c.id}:${c.severity}`),
      serve: out.serves[0]
        ? {
            classification: out.serves[0].detection.kind,
            included: out.serves[0].included,
            exclusions: out.serves[0].exclusions,
            plausibility: out.serves[0].plausibility,
            metrics: Object.fromEntries(Object.entries(out.serves[0].metrics).map(([k, v]) => [k, { status: v!.status, value: v!.value, reason: v!.reasonCode, low: v!.uncertainty?.low, high: v!.uncertainty?.high }])),
            events: out.serves[0].events,
          }
        : null,
    }
  }
  perClip[clip] = clipOut
  writeFileSync(join(outDir, `${clip}.json`), JSON.stringify(clipOut, null, 1))
}

// ---------- SUMMARY.md ----------

const lines: string[] = []
const sets = [...new Set(allRows.map((r) => r.set))].sort()
lines.push('# Metric validation on the synthetic corpus (engine-core)')
lines.push('')
lines.push(`Generated ${new Date().toISOString()} by \`tools/validate/metrics-eval.ts\` in ${((Date.now() - t0) / 1000).toFixed(0)} s over ${clips.length} clips.`)
lines.push('')
lines.push('Inputs are the app pipeline\'s REAL outputs for each rendered clip (cleaned MediaPipe poses, ball candidates, tracks and toss analysis, audio onsets; `smoke.mjs --full`), with the truth camera pitch passed as an in-app sensor reading. Truth is the generator\'s `truth.json` and `truth-extra.json` (`canonical`). No real footage is involved; every figure is synthetic (METRICS §6 item 8).')
lines.push('')
lines.push('Variants: **default** (hit sound off), **audio** (hit sound on), **injected** (truth landmarks + planning noise 0.02 BH, speed blur, swaps and a persistent setup mirror, cleaned like the app; same ball data). Coverage = share of truths inside the per-serve 95% interval (V1 gate ≥ 93%).')
lines.push('')
{
  const noisePath = join(outDir, 'noise.json')
  const noise = existsSync(noisePath) ? readJson<{ summary: Record<string, { median: number; p90: number; n: number }> }>(noisePath).summary : null
  const nz = (k: string, d = 3) => (noise?.[k] ? `${noise[k].median.toFixed(d)} (p90 ${noise[k].p90.toFixed(d)})` : '–')
  lines.push('## Findings and engine decisions')
  lines.push('')
  lines.push('- **Measured pose noise (METRICS §5.5; `validation/results/metrics/noise.json`, `tools/validate/metrics-eval.noise.ts`).** Cleaned MediaPipe vs truth, side view, in body heights (BH): mid-hip random SD ' + nz('midHipY.randomSd') + ', bias ' + nz('midHipY.bias') + '; lowest foot point in stance random SD ' + nz('lowestFootY(stance).randomSd') + ', bias ' + nz('lowestFootY(stance).bias') + '; front toe x bias ' + nz('toeLX.bias') + '; wrists random SD ' + nz('wristRY.randomSd') + '. The planning values of §1.2 (0.02–0.03 BH) are about 5–10× the measured random noise, so detection thresholds use max(floor, 3 × measured noise per serve).')
  lines.push('- **Left/right mirror fix.** A whole-body mirror fit MediaPipe better than its own labels in ' + (noise?.mirrorBefore ? `${Math.round(noise.mirrorBefore.median * 100)}%` : '–') + ' of side-view frames (median per clip; the brief quoted 36%), typically one persistent mirrored stretch before release. `serve/relabel.ts` (two-state Viterbi: limb continuity + tossing hand near the ball, highest wrist at contact, front foot towards the net) brings it to ' + (noise?.mirrorAfter ? `${Math.round(noise.mirrorAfter.median * 100)}% (p90 ${Math.round(noise.mirrorAfter.p90 * 100)}%)` : '–') + '. Roles used by metrics stay geometric (§1.1).')
  const al = Object.entries(audioLabels).sort()
  lines.push('- **Audio labeller (`video/audio.ts`).** The earlier score labelled the racket pop `unknown` and footsteps `contact` on every clip. Now (onsets matched to the rendered sounds within 5 ms): ' + (al.length ? al.map(([k, v]) => `${k} ${v}`).join('; ') : '–') + '. Distractor hits on another court are `contact`-like by design and are ignored unless they fall in the serve\'s contact window.')
  lines.push('- **Release (hero 3 timing).** The ball hinge fit reads the release ~12 ms early at ≥ 60 fps on development seeds s1–s3 (test seeds ~21 ms): corrected by +12.5 ms, σ floor 25 ms kept. The pose hand-separation method lags by ~60 ms (the separation threshold is crossed after the hand decelerates) and is used only as a lag-corrected fallback. At 30 fps the hinge fit is unreliable (MAE ~80 ms): σ ≥ 100 ms and rhythm capped at experimental (FPS_TOO_LOW).')
  lines.push('- **Contact.** `ball-intersection` (outgoing line meets the toss parabola) MAE ≈ 1 ms at ≥ 60 fps; `ball-bracket` bias +3.9 ms (β_occ −4 ms), wrist apex bias −7.4 ms (β_w +7.4 ms), all calibrated on s1–s3.')
  lines.push('- **Depth prior (§3.2).** The generator renders tosses 0.09–0.21 m nearer the camera than the body; the spec prior is 0.30 ± 0.15 m (flat/slice). It is kept (real-world evidence, σ in σ_p). At the D1 distances (7–9 m) corrected heights are within ±2% of height; at 5 m they read 4–7% low, so heights nearer than 6 m are capped at experimental (VALIDATION_PENDING). With truth landmarks (injected) the bias is larger (MediaPipe reads raw heights ~3% high, partly cancelling).')
  lines.push('- **Leg drive.** Method error with injected noise: MAE ≈ 0.6% of height. MediaPipe\'s hip landmark reads the rise ~2% of height low (posture-dependent, persistent, §1.2 σ_p): it cancels in the player-relative band and is stated in the basis.')
  lines.push('- **Trophy (lowest hip).** The minimum is flat (loading depth 1–3% of height on the corpus): timing MAE ≈ 75–90 ms, so `drive-time` fails its 50 ms threshold and stays experimental; σ now grows with the flatness (45–150 ms). Acceptance depth uses 3 × measured hip noise (floor 0.01 BH) instead of the planning 0.03 BH.')
  lines.push('- **Landing.** Each foot is measured against its own standing level (the far foot projects higher); small recreational jumps (2–5 cm) are found by the foot coming back down through 35% of its lift. `landing-distance` stays experimental (p95 fails on the D1 set and with injected foot noise).')
  lines.push('- **Start toe S0.** MediaPipe\'s foot point jumps back by up to 0.1 BH for a few frames as the tossing arm passes at release, so S0 is the median over the planted stance up to release (not only release ± 0.1 s). The foot point still sits ~0.02 BH behind the toe tip: forward positions read ~4–5 cm long and fail MAE ≤ 5 cm narrowly (V0); their spreads are unaffected.')
  lines.push('- **View check.** Declared side but filmed at 45° in front: the served ball rises in the picture (< −1 BH/s) → VIEW_MISMATCH on all 5 front45 clips; no false alarms on side clips.')
  lines.push('- **Spreads.** The corpus has one multi-serve clip (8 serves, 4 per court side, so the per-stratum spreads are correctly TOO_FEW_SERVES); pooled over all 8 the corrected SDs are within threshold (toss height +0.8 cm, forward −2.2 cm, rhythm −5 ms). The S9 variability family (20-serve blocks, sdScale) is not rendered yet, so spread V1 rests on this block plus per-serve error analysis.')
  lines.push('- **Trophy pause** thresholds were grid-searched on development seeds (`tools/validate/metrics-eval.grid.ts`: pelvis 0.02 BH/s, wrists 0.2 BH/s); MAE ~65 ms stays above 60 ms, so it stays experimental.')
  lines.push('')
}
for (const variant of ['default', 'audio', 'injected']) {
  const vr = allRows.filter((r) => r.variant === variant)
  if (!vr.length) continue
  lines.push(`## ${variant}: per metric (all clips)`)
  lines.push('')
  lines.push('| metric | unit | n measured | bias | MAE | p95 | max | coverage | status distribution |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  const metrics = [...new Set(vr.map((r) => r.metric))]
  for (const m of metrics) {
    const rs = vr.filter((r) => r.metric === m)
    const errs = rs.filter((r) => typeof r.error === 'number').map((r) => r.error!)
    const st = stats(errs)
    const cov = rs.filter((r) => r.covered !== undefined)
    const statusCounts: Record<string, number> = {}
    for (const r of rs) {
      const k = r.status === 'unavailable' ? `unavailable:${r.reason}` : r.reason && r.status !== 'estimated' ? `${r.status}:${r.reason}` : r.status
      statusCounts[k] = (statusCounts[k] ?? 0) + 1
    }
    const unit = NUMERIC[m]?.label ?? (m.includes('deg') ? 'deg' : m === 'serve-count' ? 'count' : '')
    const d = unit === 'ratio' ? 3 : 1
    lines.push(`| ${m} | ${unit} | ${st.n} of ${rs.length} | ${fmt(st.bias, d)} | ${fmt(st.mae, d)} | ${fmt(st.p95, d)} | ${fmt(st.max, d)} | ${cov.length ? `${Math.round((100 * cov.filter((r) => r.covered).length) / cov.length)}% (${cov.length})` : '–'} | ${Object.entries(statusCounts).map(([k, v]) => `${k} ${v}`).join(', ')} |`)
  }
  lines.push('')
  lines.push(`### ${variant}: per metric × scenario (MAE / bias / coverage / measured)`)
  lines.push('')
  const keyMetrics = ['toss-apex-height', 'toss-drop', 'contact-height-ratio', 'toss-forward', 'contact-forward', 'rhythm-release-to-contact', 'leg-drive', 'drive-time', 'loading-depth', 'landing-distance', 'trophy-pause', 'shoulder-tilt-trophy (2D level, deg)']
  lines.push(`| scenario | ${keyMetrics.join(' | ')} |`)
  lines.push(`| --- | ${keyMetrics.map(() => '---').join(' | ')} |`)
  for (const set of sets) {
    const cells = keyMetrics.map((m) => {
      const rs = vr.filter((r) => r.set === set && r.metric === m)
      if (!rs.length) return '–'
      const errs = rs.filter((r) => typeof r.error === 'number').map((r) => r.error!)
      const st = stats(errs)
      const cov = rs.filter((r) => r.covered !== undefined)
      const d = m.includes('ratio') || m === 'toss-apex-height' ? 3 : 1
      if (!st.n) return `– (0/${rs.length}: ${[...new Set(rs.map((r) => r.reason))].join(',')})`
      return `${fmt(st.mae, d)} / ${fmt(st.bias, d)} / ${cov.length ? Math.round((100 * cov.filter((r) => r.covered).length) / cov.length) + '%' : '–'} / ${st.n}/${rs.length}`
    })
    lines.push(`| ${set} | ${cells.join(' | ')} |`)
  }
  lines.push('')
  lines.push(`### ${variant}: event timing error (ms; MAE / bias / n found of clips), by capture fps`)
  lines.push('')
  const ve = allEvents.filter((e) => e.variant === variant)
  const fpsList = [...new Set(ve.map((e) => e.fps))].sort((a, b) => a - b)
  const evNames = [...new Set(ve.map((e) => e.event))]
  lines.push(`| event | ${fpsList.map((f) => `${f} fps`).join(' | ')} |`)
  lines.push(`| --- | ${fpsList.map(() => '---').join(' | ')} |`)
  for (const ev of evNames) {
    const cells = fpsList.map((f) => {
      const es = ve.filter((e) => e.event === ev && e.fps === f)
      const errs = es.filter((e) => e.errorMs !== null).map((e) => e.errorMs!)
      const st = stats(errs)
      return st.n ? `${fmt(st.mae)} / ${fmt(st.bias)} / ${st.n}/${es.length}` : `– / 0/${es.length}`
    })
    lines.push(`| ${ev} | ${cells.join(' | ')} |`)
  }
  lines.push('')
}
// ---------- acceptance (METRICS §3 S0 thresholds; §5.4) ----------
{
  const d = allRows.filter((r) => r.variant === 'default')
  const fpsOf = new Map(allEvents.filter((e) => e.variant === 'default').map((e) => [e.clip, e.fps]))
  const D1 = ['default75', 'fence9', 'dist7']
  const excluded = ['dist4', 'front45', 'night240', 'rear', 'quick-rear30-lefty', 'fps30', 'session']
  const groups: { name: string; pick: (r: Row) => boolean }[] = [
    { name: 'D1 envelope (portrait 7–7.5 m, landscape fence 9 m)', pick: (r) => D1.includes(r.set) },
    { name: 'all side-view day clips ≥ 60 fps', pick: (r) => !excluded.includes(r.set) && (fpsOf.get(r.clip) ?? 60) >= 60 },
  ]
  type Rule = { metric: string; label: string; check: (errs: number[], cov: number | null) => boolean; stat: (errs: number[], cov: number | null) => string }
  const med = (xs: number[]) => {
    const s = xs.map(Math.abs).sort((a, b) => a - b)
    return s.length ? s[s.length >> 1] : NaN
  }
  const covOk = (c: number | null) => c === null || c >= 0.93
  const rules: Rule[] = [
    { metric: 'toss-apex-height', label: 'median |e| ≤ 0.025, p95 ≤ 0.05, cov ≥ 93%', check: (e, c) => med(e) <= 0.025 && stats(e).p95 <= 0.05 && covOk(c), stat: (e, c) => `median ${fmt(med(e), 3)}, p95 ${fmt(stats(e).p95, 3)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'toss-forward', label: 'MAE ≤ 5 cm, p95 ≤ 10, cov ≥ 93%', check: (e, c) => stats(e).mae <= 5 && stats(e).p95 <= 10 && covOk(c), stat: (e, c) => `MAE ${fmt(stats(e).mae)}, p95 ${fmt(stats(e).p95)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'toss-drop', label: 'MAE ≤ 5 cm, cov ≥ 93%', check: (e, c) => stats(e).mae <= 5 && covOk(c), stat: (e, c) => `MAE ${fmt(stats(e).mae)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'contact-height-ratio', label: 'MAE ≤ 0.03, p95 ≤ 0.05, cov ≥ 93%', check: (e, c) => stats(e).mae <= 0.03 && stats(e).p95 <= 0.05 && covOk(c), stat: (e, c) => `MAE ${fmt(stats(e).mae, 3)}, p95 ${fmt(stats(e).p95, 3)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'contact-forward', label: 'MAE ≤ 6 cm, p95 ≤ 12, cov ≥ 93%', check: (e, c) => stats(e).mae <= 6 && stats(e).p95 <= 12 && covOk(c), stat: (e, c) => `MAE ${fmt(stats(e).mae)}, p95 ${fmt(stats(e).p95)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'rhythm-release-to-contact', label: 'MAE ≤ 1 frame + 5 ms (21.7 ms at 60), cov ≥ 93%', check: (e, c) => stats(e).mae <= 21.7 && covOk(c), stat: (e, c) => `MAE ${fmt(stats(e).mae)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'trophy-pause', label: 'MAE ≤ 60 ms', check: (e) => stats(e).mae <= 60, stat: (e) => `MAE ${fmt(stats(e).mae)}` },
    { metric: 'leg-drive', label: 'MAE ≤ 2% H, cov ≥ 93%', check: (e, c) => stats(e).mae <= 2 && covOk(c), stat: (e, c) => `MAE ${fmt(stats(e).mae)}, bias ${fmt(stats(e).bias)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'drive-time', label: 'MAE ≤ 50 ms, cov ≥ 93%', check: (e, c) => stats(e).mae <= 50 && covOk(c), stat: (e, c) => `MAE ${fmt(stats(e).mae)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'loading-depth', label: 'MAE ≤ 2% H', check: (e) => stats(e).mae <= 2, stat: (e) => `MAE ${fmt(stats(e).mae)}` },
    { metric: 'landing-distance', label: 'MAE ≤ 8 cm, p95 ≤ 15, cov ≥ 93%', check: (e, c) => stats(e).mae <= 8 && stats(e).p95 <= 15 && covOk(c), stat: (e, c) => `MAE ${fmt(stats(e).mae)}, p95 ${fmt(stats(e).p95)}, cov ${c === null ? '–' : Math.round(c * 100) + '%'}` },
    { metric: 'shoulder-tilt-trophy (3D, deg)', label: 'rectified 2D within ±4° of 3D (p95)', check: (e) => stats(e).p95 <= 4, stat: (e) => `MAE ${fmt(stats(e).mae)}, p95 ${fmt(stats(e).p95)}` },
    { metric: 'deep-bend-flag', label: 'two-level error ≤ 15%', check: (e) => stats(e).mae <= 0.15, stat: (e) => `error ${Math.round(stats(e).mae * 100)}%` },
    { metric: 'serve-count', label: 'precision and recall ≥ 99%', check: (e) => e.every((x) => x === 0), stat: (e) => `${e.filter((x) => x !== 0).length} wrong of ${e.length}` },
  ]
  lines.push('## Acceptance against the METRICS S0 thresholds (default variant)')
  lines.push('')
  lines.push('Pass/fail per metric on the D1 envelope and on all side-view day clips at 60 fps or more (5 m clips of the older base240 family included). Coverage = per-serve 95% interval coverage. Metrics that fail stay at V0 (experimental) in the engine; see `app/src/analysis/metrics/catalogue.ts`.')
  lines.push('')
  lines.push(`| metric | threshold | ${groups.map((g) => g.name).join(' | ')} |`)
  lines.push(`| --- | --- | ${groups.map(() => '---').join(' | ')} |`)
  const summaryJson: Record<string, unknown> = {}
  for (const rule of rules) {
    const perGroup: Record<string, unknown> = {}
    const cells = groups.map((g) => {
      const rs = d.filter((r) => r.metric === rule.metric && g.pick(r))
      const errs = rs.filter((r) => typeof r.error === 'number').map((r) => r.error!)
      const cov = rs.filter((r) => r.covered !== undefined)
      const c = cov.length ? cov.filter((r) => r.covered).length / cov.length : null
      if (!errs.length) return '– (no values)'
      const st = stats(errs)
      perGroup[g.name] = { pass: rule.check(errs, c), n: st.n, bias: st.bias, mae: st.mae, p95: st.p95, coverage: c }
      return `${rule.check(errs, c) ? 'PASS' : 'FAIL'}: ${rule.stat(errs, c)} (n ${errs.length})`
    })
    lines.push(`| ${rule.metric} | ${rule.label} | ${cells.join(' | ')} |`)
    summaryJson[rule.metric.replace(/ \(.*\)$/, '')] = { threshold: rule.label, ...perGroup }
  }
  lines.push('')
  // "How we measure" reads this (ARCHITECTURE §13): synthetic only, labelled as such in the UI.
  writeFileSync(
    join(repoRoot, 'app/src/analysis/metrics/validation-summary.json'),
    JSON.stringify({ source: 'synthetic', generated: new Date().toISOString(), clips: clips.length, note: 'Rendered synthetic serves run through the app pipeline; no real footage. See validation/results/metrics/SUMMARY.md.', metrics: summaryJson }, null, 1),
  )
}
writeFileSync(join(outDir, 'SUMMARY.md'), lines.join('\n'))
writeFileSync(join(outDir, 'rows.json'), JSON.stringify({ rows: allRows, events: allEvents }))
console.log(`metrics-eval: ${clips.length} clips → ${join(outDir, 'SUMMARY.md')}`)
}

export { buildInput, compare, injectedPoses, readJson, stats, type Dump, type Extra, type Truth }
