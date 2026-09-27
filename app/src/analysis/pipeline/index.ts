/**
 * Production analysis pipeline (engine-pipeline). See orchestrator.ts for the stages and
 * README.md in this folder for the design, budgets and measured timings.
 *
 *   runAnalysis(file, { sessionId, profile, view, capture?, fpsOverride?, signal?, onProgress? })
 *     -> Promise<RunAnalysisResult>   (rejects with AnalysisError: code + player-facing message)
 */
export { runAnalysis, defaultDeps, PIPELINE_VERSION, SPARSE_COARSE_HZ, SPARSE_HZ, type PipelineDeps } from './orchestrator.ts'
export { AnalysisError, PLAYER_MESSAGES, isAbort, toAnalysisError } from './errors.ts'
export { ProgressReporter, labelFor, stepSpans } from './progress.ts'
export type {
  PipelineEvent,
  PipelineProgress,
  PipelineStep,
  PipelineTimings,
  PlayerFacingError,
  RunAnalysisOptions,
  RunAnalysisProfile,
  RunAnalysisResult,
} from './types.ts'
