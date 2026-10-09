/**
 * What the frame rate does to the card's readings (L2.6).
 *
 * L2.6 set out to read a practice session's serves at 16 fps, keeping only the
 * readings that held within their noise of the 32 fps read. They did not, and
 * the measuring found something worse first: the contact readings drifted
 * between the app's own 32 fps and the suite's 50. This file holds what was
 * fixed to the fix, and pins what was not, so each comes back the day it moves.
 *
 * Every figure is the worst over the rig's clean serve and the six Bath serves
 * from the guide's placement and from the back fence, each filmed twenty-four
 * times with the suite's camera noise: how far the mean moved, in the reading's
 * own noise deviations (`CARD_NOISE_SD`).
 */
import { peakBetween, poseAt } from '../between'
import { CARD_NOISE_SD } from '../consistency'
import { LM } from '../geometry'
import { measure } from '../metrics'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { assessSpatial, viewFromCourtYaw } from '../spatial'
import { buildServe } from '../syntheticServe'
import type { Frame, Landmark } from '../types'
import { DEPTH_AWARE, DEPTH_BIAS, DEPTH_MULTIPLIER, IN_PLANE, REAL_SERVES, SEEDS } from './repeatability'
import { assert, check, heading, near, note, report } from './harness'

heading('Between two samples')

const point = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 })
const frameAt = (t: number, x: number): Frame => ({
  index: Math.round(t * 100),
  t,
  image: [point(x, 2 * x)],
  world: [point(-x, x)],
  visibility: 1,
})

check('a pose between two samples lies on the line between them', () => {
  const frames = [frameAt(0, 0), frameAt(0.1, 1), frameAt(0.2, 3)]
  const mid = poseAt(frames, 0.15)
  near(mid.image[0].x, 2, 1e-12, 'x between the second and third samples')
  near(mid.image[0].y, 4, 1e-12, 'y between the second and third samples')
  near(mid.world[0].x, -2, 1e-12, 'the world skeleton too')
  assert(mid.t === 0.15, 'the moment asked for was not the moment returned')
  assert(poseAt(frames, -1) === frames[0] && poseAt(frames, 9) === frames[2], 'a moment off the end was invented')
})

check('the top of a rounded peak is found between samples, and a sharp one is not overshot', () => {
  // A parabola peaking at t = 0.43 with height 2, sampled every 0.1 s.
  const ts = [0.2, 0.3, 0.4, 0.5, 0.6]
  const round = ts.map((t) => 2 - 30 * (t - 0.43) ** 2)
  near(peakBetween(round, ts, 2), 2, 1e-9, 'a rounded peak')
  // A tent peaking at 0.43: straight sides, the shape a parabola reads low.
  const tent = ts.map((t) => 2 - 5 * Math.abs(t - 0.43))
  const read = peakBetween(tent, ts, 2)
  assert(read > tent[2] && read <= 2, `a sharp peak read ${read}, its samples ${tent[2]}, its top 2`)
  // Not a peak: the sample's own value.
  assert(peakBetween([1, 2, 3], [0, 0.1, 0.2], 1) === 3, 'a rising series was given a top')
  assert(peakBetween([1, 2], [0, 0.1], 1) === 2, 'an end sample was given a top')
})

heading('The contact readings, at the app’s rate and the suite’s')

const stature = (f: Frame) => (Math.max(f.image[LM.leftAnkle].y, f.image[LM.rightAnkle].y) - f.image[LM.nose].y) / 0.93
const RIG = stature(buildServe({}, 50)[0])

const SOURCES: { name: string; film: (seed: number, fps: number) => Frame[] }[] = [
  { name: 'the rig', film: (seed, fps) => buildServe({ ...DEPTH_AWARE, seed }, fps) },
  ...(
    [
      ['the guide', {}],
      ['the back fence', { bearing: 180, distance: 6 }],
    ] as const
  ).flatMap(([where, phone]) =>
    REAL_SERVES.map((serve, s) => {
      const scale = stature(filmMocap(serve, { ...phone, fps: 50 })[0]) / RIG
      return {
        name: `Bath serve ${s + 1} from ${where}`,
        film: (seed: number, fps: number) =>
          filmMocap(serve, {
            ...phone,
            fps,
            seed,
            noise: IN_PLANE * scale,
            depthNoise: DEPTH_MULTIPLIER,
            depthBias: DEPTH_BIAS * scale,
          }),
      }
    }),
  ),
]

/** Every card reading of every take, per source, at one rate; `undefined` for a take refused. */
function readAt(fps: number): (Record<string, number> | undefined)[][] {
  return SOURCES.map((src) =>
    SEEDS.map((seed) => {
      const frames = src.film(seed, fps)
      let skel
      try {
        skel = detectServe(frames, fps)
      } catch {
        return undefined
      }
      const view = viewFromCourtYaw(assessSpatial(frames, skel.keys.ready, skel.bodyHeight, skel).court_yaw_deg)
      const values: Record<string, number> = {}
      for (const m of measure(frames, skel, view === 'side', { serveType: 'flat' }).flatMap((f) => f.metrics)) {
        if (Number.isFinite(m.value)) values[m.id] = m.value
      }
      return values
    }),
  )
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** The worst move of each reading's mean between two rates, in its own noise deviations. */
function drift(base: ReturnType<typeof readAt>, low: ReturnType<typeof readAt>): Record<string, number> {
  const worst: Record<string, number> = {}
  base.forEach((takes, s) => {
    const ids = new Set(takes.flatMap((t) => (t ? Object.keys(t) : [])))
    for (const id of ids) {
      const noise = CARD_NOISE_SD[id]
      if (!noise) continue
      const a = takes.map((t) => t?.[id]).filter((v): v is number => v !== undefined)
      const b = low[s].map((t) => t?.[id]).filter((v): v is number => v !== undefined)
      if (a.length < 12 || b.length < 12) continue
      worst[id] = Math.max(worst[id] ?? 0, Math.abs(mean(b) - mean(a)) / noise)
    }
  })
  return worst
}

const at50 = readAt(50)
const at32 = readAt(32)
const at20 = readAt(20)
const appRate = drift(at50, at32)
const lightRate = drift(at32, at20)

check('contact height reads the same at 32 fps as at 50, within its noise', () => {
  // Was 1.58 off the nearest sample; the top of the reach between samples is 0.68.
  note(`contact height moved ${appRate.contactHeight.toFixed(2)} noise deviations between 50 and 32 fps`)
  assert(appRate.contactHeight <= 1, `contact height moved ${appRate.contactHeight.toFixed(2)} deviations with the frame rate`)
})

check('KNOWN: contact ahead still moves with the frame rate, because the contact moment does', () => {
  /*
   * Read at the refined moment between samples, and still 2.5 deviations
   * apart. The moment itself is the cause: `refineExtremum` places contact up
   * to 12 ms differently at 32 fps than at 50, and the hand crosses the body at
   * about seven metres a second there, so 12 ms is five per cent of the body.
   * This fails the day the contact moment stops moving with the rate; contact
   * ahead then wants its noise re-measured, and this check retired.
   */
  note(`contact ahead moved ${appRate.contactAhead.toFixed(2)} deviations between 50 and 32 fps`)
  assert(appRate.contactAhead > 1, 'contact ahead now holds across frame rates: retire this check (L2.6)')
})

heading('A lighter read for sessions')

check('KNOWN: a 20 fps read loses readings a session needs, so sessions read at 32', () => {
  /*
   * L2.6's plan was a light read at 16 fps. At 16, a sixth of the takes were
   * refused outright (54 of 312). At 20 none were, and seven readings held
   * within their noise of the 32 fps read; the drop and the contact did not,
   * and those are what a session's fault counts are made of. A session
   * therefore reads every serve at the report's rate, without the ball, the
   * racket boxes, the stills or the second pose model (`session/video.ts`).
   * This fails the day the three below hold at 20 fps, when the light read is
   * worth building.
   */
  const lost = ['dropDepth', 'contactHeight', 'tossArmHold'].filter((id) => lightRate[id] > 1)
  const held = Object.entries(lightRate)
    .filter(([, d]) => d <= 1)
    .map(([id]) => id)
  note(`held at 20 fps: ${held.join(', ')}`)
  note(`lost: ${lost.map((id) => `${id} ${lightRate[id].toFixed(2)}`).join(', ')}`)
  assert(lost.length > 0, 'the drop and contact readings now hold at 20 fps: build the light read (L2.6)')
  assert(at20.flat().filter((t) => !t).length <= 3, 'a 20 fps read now refuses takes, and the note above is stale')
})

report()
