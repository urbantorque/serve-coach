/**
 * Display rotation from the QuickTime/ISO track matrix, and coordinate transforms
 * between the coded frame (what decoders output) and the displayed frame.
 *
 * Matrix layout (tkhd): [a b u; c d v; x y w] with points transformed as
 * [x' y' 1] = [x y 1] * M, so x' = a*x + c*y + tx and y' = b*x + d*y + ty.
 * a, b, c, d are 16.16 fixed point; only their ratios matter here.
 * iPhone portrait video stores a = 0, b = 1, c = -1, d = 0: rotate 90 deg clockwise to display.
 */

export type RotationDeg = 0 | 90 | 180 | 270

export interface MatrixRotation {
  /** Clockwise rotation to apply to the coded image for display. */
  rotationDeg: RotationDeg
  /** True when the matrix also mirrors the image (negative determinant). */
  mirrored: boolean
  /** Angle before snapping to a multiple of 90. */
  rawAngleDeg: number
  /** False when the matrix is not (close to) a multiple of 90 degrees. */
  exact: boolean
}

export function normalizeRotation(deg: number): RotationDeg {
  const snapped = ((Math.round(deg / 90) * 90) % 360 + 360) % 360
  return snapped as RotationDeg
}

export function rotationFromMatrix(matrix: ArrayLike<number> | null | undefined): MatrixRotation {
  if (!matrix || matrix.length < 5) return { rotationDeg: 0, mirrored: false, rawAngleDeg: 0, exact: true }
  // Stored as unsigned 32-bit in some parsers; reinterpret as signed.
  const signed = (v: number) => (v > 0x7fffffff ? v - 0x100000000 : v)
  const a = signed(matrix[0])
  const b = signed(matrix[1])
  const c = signed(matrix[3])
  const d = signed(matrix[4])
  if (a === 0 && b === 0 && c === 0 && d === 0) return { rotationDeg: 0, mirrored: false, rawAngleDeg: 0, exact: true }
  const mirrored = a * d - b * c < 0
  const rawAngleDeg = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  const rotationDeg = normalizeRotation(rawAngleDeg)
  const offBy = Math.abs(((rawAngleDeg - rotationDeg + 540) % 360) - 180)
  return { rotationDeg, mirrored, rawAngleDeg, exact: offBy < 1 }
}

export function displaySize(codedWidth: number, codedHeight: number, rotationDeg: RotationDeg) {
  return rotationDeg === 90 || rotationDeg === 270
    ? { width: codedHeight, height: codedWidth }
    : { width: codedWidth, height: codedHeight }
}

/** Normalised coded-frame point -> normalised display point (both origin top-left). */
export function codedToDisplay(x: number, y: number, rotationDeg: RotationDeg): { x: number; y: number } {
  switch (rotationDeg) {
    case 90:
      return { x: 1 - y, y: x }
    case 180:
      return { x: 1 - x, y: 1 - y }
    case 270:
      return { x: y, y: 1 - x }
    default:
      return { x, y }
  }
}

/** Inverse of codedToDisplay. */
export function displayToCoded(x: number, y: number, rotationDeg: RotationDeg): { x: number; y: number } {
  switch (rotationDeg) {
    case 90:
      return { x: y, y: 1 - x }
    case 180:
      return { x: 1 - x, y: 1 - y }
    case 270:
      return { x: 1 - y, y: x }
    default:
      return { x, y }
  }
}

/**
 * Canvas 2D transform that draws a coded image of size (codedW x codedH) rotated into a
 * display canvas of size (displayW x displayH): ctx.setTransform(...t) then
 * ctx.drawImage(image, 0, 0, drawW, drawH).
 */
export function canvasRotationTransform(rotationDeg: RotationDeg, displayW: number, displayH: number) {
  switch (rotationDeg) {
    case 90:
      // coded (u, v) -> display (displayW - v, u)
      return { matrix: [0, 1, -1, 0, displayW, 0] as const, drawW: displayH, drawH: displayW }
    case 180:
      return { matrix: [-1, 0, 0, -1, displayW, displayH] as const, drawW: displayW, drawH: displayH }
    case 270:
      // coded (u, v) -> display (v, displayH - u)
      return { matrix: [0, -1, 1, 0, 0, displayH] as const, drawW: displayH, drawH: displayW }
    default:
      return { matrix: [1, 0, 0, 1, 0, 0] as const, drawW: displayW, drawH: displayH }
  }
}
