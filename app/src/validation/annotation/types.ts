/**
 * "Check this serve" annotations (ARCHITECTURE §6.6, §12; METRICS §5.6). A person (the player, a coach
 * or our team) marks ground truth on one serve of a real clip. The stored record is the §6.6
 * `ServeAnnotation` plus a few additive fields, kept in the existing `annotations` table.
 */
import type { MetricId } from '../../analysis/types.ts'
import type { ServeAnnotation } from '../../data/domain.ts'

export type AnnotatorRole = 'player' | 'coach' | 'team'

/** metrics.json `speed-radar-entered.inputs.device`. */
export type RadarDevice = 'pocket-radar' | 'other-radar' | 'other'

export interface CheckReference {
  /** Peak speed from a radar, km/h (converted when entered in mph). Stored as `speed-radar-entered`. */
  radarKmh?: number
  radarDevice?: RadarDevice
  /** What the radar reads: its peak (near the racket), never an average. */
  radarQuantity?: 'peak'
  /** The unit the reading was entered in, and the number as entered. */
  radarUnit?: 'km/h' | 'mph'
  radarEntered?: number
  tapeLandingM?: number
  poleApexM?: number
}

/** One person's marks on one serve, as stored. */
export interface CheckAnnotation extends ServeAnnotation {
  serveId: string
  annotatorRole: AnnotatorRole
  /**
   * True while the marks were made without seeing the app's values (METRICS §5.6 blinding). Marks
   * changed after the comparison was shown set it to false for good.
   */
  blind: boolean
  /** When the comparison was first shown for these marks. */
  revealedAt?: string
  updatedAt: string
  reference?: CheckReference
  /**
   * Study participant code (for example "P07") when one study phone holds several players' sessions
   * (docs/VALIDATION_PROTOCOL.md §7.4). The export uses it as the subject key, so pooled statistics
   * cluster serves by player. A pseudonym, never a name. Absent on a player's own phone.
   */
  subjectCode?: string
}

/**
 * The per-serve metrics a check can compare, in the app's own units. Leg drive, loading depth and
 * drive time come from the hip-centre marks and the lowest-hip frame; shoulder tilt at the top from
 * both shoulders on the trophy frame (METRICS §5.6).
 */
export const CHECKED_METRIC_IDS = [
  'toss-apex-height',
  'contact-height-ratio',
  'toss-drop',
  'rhythm-release-to-contact',
  'toss-forward',
  'contact-forward',
  'landing-distance',
  'leg-drive',
  'loading-depth',
  'drive-time',
  'shoulder-tilt-trophy',
] as const satisfies readonly MetricId[]
export type CheckedMetricId = (typeof CHECKED_METRIC_IDS)[number]

/** The events a check marks, in serve order (keys shared with the engine's ServeEvents). */
export const CHECKED_EVENTS = ['tossRelease', 'tossApex', 'trophy', 'lowestHip', 'contact', 'landing'] as const
export type CheckedEvent = (typeof CHECKED_EVENTS)[number]

/**
 * The app's own unrounded mechanics for a serve (ServeAnalysis.legDrive and .shoulder), so marks are
 * compared with what the engine computed rather than the rounded display value. The shoulder angle
 * is internal validation data only: the app never shows degrees for a band (D5).
 */
export interface AppMechanics {
  /** Leg drive, % of height. */
  hipRisePctH?: number
  /** Loading depth, % of height. */
  hipDropPctH?: number
  /** Drive time, ms. */
  driveTimeMs?: number
  /** 2D shoulder-line angle at trophy, degrees, positive = front shoulder higher. */
  shoulderTiltDeg?: number
}

/** A point in normalised coordinates of the displayed frame (x / width, y / height). */
export interface MarkPoint {
  frameIndex: number
  x: number
  y: number
}
