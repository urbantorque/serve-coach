/**
 * Person localisation for ROI cropping: find where the people are in a frame when the
 * server is too small for a full-frame detection.
 *
 * Coarse to fine: level 0 is the full frame, level 1 splits it into squares of the short
 * side (3 overlapping squares for 9:16), deeper levels use smaller squares. Levels up to
 * `minLevel` always run, so a large bystander in the full frame cannot hide a small server;
 * deeper levels run only while nobody has been verified.
 *
 * Every candidate is verified by running the detector again on the ROI crop it implies.
 * A tiny full-frame detection can be badly wrong (in the feasibility renders one was 1.5
 * body heights off); a real person is found again, larger and more accurately, in the crop.
 * The verified pose (not the coarse one) is returned.
 *
 * The detector is injected, so the logic is unit-tested in Node with a fake detector.
 */
import type { Landmark } from '../types.ts'
import { meanCoreVisibility } from './landmarks.ts'
import { type FrameSize, type PixelRect, type RoiOptions, DEFAULT_ROI_OPTIONS, bodyExtentPx, cropCandidateToFrame, localisationTiles, squareCropInFrame, targetSquare } from './roi.ts'
import { type PoseCandidate, bodyBoxHU, iou } from './tracking.ts'

/** Runs the pose model on one rectangle of the current frame; landmarks normalised to that rectangle. */
export type CropDetector = (rect: PixelRect) => Promise<PoseCandidate[]>

export interface LocaliseOptions {
  /** Levels 0..minLevel always run. */
  minLevel: number
  /** Deepest level tried while nobody is verified. */
  maxLevel: number
  /** Minimum pose score (mean core-joint visibility) for a candidate. */
  minScore: number
  /** At most this many candidates (best score first) are verified per level. */
  maxVerify: number
  /** Candidates whose arm-free boxes overlap this much (IoU) are the same person. */
  sameIoU: number
  /** Crop geometry for the verification run (same as the per-frame ROI). */
  roi: RoiOptions
}

export const DEFAULT_LOCALISE_OPTIONS: LocaliseOptions = {
  minLevel: 1,
  maxLevel: 2,
  minScore: 0.5,
  maxVerify: 3,
  sameIoU: 0.3,
  roi: DEFAULT_ROI_OPTIONS,
}

export interface LocaliseResult {
  /** Verified people in full-frame normalised coordinates, from their ROI runs. */
  people: PoseCandidate[]
  /** Deepest level that ran. */
  levelReached: number
  detectorRuns: number
  /** Every rectangle run, in order: tiles, then verification crops. */
  rects: PixelRect[]
}

interface Scored {
  candidate: PoseCandidate
  score: number
}

function boxOf(landmarks: readonly Landmark[], frame: FrameSize) {
  return bodyBoxHU(landmarks, frame.width / frame.height)
}

/** Keeps the best-scoring candidate of every group of overlapping ones. */
export function dedupePeople(people: readonly Scored[], frame: FrameSize, sameIoU: number): Scored[] {
  const kept: Scored[] = []
  for (const p of [...people].sort((a, b) => b.score - a.score)) {
    const box = boxOf(p.candidate.landmarks, frame)
    if (!box) continue
    const duplicate = kept.some((k) => {
      const other = boxOf(k.candidate.landmarks, frame)
      return other !== null && iou(box, other) >= sameIoU
    })
    if (!duplicate) kept.push(p)
  }
  return kept
}

/** The verification crop for a candidate: the per-frame ROI its pose implies. */
export function verificationCrop(landmarks: readonly Landmark[], frame: FrameSize, roi: RoiOptions): PixelRect | null {
  const extent = bodyExtentPx(landmarks, frame, roi.minVisibility)
  if (!extent) return null
  const square = targetSquare(extent, extent.staturePx, frame, roi)
  return squareCropInFrame(square.cx, square.cy, square.side, frame)
}

export async function localisePeople(
  frame: FrameSize,
  detect: CropDetector,
  options: Partial<LocaliseOptions> = {},
): Promise<LocaliseResult> {
  const o = { ...DEFAULT_LOCALISE_OPTIONS, ...options }
  const rects: PixelRect[] = []
  let found: Scored[] = []
  let levelReached = -1

  const run = async (rect: PixelRect): Promise<Scored[]> => {
    rects.push(rect)
    const candidates = await detect(rect)
    return candidates
      .map((c) => cropCandidateToFrame(c, rect, frame))
      .map((candidate) => ({ candidate, score: meanCoreVisibility(candidate.landmarks) }))
      .filter((s) => s.score >= o.minScore)
  }

  for (let level = 0; level <= o.maxLevel; level++) {
    if (level > o.minLevel && found.length > 0) break
    const tiles = localisationTiles(frame, level)
    if (tiles.length === 0) continue
    levelReached = level
    const perTile = await Promise.all(tiles.map(run))
    const coarse = dedupePeople(perTile.flat(), frame, o.sameIoU).filter(
      (c) => !found.some((f) => overlaps(f.candidate.landmarks, c.candidate.landmarks, frame, o.sameIoU)),
    )
    for (const candidate of coarse.slice(0, o.maxVerify)) {
      const crop = verificationCrop(candidate.candidate.landmarks, frame, o.roi)
      if (!crop) continue
      const refined = (await run(crop)).filter((r) => overlaps(r.candidate.landmarks, candidate.candidate.landmarks, frame, o.sameIoU))
      const best = refined.sort((a, b) => b.score - a.score)[0]
      if (best && !found.some((f) => overlaps(f.candidate.landmarks, best.candidate.landmarks, frame, o.sameIoU))) found.push(best)
    }
  }
  found = dedupePeople(found, frame, o.sameIoU)
  return { people: found.map((f) => f.candidate), levelReached, detectorRuns: rects.length, rects }
}

function overlaps(a: readonly Landmark[], b: readonly Landmark[], frame: FrameSize, minIoU: number): boolean {
  const boxA = boxOf(a, frame)
  const boxB = boxOf(b, frame)
  return boxA !== null && boxB !== null && iou(boxA, boxB) >= minIoU
}
