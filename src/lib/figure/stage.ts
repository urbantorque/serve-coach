/**
 * Where a body sits on a canvas, and the picture composed around it: one pose,
 * or a whole swing as a single multiple exposure.
 *
 * Everything here works on `Frame`, so the player's own tracked frames, a stored
 * track and the real model serve all draw the same way.
 */
import { LM, type Side } from '../analysis/geometry'
import { smoothedRacket } from '../analysis/racket'
import type { Frame } from '../analysis/types'
import { gripOf, paintAthlete, paintRibbon, paintTrace, type AthleteOptions, type Material } from './athlete'
import { nearSide, statureOf, type Placed, type Pt, type Shapes } from './shape'

export interface Placement {
  /** Canvas position of a point in the frame's own units. */
  place: (p: { x: number; y: number }) => Pt
  /** The same placement as numbers: `x * scale + ox`, `y * scale + oy`. */
  scale: number
  ox: number
  oy: number
  /** The body's height on this canvas, held for the whole swing. */
  stature: number
  /** The lowest the feet get, on this canvas. */
  floor: number
}

export interface PlaceOptions {
  /** How much of the canvas the body's whole motion may fill, 0 to 1. */
  fill?: number
  /**
   * The body's height as a share of the canvas, in place of `fill`: two swings
   * placed with the same share stand at the same size, whatever each one's
   * arms and racket went on to do.
   */
  height?: number
  /** Where the body's centre sits across the canvas, 0 to 1. */
  across?: number
  /** Where the feet sit down the canvas, 0 to 1. */
  feet?: number
}

const FEET = [LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe]

/** The box the body moves through across these frames, in the frames' units. */
function reach(frames: readonly Frame[]) {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const f of frames) {
    for (const p of f.image) {
      if (p.x < x0) x0 = p.x
      if (p.x > x1) x1 = p.x
      if (p.y < y0) y0 = p.y
      if (p.y > y1) y1 = p.y
    }
  }
  return { x0, x1, y0, y1 }
}

/**
 * Fit a swing to a canvas at one scale, so the figure holds its size and its
 * proportions as it moves. Fitted to the body and not the racket: a racket
 * rising out of the top of the picture is what a photograph does, and fitting
 * to it shrinks the player by a third.
 */
export function placeSwing(frames: readonly Frame[], w: number, h: number, o: PlaceOptions = {}): Placement {
  const { x0, x1, y0, y1 } = reach(frames)
  const fill = o.fill ?? 0.84
  let tall = 0
  if (o.height) for (const f of frames) tall = Math.max(tall, statureOf(f.image))
  const scale = o.height && tall > 0
    ? (h * o.height) / tall
    : Math.min((w * fill) / Math.max(1e-6, x1 - x0), (h * fill) / Math.max(1e-6, y1 - y0))
  const across = o.across ?? 0.5
  const feet = o.feet ?? 0.9
  const ox = w * across - ((x0 + x1) / 2) * scale
  const oy = h * feet - y1 * scale
  const place = (p: { x: number; y: number }): Pt => ({ x: p.x * scale + ox, y: p.y * scale + oy })
  let stature = 0
  let floor = 0
  for (const f of frames) {
    const placed = f.image.map(place)
    stature = Math.max(stature, statureOf(placed))
    for (const k of FEET) floor = Math.max(floor, placed[k].y)
  }
  return { place, scale, ox, oy, stature, floor }
}

export interface PoseOptions extends Pick<AthleteOptions, 'material' | 'work' | 'teach' | 'rim' | 'ground' | 'still'> {
  racket: Side
  /** The swing around this frame, for estimating a tracked racket. */
  swing?: readonly Frame[]
  index?: number
  bodyHeight?: number
}

/** One pose of a swing, on the canvas. */
export function paintPose(ctx: CanvasRenderingContext2D, frame: Frame, at: Placement, o: PoseOptions): Shapes {
  const placed: Placed = frame.image.map(at.place)
  const known = frame.racket
  const tracked =
    !known && o.swing && o.index !== undefined && o.bodyHeight
      ? smoothedRacket(o.swing as Frame[], o.index, o.racket, o.bodyHeight)
      : undefined
  const gear = known ?? tracked
  return paintAthlete(ctx, placed, {
    material: o.material,
    racket: o.racket,
    gear: gear ? { grip: gripOf(placed, o.racket), head: at.place(gear.head) } : undefined,
    stature: at.stature,
    near: nearSide(placed, frame.world?.length ? frame.world : undefined),
    work: o.work,
    teach: o.teach,
    rim: o.rim,
    ground: o.ground,
    floorY: at.floor,
    still: o.still,
  })
}

export interface ExposureOptions {
  racket: Side
  bodyHeight?: number
  /** The first and last frames of the exposure; the last is the solid body. */
  from: number
  to: number
  /** How many earlier bodies are laid down. */
  traces?: number
  material?: Material
  /** Paint these instead of the last frame's body, for a thumbnail. */
  bare?: boolean
  /**
   * How far the swing has got, for a picture still being laid down: the traces
   * and the racket's path up to this frame, and the body moving at it. The
   * shared clip builds the poster this way, so the two cannot drift apart.
   */
  now?: number
  /** The racket's path from `racketPath`, for a swing painted many times over. */
  path?: readonly (Pt | undefined)[]
}

type Gear = Pick<ExposureOptions, 'racket' | 'bodyHeight'>

/** The racket head on one frame, in the frame's units: known on a rig, else estimated. */
const headOf = (frames: readonly Frame[], i: number, o: Gear) =>
  frames[i].racket?.head ?? (o.bodyHeight ? smoothedRacket(frames as Frame[], i, o.racket, o.bodyHeight)?.head : undefined)

/** Where the racket head was on each frame from `from` to `to`, on this canvas. */
export function racketPath(frames: readonly Frame[], at: Placement, o: Gear & Pick<ExposureOptions, 'from' | 'to'>): (Pt | undefined)[] {
  const path: (Pt | undefined)[] = []
  for (let i = o.from; i <= o.to; i++) {
    const head = headOf(frames, i, o)
    path.push(head ? at.place(head) : undefined)
  }
  return path
}

/**
 * A body a share `f` of the way from frame `i` to the next, racket too. Slow
 * motion holds each tracked frame for several of the clip's, and at the ball,
 * where the racket moves furthest between frames, that read as a stutter.
 */
export function frameBetween(frames: readonly Frame[], i: number, f: number, o: Gear): Frame {
  const a = frames[i]
  const b = frames[i + 1]
  if (!b || f <= 0) return a
  const mix = <P extends { x: number; y: number; z?: number }>(p: P, q: P): P => ({
    ...p,
    x: p.x + (q.x - p.x) * f,
    y: p.y + (q.y - p.y) * f,
    ...(p.z !== undefined && q.z !== undefined ? { z: p.z + (q.z - p.z) * f } : {}),
  })
  const ha = headOf(frames, i, o)
  const hb = headOf(frames, i + 1, o)
  const head = ha && hb ? mix(ha, hb) : undefined
  return {
    ...a,
    t: a.t + (b.t - a.t) * f,
    image: a.image.map((p, k) => (b.image[k] ? mix(p, b.image[k]) : p)),
    world: a.world.length === b.world.length ? a.world.map((p, k) => mix(p, b.world[k])) : a.world,
    racket: head ? { grip: a.racket?.grip ?? head, head } : a.racket,
  }
}

/**
 * The whole serve in one picture: the swing laid down as light, the racket
 * head's real path as a ribbon, and the body solid at the end of it.
 *
 * It is the one image in the app that could only be this player's, because
 * every part of it is the path their own body and racket took.
 */
export function paintExposure(ctx: CanvasRenderingContext2D, frames: readonly Frame[], at: Placement, o: ExposureOptions) {
  const span = Math.max(1, o.to - o.from)
  const traces = o.traces ?? 10
  const every = Math.max(1, Math.floor(span / traces))
  // `now` may fall between two frames: the body is drawn partway, and the
  // racket's path runs to where its head is at that instant.
  const end = Math.max(o.from, Math.min(o.to, o.now ?? o.to))
  const now = Math.floor(end)
  const body = end > now ? frameBetween(frames, now, end - now, o) : frames[now]
  for (let i = o.from; i < o.to && i <= now; i += every) {
    const placed = frames[i].image.map(at.place)
    paintTrace(ctx, placed, {
      racket: o.racket,
      stature: at.stature,
      near: nearSide(placed, frames[i].world?.length ? frames[i].world : undefined),
      alpha: 0.05 + 0.1 * ((i - o.from) / span),
    })
  }
  const path = (o.path ?? racketPath(frames, at, o)).slice(0, now - o.from + 1).filter((p): p is Pt => p !== undefined)
  if (body !== frames[now] && body.racket) path.push(at.place(body.racket.head))
  if (path.length > 1) paintRibbon(ctx, path, at.stature * 0.026)
  if (!o.bare) {
    paintPose(ctx, body, at, {
      racket: o.racket,
      swing: frames,
      index: now,
      bodyHeight: o.bodyHeight,
      material: o.material,
      ground: 1,
      // A still gets the soft rim, motion the cheap one (DESIGN.md).
      still: end === o.to,
    })
  }
}

export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

/**
 * The part of the frame to show: the player, large, the way a sports
 * photograph is cropped. In the frame's own units, where height is 1. Fitted to
 * the whole swing, so nothing jumps as it plays. Clamped to the frame, because
 * a crop past the edge would be asking the video for pixels it does not have.
 */
export function cropOn(frames: readonly Frame[], stageAspect: number, frameAspect: number): Crop {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const f of frames) {
    for (const p of f.image) {
      if (p.x < x0) x0 = p.x
      if (p.x > x1) x1 = p.x
      if (p.y < y0) y0 = p.y
      if (p.y > y1) y1 = p.y
    }
  }
  const tall = Math.min(1, (y1 - y0) / 0.68)
  const wide = Math.min(frameAspect, Math.max((x1 - x0) / 0.8, tall * stageAspect))
  const h = Math.min(1, wide / stageAspect)
  const w = h * stageAspect
  const cx = (x0 + x1) / 2
  // A little more room above than below: the toss and the racket live up there.
  const cy = (y0 + y1) / 2 - h * 0.05
  return {
    x: Math.max(0, Math.min(frameAspect - w, cx - w / 2)),
    y: Math.max(0, Math.min(1 - h, cy - h / 2)),
    w,
    h,
  }
}
