/**
 * The model serve: a real one.
 *
 * "Good" used to be the rig, a serve posed by hand, so what a player was asked
 * to aim at was a drawing. This is one serve from the Bath motion capture, by a
 * real player, that landed in and that the engine scores in the eighties with no
 * fault named on it. It is a good serve to watch, not the only right one, and
 * the copy around it says so.
 *
 * Filmed by the same virtual phone the engine's bench uses, so the frames have
 * the shape every player and report already reads. The ball is the one thing
 * here that is drawn: the capture never marked it.
 */
import { mirrorFrames } from '../analysis/mirror'
import { filmMocap, unpackMocap, type PackedMocapServe } from '../analysis/mocapServe'
import { buildPhases, detectServe } from '../analysis/phases'
import { LM } from '../analysis/geometry'
import type { Frame, Phase } from '../analysis/types'
import type { BallFlight } from '../vision/ballTrack'
import packed from './modelServe.json'

/** The rate the model is filmed at. */
export const MODEL_FPS = 60

/** Frames share a unit in x and y, as the rig's do. */
export const MODEL_ASPECT = 1

/** Metres per unit of the picture's height, near enough for the ball's fall. */
const STATURE_M = 1.8

export interface ModelServe {
  frames: Frame[]
  phases: Phase[]
  contactT: number
  ball?: BallFlight
}

const fromBase64 = (t: string): Uint8Array => {
  const bin = atob(t)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * The toss, drawn: up from the tossing hand and down to the strings on a real
 * fall, so the ball meets the racket at contact on a curve gravity would make.
 */
function drawnToss(frames: Frame[], contact: number, stature: number, racket: 'left' | 'right'): BallFlight | undefined {
  const hit = frames[contact]?.racket
  if (!hit) return undefined
  const hand = racket === 'right' ? LM.leftWrist : LM.rightWrist
  const k = (9.81 / 2) * (stature / STATURE_M)
  // How far the ball falls from its top to the strings. A club toss: 40 cm.
  const fall = 0.4 * (stature / STATURE_M)
  const apexY = hit.head.y - fall
  const t1 = frames[contact].t
  const apexT = t1 - Math.sqrt(fall / k)
  const arc = (t: number) => apexY + k * (t - apexT) ** 2

  // Let go where the tossing hand meets the arc on its way up.
  let release = -1
  let gap = Infinity
  for (let i = 0; i < contact && frames[i].t < apexT; i++) {
    const d = Math.abs(frames[i].image[hand].y - arc(frames[i].t))
    if (d < gap) {
      gap = d
      release = i
    }
  }
  if (release < 0) return undefined
  const t0 = frames[release].t
  const from = frames[release].image[hand]
  const slope = (hit.head.x - from.x) / Math.max(1e-3, t1 - t0)
  const x = (t: number) => from.x + slope * (t - t0)
  const samples = []
  for (let i = release; i <= contact; i++) {
    const t = frames[i].t
    samples.push({ t, x: x(t), y: arc(t) })
  }
  return {
    coefficients: [apexY + k * apexT * apexT, -2 * k * apexT, k],
    apex: { t: apexT, x: x(apexT), y: apexY },
    samples,
    confidence: 1,
  }
}

/** The model serve on the player's own side, ready to finish. */
export function modelMotion(racket: 'left' | 'right', bearing = 90): ModelServe | undefined {
  try {
    const serve = unpackMocap(packed as PackedMocapServe, fromBase64)
    const filmed = filmMocap(serve, { fps: MODEL_FPS, aspect: MODEL_ASPECT, bearing })
    const frames = racket === 'left' ? mirrorFrames(filmed, MODEL_ASPECT) : filmed
    const skel = detectServe(frames, MODEL_FPS, racket)
    const phases = buildPhases(frames, skel.keys)
    const first = phases[0].frame
    const last = phases[phases.length - 1].frame
    const contact = skel.keys.contact
    const ball = drawnToss(frames, contact, skel.bodyHeight, racket)
    return {
      frames: frames.slice(first, last + 1),
      phases: phases.map((p) => ({ ...p, frame: p.frame - first })),
      contactT: frames[contact].t,
      ...(ball ? { ball } : {}),
    }
  } catch {
    return undefined
  }
}
