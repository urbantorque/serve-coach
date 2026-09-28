/**
 * Hint copy for heights when the phone's tilt is unknown (reason codes PITCH_UNKNOWN / TILT_UNKNOWN,
 * the capture check `cq.camera-level`). The engine's stored hint, "Record in the app with motion
 * access on, so we can level the picture.", predates the import mount question (METRICS §1.1 item
 * 3a): it said nothing about imports and named a browser permission instead of what the app does.
 * Screens pass stored hints through `tiltHint`, so sessions analysed before this change read the
 * same as new ones. Since engine 1.1.0 the engine and metrics.json emit TILT_HINT's wording
 * themselves (catalogue.ts PITCH_UNKNOWN / TILT_UNKNOWN, quality/checks.ts `cq.camera-level`).
 */

/** What a player can do next time: record in the app (it reads the tilt), or answer the mount question on import. */
export const TILT_HINT =
  'Record in the app, which reads the phone\'s tilt once you allow it, or answer “How was the phone mounted?” when you import. A level mount can keep contact height as an estimate.'

/** The import screen's own line under the mount question, for a side view answered "Tilted, or not sure". */
export const IMPORT_MOUNT_HINT = 'Next time, a fence clip or tripod checked with a level can keep contact height as an estimate, and recording in the app reads the tilt for you.'

const STALE = /record in the app with motion access on/i

/** The stored hint, with the stale "motion access" wording replaced by the current tilt hint. */
export function tiltHint<T extends string | null | undefined>(hint: T): T | string {
  if (!hint) return hint
  return STALE.test(hint) ? TILT_HINT : hint
}
