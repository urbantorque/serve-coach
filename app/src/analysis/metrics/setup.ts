/**
 * The set-up key: which physical set-up a session was filmed from (METRICS §1.1 set-up class,
 * §1.6 strata, §4.4 matching). Distance-dependent biases differ by set-up (a 0.3 m toss offset reads
 * 11.6 cm high at 6 m but 8.6 cm at 8 m; sideways scatter adds 3.7 vs 2.8 cm of apparent spread), so
 * absolute spatial metrics, spreads and pose-derived metrics are only compared within one set-up.
 *
 *   key = `${orientation}|${distanceClass}|${servingSpot}`   e.g. "portrait|standard|singles"
 *
 * - orientation: the displayed orientation (portrait is the D1 default).
 * - distance class from the camera-to-server distance D = f_HU · H_m / H_HU (±6% 1σ):
 *   close < 6.75 m (closer than the D1 default; heights under 6 m are experimental anyway),
 *   standard 6.75 to 8.25 m (D1 portrait, 7 to 8 m), far ≥ 8.25 m (the side fence, 8.5 to 9.5 m).
 *   The edges sit about 1.7σ from 7.5 m, so a D1 session does not flip class from noise.
 * - serving spot: singles or doubles spot on the baseline (moves the server about 1.4 m along the
 *   baseline, so D changes); "unknown" when not asked.
 *
 * Shared by the engine (writes StratumKey.setup and SessionStats.setupKey), coaching (baseline and
 * re-test grouping) and the UI (trends, usual ranges, "Building your baseline"). Pure.
 */
import type { CameraOrientation, ServingSpot } from '../types.ts'

export type DistanceClass = 'close' | 'standard' | 'far'

export const DISTANCE_CLASS_EDGES_M = { standardFrom: 6.75, farFrom: 8.25 } as const

export function distanceClassOf(distanceM: number | undefined): DistanceClass | 'unknown' {
  if (distanceM === undefined || !Number.isFinite(distanceM) || distanceM <= 0) return 'unknown'
  if (distanceM < DISTANCE_CLASS_EDGES_M.standardFrom) return 'close'
  if (distanceM < DISTANCE_CLASS_EDGES_M.farFrom) return 'standard'
  return 'far'
}

export interface SetupFacts {
  orientation?: CameraOrientation
  distanceM?: number
  servingSpot?: ServingSpot
}

export function setupKeyOf(f: SetupFacts): string {
  return [f.orientation ?? 'unknown', distanceClassOf(f.distanceM), f.servingSpot ?? 'unknown'].join('|')
}

export interface ParsedSetup {
  orientation: CameraOrientation | 'unknown'
  distanceClass: DistanceClass | 'unknown'
  servingSpot: ServingSpot | 'unknown'
}

export function parseSetupKey(key: string | undefined): ParsedSetup | null {
  if (!key) return null
  const [orientation = 'unknown', distanceClass = 'unknown', servingSpot = 'unknown'] = key.split('|')
  return {
    orientation: orientation as ParsedSetup['orientation'],
    distanceClass: distanceClass as ParsedSetup['distanceClass'],
    servingSpot: servingSpot as ParsedSetup['servingSpot'],
  }
}

/**
 * Same set-up (METRICS §4.4). A missing key (a session analysed before set-up keys existed) matches
 * anything, so older data keeps its comparisons; within a key, each part must be equal when both
 * sides know it ("unknown" serving spot matches either spot: it was simply not asked).
 */
export function sameSetup(a: string | undefined, b: string | undefined): boolean {
  const pa = parseSetupKey(a)
  const pb = parseSetupKey(b)
  if (!pa || !pb) return true
  const eq = (x: string, y: string) => x === 'unknown' || y === 'unknown' || x === y
  return pa.orientation === pb.orientation && pa.distanceClass === pb.distanceClass && eq(pa.servingSpot, pb.servingSpot)
}

const DISTANCE_WORDS: Record<DistanceClass | 'unknown', string> = {
  close: 'closer than 6.75 m',
  standard: 'about 7 to 8 m away',
  far: 'at the fence, 8.25 m or more',
  unknown: 'distance unknown',
}

/** "Upright phone, about 7 to 8 m away, singles spot" (the glossary's "same set-up"). */
export function setupWords(key: string | undefined): string {
  const p = parseSetupKey(key)
  if (!p) return 'Same set-up'
  const parts = [p.orientation === 'portrait' ? 'Upright phone' : p.orientation === 'landscape' ? 'Sideways phone' : 'Phone', DISTANCE_WORDS[p.distanceClass]]
  if (p.servingSpot !== 'unknown') parts.push(`${p.servingSpot} spot`)
  return parts.join(', ')
}

/**
 * Camera distance from a stored analysis summary (older sessions): D = f_HU · H_m / H_HU with the
 * long-side field of view mapped to the displayed frame (METRICS §1.1).
 */
export function distanceFromSummary(s: { fovDeg?: number; width?: number; height?: number; bodyHeightHU?: number; heightM?: number }): number | undefined {
  const { fovDeg, width, height, bodyHeightHU, heightM } = s
  if (!fovDeg || !width || !height || !bodyHeightHU || !heightM || bodyHeightHU <= 0) return undefined
  const fLong = 1 / (2 * Math.tan((fovDeg * Math.PI) / 360))
  const fHU = fLong * (Math.max(width, height) / height)
  return (fHU * heightM) / bodyHeightHU
}
