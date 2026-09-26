import type { Vec3 } from './math/vec.ts'

/**
 * ITF court geometry in court coordinates: origin at the centre mark on the server's baseline
 * (outer edge of the baseline), +x toward the net, +y to the server's left when facing the net, +z up.
 * Lines lie inside the court dimensions (outer edges are on the measured boundary).
 */
export const COURT = {
  lengthM: 23.77,
  netXM: 23.77 / 2,
  singlesHalfWidthM: 8.23 / 2,
  doublesHalfWidthM: 10.97 / 2,
  serviceLineFromNetM: 6.4,
  netHeightCentreM: 0.914,
  netHeightPostM: 1.07,
  netPostYM: 10.97 / 2 + 0.914,
  centreMarkLengthM: 0.1,
  baselineWidthM: 0.08,
  lineWidthM: 0.05,
} as const

export const FAR_SERVICE_LINE_X = COURT.netXM + COURT.serviceLineFromNetM
export const NEAR_SERVICE_LINE_X = COURT.netXM - COURT.serviceLineFromNetM

export interface LineRect {
  /** Axis-aligned painted rectangle on z=0: x0..x1, y0..y1 (metres). */
  x0: number
  x1: number
  y0: number
  y1: number
}

/** All painted lines as rectangles on the court surface. */
export function courtLines(): LineRect[] {
  const L = COURT.lengthM
  const sw = COURT.singlesHalfWidthM
  const dw = COURT.doublesHalfWidthM
  const w = COURT.lineWidthM
  const bw = COURT.baselineWidthM
  const lines: LineRect[] = [
    { x0: 0, x1: bw, y0: -dw, y1: dw }, // near baseline
    { x0: L - bw, x1: L, y0: -dw, y1: dw }, // far baseline
    { x0: 0, x1: L, y0: -dw, y1: -dw + w }, // doubles sidelines
    { x0: 0, x1: L, y0: dw - w, y1: dw },
    { x0: 0, x1: L, y0: -sw, y1: -sw + w }, // singles sidelines
    { x0: 0, x1: L, y0: sw - w, y1: sw },
    { x0: NEAR_SERVICE_LINE_X - w / 2, x1: NEAR_SERVICE_LINE_X + w / 2, y0: -sw, y1: sw },
    { x0: FAR_SERVICE_LINE_X - w / 2, x1: FAR_SERVICE_LINE_X + w / 2, y0: -sw, y1: sw },
    { x0: NEAR_SERVICE_LINE_X, x1: FAR_SERVICE_LINE_X, y0: -w / 2, y1: w / 2 }, // centre service line
    { x0: bw, x1: bw + COURT.centreMarkLengthM, y0: -w / 2, y1: w / 2 }, // near centre mark
    { x0: L - bw - COURT.centreMarkLengthM, x1: L - bw, y0: -w / 2, y1: w / 2 },
  ]
  return lines
}

export type CourtSide = 'deuce' | 'ad'
export type ServeDirection = 'T' | 'body' | 'wide'

/**
 * Nominal aim point on the far side for a right-hander-frame serve.
 * Deuce server stands at y<0 and serves cross-court into the box at y in [0, singlesHalfWidth].
 */
export function serveTarget(side: CourtSide, direction: ServeDirection): Vec3 {
  const depthX = { T: FAR_SERVICE_LINE_X - 0.6, body: FAR_SERVICE_LINE_X - 0.9, wide: FAR_SERVICE_LINE_X - 1.2 }[direction]
  const absY = { T: 0.35, body: 2.0, wide: COURT.singlesHalfWidthM - 0.45 }[direction]
  const y = side === 'deuce' ? absY : -absY
  return [depthX, y, 0]
}

/** True when a bounce point (x,y) is inside the correct service box (lines count as in). */
export function isInServiceBox(side: CourtSide, x: number, y: number): boolean {
  if (x < COURT.netXM || x > FAR_SERVICE_LINE_X + COURT.lineWidthM / 2) return false
  const sw = COURT.singlesHalfWidthM
  return side === 'deuce' ? y >= -COURT.lineWidthM / 2 && y <= sw : y <= COURT.lineWidthM / 2 && y >= -sw
}

/** Net top height (m) at lateral position y: straight-line sag from post to centre strap. */
export function netTopHeightM(y: number): number {
  const t = Math.min(1, Math.abs(y) / COURT.netPostYM)
  return COURT.netHeightCentreM + (COURT.netHeightPostM - COURT.netHeightCentreM) * t
}
