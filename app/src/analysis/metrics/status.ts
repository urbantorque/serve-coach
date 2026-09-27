/**
 * Status resolution (METRICS §1.3, ARCHITECTURE §5.6): prerequisites → unavailable with the first
 * failing reason; otherwise min(target, validation ceiling in this condition class), then the
 * per-value downgrades. Every downgrade and every unavailable value carries a reason code.
 */
import type { MetricId, MetricStatus, MetricValue, ReasonCode } from '../types.ts'
import {
  METRIC_UNITS,
  POSE_DERIVED_IDS,
  UNLOCK_HINTS,
  lowerStatus,
  statusCeiling,
  type ConditionClass,
} from './catalogue.ts'

export interface Downgrade {
  /** The highest status the value may keep. */
  cap: MetricStatus
  reason: ReasonCode
}

export interface MetricDraft {
  value: number | string | null
  confidence: number
  basis: string
  uncertainty?: MetricValue['uncertainty']
  secondary?: Record<string, number | string>
  sigmaRandom?: number
  sigmaLeak?: number
  sigmaShared?: number
  downgrades?: Downgrade[]
  /** Info-level reason attached without a downgrade (e.g. SCALE_INCONSISTENT on the cm value). */
  infoReason?: ReasonCode
  plausibility?: MetricValue['plausibility']
  band?: MetricValue['band']
  bandBasis?: MetricValue['bandBasis']
  bandProbabilities?: MetricValue['bandProbabilities']
  flag?: boolean
  censored?: 'right'
  quantity?: MetricValue['quantity']
  provenance?: MetricValue['provenance']
  display?: string
  n?: number
  nEligible?: number
  provisional?: boolean
  nearMeasurementLimit?: boolean
  checkId?: string
}

export const METHOD_VERSION = 'engine-core@1.0.0'

/** Plain-English reason text for `unavailableReason` (METRICS §1.3 meanings). */
export const REASON_TEXT: Partial<Record<ReasonCode, string>> = {
  VIEW_NOT_SUPPORTED: 'This camera view cannot see it.',
  NEEDS_SIDE_VIEW: 'Only the side view can see this.',
  NEEDS_REAR_VIEW: 'Only the view from behind can see this.',
  VIEW_MISMATCH: 'The clip does not look like the view that was chosen.',
  FPS_TOO_LOW: 'The frame rate is too low for this.',
  TIME_BASE_UNKNOWN: 'The clip may be slow motion and its real timing could not be confirmed.',
  FRAMES_DROPPED: 'Too many frames were missing in this serve.',
  PLAYER_HEIGHT_MISSING: 'Centimetres need your height.',
  BODY_NOT_UPRIGHT: 'No standing frames to measure your height in the picture.',
  FEET_NOT_VISIBLE: 'Your feet were not clearly visible.',
  POSE_LOW_QUALITY: 'Body tracking was not reliable enough here.',
  OCCLUDED: 'The body part needed was hidden at that moment.',
  ROLE_AMBIGUOUS: 'We could not tell your front foot from your back foot.',
  BALL_NOT_TRACKED: 'The ball toss was not tracked.',
  APEX_OUT_OF_FRAME: 'The toss went above the picture and could not be fitted.',
  RELEASE_NOT_FOUND: 'The toss release was not found.',
  CONTACT_NOT_FOUND: 'The ball was not seen near contact.',
  LANDING_NOT_FOUND: 'The landing was not found.',
  NO_CONTACT: 'Swing and miss.',
  NOT_ENTERED: 'Not tagged yet.',
  TARGET_NOT_TAGGED: 'Needs the target you aimed at.',
  NEEDS_CALIBRATION: 'Needs the four-corner court tap.',
  BOUNCE_NOT_LOCATED: 'The bounce was not found in the video.',
  CAMERA_MOVED: 'The phone moved during recording.',
  CAMERA_TILTED: 'The phone was tilted more than we can correct.',
  IMPLAUSIBLE_VALUE: 'This reading failed a plausibility check.',
  TOO_FEW_SERVES: 'Not enough serves for this summary.',
  NOT_MEASURABLE: 'Phone video cannot measure this.',
  NOT_IMPLEMENTED: 'Not built yet.',
  CONDITION_NOT_VALIDATED: 'Not yet validated for this light.',
  RANGE_TOO_WIDE: 'The range would be too wide to be useful.',
  BASELINE_BUILDING: 'Building your personal range first.',
}

/** Fills the {n} / {k} placeholders of the catalogue hints (the engine has no history: 1 of 2 sessions). */
export function fillHint(hint: string | undefined): string | undefined {
  if (!hint) return undefined
  return hint.replace('{k}', '1').replace('{n}', '5')
}

export function unavailable(id: MetricId, reason: ReasonCode, basis: string, extra: Partial<MetricValue> = {}): MetricValue {
  return {
    id,
    value: null,
    unit: METRIC_UNITS[id],
    status: 'unavailable',
    confidence: 0,
    basis,
    reasonCode: reason,
    unavailableReason: REASON_TEXT[reason] ?? reason,
    unlockHint: fillHint(UNLOCK_HINTS[reason]),
    methodVersion: METHOD_VERSION,
    ...extra,
  }
}

const NIGHT: ConditionClass[] = ['night-lights', 'flicker']

/** Resolves the emitted status of a computed value and builds the MetricValue. */
export function finalizeMetric(id: MetricId, draft: MetricDraft, condition: ConditionClass): MetricValue {
  const { status: ceiling, level } = statusCeiling(id, condition)
  let status = ceiling
  let reason: ReasonCode | undefined
  if ((POSE_DERIVED_IDS as readonly string[]).includes(id) && NIGHT.includes(condition) && status !== 'experimental') {
    status = 'experimental'
    reason = 'CONDITION_NOT_VALIDATED'
  }
  if (level === 'V0' && ceiling === 'experimental' && !reason) reason = NIGHT.includes(condition) && (POSE_DERIVED_IDS as readonly string[]).includes(id) ? 'CONDITION_NOT_VALIDATED' : 'VALIDATION_PENDING'
  // The status without the unknown-pitch cap (METRICS §1.1 item 3: spreads keep their status).
  let levelStatus = status
  for (const d of draft.downgrades ?? []) if (d.reason !== 'PITCH_UNKNOWN') levelStatus = lowerStatus(levelStatus, d.cap)
  for (const d of draft.downgrades ?? []) {
    const next = lowerStatus(status, d.cap)
    if (next !== status || d.cap === status) {
      // Keep the most specific reason for the lowest cap.
      if (next !== status || !reason || reason === 'VALIDATION_PENDING') reason = d.reason
      status = next
    }
  }
  if (status === 'unavailable') {
    return unavailable(id, reason ?? 'VALIDATION_PENDING', draft.basis, { validationLevel: level, conditionClass: condition })
  }
  const out: MetricValue = {
    id,
    value: draft.value,
    unit: METRIC_UNITS[id],
    status,
    confidence: Math.max(0, Math.min(1, draft.confidence)),
    basis: draft.basis,
    validationLevel: level,
    conditionClass: condition,
    methodVersion: METHOD_VERSION,
  }
  const code = reason ?? draft.infoReason
  if (code) {
    out.reasonCode = code
    const hint = fillHint(UNLOCK_HINTS[code])
    if (hint) out.unlockHint = hint
  }
  const copy: (keyof MetricDraft & keyof MetricValue)[] = [
    'uncertainty', 'secondary', 'sigmaRandom', 'sigmaLeak', 'sigmaShared', 'plausibility', 'band', 'bandBasis', 'bandProbabilities',
    'flag', 'censored', 'quantity', 'provenance', 'display', 'n', 'nEligible', 'provisional', 'nearMeasurementLimit', 'checkId',
  ]
  for (const k of copy) if (draft[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = draft[k]
  if (levelStatus !== status && levelStatus !== 'unavailable') out.statusIfLevel = levelStatus
  if (status === 'experimental' && out.uncertainty?.kind === 'ci95') out.uncertainty = { ...out.uncertainty, kind: 'range' }
  return out
}

/** The canonical "wrong view" code: NEEDS_SIDE_VIEW / NEEDS_REAR_VIEW (ARCHITECTURE §5.6). */
export function wrongViewReason(metricViews: readonly string[]): ReasonCode {
  if (metricViews.length === 0) return 'NOT_MEASURABLE'
  return metricViews.includes('side') ? 'NEEDS_SIDE_VIEW' : 'NEEDS_REAR_VIEW'
}
