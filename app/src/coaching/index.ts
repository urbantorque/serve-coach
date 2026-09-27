/**
 * Coaching engine public API (COACHING §7; ARCHITECTURE §3 `coaching/`). Framework-free: imports only
 * `analysis/types` and `analysis/stats`. UI adapters live in `ui/screens/focus/`.
 */
export { decideFocus, DECISION_COPY, GOAL_WORDS, warmUpRoutine } from './decide.ts'
export { detectItem, ITEM_WORDS, type Detection, type DetectStatus } from './detect.ts'
export { buildEvidence, chooseCue, chooseDrill, keyFrameEventFor, OUTCOME_LINE, practiceLogRules, progressionGatePasses, retestPlan } from './deliver.ts'
export {
  buildVerdictRequest,
  COOLDOWN_SESSIONS,
  cooldownsFrom,
  experimentFromDecision,
  experimentRecordStatus,
  experimentTransition,
  matchedComparison,
  primarySpec,
  rederiveRetests,
  retestDue,
  retestKind,
  sameSessionCheck,
  STRAIGHT_AFTER_PRACTICE,
  SUPERSEDED_COPY,
  unmatchedReason,
  localYmd,
  type EndedExperiment,
  type MatchedComparisonResult,
  type RetestDue,
  type SameSessionCheck,
  type Transition,
} from './experiment.ts'
export { ENGINE_VERSION, FOCUS_ITEMS, getItem, item, itemByFaultId, LIBRARY, LIBRARY_VERSION, type LibraryItem } from './library.ts'
export { lintItem, lintLibrary } from './lint.ts'
export { LOAD_COPY, loadGuidance, rampFlag } from './load.ts'
export { coachLevel, normaliseProfile, REGION_WORDS, registerForLevel, type NormalisedProfile } from './profile.ts'
export {
  BODY_CHECK,
  bodyCheckFromRedFlags,
  COMFORT_LINE,
  DRILL_PAIN_RULE,
  LESS_EFFORT_LINE,
  PAUSE_LINE,
  RED_FLAG_ANSWERS,
  RED_FLAG_TITLE,
  RED_FLAGS,
  REFERRAL_COPY,
  referralLevel,
  sorenessLine,
  UNDER_18_MESSAGE,
} from './safety.ts'
export { toCoachingRecord } from './record.ts'
export { largestStratum, sameStratum, sessionSetupKey, stratumId, stratumWords } from './strata.ts'
export { metricsVerdict, verdictOutput, verdictSentence, VERDICT_MINIMUM } from './verdict.ts'
export type * from './types.ts'
