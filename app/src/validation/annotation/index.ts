/**
 * "Check this serve": hand-marked ground truth on real clips, the per-serve "App vs you" comparison,
 * the `serve-coach-validation@1` export and the pooled statistics. See README.md in this folder and
 * docs/VALIDATION_PROTOCOL.md.
 */
export * from './types.ts'
export * from './marks.ts'
export * from './agreement.ts'
export * from './export.ts'
export { deleteCheck, gatherChecks, getCheck, listChecks, listChecksForServe, markRevealed, saveCheck, type CheckRecords } from './store.ts'
