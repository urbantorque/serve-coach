/**
 * What a rig player draws on a frame beyond the body (L4.4, L4.5): the ball,
 * and on a fault demonstration the part to watch.
 *
 * Apart from `faultDemo.ts` because the player that draws these sits in the
 * report's chunk, and `faultDemo.ts` brings the whole rig with it. This file
 * reads a frame and a flight and nothing else.
 */
import { LM, sided } from './analysis/geometry'
import type { Frame, PhaseId } from './analysis/types'
import type { DemoServe } from './faultDemo'
import type { DemoPart } from './faultDemoDials'
import { ballMarkerAt } from './vision/ballTrack'

type Pt = { x: number; y: number }
type Side = 'left' | 'right'

const other = (s: Side): Side => (s === 'right' ? 'left' : 'right')

/**
 * Where a model serve's ball is on a frame: in the tossing hand until it is
 * let go, on its arc to the strings, and gone after contact — the drawing
 * claims nothing about where a struck ball went.
 */
export function ballOn(serve: DemoServe, frame: Frame, racket: Side): (Pt & { path?: Pt[] }) | undefined {
  const flight = serve.ball
  if (!flight?.samples.length || frame.t > serve.contactT + 1e-6) return undefined
  if (frame.t < flight.samples[0].t) {
    const hand = frame.image[sided(other(racket)).wrist]
    return { x: hand.x, y: hand.y }
  }
  return ballMarkerAt(flight, frame.t)
}

/** The clean serve's frame at a moment, on the player's own side (L4.6). */
export function modelFrameAt(model: DemoServe, phase: PhaseId): Frame | undefined {
  const at = model.phases.find((p) => p.id === phase)
  return at ? model.frames[at.frame] : undefined
}

/** What to paint on the faulty body at one instant. */
export interface Highlight {
  /** Bones in `--work`. */
  work?: [number, number][]
  /** The racket in `--work`. */
  workRacket?: boolean
  /** The ball in `--work`. */
  workBall?: boolean
  /** The fix's same part, dashed — a ring alone where it is a point. */
  target: { a: Pt; b: Pt }[]
  /** Over the body: on a model, the dashed shape is the instruction. */
  targetOver: true
}

const mid = (f: Frame, a: number, b: number): Pt => ({
  x: (f.image[a].x + f.image[b].x) / 2,
  y: (f.image[a].y + f.image[b].y) / 2,
})

/**
 * The part a demonstration names, on the faulty body (L4.5): painted in
 * `--work`, with the fix's own beside it, dashed, hung from the point the part
 * moves from — the grip for the racket, the shoulder for the elbow, the
 * tossing elbow for the hand, the hips for the ball, and the court itself
 * for the hips. Hung there rather than drawn where the fix stood, so the dashed shape is
 * the difference and not the distance between two people.
 */
export function highlightOf(
  part: DemoPart,
  racket: Side,
  fault: Frame,
  fix: Frame,
  faultBall?: Pt,
  fixBall?: Pt,
): Highlight {
  return { ...partOn(part, racket, fault, fix, faultBall, fixBall), targetOver: true }
}

/** The painted part and its dashed fix, before `highlightOf` puts the target on top. */
function partOn(
  part: DemoPart,
  racket: Side,
  fault: Frame,
  fix: Frame,
  faultBall?: Pt,
  fixBall?: Pt,
): Omit<Highlight, 'targetOver'> {
  const arm = sided(racket)
  const toss = sided(other(racket))
  const hung = (from: Pt, to: Pt) => (p: Pt): Pt => ({ x: p.x - to.x + from.x, y: p.y - to.y + from.y })
  switch (part) {
    case 'racket': {
      if (!fault.racket || !fix.racket) return { workRacket: true, target: [] }
      const m = hung(fault.racket.grip, fix.racket.grip)
      return { workRacket: true, target: [{ a: m(fix.racket.grip), b: m(fix.racket.head) }] }
    }
    case 'elbow': {
      const m = hung(fault.image[arm.shoulder], fix.image[arm.shoulder])
      return {
        work: [[arm.shoulder, arm.elbow]],
        target: [{ a: m(fix.image[arm.shoulder]), b: m(fix.image[arm.elbow]) }],
      }
    }
    case 'tossingHand': {
      const m = hung(fault.image[toss.elbow], fix.image[toss.elbow])
      return {
        work: [[toss.elbow, toss.wrist]],
        target: [{ a: m(fix.image[toss.elbow]), b: m(fix.image[toss.wrist]) }],
      }
    }
    case 'ball': {
      const m = hung(mid(fault, LM.leftHip, LM.rightHip), mid(fix, LM.leftHip, LM.rightHip))
      return { workBall: true, target: fixBall && faultBall ? [{ a: m(fixBall), b: m(fixBall) }] : [] }
    }
    case 'hips': {
      // Lined up across, but left at their own height: both serves are on
      // one court under one camera, and the fault is how high the hips get.
      // Hung from the ankles, a serve that leaves the ground hid its own rise.
      const a = mid(fault, LM.leftHip, LM.rightHip)
      const b = mid(fix, LM.leftHip, LM.rightHip)
      const m = hung({ x: a.x, y: 0 }, { x: b.x, y: 0 })
      const thighs: [number, number][] = [
        [LM.leftHip, LM.leftKnee],
        [LM.rightHip, LM.rightKnee],
      ]
      return { work: thighs, target: thighs.map(([p, q]) => ({ a: m(fix.image[p]), b: m(fix.image[q]) })) }
    }
  }
}
