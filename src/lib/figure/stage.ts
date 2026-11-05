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
  /** The body's height on this canvas, held for the whole swing. */
  stature: number
  /** The lowest the feet get, on this canvas. */
  floor: number
}

export interface PlaceOptions {
  /** How much of the canvas the body's whole motion may fill, 0 to 1. */
  fill?: number
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
  const scale = Math.min((w * fill) / Math.max(1e-6, x1 - x0), (h * fill) / Math.max(1e-6, y1 - y0))
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
  return { place, stature, floor }
}

export interface PoseOptions extends Pick<AthleteOptions, 'material' | 'work' | 'rim' | 'ground' | 'still'> {
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
  for (let i = o.from; i < o.to; i += every) {
    const placed = frames[i].image.map(at.place)
    paintTrace(ctx, placed, {
      racket: o.racket,
      stature: at.stature,
      near: nearSide(placed, frames[i].world?.length ? frames[i].world : undefined),
      alpha: 0.05 + 0.1 * ((i - o.from) / span),
    })
  }
  const path: Pt[] = []
  for (let i = o.from; i <= o.to; i++) {
    const known = frames[i].racket
    const head = known?.head ?? (o.bodyHeight ? smoothedRacket(frames as Frame[], i, o.racket, o.bodyHeight)?.head : undefined)
    if (head) path.push(at.place(head))
  }
  paintRibbon(ctx, path, at.stature * 0.026)
  if (!o.bare) {
    paintPose(ctx, frames[o.to], at, {
      racket: o.racket,
      swing: frames,
      index: o.to,
      bodyHeight: o.bodyHeight,
      material: o.material,
      ground: 1,
      still: true,
    })
  }
}
