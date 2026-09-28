/**
 * The parts of docs/specs/metrics.json the engine uses at runtime (ARCHITECTURE §3: the app never
 * reads outside app/). `catalogue.test.ts` in this folder fails if these drift from the JSON.
 *
 * VALIDATION LEVELS are the exception: metrics.json still says V0 everywhere, and METRICS §5.7
 * says CI updates it only through a reviewed change. The engine therefore keeps its own table,
 * set from the latest synthetic run (validation/results/metrics/SUMMARY.md); it is proposed for
 * metrics.json in that summary. A metric only reaches V1 (status ceiling "estimated") in the
 * condition classes whose synthetic cells passed.
 */
import type { MetricId, MetricStatus, ReasonCode } from '../types.ts'

export const CATALOGUE_VERSION = '1.1.0'
export const ENGINE_VERSION = '1.1.0'
export const BANDS_VERSION = 'bands_v1_provisional'

/**
 * METRICS §1.3 condition classes, plus 'unknown': the light was not recorded (an import with no
 * light answer). No metric is validated for 'unknown', so every value is at most experimental there,
 * with CONDITION_NOT_VALIDATED. The engine never assumes daylight it was not told about.
 */
export type ConditionClass = 'day' | 'overcast' | 'night-lights' | 'flicker' | 'unknown'
/** Condition classes the pose evidence has not been validated in (METRICS §1.3 night cap). */
export const UNVALIDATED_LIGHT: readonly ConditionClass[] = ['night-lights', 'flicker', 'unknown']
export type ValidationLevel = 'V0' | 'V1' | 'V2' | 'V3'

/** Canonical engine units per metric id (MetricValue.unit). */
export const METRIC_UNITS: Record<MetricId, string> = {
  'serve-count': 'count',
  'retoss-count': 'count',
  'toss-apex-height': 'ratio-of-height',
  'toss-forward': 'cm',
  'toss-lateral': 'cm',
  'toss-drop': 'cm',
  'toss-height-spread': 'cm',
  'toss-forward-spread': 'cm',
  'toss-lateral-spread': 'cm',
  'contact-height-ratio': 'ratio-of-height',
  'contact-height-spread': 'cm',
  'contact-forward': 'cm',
  'rhythm-release-to-contact': 'ms',
  'rhythm-spread': 'ms',
  'trophy-pause': 'ms',
  'leg-drive': '% of height',
  'drive-time': 'ms',
  'loading-depth': '% of height',
  'deep-bend-flag': 'yes/no',
  'shoulder-tilt-trophy': 'band',
  'knee-bend-band': 'band',
  'shoulder-over-shoulder-contact': 'band',
  'landing-distance': 'cm',
  repeatability: 'index-0-100',
  'serve-in-rate': 'k-of-n',
  'first-serve-in-rate': 'k-of-n',
  'second-serve-in-rate': 'k-of-n',
  'double-faults': 'count',
  'placement-zone': 'counts T/body/wide',
  'serve-type-mix': 'counts flat/slice/kick/unknown',
  'speed-experimental': 'km/h range',
  'speed-average-rear': 'km/h range',
  'speed-radar-entered': 'km/h',
  spin: 'none',
  'capture-quality': 'good|usable|poor',
  'fatigue-flag': 'flag',
  'load-flag': 'flag',
}

/** metrics.json `statusTarget` (the ceiling after full validation). */
export const STATUS_TARGET: Record<MetricId, MetricStatus> = {
  'serve-count': 'measured',
  'retoss-count': 'measured',
  'toss-apex-height': 'estimated',
  'toss-forward': 'estimated',
  'toss-lateral': 'estimated',
  'toss-drop': 'measured',
  'toss-height-spread': 'estimated',
  'toss-forward-spread': 'estimated',
  'toss-lateral-spread': 'estimated',
  'contact-height-ratio': 'estimated',
  'contact-height-spread': 'estimated',
  'contact-forward': 'estimated',
  'rhythm-release-to-contact': 'measured',
  'rhythm-spread': 'measured',
  'trophy-pause': 'estimated',
  'leg-drive': 'estimated',
  'drive-time': 'estimated',
  'loading-depth': 'estimated',
  'deep-bend-flag': 'experimental',
  'shoulder-tilt-trophy': 'estimated',
  'knee-bend-band': 'estimated',
  'shoulder-over-shoulder-contact': 'experimental',
  'landing-distance': 'estimated',
  repeatability: 'experimental',
  'serve-in-rate': 'player-entered',
  'first-serve-in-rate': 'player-entered',
  'second-serve-in-rate': 'player-entered',
  'double-faults': 'player-entered',
  'placement-zone': 'player-entered',
  'serve-type-mix': 'player-entered',
  'speed-experimental': 'experimental',
  'speed-average-rear': 'experimental',
  'speed-radar-entered': 'player-entered',
  spin: 'unavailable',
  'capture-quality': 'measured',
  'fatigue-flag': 'estimated',
  'load-flag': 'estimated',
}

/** Views per metric (metrics.json `views`). */
export const METRIC_VIEWS: Record<MetricId, readonly ('side' | 'rear')[]> = {
  'serve-count': ['side', 'rear'],
  'retoss-count': ['side', 'rear'],
  'toss-apex-height': ['side', 'rear'],
  'toss-forward': ['side'],
  'toss-lateral': ['rear'],
  'toss-drop': ['side', 'rear'],
  'toss-height-spread': ['side', 'rear'],
  'toss-forward-spread': ['side'],
  'toss-lateral-spread': ['rear'],
  'contact-height-ratio': ['side', 'rear'],
  'contact-height-spread': ['side', 'rear'],
  'contact-forward': ['side'],
  'rhythm-release-to-contact': ['side', 'rear'],
  'rhythm-spread': ['side', 'rear'],
  'trophy-pause': ['side', 'rear'],
  'leg-drive': ['side'],
  'drive-time': ['side'],
  'loading-depth': ['side'],
  'deep-bend-flag': ['side'],
  'shoulder-tilt-trophy': ['side'],
  'knee-bend-band': ['rear'],
  'shoulder-over-shoulder-contact': ['rear'],
  'landing-distance': ['side'],
  repeatability: ['side', 'rear'],
  'serve-in-rate': ['side', 'rear'],
  'first-serve-in-rate': ['side', 'rear'],
  'second-serve-in-rate': ['side', 'rear'],
  'double-faults': ['side', 'rear'],
  'placement-zone': ['side', 'rear'],
  'serve-type-mix': ['side', 'rear'],
  'speed-experimental': ['side'],
  'speed-average-rear': ['rear'],
  'speed-radar-entered': ['side', 'rear'],
  spin: [],
  'capture-quality': ['side', 'rear'],
  'fatigue-flag': ['side', 'rear'],
  'load-flag': ['side', 'rear'],
}

export const TIMING_METRIC_IDS = ['rhythm-release-to-contact', 'rhythm-spread', 'toss-drop', 'trophy-pause', 'drive-time'] as const
export const SPATIAL_SPREAD_IDS = ['toss-height-spread', 'toss-forward-spread', 'toss-lateral-spread', 'contact-height-spread'] as const
/** The session spread each per-serve value feeds (its relative use is judged by the spread's level). */
export const SPREAD_OF: Partial<Record<MetricId, MetricId>> = {
  'toss-apex-height': 'toss-height-spread',
  'toss-forward': 'toss-forward-spread',
  'toss-lateral': 'toss-lateral-spread',
  'contact-height-ratio': 'contact-height-spread',
  'rhythm-release-to-contact': 'rhythm-spread',
}
/** cm positions from the image scale (METRICS §3.25 "positions" and "cm values"). */
export const POSITION_IDS = ['toss-forward', 'toss-lateral', 'contact-forward', 'landing-distance'] as const
export const POSE_DERIVED_IDS = [
  'leg-drive', 'drive-time', 'loading-depth', 'deep-bend-flag', 'shoulder-tilt-trophy', 'landing-distance',
  'trophy-pause', 'knee-bend-band', 'shoulder-over-shoulder-contact', 'repeatability',
] as const
/** Absolute heights, cm positions and angles: experimental with PITCH_UNKNOWN when the pitch is unknown (§1.1.3). */
export const PITCH_SENSITIVE_IDS = [
  'toss-apex-height', 'toss-forward', 'toss-lateral', 'contact-height-ratio', 'contact-forward',
  'landing-distance', 'shoulder-tilt-trophy', 'deep-bend-flag',
] as const

/** Player-facing unlock hints (metrics.json `reasonCodes`), plus the ARCHITECTURE §6.1 codes. */
export const UNLOCK_HINTS: Record<ReasonCode, string> = {
  VIEW_NOT_SUPPORTED: 'Film from the side, on your hitting-arm side, to see this.',
  VIEW_MISMATCH: "This clip doesn't look like the view you chose. Check where the phone is.",
  FPS_TOO_LOW: 'Record at 60 fps (120 fps or more for speed).',
  TIME_BASE_UNKNOWN: 'Import the original slow-motion file, or record in the app.',
  FRAMES_DROPPED: 'Close other apps while recording.',
  PLAYER_HEIGHT_MISSING: 'Add your height in Profile to see centimetres.',
  BODY_NOT_UPRIGHT: 'Stand tall for a second before each serve.',
  FEET_NOT_VISIBLE: 'Keep your feet in the frame.',
  POSE_LOW_QUALITY: "Make sure you're the only person near your serving spot, with the light behind the camera.",
  OCCLUDED: 'Try the other side of the court so nothing blocks the view.',
  ROLE_AMBIGUOUS: "We couldn't tell your front foot from your back foot on this serve.",
  BALL_NOT_TRACKED: 'Toss against sky, a fence or a plain windbreak; avoid trees behind you.',
  APEX_EXTRAPOLATED: 'Your toss went above the picture, so its height is estimated. Move the phone back a step to see it all.',
  APEX_OUT_OF_FRAME: 'Move the phone back a step or raise it a little so the whole toss fits.',
  RELEASE_NOT_FOUND: "We couldn't see this moment clearly on this serve.",
  CONTACT_NOT_FOUND: "We couldn't see this moment clearly on this serve.",
  LANDING_NOT_FOUND: "We couldn't see this moment clearly on this serve.",
  NO_CONTACT: 'Swing and miss: not counted in contact stats.',
  AUDIO_UNAVAILABLE: "Optional: turn on 'Use the hit sound for timing' for sharper contact timing.",
  NOT_ENTERED: 'Tag your serves (in, net, long, wide) in review.',
  TARGET_NOT_TAGGED: 'Tag where you aimed: T, body or wide.',
  BOUNCE_NOT_LOCATED: 'Raise the rear phone so both service boxes are clear. 4K helps.',
  NEEDS_CALIBRATION: 'Tap the four corners of the service box.',
  CAMERA_MOVED: 'Fix the phone firmly; it moved during recording.',
  CAMERA_TILTED: 'Keep the phone level; the guide turns green.',
  PITCH_UNKNOWN: "Record in the app, which reads the phone's tilt once you allow it, or answer “How was the phone mounted?” when you import. A level mount keeps heights as estimates.",
  SCALE_INCONSISTENT: 'Check your height in Profile. If this was slow motion, import the original.',
  IMPLAUSIBLE_VALUE: 'This reading looked wrong, so we left it out.',
  CHECK_THIS_SERVE: 'This one looks unusual. Check this serve?',
  TOO_FEW_SERVES: 'Record at least {n} serves from one side.',
  BASELINE_BUILDING: 'Building your range: {k} of 2 sessions from this set-up.',
  RANGE_TOO_WIDE: "This footage can't pin the speed down closely enough.",
  EXPERIMENTAL_HIDDEN: 'Turn on experimental metrics in Profile to see this.',
  CONDITION_NOT_VALIDATED: 'Checked in daylight only. Under lights this reading is experimental.',
  VALIDATION_PENDING: '',
  NOT_MEASURABLE:
    "Spin needs cameras shooting about 1,000 frames a second or a radar tracker; phone video can't measure it. Log the serve type you meant instead.",
  NOT_IMPLEMENTED: 'Coming later.',
  LOW_LIGHT: 'Put the sun or court lights behind the camera.',
  FLICKER: 'Under lights, record at 50 or 100 fps if your phone allows it.',
  MOTION_BLUR: "More light, or a shorter shutter in the app's recorder.",
  UNMATCHED: 'Compare sessions from the same side, view, set-up and serve.',
  NEEDS_SIDE_VIEW: 'Film from the side, on your hitting-arm side, to see this.',
  NEEDS_REAR_VIEW: 'Add a phone behind you to see this.',
  TILT_UNKNOWN: "Record in the app, which reads the phone's tilt once you allow it, or answer “How was the phone mounted?” when you import. A level mount keeps heights as estimates.",
  EXCLUDED_BY_QUALITY: 'This reading looked wrong, so we left it out.',
}

/** Plausibility bounds (metrics.json `plausibility`, §4.2). Hard = [low, high] reject; soft = flag. */
export const PLAUSIBILITY = {
  enteredHeightM: { hard: [1.3, 2.2], soft: [1.45, 2.05] },
  releaseHeightRatio: { hard: [0.45, 1.5], soft: [0.65, 1.25] },
  releaseToApexS: { hard: [0.25, 0.85], soft: [0.38, 0.72] },
  apexHeightM: { hardBelowContactMinusM: 0.1, hardAbove: 5.5, softBelow: 2.4, softAbove: 4.6, softRatioBelow: 1.45, softRatioAbove: 2.6 },
  apexToContactSignedS: { hard: [-0.15, 0.7], soft: [0, 0.57] },
  dropM: { hardAbove: 2.2, softBelow: 0.03, softAbove: 1.6 },
  releaseToContactS: { hard: [0.4, 1.6], soft: [0.6, 1.35] },
  contactHeightRatio: { hard: [1.1, 1.75], soft: [1.3, 1.62] },
  contactForwardM: { hard: [-0.8, 2], soft: [-0.3, 1.2] },
  tossForwardM: { hard: [-0.8, 2], soft: [-0.3, 1.2] },
  withinPlayerApexSdM: { hardAbove: 0.6, softAbove: 0.35 },
  withinPlayerRhythmSdS: { hardAbove: 0.3, softAbove: 0.15 },
  landingM: { hard: [-0.8, 2.5], soft: [-0.3, 1.5] },
  fittedGravityMps2: { hard: [7, 13], soft: [8.8, 10.8] },
  legDrivePctHeight: { hard: [-5, 40], soft: [0, 30] },
  driveTimeS: { hard: [0.05, 1.2], soft: [0.15, 0.8] },
  loadingDepthPctHeight: { hard: [-5, 30], softAbove: 20 },
  launchSpeedKmh: { hard: [40, 240], soft: [60, 200] },
  averageSpeedRearKmh: { hard: [30, 200], soft: [50, 170] },
} as const

const V1_DAY: Partial<Record<ConditionClass, ValidationLevel>> = { day: 'V1', overcast: 'V1' }

/**
 * Engine-side validation levels per condition class, from the synthetic run in
 * validation/results/metrics/SUMMARY.md (METRICS §1.3, §5.4; 2026-09-27, 122 rendered clips run
 * through the app pipeline). Unlisted = V0 (experimental) everywhere. Night-lights and flicker stay
 * V0 for every metric: the corpus has night renders at 240 fps only, and pose-derived metrics are
 * night-capped until the S4 cells pass.
 *
 * Passed (V1): serve-count, toss-apex-height and contact-height-ratio (D1 distances only; closer
 * than 6 m they are capped at experimental per serve). toss-apex-height is a LIMITED pass: with
 * truth landmarks (the 'injected', method-only variant) the D1 set gives median 4.1% and p95 5.6% of
 * height, which fails the gate (median ≤ 2.5%, p95 ≤ 5%). The app-pipeline pass (median 1.1%, p95
 * 2.7%) relies on MediaPipe's ~3% high head/floor reading cancelling the depth prior's
 * over-correction (the renders put the toss 0.09–0.21 m nearer the camera, the prior 0.30 m). Neither
 * bias is confirmed on real players; a V2 real-footage check must confirm the cancellation. Until
 * then the method-only p95 sets its assumed-level budget below. contact-height-ratio passes with truth
 * landmarks too (MAE 2.5%, p95 3.9%). Also: toss-drop, rhythm-release-to-contact
 * (≥ 45 fps; 30 fps is capped per serve), leg-drive (method MAE 0.6% with injected noise; MediaPipe
 * reads about 2% of height low, a persistent bias), loading-depth, and the spreads
 * toss-height-spread, toss-forward-spread, contact-height-spread, rhythm-spread (one 8-serve block
 * plus per-serve error analysis; the S9 variability family is not rendered yet).
 *
 * Failed (V0): toss-forward and contact-forward (MAE 5.3–6.7 cm against 5–6 cm: MediaPipe's foot
 * point sits behind the toe), drive-time (flat hip minimum: MAE 64–75 ms against 50), landing-distance
 * (p95 24 cm on the D1 set, 42 cm with injected foot noise), shoulder-tilt-trophy (p95 5.3° against
 * ±4°), trophy-pause (MAE 65–100 ms against 60), retoss-count (no re-toss renders), and the rear-view
 * and experimental-by-design metrics.
 */
export const VALIDATION_LEVELS: Partial<Record<MetricId, Partial<Record<ConditionClass, ValidationLevel>>>> = {
  'serve-count': V1_DAY,
  'toss-apex-height': V1_DAY,
  'toss-drop': V1_DAY,
  'contact-height-ratio': V1_DAY,
  'rhythm-release-to-contact': V1_DAY,
  'toss-height-spread': V1_DAY,
  'toss-forward-spread': V1_DAY,
  'contact-height-spread': V1_DAY,
  'rhythm-spread': V1_DAY,
  'leg-drive': V1_DAY,
  'loading-depth': V1_DAY,
}

/** Closer than this (camera to server, metres) the depth prior over-corrects heights (§3.2): experimental. */
export const MIN_VALIDATED_DISTANCE_M = 6

/**
 * Absolute heights with a level ASSUMED from the import's mount answer (METRICS §1.1.3a). The pitch
 * and roll priors widen each serve's range; the value keeps its V1 status only while the widened
 * per-serve error still meets the METRICS acceptance threshold:
 *   √(measuredP95² + (1.96·σ_tilt)²) ≤ p95Threshold   (ratio of standing height)
 * p95Threshold: METRICS §3.2 (p95 ≤ 5% of standing height) and §3.8 (p95 ≤ 0.05). measuredP95: the
 * synthetic worst-5% error at the D1 distances (validation/results/metrics/SUMMARY.md, 2026-09-27),
 * the larger of the app-pipeline and the method-only (truth landmarks) variants: toss-apex-height's
 * app-pipeline p95 (0.027) rests on two biases cancelling (VALIDATION_LEVELS above), so its method-only
 * p95 (0.056) is used, and an assumed level never keeps toss height estimated.
 */
export const ASSUMED_LEVEL_HEIGHT_BUDGET: Partial<Record<MetricId, { p95Threshold: number; measuredP95: number }>> = {
  'toss-apex-height': { p95Threshold: 0.05, measuredP95: 0.056 },
  'contact-height-ratio': { p95Threshold: 0.05, measuredP95: 0.02 },
}
/** Planning horizontal offset of the ball from the floor reference when the image gives none (m) [Our inference]. */
export const ROLL_OFFSET_DEFAULT_M = 0.5

export function validationLevel(id: MetricId, condition: ConditionClass): ValidationLevel {
  return VALIDATION_LEVELS[id]?.[condition] ?? 'V0'
}

const RANK: Record<MetricStatus, number> = { unavailable: 0, experimental: 1, estimated: 2, measured: 3, 'player-entered': 4 }

/** min(target, ceiling of the validation level) (§1.3). */
export function statusCeiling(id: MetricId, condition: ConditionClass): { status: MetricStatus; level: ValidationLevel } {
  const target = STATUS_TARGET[id]
  if (target === 'player-entered' || target === 'unavailable') return { status: target, level: validationLevel(id, condition) }
  const level = validationLevel(id, condition)
  let ceiling: MetricStatus = 'experimental'
  if (level === 'V1') ceiling = 'estimated'
  else if (level === 'V2') ceiling = (TIMING_METRIC_IDS as readonly string[]).includes(id) ? 'measured' : 'estimated'
  else if (level === 'V3') ceiling = target
  return { status: RANK[target] < RANK[ceiling] ? target : ceiling, level }
}

export function lowerStatus(a: MetricStatus, b: MetricStatus): MetricStatus {
  return RANK[a] <= RANK[b] ? a : b
}
