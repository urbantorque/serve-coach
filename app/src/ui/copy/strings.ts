/**
 * UI strings not owned by metrics.json or coaching-library.json (DESIGN §13.1). Australian English,
 * sentence case, no em or en dashes, no exclamation marks, no emoji (DESIGN §11). The copy lint in
 * strings.test.ts scans this file.
 */
import type { MetricStatus, ReasonCode } from '../../analysis/types.ts'
import { REAR_ONLY_METRIC_IDS } from '../../analysis/types.ts'
import type { VerdictWord } from '../../data/domain.ts'

/** DESIGN §3.1 chip labels. */
export const STATUS_LABEL: Record<MetricStatus, string> = {
  measured: 'Measured',
  estimated: 'Estimate',
  'player-entered': 'You logged',
  experimental: 'Experimental',
  unavailable: 'Not available',
}

/** DESIGN §3.4 evidence tier chips. */
export type EvidenceTierId = 'research-backed' | 'coach-recommended' | 'experimental'
export const TIER_LABEL: Record<EvidenceTierId, string> = {
  'research-backed': 'Research-backed',
  'coach-recommended': 'Coaches recommend',
  experimental: 'Experimental',
}

/** DESIGN §3.5: one display vocabulary for every verdict id across specs. */
export type VerdictDisplayId =
  | 'clearly-better'
  | 'likely-better'
  | 'about-the-same'
  | 'too-early'
  | 'likely-worse'
  | 'clearly-worse'
  | 'not-comparable'
  | 'trend-too-early'

export const VERDICT_WORDS: Record<VerdictDisplayId, string> = {
  'clearly-better': 'Clearly better',
  'likely-better': 'Likely better',
  'about-the-same': 'About the same',
  'too-early': 'Too early to tell',
  'likely-worse': 'Likely worse',
  'clearly-worse': 'Clearly worse',
  'not-comparable': 'Not comparable yet',
  'trend-too-early': 'Not a clear trend yet',
}

/** Maps METRICS, COACHING and ARCHITECTURE verdict ids to the display vocabulary (DESIGN §15 flag 2). */
export function verdictDisplayId(id: VerdictWord | VerdictDisplayId): VerdictDisplayId {
  switch (id) {
    case 'clear-improvement':
      return 'clearly-better'
    case 'clear-decline':
      return 'clearly-worse'
    case 'too-early-to-tell':
      return 'too-early'
    case 'no-clear-change':
      return 'about-the-same'
    default:
      return id
  }
}

/** Player-relative band words (DESIGN §3.3 rule 6). Never degrees, never good or bad. */
export const BAND_WORDS = {
  low: 'Lower than your usual',
  typical: 'Typical for you',
  high: 'Higher than your usual',
  unclear: 'Not clear yet',
} as const

export const CAPTURE_WORDS = { good: 'Good', usable: 'Fair', poor: 'Limited' } as const

/** DESIGN §3.2 validation level, in words. */
export const VALIDATION_TEXT = {
  V0: 'Not yet checked',
  V1: 'Checked on simulated serves. Real-court check in progress.',
  V2: 'Checked against hand-marked real video',
  V3: 'Checked against a physical reference (radar, measuring pole or a second camera)',
} as const

/** DESIGN §3.1 short forms for tiles (its table allows up to five words). METRICS owns the unlock hints. */
const REASON_SHORT: Partial<Record<ReasonCode, string>> = {
  NEEDS_REAR_VIEW: 'Needs a view from behind',
  NEEDS_SIDE_VIEW: 'Needs the side view',
  VIEW_MISMATCH: 'Not from this view',
  FPS_TOO_LOW: 'Needs 60 fps',
  TARGET_NOT_TAGGED: 'Tag your target',
  APEX_EXTRAPOLATED: 'Peak estimated',
  TILT_UNKNOWN: 'Phone tilt unknown',
  PITCH_UNKNOWN: 'Phone tilt unknown',
  BOUNCE_NOT_LOCATED: 'Bounce not found',
  EXCLUDED_BY_QUALITY: 'Not measured',
  IMPLAUSIBLE_VALUE: 'Not measured',
  TIME_BASE_UNKNOWN: 'Frame timing unclear',
  PLAYER_HEIGHT_MISSING: 'Add your height',
  FEET_NOT_VISIBLE: 'Feet out of frame',
  BALL_NOT_TRACKED: 'Ball not tracked',
  APEX_OUT_OF_FRAME: 'Toss left the frame',
  NOT_ENTERED: 'Tag your serves',
  NEEDS_CALIBRATION: 'Tap the court corners',
  EXPERIMENTAL_HIDDEN: 'Experimental (off)',
  NOT_MEASURABLE: 'Not measurable by phone',
  NOT_IMPLEMENTED: 'Coming later',
  CAMERA_MOVED: 'Phone moved',
  CAMERA_TILTED: 'Phone tilted',
  POSE_LOW_QUALITY: 'Body not clear',
  OCCLUDED: 'Body not clear',
  CHECK_THIS_SERVE: 'Check this serve',
}

export const REASON_FALLBACK = "Couldn't see this clearly"

/**
 * Short reason phrase that replaces an unavailable value (DESIGN §3.1). Speed needs 120 fps; the
 * catalogue's generic VIEW_NOT_SUPPORTED resolves by the metric's view.
 */
export function reasonShortForm(code: ReasonCode | undefined, metricId?: string, opts: { minServes?: number } = {}): string {
  if (!code) return REASON_FALLBACK
  if (code === 'FPS_TOO_LOW' && metricId?.startsWith('speed')) return 'Needs 120 fps'
  if (code === 'TOO_FEW_SERVES') return opts.minServes ? `Needs ${opts.minServes} serves` : 'Needs more serves'
  if (code === 'VIEW_NOT_SUPPORTED') {
    return metricId && (REAR_ONLY_METRIC_IDS as readonly string[]).includes(metricId) ? 'Needs a view from behind' : 'Needs the side view'
  }
  return REASON_SHORT[code] ?? REASON_FALLBACK
}

/** Glossary (DESIGN §11): phase and key-frame captions the player sees. */
export const PHASE_LABEL = {
  setup: 'Setup',
  toss: 'Toss',
  loading: 'Loading',
  drive: 'Drive',
  contact: 'Contact',
  landing: 'Landing',
  recovery: 'Recovery',
} as const

export const KEY_FRAME_LABEL = {
  setup: 'Setup',
  release: 'Release',
  apex: 'Peak',
  trophy: 'Top of swing',
  lowestHip: 'Lowest point',
  contact: 'Contact',
  landing: 'Landing',
  recovery: 'Recovery',
} as const

/** Serve outcome words (DESIGN §2.6); the mark shape always sits beside the word. */
export type OutcomeMarkKind = 'in' | 'net' | 'long' | 'wide' | 'fault' | 'untagged'
export const OUTCOME_WORDS: Record<OutcomeMarkKind, string> = {
  in: 'In',
  net: 'Net',
  long: 'Long',
  wide: 'Wide',
  fault: 'Fault',
  untagged: 'Not tagged',
}

export const UI = {
  sampleBanner: 'Sample data · synthetic player',
  earlyRead: 'Early read',
  plus: 'Plus',
  experimentalHeader: 'Experimental',
  experimentalLine: 'Not yet checked against a radar or measured marks. Not used for coaching.',
  notAvailableHeader: 'Not available from this session',
  validationFooter:
    'Early version: our measurements are checked on simulated serves, not yet on real courts.',
  howWeMeasure: 'How we measure',
  sideTossBias:
    'From the side, a toss nearer the camera than your body reads a little high, and a little sideways wobble adds a few centimetres to the spread.',
  measurementLimit: 'At the limit of what we can measure.',
  checkThisServe: 'Check this serve',
  updating: 'Updating…',
  saving: 'Saving…',
  loadError: "We couldn't load this. Try again.",
  tryAgain: 'Try again',
} as const

/** DESIGN §11 rules 6 and 12: words that never appear in player-facing copy (copy lint). */
export const NEVER_SAY = [
  'bend more',
  'bend deeper',
  'get lower',
  'jump higher',
  'push harder',
  'explode',
  'little bend',
  'level up',
  'streak',
  'unlock your potential',
  'crush',
  'perfect',
  'magic',
  'smart',
  'bad serve',
  'failed',
  'wrong',
] as const
