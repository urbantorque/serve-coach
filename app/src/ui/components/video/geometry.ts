/**
 * Video box geometry (DESIGN §8.11, §10.7, §10.8): how a clip is drawn into its box (fit, zoom to the
 * player, the fixed Tagging crop) and how normalised clip coordinates map to box pixels. Aspect ratio is
 * always preserved. Pure functions, unit-tested.
 */

export interface Size {
  width: number
  height: number
}

/** Clip pixel = normalised * clip size; box pixel = offset + clip pixel * scale. */
export interface ViewTransform {
  scale: number
  ox: number
  oy: number
}

export interface BoxPoint {
  x: number
  y: number
}

/** The whole frame, letterboxed or pillarboxed and centred. */
export function fitTransform(clip: Size, box: Size): ViewTransform {
  const scale = Math.min(box.width / clip.width, box.height / clip.height)
  return { scale, ox: (box.width - clip.width * scale) / 2, oy: (box.height - clip.height * scale) / 2 }
}

/** Vertical band of the clip to fill the box height, centred on a column (all normalised). */
export interface ClipRegion {
  top: number
  bottom: number
  centerX: number
}

/**
 * Fills the box height with `region` (never smaller than fit), centred on the region's column plus a
 * horizontal `pan` in box pixels. The clip always covers the box horizontally when it is wide enough,
 * so panning never reveals an empty edge.
 */
export function regionTransform(clip: Size, box: Size, region: ClipRegion, pan = 0): ViewTransform {
  const fit = fitTransform(clip, box)
  const span = Math.max(1e-3, region.bottom - region.top)
  const scale = Math.max(fit.scale, box.height / (span * clip.height))
  const drawnW = clip.width * scale
  const drawnH = clip.height * scale
  let ox = box.width / 2 - region.centerX * drawnW + pan
  ox = drawnW >= box.width ? Math.min(0, Math.max(box.width - drawnW, ox)) : (box.width - drawnW) / 2
  let oy = -region.top * drawnH
  oy = drawnH >= box.height ? Math.min(0, Math.max(box.height - drawnH, oy)) : (box.height - drawnH) / 2
  return { scale, ox, oy }
}

/** Largest pan (box px) either side of centre before the clip edge would show. */
export function panLimits(clip: Size, box: Size, region: ClipRegion): { min: number; max: number } {
  const t = regionTransform(clip, box, region, 0)
  const drawnW = clip.width * t.scale
  if (drawnW <= box.width) return { min: 0, max: 0 }
  const centred = box.width / 2 - region.centerX * drawnW
  return { min: box.width - drawnW - centred, max: -centred }
}

export function toBox(t: ViewTransform, clip: Size, nx: number, ny: number): BoxPoint {
  return { x: t.ox + nx * clip.width * t.scale, y: t.oy + ny * clip.height * t.scale }
}

/** The drawn clip rectangle inside the box. */
export function drawnRect(t: ViewTransform, clip: Size): { left: number; top: number; width: number; height: number } {
  return { left: t.ox, top: t.oy, width: clip.width * t.scale, height: clip.height * t.scale }
}

/**
 * The player region for "Zoom to you" and the Tagging crop (DESIGN §8.11, §10.8): from 0.2 m below the
 * feet to 0.3 m above the highest toss peak of the session, centred on the player's column. Heights
 * convert with the player's standing height in frame (`bodyHeightNorm`, normalised y) and height in
 * metres. Without a peak, 2.2 standing heights above the floor stands in for it.
 */
export function playerRegion(opts: {
  groundY: number
  bodyHeightNorm: number
  heightM: number
  columnX: number
  peakY?: number | null
}): ClipRegion {
  const perM = opts.bodyHeightNorm / Math.max(0.5, opts.heightM)
  const peak = opts.peakY ?? opts.groundY - 2.2 * opts.bodyHeightNorm
  const top = Math.max(0, Math.min(peak, opts.groundY - opts.bodyHeightNorm) - 0.3 * perM)
  const bottom = Math.min(1, opts.groundY + 0.2 * perM)
  return { top, bottom: Math.max(bottom, top + 0.05), centerX: opts.columnX }
}

/**
 * Height ruler ticks in multiples of the player's standing height, above the floor (normalised y).
 * Only ticks inside the frame are returned.
 */
export function rulerTicks(groundY: number, bodyHeightNorm: number, multiples: readonly number[] = [0.5, 1, 1.5, 2]): { k: number; y: number }[] {
  return multiples.map((k) => ({ k, y: groundY - k * bodyHeightNorm })).filter((t) => t.y >= 0 && t.y <= 1)
}

/** Label for a ruler tick: "1×", "1.5×" (a multiple of the player's height, not a metric value). */
export function rulerLabel(k: number): string {
  return `${Number.isInteger(k) ? k : k.toFixed(1)}×`
}

/**
 * Ghost mapping (DESIGN §8.12): the comparison serve's pose, scaled by standing body height in pixels
 * and anchored at the start toe, expressed in the current clip's normalised coordinates.
 */
export interface GhostAnchor {
  toe: { x: number; y: number }
  /** Standing height as a fraction of the frame height. */
  bodyHeightNorm: number
  clip: Size
}

export function ghostMapper(current: GhostAnchor, other: GhostAnchor): (p: { x: number; y: number }) => { x: number; y: number } {
  const k = (current.bodyHeightNorm * current.clip.height) / (other.bodyHeightNorm * other.clip.height)
  return (p) => {
    const dx = (p.x - other.toe.x) * other.clip.width * k
    const dy = (p.y - other.toe.y) * other.clip.height * k
    return { x: current.toe.x + dx / current.clip.width, y: current.toe.y + dy / current.clip.height }
  }
}

/** Keeps a label box inside the video box (8 px margin). */
export function clampLabel(x: number, y: number, w: number, h: number, box: Size, margin = 8): BoxPoint {
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, box.width - w - margin)),
    y: Math.min(Math.max(margin, y), Math.max(margin, box.height - h - margin)),
  }
}
