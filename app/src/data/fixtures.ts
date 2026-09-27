/**
 * UI development fixtures: three sample sessions of a synthetic "Sample player".
 *
 * HONESTY NOTE. These are hand-authored fixtures, not engine output and not a real person. Per-serve
 * values are drawn from a seeded random generator inside the provisional recreational bands of
 * docs/research/gaps/recreational-reference-ranges.md §7 and within the plausibility bounds of §8;
 * session values are then computed from those serves so the numbers agree with each other. Every
 * record is flagged `demo: true` / `isDemo: 1` and every screen showing them must show the
 * "Sample data · synthetic player" banner (DESIGN §8.21). The real demo seed (ARCHITECTURE §11,
 * built by running the engine on synthetic clips) replaces these once `tools/demo` exists.
 *
 * Sessions:
 *  1. Sat 12 Sep 2026, side view, upright (portrait) set-up, 60 fps, deuce first serves, 22 serves,
 *     every serve tagged. Baseline of the toss experiment. Speed unavailable (60 fps).
 *  2. Sat 19 Sep 2026, view from behind, 60 fps, 12 serves, capture Fair, outcomes from a tally.
 *     Rear-only bands are experimental; side-only metrics are unavailable ("Needs the side view").
 *  3. Sat 26 Sep 2026, side view, imported 120 fps clip (tilt unknown), deuce first serves aimed at
 *     the T, 22 serves. Re-test of the experiment; experimental speed range present.
 */
import type {
  Band,
  CameraOrientation,
  CaptureSetup,
  EventEstimate,
  MetricId,
  MetricStatus,
  MetricValue,
  PhaseSpan,
  QualityCheck,
  ReasonCode,
  ServeOutcome,
  TargetZone,
  TiltStatus,
} from '../analysis/types.ts'
import { REAR_ONLY_METRIC_IDS, SIDE_ONLY_METRIC_IDS } from '../analysis/types.ts'
import type { EngineStamp, ServeAnalysis, SessionAnalysis, SessionStats, StratumKey } from './domain.ts'
import type {
  CoachingRecord,
  ExperimentRecord,
  MatchLogRecord,
  PracticeLogRecord,
  ProfileRecord,
  ServeTagRecord,
  SessionRecord,
  SessionTallyRecord,
  VideoRecord,
} from './records.ts'

export const FIXTURE_NOTE =
  'Sample data: a computer-generated player. Hand-authored UI fixture drawn inside the provisional recreational bands; not engine output.'
const BASIS = 'Demo fixture (synthetic player); not engine output.'
const PLAYER_HEIGHT_M = 1.78

// ---------- seeded random numbers ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normalFrom(rand: () => number): (mean: number, sd: number) => number {
  return (mean, sd) => {
    const u = Math.max(rand(), 1e-9)
    const v = rand()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}

// ---------- small statistics helpers (display fixtures only; the engine owns real statistics) ----------

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
function sd(xs: number[]): number {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
const round = (x: number, step: number) => Math.round(x / step) * step
const r2 = (x: number) => Math.round(x * 100) / 100

/** Wilson 95% interval for k of n. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1]
  const p = k / n
  const denom = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

function meanCi(xs: number[], step: number): { value: number; low: number; high: number } {
  const m = mean(xs)
  const half = (1.96 * sd(xs)) / Math.sqrt(xs.length)
  return { value: round(m, step), low: round(m - half, step), high: round(m + half, step) }
}

function sdCi(xs: number[], step: number): { value: number; low: number; high: number } {
  const s = sd(xs)
  const k = 1.96 / Math.sqrt(2 * (xs.length - 1))
  return { value: round(s, step), low: round(s * (1 - k), step), high: round(s * (1 + k), step) }
}

// ---------- MetricValue builders ----------

function mv(
  id: MetricId,
  status: Exclude<MetricStatus, 'unavailable'>,
  value: number | string | null,
  unit: string,
  extra: Partial<MetricValue> = {},
): MetricValue {
  return { id, value, unit, status, confidence: status === 'player-entered' ? 1 : 0.8, basis: BASIS, validationLevel: 'V1', ...extra }
}

function unavailable(id: MetricId, unit: string, reasonCode: ReasonCode, unlockHint?: string): MetricValue {
  return { id, value: null, unit, status: 'unavailable', confidence: 0, basis: BASIS, reasonCode, ...(unlockHint ? { unlockHint } : {}) }
}

// ---------- engine-shaped scaffolding ----------

function stamp(analysedAt: string): EngineStamp {
  return {
    engineVersion: '0.0.0-fixture',
    contract: 1,
    catalogueVersion: '1.1.0',
    poseModel: 'fixture',
    poseBackend: 'cpu',
    decodePath: 'webcodecs',
    analysedAt,
    durationMs: 0,
    paramsHash: 'fixture',
    bandsVersion: 'bands_v1_provisional',
  }
}

function ev(t: number, fps: number, method: string, confidence = 0.9): EventEstimate {
  return { frameIndex: Math.round(t * fps), tReal: r2(t), uncertaintyS: r2(1 / fps), confidence, method }
}

function phasesFor(e: Record<'start' | 'release' | 'apex' | 'trophy' | 'lowestHip' | 'contact' | 'landing' | 'end', number>, fps: number): PhaseSpan[] {
  const f = (t: number) => Math.round(t * fps)
  const span = (phase: PhaseSpan['phase'], a: number, b: number, key: number): PhaseSpan => ({
    phase,
    startFrame: f(a),
    endFrame: f(b),
    keyFrame: f(key),
    confidence: 0.85,
  })
  const c = e.contact
  return [
    span('setup', e.start, e.release, e.start),
    span('toss', e.release, e.apex, e.apex),
    span('loading', e.apex, e.lowestHip, e.trophy),
    span('drive', e.lowestHip, c - 1 / fps, e.lowestHip),
    span('contact', c - 1 / fps, c + 1 / fps, c),
    span('landing', c + 1 / fps, e.landing, e.landing),
    span('recovery', e.landing, e.end, e.end),
  ]
}

// ---------- session specification ----------

interface SessionSpec {
  id: string
  label: string
  startedAt: string
  visitId: string
  view: 'side' | 'rear'
  fps: number
  source: VideoRecord['source']
  orientation: CameraOrientation
  setup: CaptureSetup
  tilt: TiltStatus
  seed: number
  serves: number
  /** 1-based serve index -> exclusion reason. */
  excluded: Record<number, ReasonCode>
  /** 1-based index of a serve whose apex was fitted above the frame (APEX_EXTRAPOLATED). */
  apexExtrapolated?: number
  /** 1-based index of a soft-flagged serve ("Check this serve"). */
  softFlagged?: number
  apexRatio: [number, number]
  apexSdCm: number
  forwardCm: [number, number]
  lateralSdCm?: number
  contactRatio: [number, number]
  contactForwardCm: [number, number]
  rhythmMs: [number, number]
  hipRisePct: [number, number]
  driveMs: [number, number]
  hipDropPct: [number, number]
  landingCm: [number, number]
  outcomes?: ServeOutcome[]
  tally?: SessionTallyRecord
  target?: TargetZone
  capture: { overall: 'good' | 'usable' | 'poor'; checks: QualityCheck[] }
  headline: string
  template: SessionRecord['template']
  isRetest: 0 | 1
  experimentId?: string
  speedRange?: [number, number, number]
}

const EXPERIMENT_ID = 'demo-exp-toss-height'
const DECISION_ID = 'demo-decision-s1'

const SPECS: SessionSpec[] = [
  {
    id: 'demo-s1',
    label: 'Deuce first serves',
    startedAt: '2026-09-12T08:10:00+10:00',
    visitId: '2026-09-12',
    view: 'side',
    fps: 60,
    source: 'in-app-web',
    orientation: 'portrait',
    setup: 'side-portrait',
    tilt: 'measured-level',
    seed: 1209,
    serves: 22,
    excluded: { 9: 'EXCLUDED_BY_QUALITY', 17: 'POSE_LOW_QUALITY' },
    apexExtrapolated: 5,
    softFlagged: 14,
    apexRatio: [1.84, 0],
    apexSdCm: 17,
    forwardCm: [27, 14],
    contactRatio: [1.45, 0.022],
    contactForwardCm: [34, 11],
    rhythmMs: [965, 60],
    hipRisePct: [9, 1.4],
    driveMs: [345, 28],
    hipDropPct: [6, 1.1],
    landingCm: [36, 12],
    outcomes: [
      'in', 'net', 'in', 'long', 'in', 'in', 'net', 'in', 'wide', 'in', 'long',
      'in', 'net', 'in', 'in', 'long', 'net', 'in', 'in', 'long', 'in', 'net',
    ],
    capture: { overall: 'good', checks: [] },
    headline: 'Your toss peaked at a different height on many serves. Contact height stayed steady.',
    template: 'check-in',
    isRetest: 0,
  },
  {
    id: 'demo-s2',
    label: 'View from behind',
    startedAt: '2026-09-19T09:30:00+10:00',
    visitId: '2026-09-19',
    view: 'rear',
    fps: 60,
    source: 'in-app-web',
    orientation: 'landscape',
    setup: 'rear-outcomes',
    tilt: 'measured-corrected',
    seed: 1909,
    serves: 12,
    excluded: { 6: 'APEX_OUT_OF_FRAME' },
    apexRatio: [1.86, 0],
    apexSdCm: 15,
    forwardCm: [0, 0],
    lateralSdCm: 9,
    contactRatio: [1.44, 0.025],
    contactForwardCm: [0, 0],
    rhythmMs: [955, 55],
    hipRisePct: [0, 0],
    driveMs: [0, 0],
    hipDropPct: [0, 0],
    landingCm: [0, 0],
    tally: { sessionId: 'demo-s2', firstServes: { in: 7, total: 12, net: 3, long: 1, wide: 1 }, enteredAt: '2026-09-19T09:52:00+10:00' },
    capture: {
      overall: 'usable',
      checks: [
        {
          id: 'cq.toss-headroom',
          pass: false,
          severity: 'warn',
          message: 'The toss left the top of the picture on 1 of 12 serves.',
          scope: 'serve',
          fix: 'Next time, raise the phone a little or step back.',
        },
      ],
    },
    headline: 'An early read from behind: 11 of 12 serves measured. A few more serves will firm it up.',
    template: 'outcomes',
    isRetest: 0,
  },
  {
    id: 'demo-s3',
    label: 'Re-test: deuce first serves',
    startedAt: '2026-09-26T08:40:00+10:00',
    visitId: '2026-09-26',
    view: 'side',
    fps: 120,
    source: 'file-import',
    orientation: 'portrait',
    setup: 'side-portrait',
    tilt: 'unknown',
    seed: 2609,
    serves: 22,
    excluded: { 12: 'CONTACT_NOT_FOUND' },
    apexRatio: [1.83, 0],
    apexSdCm: 11,
    forwardCm: [31, 9],
    contactRatio: [1.46, 0.02],
    contactForwardCm: [37, 9],
    rhythmMs: [945, 45],
    hipRisePct: [10, 1.3],
    driveMs: [335, 25],
    hipDropPct: [6, 1],
    landingCm: [41, 11],
    outcomes: [
      'in', 'in', 'net', 'in', 'in', 'long', 'in', 'in', 'in', 'net', 'in',
      'wide', 'in', 'in', 'net', 'in', 'long', 'in', 'in', 'in', 'net', 'in',
    ],
    target: 'T',
    capture: {
      overall: 'good',
      checks: [
        {
          id: 'cq.tilt',
          pass: false,
          severity: 'info',
          message: 'Imported clip: phone tilt unknown, so heights are estimates.',
          scope: 'clip',
        },
      ],
    },
    headline: 'Your toss height was steadier than on 12 Sep. Contact stayed in front of you.',
    template: 'retest',
    isRetest: 1,
    experimentId: EXPERIMENT_ID,
    speedRange: [130, 145, 14],
  },
]

// ---------- per-serve generation ----------

interface Draw {
  apexCm: number
  forwardCm: number
  lateralCm: number
  contactRatio: number
  contactForwardCm: number
  rhythmMs: number
  pauseMs: number
  hipRisePct: number
  driveMs: number
  hipDropPct: number
  deepBend: boolean
  shoulderBand: Band
  kneeBand: Band
  sosBand: Band
  landingCm: number
}

function drawServes(spec: SessionSpec): Draw[] {
  const rand = mulberry32(spec.seed)
  const n = normalFrom(rand)
  const bandFrom = (): Band => {
    const u = rand()
    return u < 0.15 ? 'low' : u < 0.85 ? 'typical' : 'high'
  }
  const out: Draw[] = []
  for (let i = 0; i < spec.serves; i++) {
    out.push({
      apexCm: n(spec.apexRatio[0] * PLAYER_HEIGHT_M * 100, spec.apexSdCm),
      forwardCm: n(spec.forwardCm[0], spec.forwardCm[1]),
      lateralCm: n(6, spec.lateralSdCm ?? 0),
      contactRatio: n(spec.contactRatio[0], spec.contactRatio[1]),
      contactForwardCm: n(spec.contactForwardCm[0], spec.contactForwardCm[1]),
      rhythmMs: n(spec.rhythmMs[0], spec.rhythmMs[1]),
      pauseMs: n(260, 60),
      hipRisePct: n(spec.hipRisePct[0], spec.hipRisePct[1]),
      driveMs: n(spec.driveMs[0], spec.driveMs[1]),
      hipDropPct: n(spec.hipDropPct[0], spec.hipDropPct[1]),
      deepBend: rand() < 0.22,
      shoulderBand: bandFrom(),
      kneeBand: bandFrom(),
      sosBand: bandFrom(),
      landingCm: n(spec.landingCm[0], spec.landingCm[1]),
    })
  }
  return out
}

function serveMetrics(spec: SessionSpec, d: Draw, index: number): Partial<Record<MetricId, MetricValue>> {
  const side = spec.view === 'side'
  const tiltUnknown = spec.tilt === 'unknown'
  const heightReason: Partial<MetricValue> = tiltUnknown ? { reasonCode: 'TILT_UNKNOWN' } : {}
  const apexRatio = d.apexCm / (PLAYER_HEIGHT_M * 100)
  const contactCm = d.contactRatio * PLAYER_HEIGHT_M * 100
  const m: Partial<Record<MetricId, MetricValue>> = {
    'toss-apex-height': mv('toss-apex-height', 'estimated', r2(apexRatio), 'ratio-of-height', {
      uncertainty: { kind: 'ci95', low: r2(apexRatio - 0.04), high: r2(apexRatio + 0.04) },
      secondary: { cm: Math.round(d.apexCm) },
      ...(index === spec.apexExtrapolated ? { reasonCode: 'APEX_EXTRAPOLATED' as const } : heightReason),
    }),
    'toss-drop': mv('toss-drop', 'estimated', Math.round(d.apexCm - contactCm), 'cm', {
      uncertainty: { kind: 'ci95', low: Math.round(d.apexCm - contactCm - 9), high: Math.round(d.apexCm - contactCm + 9) },
      ...heightReason,
    }),
    'contact-height-ratio': mv('contact-height-ratio', 'estimated', r2(d.contactRatio), 'ratio-of-height', {
      uncertainty: { kind: 'ci95', low: r2(d.contactRatio - 0.03), high: r2(d.contactRatio + 0.03) },
      secondary: { cm: Math.round(contactCm) },
      ...(index === spec.softFlagged ? { plausibility: 'soft-flag' as const, reasonCode: 'CHECK_THIS_SERVE' as const } : heightReason),
    }),
    'rhythm-release-to-contact': mv('rhythm-release-to-contact', 'estimated', round(d.rhythmMs, 10), 'ms', {
      uncertainty: { kind: 'ci95', low: round(d.rhythmMs - 20, 10), high: round(d.rhythmMs + 20, 10) },
    }),
    'trophy-pause': mv('trophy-pause', 'experimental', round(d.pauseMs, 10), 'ms', {
      uncertainty: { kind: 'range', low: round(d.pauseMs - 60, 10), high: round(d.pauseMs + 60, 10) },
    }),
    spin: unavailable('spin', 'none', 'NOT_MEASURABLE'),
  }
  if (side) {
    m['toss-forward'] = mv('toss-forward', 'estimated', Math.round(d.forwardCm), 'cm', {
      uncertainty: { kind: 'ci95', low: Math.round(d.forwardCm - 7), high: Math.round(d.forwardCm + 7) },
    })
    m['contact-forward'] = mv('contact-forward', 'estimated', Math.round(d.contactForwardCm), 'cm', {
      uncertainty: { kind: 'ci95', low: Math.round(d.contactForwardCm - 8), high: Math.round(d.contactForwardCm + 8) },
    })
    m['leg-drive'] = mv('leg-drive', 'estimated', Math.round(d.hipRisePct), '% of height', {
      uncertainty: { kind: 'ci95', low: Math.round(d.hipRisePct - 2), high: Math.round(d.hipRisePct + 2) },
    })
    m['drive-time'] = mv('drive-time', 'estimated', round(d.driveMs, 10), 'ms', {
      uncertainty: { kind: 'ci95', low: round(d.driveMs - 40, 10), high: round(d.driveMs + 40, 10) },
    })
    m['loading-depth'] = mv('loading-depth', 'estimated', Math.round(d.hipDropPct), '% of height', {
      uncertainty: { kind: 'ci95', low: Math.round(d.hipDropPct - 1.5), high: Math.round(d.hipDropPct + 1.5) },
    })
    m['deep-bend-flag'] = mv('deep-bend-flag', 'experimental', d.deepBend ? 'yes' : 'no', 'yes/no', { flag: d.deepBend })
    m['shoulder-tilt-trophy'] = mv('shoulder-tilt-trophy', 'estimated', d.shoulderBand, 'band', {
      band: d.shoulderBand,
      bandBasis: 'player-relative',
    })
    m['landing-distance'] = mv('landing-distance', 'estimated', Math.round(d.landingCm), 'cm', {
      uncertainty: { kind: 'ci95', low: Math.round(d.landingCm - 12), high: Math.round(d.landingCm + 12) },
    })
    m['knee-bend-band'] = unavailable('knee-bend-band', 'band', 'NEEDS_REAR_VIEW')
    m['shoulder-over-shoulder-contact'] = unavailable('shoulder-over-shoulder-contact', 'band', 'NEEDS_REAR_VIEW')
  } else {
    m['toss-lateral'] = mv('toss-lateral', 'experimental', Math.round(d.lateralCm), 'cm', {
      uncertainty: { kind: 'range', low: Math.round(d.lateralCm - 8), high: Math.round(d.lateralCm + 8) },
    })
    m['knee-bend-band'] = mv('knee-bend-band', 'experimental', d.kneeBand, 'band', { band: d.kneeBand, bandBasis: 'player-relative' })
    m['shoulder-over-shoulder-contact'] = mv('shoulder-over-shoulder-contact', 'experimental', d.sosBand, 'band', {
      band: d.sosBand,
      bandBasis: 'player-relative',
    })
    for (const id of SIDE_ONLY_METRIC_IDS) {
      if (id === 'toss-forward-spread' || id === 'speed-experimental') continue
      m[id] = unavailable(id, 'n/a', 'NEEDS_SIDE_VIEW')
    }
  }
  return m
}

function buildServe(spec: SessionSpec, d: Draw, index: number, analysedAt: string): ServeAnalysis {
  const id = `${spec.id}-serve-${String(index).padStart(2, '0')}`
  const fps = spec.fps
  const t0 = 4 + (index - 1) * 9
  const release = t0 + 0.8
  const contact = release + d.rhythmMs / 1000
  const lowestHip = contact - (spec.view === 'side' ? d.driveMs : 340) / 1000
  const e = {
    start: t0,
    release,
    apex: release + 0.58,
    trophy: release + 0.52,
    lowestHip,
    contact,
    landing: contact + 0.26,
    end: contact + 1.2,
  }
  const exclusion = spec.excluded[index]
  const included = exclusion === undefined
  return {
    schemaVersion: 1,
    id,
    sessionId: spec.id,
    videoId: `${spec.id}-video`,
    index,
    mode: spec.view === 'side' ? 'technique' : 'outcomes',
    view: spec.view,
    handedness: 'right',
    window: { startFrame: Math.round(e.start * fps), endFrame: Math.round(e.end * fps), tStartReal: e.start, tEndReal: r2(e.end) },
    detection: { confidence: 0.93, cues: ['toss-arm', 'ball-above-head', 'motion'], kind: 'serve', anchor: 'pose-arm-run' },
    events: {
      setupStart: ev(e.start, fps, 'pose-still'),
      tossRelease: ev(e.release, fps, 'wrist-peak'),
      tossApex: ev(e.apex, fps, 'ball-apex-fit', index === spec.apexExtrapolated ? 0.6 : 0.9),
      trophy: ev(e.trophy, fps, 'fused'),
      lowestHip: ev(e.lowestHip, fps, 'hip-min', 0.75),
      contact: ev(e.contact, fps, 'fused', exclusion === 'CONTACT_NOT_FOUND' ? 0.3 : 0.92),
      landing: ev(e.landing, fps, 'foot-contact'),
      recoveryEnd: ev(e.end, fps, 'pose-still'),
    },
    phases: phasesFor(e, fps),
    rectification: {
      status: spec.tilt,
      source: spec.tilt === 'unknown' ? 'none' : 'motion-sensor',
      orientation: spec.orientation,
      fovDeg: 64,
      fovSource: 'lens-default',
      ...(spec.tilt === 'unknown' ? {} : { pitchDeg: { value: spec.tilt === 'measured-level' ? 0.4 : 2.6, sigma: 0.5 } }),
    },
    toss: null,
    contact: null,
    legDrive: null,
    shoulder: null,
    rear: null,
    landing: null,
    audio: { usable: false, reason: 'Hit-sound timing was off.' },
    speed: null,
    metrics: included ? serveMetrics(spec, d, index) : {},
    quality: {
      overall: included ? 'good' : 'poor',
      checks: included
        ? []
        : [{ id: 'sq.excluded', pass: false, severity: 'block', message: 'This serve could not be measured.', scope: 'serve' }],
    },
    plausibility: {
      hardRejects: exclusion === 'EXCLUDED_BY_QUALITY' ? ['releaseToContactS'] : [],
      softFlags: index === spec.softFlagged ? ['contactHeightRatio'] : [],
    },
    included,
    exclusions: included ? [] : [exclusion],
    keyFrames: {},
    engine: stamp(analysedAt),
  }
}

// ---------- session-level statistics from the serves ----------

function sessionMetrics(spec: SessionSpec, draws: Draw[], serves: ServeAnalysis[], tags: ServeTagRecord[]): Partial<Record<MetricId, MetricValue>> {
  const inc = draws.filter((_, i) => serves[i].included)
  const n = inc.length
  const nEligible = draws.length
  const side = spec.view === 'side'
  const tiltReason: Partial<MetricValue> = spec.tilt === 'unknown' ? { reasonCode: 'TILT_UNKNOWN' } : {}
  const provisionalSpread = n < 20
  const provisionalCentre = n < 12
  const common = { n, nEligible }
  const m: Partial<Record<MetricId, MetricValue>> = {}

  m['serve-count'] = mv('serve-count', 'measured', spec.serves, 'count', { n: spec.serves, nEligible: spec.serves })
  m['retoss-count'] = mv('retoss-count', 'estimated', spec.view === 'side' ? 1 : 0, 'count', { n: spec.serves })
  m['capture-quality'] = mv('capture-quality', 'measured', spec.capture.overall, 'good|usable|poor', common)

  const apexRatios = inc.map((d) => d.apexCm / (PLAYER_HEIGHT_M * 100))
  const apex = meanCi(apexRatios, 0.01)
  m['toss-apex-height'] = mv('toss-apex-height', 'estimated', apex.value, 'ratio-of-height', {
    ...common,
    uncertainty: { kind: 'ci95', low: apex.low, high: apex.high },
    secondary: { cm: Math.round(apex.value * PLAYER_HEIGHT_M * 100) },
    ...tiltReason,
  })
  const hs = sdCi(inc.map((d) => d.apexCm), 0.5)
  m['toss-height-spread'] = mv('toss-height-spread', 'estimated', hs.value, 'cm', {
    ...common,
    uncertainty: { kind: 'ci95', low: hs.low, high: hs.high },
    provisional: provisionalSpread,
    ...tiltReason,
  })
  const drops = inc.map((d) => d.apexCm - d.contactRatio * PLAYER_HEIGHT_M * 100)
  const drop = meanCi(drops, 1)
  m['toss-drop'] = mv('toss-drop', 'estimated', drop.value, 'cm', { ...common, uncertainty: { kind: 'ci95', low: drop.low, high: drop.high }, ...tiltReason })
  const cr = meanCi(inc.map((d) => d.contactRatio), 0.01)
  m['contact-height-ratio'] = mv('contact-height-ratio', 'estimated', cr.value, 'ratio-of-height', {
    ...common,
    uncertainty: { kind: 'ci95', low: cr.low, high: cr.high },
    secondary: { cm: Math.round(cr.value * PLAYER_HEIGHT_M * 100) },
    provisional: provisionalCentre,
    ...tiltReason,
  })
  const chs = sdCi(inc.map((d) => d.contactRatio * PLAYER_HEIGHT_M * 100), 0.5)
  m['contact-height-spread'] = mv('contact-height-spread', 'estimated', chs.value, 'cm', {
    ...common,
    uncertainty: { kind: 'ci95', low: chs.low, high: chs.high },
    provisional: provisionalSpread,
    nearMeasurementLimit: chs.value <= 4,
  })
  const rh = meanCi(inc.map((d) => d.rhythmMs), 10)
  m['rhythm-release-to-contact'] = mv('rhythm-release-to-contact', 'estimated', rh.value, 'ms', {
    ...common,
    uncertainty: { kind: 'ci95', low: rh.low, high: rh.high },
  })
  const rs = sdCi(inc.map((d) => d.rhythmMs), 5)
  m['rhythm-spread'] = mv('rhythm-spread', 'estimated', rs.value, 'ms', {
    ...common,
    uncertainty: { kind: 'ci95', low: rs.low, high: rs.high },
    provisional: provisionalSpread,
  })
  const tp = meanCi(inc.map((d) => d.pauseMs), 10)
  m['trophy-pause'] = mv('trophy-pause', 'experimental', tp.value, 'ms', { ...common, uncertainty: { kind: 'range', low: tp.low - 50, high: tp.high + 50 } })
  m.repeatability = mv('repeatability', 'experimental', spec.view === 'side' ? 68 : 61, 'index-0-100', {
    ...common,
    uncertainty: { kind: 'range', low: spec.view === 'side' ? 61 : 52, high: spec.view === 'side' ? 75 : 70 },
  })
  m.spin = unavailable('spin', 'none', 'NOT_MEASURABLE')
  m['speed-radar-entered'] = unavailable('speed-radar-entered', 'km/h', 'NOT_ENTERED')

  if (side) {
    const fw = meanCi(inc.map((d) => d.forwardCm), 1)
    m['toss-forward'] = mv('toss-forward', 'estimated', fw.value, 'cm', { ...common, uncertainty: { kind: 'ci95', low: fw.low, high: fw.high }, ...tiltReason })
    const fs = sdCi(inc.map((d) => d.forwardCm), 0.5)
    m['toss-forward-spread'] = mv('toss-forward-spread', 'estimated', fs.value, 'cm', {
      ...common,
      uncertainty: { kind: 'ci95', low: fs.low, high: fs.high },
      provisional: provisionalSpread,
      ...tiltReason,
    })
    const cf = meanCi(inc.map((d) => d.contactForwardCm), 1)
    m['contact-forward'] = mv('contact-forward', 'estimated', cf.value, 'cm', { ...common, uncertainty: { kind: 'ci95', low: cf.low, high: cf.high } })
    const lr = meanCi(inc.map((d) => d.hipRisePct), 1)
    const typicalHip = inc.filter((d) => Math.abs(d.hipRisePct - spec.hipRisePct[0]) <= spec.hipRisePct[1]).length
    m['leg-drive'] = mv('leg-drive', 'estimated', lr.value, '% of height', {
      ...common,
      uncertainty: { kind: 'ci95', low: lr.low, high: lr.high },
      band: 'typical',
      bandBasis: 'player-relative',
      secondary: { k: typicalHip, reference: spec.id === 'demo-s1' ? 'session' : 'usual' },
    })
    const dt = meanCi(inc.map((d) => d.driveMs), 10)
    m['drive-time'] = mv('drive-time', 'estimated', dt.value, 'ms', { ...common, uncertainty: { kind: 'ci95', low: dt.low, high: dt.high } })
    const ld = meanCi(inc.map((d) => d.hipDropPct), 1)
    m['loading-depth'] = mv('loading-depth', 'estimated', ld.value, '% of height', { ...common, uncertainty: { kind: 'ci95', low: ld.low, high: ld.high } })
    const deep = inc.filter((d) => d.deepBend).length
    m['deep-bend-flag'] = mv('deep-bend-flag', 'experimental', deep > 0 ? 'yes' : 'no', 'yes/no', { ...common, flag: deep > 0, secondary: { k: deep } })
    const bandCounts = { low: 0, typical: 0, high: 0 }
    for (const d of inc) bandCounts[d.shoulderBand]++
    const modal = (Object.keys(bandCounts) as Band[]).reduce((a, b) => (bandCounts[b] > bandCounts[a] ? b : a))
    m['shoulder-tilt-trophy'] = mv('shoulder-tilt-trophy', 'estimated', modal, 'band', {
      ...common,
      band: modal,
      bandBasis: 'player-relative',
      secondary: { k: bandCounts[modal], reference: spec.id === 'demo-s1' ? 'session' : 'usual' },
    })
    const land = meanCi(inc.map((d) => d.landingCm), 1)
    m['landing-distance'] = mv('landing-distance', 'estimated', land.value, 'cm', { ...common, uncertainty: { kind: 'ci95', low: land.low, high: land.high } })
    for (const id of REAR_ONLY_METRIC_IDS) m[id] = unavailable(id, 'n/a', 'NEEDS_REAR_VIEW')
    m['speed-experimental'] = spec.speedRange
      ? mv('speed-experimental', 'experimental', null, 'km/h range', {
          n: spec.speedRange[2],
          nEligible: n,
          quantity: 'launch-speed',
          uncertainty: { kind: 'range', low: spec.speedRange[0], high: spec.speedRange[1] },
        })
      : unavailable('speed-experimental', 'km/h range', 'FPS_TOO_LOW')
  } else {
    const lat = sdCi(inc.map((d) => d.lateralCm), 0.5)
    m['toss-lateral-spread'] = mv('toss-lateral-spread', 'experimental', lat.value, 'cm', {
      ...common,
      uncertainty: { kind: 'range', low: lat.low, high: lat.high },
      provisional: provisionalSpread,
    })
    const latMean = meanCi(inc.map((d) => d.lateralCm), 1)
    m['toss-lateral'] = mv('toss-lateral', 'experimental', latMean.value, 'cm', { ...common, uncertainty: { kind: 'range', low: latMean.low, high: latMean.high } })
    const knee = { low: 0, typical: 0, high: 0 }
    for (const d of inc) knee[d.kneeBand]++
    m['knee-bend-band'] = mv('knee-bend-band', 'experimental', 'typical', 'band', {
      ...common,
      band: 'typical',
      bandBasis: 'player-relative',
      provisional: true,
      secondary: { k: knee.typical, reference: 'session' },
    })
    m['shoulder-over-shoulder-contact'] = mv('shoulder-over-shoulder-contact', 'experimental', 'typical', 'band', {
      ...common,
      band: 'typical',
      bandBasis: 'player-relative',
      provisional: true,
      secondary: { k: inc.filter((d) => d.sosBand === 'typical').length, reference: 'session' },
    })
    m['speed-average-rear'] = unavailable('speed-average-rear', 'km/h range', 'NEEDS_CALIBRATION')
    for (const id of SIDE_ONLY_METRIC_IDS) m[id] = unavailable(id, 'n/a', 'NEEDS_SIDE_VIEW')
  }

  // Outcomes (D3: player-entered in single-view mode).
  if (tags.length) {
    const counted = tags.filter((t) => t.outcome && t.outcome !== 'let' && t.outcome !== 'unknown')
    const k = counted.filter((t) => t.outcome === 'in').length
    const nn = counted.length
    const [lo, hi] = wilson(k, nn)
    const rate = (id: MetricId) =>
      mv(id, 'player-entered', r2(k / nn), 'k-of-n', {
        n: nn,
        secondary: { k },
        provenance: 'from-your-tags',
        uncertainty: { kind: 'ci95', low: r2(lo), high: r2(hi) },
      })
    m['serve-in-rate'] = rate('serve-in-rate')
    m['first-serve-in-rate'] = rate('first-serve-in-rate')
    m['second-serve-in-rate'] = unavailable('second-serve-in-rate', 'k-of-n', 'NOT_ENTERED')
    m['double-faults'] = unavailable('double-faults', 'count', 'NOT_ENTERED')
    m['serve-type-mix'] = mv('serve-type-mix', 'player-entered', `flat ${nn}`, 'counts flat/slice/kick/unknown', { n: nn, secondary: { flat: nn } })
    m['placement-zone'] = spec.target
      ? mv('placement-zone', 'player-entered', `${spec.target} ${nn}`, 'counts T/body/wide', { n: nn, secondary: { [spec.target]: nn } })
      : unavailable('placement-zone', 'counts T/body/wide', 'NOT_ENTERED')
  }
  if (!tags.length && spec.tally?.firstServes) {
    const { in: k, total } = spec.tally.firstServes
    const [lo, hi] = wilson(k, total)
    const rate = (id: MetricId) =>
      mv(id, 'player-entered', r2(k / total), 'k-of-n', {
        n: total,
        secondary: { k },
        basis: 'From your session tally.',
        uncertainty: { kind: 'ci95', low: r2(lo), high: r2(hi) },
      })
    m['serve-in-rate'] = rate('serve-in-rate')
    m['first-serve-in-rate'] = rate('first-serve-in-rate')
    m['second-serve-in-rate'] = unavailable('second-serve-in-rate', 'k-of-n', 'NOT_ENTERED')
    m['double-faults'] = unavailable('double-faults', 'count', 'NOT_ENTERED')
    m['serve-type-mix'] = unavailable('serve-type-mix', 'counts flat/slice/kick/unknown', 'NOT_ENTERED')
    m['placement-zone'] = unavailable('placement-zone', 'counts T/body/wide', 'NOT_ENTERED')
  }
  // METRICS §4.1: centre values from fewer than 12 serves are early reads.
  if (provisionalCentre) {
    for (const id of CENTRE_IDS) {
      const v = m[id]
      if (v && v.status !== 'unavailable') v.provisional = true
    }
  }
  return m
}

const CENTRE_IDS: MetricId[] = [
  'toss-apex-height', 'toss-forward', 'toss-lateral', 'toss-drop', 'contact-height-ratio', 'contact-forward',
  'rhythm-release-to-contact', 'leg-drive', 'drive-time', 'loading-depth', 'landing-distance',
]

// ---------- assembly ----------

export interface DemoFixtureSession {
  demo: true
  session: SessionRecord
  video: VideoRecord
  serves: ServeAnalysis[]
  tags: ServeTagRecord[]
  tally?: SessionTallyRecord
  stats: SessionStats
}

export interface DemoFixtures {
  demo: true
  note: string
  /** The synthetic player's profile, for Profile-screen development. Never seeded over a real profile. */
  profile: ProfileRecord
  sessions: DemoFixtureSession[]
  decision: CoachingRecord
  experiment: ExperimentRecord
  practiceLogs: PracticeLogRecord[]
  matchLogs: MatchLogRecord[]
}

function stratumFor(spec: SessionSpec): StratumKey {
  return {
    view: spec.view,
    cameraSide: spec.view === 'side' ? 'chest' : 'unknown',
    courtSide: 'deuce',
    serveNumber: 1,
    intendedType: 'flat',
    handedness: 'right',
  }
}

function buildSession(spec: SessionSpec): DemoFixtureSession {
  const analysedAt = new Date(new Date(spec.startedAt).getTime() + 25 * 60 * 1000).toISOString()
  const draws = drawServes(spec)
  const serves = draws.map((d, i) => buildServe(spec, d, i + 1, analysedAt))
  const tags: ServeTagRecord[] = (spec.outcomes ?? []).map((outcome, i) => ({
    serveId: serves[i].id,
    sessionId: spec.id,
    outcome,
    outcomeSource: 'player',
    serveNumber: 1,
    side: 'deuce',
    intendedType: 'flat',
    ...(spec.target ? { targetZone: spec.target } : {}),
    taggedAt: analysedAt,
    via: 'review',
  }))
  const metrics = sessionMetrics(spec, draws, serves, tags)
  const includedCount = serves.filter((s) => s.included).length
  const exclusionsByReason: Partial<Record<ReasonCode, number>> = {}
  for (const s of serves) for (const r of s.exclusions) exclusionsByReason[r] = (exclusionsByReason[r] ?? 0) + 1
  const width = spec.orientation === 'portrait' ? 1080 : 1920
  const height = spec.orientation === 'portrait' ? 1920 : 1080
  const meta = {
    fileName: spec.source === 'file-import' ? 'IMG_4127.MOV' : `serve-coach-${spec.visitId}.mp4`,
    mimeType: 'video/mp4',
    durationMediaS: 4 + spec.serves * 9 + 2,
    width,
    height,
    rotationDeg: 0 as const,
    hasAudio: false,
    nominalFps: spec.fps,
    captureFps: spec.fps,
    timeScale: 1,
    fpsSource: 'container' as const,
    isVariableFrameRate: spec.source === 'in-app-web',
    frameCount: Math.round((4 + spec.serves * 9 + 2) * spec.fps),
  }
  const rectification = serves[0].rectification
  const analysis: SessionAnalysis = {
    schemaVersion: 1,
    sessionId: spec.id,
    videoIds: [`${spec.id}-video`],
    mode: spec.view === 'side' ? 'technique' : 'outcomes',
    view: spec.view,
    capture: {
      meta,
      quality: { overall: spec.capture.overall, checks: spec.capture.checks },
      fpsClass: spec.fps >= 100 ? 'fps120plus' : spec.fps >= 50 ? 'fps60' : 'fps30',
      setup: spec.setup,
      rectification,
      scale: { bodyHeightHU: 0.46, source: 'setup-frames', heightM: PLAYER_HEIGHT_M },
      handedness: { profile: 'right', inferred: 'right', confidence: 0.9, agrees: true },
    },
    counts: {
      candidates: spec.serves,
      tossOnly: spec.view === 'side' ? 1 : 0,
      analysed: spec.serves,
      included: includedCount,
      excluded: spec.serves - includedCount,
      exclusionsByReason,
    },
    serveIds: serves.map((s) => s.id),
    engine: stamp(analysedAt),
    timings: {
      probeMs: 0, audioMs: 0, sparseMs: 0, denseMs: 0, keyFramesMs: 0, sessionMs: 0, totalMs: 0,
      framesDecoded: 0, poseFrames: 0, ballFrames: 0,
    },
  }
  const session: SessionRecord = {
    id: spec.id,
    createdAt: spec.startedAt,
    startedAt: spec.startedAt,
    visitId: spec.visitId,
    status: 'ready',
    mode: analysis.mode,
    view: spec.view,
    cameraSide: spec.view === 'side' ? 'chest' : undefined,
    fpsClass: analysis.capture.fpsClass,
    setup: spec.setup,
    tiltStatus: spec.tilt,
    orientation: spec.orientation,
    template: spec.template,
    isRetest: spec.isRetest,
    ...(spec.experimentId ? { experimentId: spec.experimentId } : {}),
    conditions: { wind: spec.id === 'demo-s2' ? 'breezy' : 'calm', light: 'day' },
    defaultSide: 'deuce',
    defaultServeNumber: 1,
    defaultIntendedType: 'flat',
    ...(spec.target ? { defaultTarget: spec.target } : {}),
    label: spec.label,
    isDemo: 1,
    analysis,
  }
  const importedAt = spec.startedAt
  const video: VideoRecord = {
    id: `${spec.id}-video`,
    sessionId: spec.id,
    role: 'demo',
    source: spec.source,
    capture: {
      source: spec.source === 'file-import' ? 'import' : 'in-app-web',
      declaredView: spec.view,
      ...(spec.view === 'side' ? { cameraSide: 'chest' as const } : {}),
      serveSide: 'deuce',
      serveNumber: 1,
      intendedType: 'flat',
      ...(spec.target ? { intendedTarget: spec.target } : {}),
      handedness: 'right',
      playerHeightM: PLAYER_HEIGHT_M,
      playerHeightSource: 'entered',
      orientation: spec.orientation,
      setup: spec.setup,
      hitSoundTiming: false,
      expectedServeCount: spec.serves,
      ...(spec.tilt === 'unknown'
        ? {}
        : { orientationSamples: [0, 100, 200].map((tMs) => ({ tMs, pitchDeg: spec.tilt === 'measured-level' ? 0.4 : 2.6, rollDeg: 0.2 })) }),
    },
    fileName: meta.fileName,
    mimeType: 'video/mp4',
    sizeBytes: 0,
    fingerprint: `fixture-${spec.id}`,
    meta,
    importedAt,
    // Fixtures carry no video file; playback falls back to key-frame stepping.
    storage: 'not-kept',
    retention: { policy: 'auto-delete-days', pinned: 0, retainUntil: new Date(importedAt).getTime() + 30 * 86_400_000 },
    retainUntil: new Date(importedAt).getTime() + 30 * 86_400_000,
    audio: spec.source === 'file-import' ? 'removed' : 'never-recorded',
    isDemo: 1,
  }
  const stats: SessionStats = {
    sessionId: spec.id,
    inputsHash: `fixture-${spec.id}`,
    computedAt: analysedAt,
    metrics,
    strata: [{ key: stratumFor(spec), n: includedCount, nTotal: spec.serves, metrics }],
    outcomeLink: null,
    outcomeLinkChecks: [],
    derivedPerServe: {},
    representativeServeId: serves.find((s) => s.included)?.id,
    bestServeId: serves.find((s, i) => s.included && tags[i]?.outcome === 'in')?.id,
    headline: spec.headline,
  }
  return { demo: true, session, video, serves, tags, ...(spec.tally ? { tally: spec.tally } : {}), stats }
}

function buildFixtures(): DemoFixtures {
  const sessions = SPECS.map(buildSession)
  const [s1, , s3] = sessions
  const before = s1.stats.metrics['toss-height-spread']
  const after = s3.stats.metrics['toss-height-spread']
  const b = Number(before?.value ?? 0)
  const a = Number(after?.value ?? 0)
  const decision: CoachingRecord = {
    id: DECISION_ID,
    sessionId: s1.session.id,
    createdAt: s1.stats.computedAt,
    libraryVersion: 'fixture',
    engineVersion: '0.0.0-fixture',
    gate: 'ok',
    focus: {
      faultId: 'toss-height-inconsistent',
      title: 'Steady toss height',
      phase: 'toss',
      evidenceTier: 'coach-recommended',
      whyChosen: 'Your toss peak varied more than your contact or rhythm, and the toss comes first in the serve.',
    },
    evidence: {
      event: 'apex',
      keyFrameId: `${s1.serves[6].id}:apex:evidence`,
      compareKeyFrameId: s1.stats.bestServeId ? `${s1.stats.bestServeId}:apex:evidence` : undefined,
      metricIds: ['toss-height-spread', 'toss-apex-height'],
      sentences: [
        'When the toss peaks at a different height each time, your swing has to re-time itself on every serve.',
        'Coaches work on this first, and experienced servers keep toss height steadier than any other part of the toss.',
      ],
    },
    cue: { id: 'toss-height-steady:outcome', text: 'Every toss peaks at the same spot.', style: 'external-target' },
    drill: {
      id: 'toss-height-steady:base',
      title: 'Same-peak serves',
      minutes: 8,
      steps: [
        'Make 5 tosses, taking the racquet back as you toss each one, then catch the ball or let it drop.',
        'Serve 20 balls at a comfortable pace, swinging at every toss, even the imperfect ones.',
        'After each serve, note whether you had to wait for the ball or chase it, and count the ones where you did neither.',
        'Finish with 10 serves alternating T and wide, without counting.',
      ],
      equipment: ['Ball basket'],
    },
    alternatives: [{ faultId: 'toss-spot-inconsistent', reason: 'Front-to-back spread was inside your usual range.' }],
    trace: [
      { step: 'safety', passed: true, detail: 'No soreness reported before this session.' },
      { step: 'confidence', passed: true, detail: '20 of 22 serves measured.' },
      { step: 'select', faultId: 'toss-height-inconsistent', passed: true, detail: 'Toss height spread was the clearest change to make.' },
    ],
    phrasing: { source: 'template' },
    experimentId: EXPERIMENT_ID,
    isDemo: 1,
  }
  const experiment: ExperimentRecord = {
    id: EXPERIMENT_ID,
    createdAt: s1.stats.computedAt,
    status: 'active',
    decisionId: DECISION_ID,
    faultId: 'toss-height-inconsistent',
    cueId: 'toss-height-steady:outcome',
    drillId: 'toss-height-steady:base',
    primaryMetricId: 'toss-height-spread',
    secondaryMetricIds: ['first-serve-in-rate'],
    direction: 'decrease',
    stratum: stratumFor(SPECS[0]),
    baselineSessionIds: [s1.session.id],
    retestSessionIds: [s3.session.id],
    result: {
      metricId: 'toss-height-spread',
      matchedOn: stratumFor(SPECS[0]),
      softFactors: {
        baseline: { fpsClass: 'fps60', setup: 'side-portrait', tiltStatus: 'measured-level', captureQuality: 'good', engineMajor: 0 },
        current: { fpsClass: 'fps120plus', setup: 'side-portrait', tiltStatus: 'unknown', captureQuality: 'good', engineMajor: 0 },
        notes: ['Different frame rate: 60 fps then 120 fps', 'Phone tilt unknown on the re-test'],
      },
      baseline: { sessionIds: [s1.session.id], n: 20, value: b, low: Number(before?.uncertainty?.low ?? b), high: Number(before?.uncertainty?.high ?? b) },
      current: { sessionIds: [s3.session.id], n: 21, value: a, low: Number(after?.uncertainty?.low ?? a), high: Number(after?.uncertainty?.high ?? a) },
      difference: { value: round(a - b, 0.5), low: round(a - b - 5, 0.5), high: round(a - b + 2, 0.5) },
      probabilityImproved: 0.86,
      verdict: 'likely-better',
      moreServesToConfirm: 10,
      notes: ['TILT_UNKNOWN'],
      caveats: ['Phone tilt unknown on the re-test'],
      computedAt: s3.stats.computedAt,
    },
    isDemo: 1,
  }
  const practiceLogs: PracticeLogRecord[] = [
    {
      id: 'demo-practice-1', date: '2026-09-16', experimentId: EXPERIMENT_ID, itemId: 'toss-height-steady',
      drillId: 'toss-height-steady:base', drillVariant: 'base', minutes: 8, reps: 20, successCriterionMet: 'partly',
      feel: 'ok', cueHelpful: 'yes', cueRegisterUsed: 'outcome', setting: 'court', body: 'fine', discomfort: 0,
      createdAt: '2026-09-16T18:40:00+10:00', isDemo: 1,
    },
    {
      id: 'demo-practice-2', date: '2026-09-23', experimentId: EXPERIMENT_ID, itemId: 'toss-height-steady',
      drillId: 'toss-height-steady:base', drillVariant: 'base', minutes: 10, reps: 25, successCriterionMet: 'yes',
      feel: 'natural', cueHelpful: 'yes', cueRegisterUsed: 'outcome', setting: 'court', body: 'fine', discomfort: 0,
      createdAt: '2026-09-23T18:55:00+10:00', isDemo: 1,
    },
  ]
  const matchLogs: MatchLogRecord[] = [
    {
      id: 'demo-match-1', date: '2026-09-15', competition: 'night-comp', serviceGames: 5, doubleFaults: 3,
      firstServeRough: 'about-half', cueUsed: 'forgot', experimentId: EXPERIMENT_ID,
      createdAt: '2026-09-16T07:30:00+10:00', updatedAt: '2026-09-16T07:30:00+10:00', isDemo: 1,
    },
    {
      id: 'demo-match-2', date: '2026-09-22', competition: 'night-comp', serviceGames: 6, doubleFaults: 1,
      firstServeRough: 'most', cueUsed: 'yes', experimentId: EXPERIMENT_ID,
      createdAt: '2026-09-23T07:15:00+10:00', updatedAt: '2026-09-23T07:15:00+10:00', isDemo: 1,
    },
  ]
  const profile: ProfileRecord = {
    id: 'me',
    heightM: PLAYER_HEIGHT_M,
    handedness: 'right',
    level: 'utr-4-5',
    utr: 4.5,
    goal: 'first-serves-in',
    ageBand: '18-plus',
    playStyle: ['night-comp'],
    matchNights: ['tue'],
    inSegment: 1,
    comfortRegions: [],
    comfort: { painFlag: 0 },
    createdAt: '2026-09-12T07:50:00+10:00',
    updatedAt: '2026-09-12T07:50:00+10:00',
  }
  return { demo: true, note: FIXTURE_NOTE, profile, sessions, decision, experiment, practiceLogs, matchLogs }
}

/** The three sample sessions and their related records. Deterministic (seeded). */
export const DEMO_FIXTURES: DemoFixtures = buildFixtures()

export const DEMO_SESSION_IDS = DEMO_FIXTURES.sessions.map((s) => s.session.id)
