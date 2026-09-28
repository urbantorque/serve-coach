/**
 * Data layer public API. Screens import from here (or `data/hooks`), never from `db.ts` directly.
 * See src/ui/README.md for conventions.
 */
export type * from './domain.ts'
export type * from './records.ts'
export { DEFAULT_SETTINGS } from './records.ts'
export { blockGroup, CURRENT_DB_VERSION, DB_NAME, fpsClassFor } from './db.ts'

export { computeInSegment, getProfile, saveProfile } from './repos/profile.ts'
export { getAllSettings, getSetting, setSetting } from './repos/settings.ts'
export {
  analysedDaysInMonth,
  createSession,
  getSession,
  listByMode,
  listByVisit,
  listSessions,
  markStatus,
  setAnalysis,
  updateSession,
} from './repos/sessions.ts'
export { getServe, getTrack, listServesBySession, putServesWithTracksAndFrames, setServeIncluded } from './repos/serves.ts'
export { addVideo, getVideo, getVideoBlob, listVideosBySession, retainUntilFor, setVideoRetention } from './repos/videos.ts'
export { getKeyFrame, getKeyFrameFor, getSessionThumb, listKeyFramesForServe, putKeyFrames } from './repos/keyFrames.ts'
export { getJob, listJobsForSession, putJob, updateJob } from './repos/jobs.ts'
export { bulkSetTags, deleteTag, getTally, listTags, setTag, setTally } from './repos/tags.ts'
export {
  attachRetest,
  completeExperiment,
  createExperiment,
  getActiveExperiment,
  getExperiment,
  getStats,
  lastLogsForDrill,
  latestDecision,
  latestPainLog,
  listExperiments,
  listMatchLogs,
  listPracticeByExperiment,
  listPracticeSince,
  logPractice,
  practiceLogDateRange,
  putDecision,
  putStats,
  saveMatchLog,
} from './repos/coaching.ts'
export {
  DELETED_SERVE_NOTE,
  deletedServesLine,
  deleteAllVideos,
  deleteEverything,
  deleteMatchLog,
  deleteServe,
  deleteSession,
  deleteVideo,
  restoreServe,
  statsAfterServeDelete,
  sweepDeletedSessionRows,
  wasSessionDeleted,
  type DeletedServeSnapshot,
} from './deletion.ts'
export { applyDeleteAfterAnalysis, EVENTS_KEEP_DAYS, sweepRetention } from './retention.ts'
export { buildExportCSV, buildExportJSON, csvField, toCsv } from './export.ts'
export { DEMO_SEED_VERSION, hasDemoData, loadDemoData, removeDemoData, SAMPLE_SEED_VERSION, sampleSessionId } from './demo.ts'
export {
  fetchSampleSeed,
  insertSampleSeed,
  isSampleSeed,
  SAMPLE_FEATURED_SESSION_ID,
  SAMPLE_PROFILE,
  SAMPLE_SESSION_IDS,
  type SampleSeed,
} from './sample.ts'
export { DEMO_FIXTURES, DEMO_SESSION_IDS, FIXTURE_NOTE, wilson } from './fixtures.ts'
// Platform additions: local beta events, the beta report, and in-app recording chunks.
export {
  clearEvents,
  daysBucket,
  droppedEventCount,
  EVENT_NAMES,
  EVENT_SCHEMAS,
  hasEvent,
  lengthBucket,
  listEvents,
  minutesBucket,
  purgeUnknownEvents,
  recordEvent,
  servesBucket,
  VERDICT_IDS as VERDICT_EVENT_IDS,
  type EventName,
  type EventProps,
} from './repos/events.ts'
export {
  ACTIVATION_DAYS,
  BETA_DEFINITIONS,
  betaInstallRef,
  buildBetaReport,
  computeGates,
  LOOP_DAYS,
  resetBetaInstallRef,
  type BetaReport,
  type GateSummary,
} from './betaReport.ts'
export {
  appendChunk,
  discardRecording,
  getRecordingHeader,
  listRecordings,
  readRecording,
  RECORDING_KEEP_DAYS,
  startRecordingRows,
  sweepRecordings,
  updateRecordingHeader,
  type RecordingSummary,
} from './repos/recordings.ts'
export { useSettingsStore } from './stores/settings.ts'
export { useUiStore, type ViewFilter } from './stores/ui.ts'
export { showToast, useToastStore } from './stores/toast.ts'
