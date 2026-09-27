/**
 * Data layer public API. Screens import from here (or `data/hooks`), never from `db.ts` directly.
 * See src/ui/README.md for conventions.
 */
export type * from './domain.ts'
export type * from './records.ts'
export { DEFAULT_SETTINGS } from './records.ts'
export { CURRENT_DB_VERSION, DB_NAME, fpsClassFor } from './db.ts'

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
export { getKeyFrame, getKeyFrameFor, listKeyFramesForServe, putKeyFrames } from './repos/keyFrames.ts'
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
  listExperiments,
  listMatchLogs,
  listPracticeByExperiment,
  logPractice,
  putDecision,
  putStats,
  saveMatchLog,
} from './repos/coaching.ts'
export { deleteAllVideos, deleteEverything, deleteMatchLog, deleteServe, deleteSession, deleteVideo } from './deletion.ts'
export { applyDeleteAfterAnalysis, EVENTS_KEEP_DAYS, sweepRetention } from './retention.ts'
export { buildExportCSV, buildExportJSON, csvField, toCsv } from './export.ts'
export { DEMO_SEED_VERSION, hasDemoData, loadDemoData, removeDemoData } from './demo.ts'
export { DEMO_FIXTURES, DEMO_SESSION_IDS, FIXTURE_NOTE, wilson } from './fixtures.ts'
export { useSettingsStore } from './stores/settings.ts'
export { useUiStore, type ViewFilter } from './stores/ui.ts'
export { showToast, useToastStore } from './stores/toast.ts'
