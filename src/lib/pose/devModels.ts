/**
 * A bench's choice of pose model, in the dev server only (A1.1).
 *
 * The benches ask whether a bigger model reads a serve better: MediaPipe's
 * heavy landmarker against the full one the app ships, RTMPose-m against -s.
 * Both bigger models live in `bench-data/models/`, which never ships. A bench
 * page sets `window.__serveCoachDevModels` before the first read, and the two
 * engines fetch that file in place of their own.
 *
 * `import.meta.env.DEV` is false in a production build, so the check folds
 * away and the app always fetches its own models.
 */
export type DevModel = 'pose' | 'refine'

export function devModelUrl(which: DevModel): string | undefined {
  if (!import.meta.env?.DEV) return undefined
  const chosen = (globalThis as { __serveCoachDevModels?: Partial<Record<DevModel, string>> }).__serveCoachDevModels
  return chosen?.[which]
}
