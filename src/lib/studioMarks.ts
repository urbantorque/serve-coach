/**
 * What a studio mark reads (E1.2): a line's lean from upright, and an angle's
 * opening at its vertex, measured on the picture.
 *
 * On the picture, not in 3D. A side-on camera sees a knee or an arm close to
 * its true angle, and any other camera does not; the read-out says "on the
 * picture" so nobody reads it as the engine's 3D measurement, which the report
 * already gives where it can stand behind it.
 */
import type { StudioMark } from './storage/db'

type Pt = { x: number; y: number }

/** Points in pixels of a picture `aspect` wide for each unit tall. */
const px = (p: Pt, aspect: number): Pt => ({ x: p.x * aspect, y: p.y })

/** Degrees, rounded, of a mark: a line from upright, an angle at its vertex. */
export function markDegrees(mark: StudioMark, aspect: number): number {
  const [a, b, c] = mark.pts.map((p) => px(p, aspect))
  if (mark.kind === 'line') {
    // From upright: 0 is plumb, 90 flat, whichever way the line was drawn.
    const lean = (Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 180) / Math.PI
    return Math.round(lean)
  }
  const u = { x: a.x - b.x, y: a.y - b.y }
  const v = { x: c.x - b.x, y: c.y - b.y }
  const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1)
  return Math.round((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI)
}

/** The read-out beside a mark. */
export function markLabel(mark: StudioMark, aspect: number): string {
  const d = markDegrees(mark, aspect)
  return mark.kind === 'line' ? `${d}° from upright` : `${d}°`
}

/** Where a read-out sits: the line's middle, or the angle's vertex. */
export const labelAt = (mark: StudioMark): Pt => (mark.kind === 'line' ? { x: (mark.pts[0].x + mark.pts[1].x) / 2, y: (mark.pts[0].y + mark.pts[1].y) / 2 } : mark.pts[1])
