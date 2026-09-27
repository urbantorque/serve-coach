/**
 * Placement of value labels on video (DESIGN §2.7, §8.11: "placed at the end of the line away from the
 * player's body"). Pure functions, unit-tested. Labels keep their preferred side when they can, but never
 * sit on a ruler tick, a tick's graduation text, a marker ring or another label: the painted scene is
 * turned into obstacle boxes, and each label takes the first candidate position that is clear.
 */
import type { BoxPoint, Size } from './geometry.ts'
import type { NPoint, Prim } from './overlayScene.ts'

/** An axis-aligned box in video-box pixels. */
export interface BoxRect {
  x: number
  y: number
  w: number
  h: number
}

export function overlapArea(a: BoxRect, b: BoxRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Approximate width of the 11 px semibold ruler graduation text ("2×", "1.5×"). */
const TEXT_CHAR_PX = 7
const TEXT_HEIGHT_PX = 16

/**
 * Boxes a label must not cover: ruler and landing ticks, ruler graduation text and marker rings
 * (apex, contact point), in box pixels. Lines and trails are not obstacles: a pill may cross a line.
 */
export function labelObstacles(prims: readonly Prim[], toBox: (p: NPoint) => BoxPoint): BoxRect[] {
  const out: BoxRect[] = []
  for (const prim of prims) {
    if (prim.kind === 'tick') {
      const p = toBox(prim.at)
      const half = prim.lengthPx / 2 + 2
      const thick = prim.width / 2 + 3
      out.push(prim.orient === 'h' ? { x: p.x - half, y: p.y - thick, w: half * 2, h: thick * 2 } : { x: p.x - thick, y: p.y - half, w: thick * 2, h: half * 2 })
    } else if (prim.kind === 'text') {
      const p = toBox(prim.at)
      const w = prim.text.length * TEXT_CHAR_PX + 4
      // paintScene draws align 'right' text to the right of the anchor (dx px away), 'left' to the left.
      const x = prim.align === 'right' ? p.x + prim.dx - 2 : p.x - prim.dx - w + 2
      out.push({ x, y: p.y - TEXT_HEIGHT_PX / 2, w, h: TEXT_HEIGHT_PX })
    } else if (prim.kind === 'dot' && prim.ring) {
      const p = toBox(prim.at)
      const r = prim.r + 4
      out.push({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 })
    } else if (prim.kind === 'cross') {
      const p = toBox(prim.at)
      const r = prim.sizePx / 2 + 2
      out.push({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 })
    }
  }
  return out
}

export interface LabelRequest {
  id: string
  /** The measured point in box pixels. */
  anchor: BoxPoint
  w: number
  h: number
  /** Preferred side of the anchor (away from the body). */
  side: 'left' | 'right'
}

export interface PlaceOptions {
  box: Size
  /** Keep labels below the corner pills. */
  insetTop?: number
  obstacles?: readonly BoxRect[]
  /** Gap between the anchor and the pill. */
  gap?: number
  /** Distance kept from the box edges. */
  margin?: number
}

/**
 * Positions (top-left, box pixels) for every label, in request order. Candidates, in order: the
 * preferred side level with the anchor; the other side; either side nudged up or down by half and one
 * pill height; then above and below the anchor. The first candidate that stays inside the box and
 * covers nothing wins; when none is clear, the one covering least (then moved least) is used. Each
 * placed label becomes an obstacle for the next, and no pill covers any label's anchor.
 */
export function placeLabels(requests: readonly LabelRequest[], opts: PlaceOptions): Record<string, BoxPoint> {
  const { box, insetTop = 8, gap = 10, margin = 8 } = opts
  const blocked: BoxRect[] = [...(opts.obstacles ?? [])]
  // Every anchor stays visible (the dot or tick the label describes).
  for (const r of requests) blocked.push({ x: r.anchor.x - 6, y: r.anchor.y - 6, w: 12, h: 12 })
  const top = Math.max(insetTop, margin)
  const out: Record<string, BoxPoint> = {}

  for (const r of requests) {
    const { anchor: a, w, h } = r
    const right = a.x + gap
    const left = a.x - gap - w
    const pref = r.side === 'right' ? right : left
    const other = r.side === 'right' ? left : right
    const cy = a.y - h / 2
    const step1 = h / 2 + gap
    const step2 = h + gap * 1.5
    const raw: BoxPoint[] = [
      { x: pref, y: cy },
      { x: other, y: cy },
      { x: pref, y: cy - step1 },
      { x: pref, y: cy + step1 },
      { x: other, y: cy - step1 },
      { x: other, y: cy + step1 },
      { x: pref, y: cy - step2 },
      { x: pref, y: cy + step2 },
      { x: other, y: cy - step2 },
      { x: other, y: cy + step2 },
      { x: a.x - w / 2, y: a.y - gap - h },
      { x: a.x - w / 2, y: a.y + gap },
    ]
    let best: { p: BoxPoint; cover: number; moved: number } | null = null
    for (const c of raw) {
      const p = {
        x: Math.min(Math.max(margin, c.x), Math.max(margin, box.width - w - margin)),
        y: Math.min(Math.max(top, c.y), Math.max(top, box.height - h - margin)),
      }
      const moved = Math.abs(p.x - c.x) + Math.abs(p.y - c.y)
      const rect = { x: p.x, y: p.y, w, h }
      const cover = blocked.reduce((s, b) => s + overlapArea(rect, b), 0)
      // Kept inside the box by a few pixels still reads as beside the anchor.
      if (cover === 0 && moved <= Math.max(1, h / 2 - 2)) {
        best = { p, cover, moved }
        break
      }
      if (!best || cover < best.cover || (cover === best.cover && moved < best.moved)) best = { p, cover, moved }
    }
    const p = best!.p
    out[r.id] = p
    blocked.push({ x: p.x, y: p.y, w, h })
  }
  return out
}
