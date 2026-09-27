/**
 * Stored record types (ARCHITECTURE §7.1). IndexedDB cannot index booleans, so every indexed flag is
 * stored as `0 | 1`.
 */
import type {
  AnalysisErrorCode,
  CaptureContext,
  CoachingDecision,
  Experiment,
  PoseTrackCompact,
  BallTrackCompact,
  Rect,
  ServeAnalysis,
  ServeAnnotation,
  ServeWindow,
  SessionAnalysis,
  SessionStats,
} from './domain.ts'
import type {
  CameraOrientation,
  CameraSide,
  CameraView,
  CaptureSetup,
  FpsClass,
  Handedness,
  KeyFrameEvent,
  LevelBand,
  ServeNumber,
  ServeOutcome,
  ServePhase,
  ServeSide,
  ServeType,
  SessionMode,
  TargetZone,
  TiltStatus,
  VideoMeta,
} from '../analysis/types.ts'

export type Flag = 0 | 1

/** COACHING §9.3 ids. */
export type BodyRegion = 'shoulder' | 'elbow' | 'back' | 'knee' | 'other'
/** PRODUCT O3; 'no-comp' is exclusive. */
export type PlayStyle = 'pennant' | 'night-comp' | 'other-league' | 'no-comp'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type Goal = 'first-serves-in' | 'more-pace' | 'second-serve-reliability' | 'less-effort'

export interface ProfileRecord {
  id: 'me'
  /** Required before analysis; 1.30 to 2.20 m accepted. */
  heightM?: number
  handedness: Handedness
  level: LevelBand
  /** Self-reported UTR (optional). Stored locally; events only ever carry its band. */
  utr?: number
  goal: Goal
  /** The closed beta is 18+ (D11); onboarding only produces '18-plus' (DESIGN §15 flag 13). */
  ageBand: 'under-15' | '15-17' | '18-plus'
  playStyle: PlayStyle[]
  matchNights: Weekday[]
  season?: { startDate: string; weeks: number }
  /** Comp player in the launch segment (D11). Recomputed on edit. */
  inSegment: Flag
  /** Standing "areas to go easy on". Never a pain flag by itself. */
  comfortRegions: BodyRegion[]
  /**
   * "My coach's focus" (PRODUCT §6.8.5, research 10 M8; ui-profile addition): a coaching-library
   * item id pinned in Profile → Coach. Maps to CoachingProfile.pinnedFocusItemId.
   */
  pinnedFocusItemId?: string
  /** Referral switch only (D8). Local only; excluded from export unless the player opts in. */
  comfort: { painFlag: Flag; area?: BodyRegion; updatedAt?: string; consentAt?: string }
  createdAt: string
  updatedAt: string
}

export type SessionTemplate =
  | 'retest' | 'check-in' | 'second-serve-check-in' | 'experiment' | 'both-sides' | 'outcomes' | 'import'

export type SessionStatus = 'importing' | 'queued' | 'analysing' | 'paused' | 'ready' | 'failed' | 'cancelled'

export interface SessionRecord {
  id: string
  createdAt: string
  /** Capture time (container) or import time. */
  startedAt: string
  /** Local calendar date of the practice visit (YYYY-MM-DD); the free-tier meter counts distinct visits. */
  visitId: string
  status: SessionStatus
  mode: SessionMode
  view: CameraView
  cameraSide?: CameraSide
  fpsClass?: FpsClass
  setup?: CaptureSetup
  tiltStatus?: TiltStatus
  /** Displayed orientation of the session's clip (D1: portrait is the default set-up). */
  orientation?: CameraOrientation
  template?: SessionTemplate
  blockIndex?: number
  isRetest: Flag
  experimentId?: string
  conditions?: { wind?: 'calm' | 'breezy' | 'windy'; light?: 'day' | 'lights' | 'indoor' }
  defaultSide?: ServeSide
  defaultServeNumber?: ServeNumber
  defaultIntendedType?: ServeType
  defaultTarget?: TargetZone
  linkedSessionId?: string
  label?: string
  venueLabel?: string
  isDemo: Flag
  analysis?: SessionAnalysis
  error?: { code: AnalysisErrorCode; message: string }
}

export type RetentionPolicy = 'keep' | 'auto-delete-days' | 'delete-after-analysis'

export interface VideoRecord {
  id: string
  sessionId: string
  role: 'primary' | 'second-angle' | 'demo'
  source: 'in-app-web' | 'in-app-native' | 'camera-input' | 'file-import' | 'demo'
  capture: CaptureContext
  fileName: string
  mimeType?: string
  sizeBytes: number
  /** size + hash of first and last 64 KB + duration: duplicate-import check. */
  fingerprint: string
  meta: VideoMeta
  importedAt: string
  storage: 'idb' | 'native' | 'deleted' | 'not-kept'
  nativePath?: string
  retention: { policy: RetentionPolicy; retainUntil?: number; pinned: Flag }
  /** Denormalised for the index (absent when kept or pinned). Epoch ms. */
  retainUntil?: number
  deletedAt?: string
  deletedReason?: 'player' | 'retention' | 'after-analysis' | 'storage-full'
  /** Invariant (D4): a stored video never has an audio track. */
  audio: 'never-recorded' | 'removed'
  isDemo: Flag
}

export interface VideoBlobRecord {
  /** = VideoRecord.id */
  id: string
  blob: Blob
}

export interface VideoChunkRecord {
  recordingId: string
  seq: number
  blob: Blob
}

export interface JobRecord {
  id: string
  sessionId: string
  videoId: string
  state: 'queued' | 'sparse' | 'dense' | 'finalising' | 'paused' | 'done' | 'failed' | 'cancelled'
  windows?: ServeWindow[]
  completedWindows: number[]
  progress: number
  attempts: number
  engineVersion: string
  updatedAt: string
  error?: { code: AnalysisErrorCode; message: string }
}

export interface ServeRecord extends ServeAnalysis {
  includedFlag: Flag
}

export interface TrackRecord {
  serveId: string
  sessionId: string
  pose: PoseTrackCompact
  ball?: BallTrackCompact
}

export interface KeyFrameRecord {
  id: string
  serveId: string
  sessionId: string
  event: KeyFrameEvent
  phase?: ServePhase
  /**
   * 'session-thumb' (engine-pipeline addition): one small square crop per session for list rows,
   * stored with the representative serve's id and deleted with the session.
   */
  role: 'thumb' | 'evidence' | 'evidence-full' | 'session-thumb'
  crop?: Rect
  frameIndex: number
  tReal: number
  width: number
  height: number
  /** image/jpeg */
  blob: Blob
  createdAt: string
}

export interface ServeTagRecord {
  serveId: string
  sessionId: string
  /** 'unknown' = "Not sure" */
  outcome?: ServeOutcome
  outcomeSource?: 'player' | 'auto-suggested'
  serveNumber?: ServeNumber
  side?: ServeSide
  intendedType?: ServeType
  targetZone?: TargetZone
  radarKmh?: number
  radarDevice?: string
  taggedAt: string
  via: 'review' | 'misses-only' | 'bulk' | 'serve-detail'
}

export interface TallyCounts {
  in: number
  total: number
  net?: number
  long?: number
  wide?: number
}

export interface SessionTallyRecord {
  sessionId: string
  firstServes?: TallyCounts
  secondServes?: TallyCounts
  doubleFaults?: number
  conflictResolution?: 'tags' | 'tally'
  enteredAt: string
}

export type SessionStatsRecord = SessionStats
export interface CoachingRecord extends CoachingDecision {
  experimentId?: string
  /** Sample data (addition to ARCHITECTURE §7.1 so demo rows can be filtered and removed). */
  isDemo?: Flag
}
export interface ExperimentRecord extends Experiment {
  /** Sample data (addition): demo experiments never appear in the player's Progress. */
  isDemo?: Flag
}

export interface PracticeLogRecord {
  id: string
  /** Local date YYYY-MM-DD. */
  date: string
  experimentId?: string
  itemId?: string
  drillId?: string
  drillVariant?: 'base' | 'progression' | 'regression'
  minutes: number
  reps?: number
  successCriterionMet?: 'yes' | 'partly' | 'no'
  feel?: 'natural' | 'ok' | 'awkward'
  cueHelpful?: 'yes' | 'not-sure' | 'no'
  cueRegisterUsed?: 'analogy' | 'outcome'
  setting?: 'court' | 'wall' | 'other'
  body?: 'fine' | 'sore' | 'pain'
  discomfort?: Flag
  /** 140 characters; never leaves the phone, never exported. */
  note?: string
  createdAt: string
  /** Sample data (addition to ARCHITECTURE §7.1). */
  isDemo?: Flag
}

/** D11 match log. Player-entered; never pooled with practice statistics. */
export interface MatchLogRecord {
  id: string
  date: string
  competition: 'pennant' | 'night-comp' | 'league' | 'social'
  serviceGames?: number
  doubleFaults?: number
  firstServeRough?: 'under-half' | 'about-half' | 'most' | 'nearly-all'
  cueUsed?: 'yes' | 'no' | 'forgot'
  experimentId?: string
  createdAt: string
  updatedAt: string
  /** Sample data (addition to ARCHITECTURE §7.1). */
  isDemo?: Flag
}

/** Local usage counts; stored on the phone only, kept 180 days. */
export interface EventRecord {
  seq?: number
  name: string
  /** ISO 8601, bucketed to the hour. */
  at: string
  props: Record<string, string | number | boolean>
}

export type AnnotationRecord = ServeAnnotation

export interface ConsentRecord {
  granted: boolean
  version: string
  at: string
  provider?: string
  payloadSchema?: string
  revokedAt?: string
}

export interface ConsentState {
  cloudAiCoaching?: ConsentRecord
  backupSync?: ConsentRecord
  modelImprovement?: ConsentRecord
  marketing?: ConsentRecord
  painNotes?: ConsentRecord
  parental?: ConsentRecord
  usageCounts?: ConsentRecord
}

/** DESIGN §13.3: the value shape of the 'theme' setting. */
export interface ThemeSetting {
  scheme: 'system' | 'light' | 'dark'
  courtSide: 'camera' | 'always' | 'off'
}

/** Value type for each settings key (ARCHITECTURE §7.1 SettingKey). */
export interface SettingValues {
  retention: { policy: RetentionPolicy; days: 7 | 30 | 90 }
  experimentalMetrics: boolean
  hitSoundTiming: boolean
  captureDefaults: { orientation: CameraOrientation; countdownS: number; fps: number }
  poseModel: 'full' | 'lite'
  consents: ConsentState
  storagePersisted: boolean | 'denied'
  lastRetentionSweepAt: string
  validationMode: boolean
  demoSeedVersion: string
  theme: ThemeSetting
  /** First-run state (ui-profile addition): the first-run redirect fires only while 'not-started'. */
  onboarding: OnboardingSetting
  /** PWA prototype plan flag (ui-profile addition). Set by the Plan screen's test buttons; no payment. */
  entitlement: EntitlementSetting
}
export type SettingKey = keyof SettingValues

/** ui-profile addition: onboarding progress (PRODUCT §6.1). */
export interface OnboardingSetting {
  status: 'not-started' | 'completed' | 'skipped'
  at?: string
}

/**
 * ui-profile addition: the local plan flag (PRODUCT §5.2, §6.15). In the PWA prototype no payment is
 * ever taken; `source: 'prototype'` marks a flag switched on for testing.
 */
export interface EntitlementSetting {
  tier: 'free' | 'plus'
  plan?: 'annual' | 'monthly' | 'season'
  source: 'prototype'
  at?: string
  /** Annual plan: the 7-day trial's end (ISO). */
  trialEndsAt?: string
  /** Season pass: the non-renewing end date (ISO). */
  endsAt?: string
}

export interface SettingRecord<K extends SettingKey = SettingKey> {
  key: K
  value: SettingValues[K]
  updatedAt: string
}

export const DEFAULT_SETTINGS: SettingValues = {
  retention: { policy: 'auto-delete-days', days: 30 },
  experimentalMetrics: false,
  hitSoundTiming: false,
  captureDefaults: { orientation: 'portrait', countdownS: 10, fps: 60 },
  poseModel: 'full',
  consents: {},
  storagePersisted: false,
  lastRetentionSweepAt: '',
  validationMode: false,
  demoSeedVersion: '',
  theme: { scheme: 'system', courtSide: 'camera' },
  onboarding: { status: 'not-started' },
  entitlement: { tier: 'free', source: 'prototype' },
}

export interface DeletionLogRecord {
  seq?: number
  at: string
  scope: 'serve' | 'session' | 'video' | 'all-videos' | 'retention-sweep' | 'match-log' | 'events-sweep'
  /** e.g. { serves: 1, keyFrames: 9 }; never content. */
  counts: Record<string, number>
  sessionId?: string
}
