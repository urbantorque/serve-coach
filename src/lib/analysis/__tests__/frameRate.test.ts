/**
 * What the frame rate does to the card's readings (L2.6).
 *
 * L2.6 set out to read a practice session's serves at 16 fps, keeping only the
 * readings that held within their noise of the 32 fps read. They did not, and
 * the measuring found something worse first: the contact readings drifted
 * between the app's own rate and the suite's 50. This file holds what was
 * fixed to the fix, and pins what was not, so each comes back the day it moves.
 *
 * The app's own rate was 32 then, and is 30 now: `readingPlan` walks the file's
 * own frames (H35).
 *
 * Every figure is the worst over the rig's clean serve and the six Bath serves
 * from the guide's placement and from the back fence, each filmed twenty-four
 * times with the suite's camera noise: how far the mean moved, in the reading's
 * own noise deviations (`CARD_NOISE_SD`).
 */
import { pathsThrough, peakBetween, poseAt } from '../between'
import { CARD_NOISE_SD } from '../consistency'
import { LM } from '../geometry'
import { measure } from '../metrics'
import { runEngine } from '../../../dev/mocap/engine'
import { appRead, filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { assessSpatial, viewFromCourtYaw } from '../spatial'
import { unswapFrames } from '../swapGuard'
import { buildServe } from '../syntheticServe'
import type { Frame, Landmark } from '../types'
import { DEPTH_AWARE, DEPTH_BIAS, DEPTH_MULTIPLIER, IN_PLANE, REAL_SERVES, SEEDS, realOnFile, seeds } from './repeatability'
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

heading('A curve through the samples')

/** One world landmark at each moment, the rest of the pose left out. */
const pathFrames = (ts: number[], at: (t: number) => number): Frame[] =>
  ts.map((t, i) => ({ index: i, t, image: [], world: [point(at(t), -2 * at(t))], visibility: 1 }))

check('a curve follows a parabola exactly, between the samples and on uneven ones', () => {
  const ts = [0, 0.03, 0.05, 0.11, 0.12, 0.17, 0.21]
  const path = pathsThrough(pathFrames(ts, (t) => 3 + 40 * t - 90 * t * t), [0], 0.1, 0.15)!
  for (const t of [0.04, 0.1, 0.133]) {
    const [p] = path(t)
    near(p.x, 3 + 40 * t - 90 * t * t, 1e-9, `x at ${t}`)
    near(p.y, -2 * (3 + 40 * t - 90 * t * t), 1e-9, `y at ${t}`)
  }
})

check('a curve averages the noise out of what it passes through', () => {
  // A level path, every sample off by ±1, alternately. The middle of the curve
  // takes most of it out, where the nearest sample keeps all of it.
  const ts = Array.from({ length: 11 }, (_, i) => 0.02 * i)
  const path = pathsThrough(pathFrames(ts, (t) => (Math.round(t / 0.02) % 2 ? 1 : -1)), [0], 0.1, 0.12)!
  assert(Math.abs(path(0.1)[0].x) < 0.3, `the middle of the curve is ${path(0.1)[0].x}`)
})

check('a sample missing a landmark is left out, and too few samples draw no curve', () => {
  const ts = [0, 0.02, 0.04, 0.06, 0.08]
  const line = pathFrames(ts, (t) => t)
  line[2].world[0] = point(Number.NaN, 0)
  near(pathsThrough(line, [0], 0.04, 0.2)!(0.04)[0].x, 0.04, 1e-9, 'around the sample with no landmark')
  line[3].world = []
  assert(pathsThrough(line, [0], 0.04, 0.2) === undefined, 'three samples drew a curve')
  // Only one moment, however many samples: nothing to fix a slope with.
  assert(pathsThrough(pathFrames([0.1, 0.1, 0.1, 0.1, 0.1], (t) => t), [0], 0.1, 0.2) === undefined, 'one moment drew a curve')
})

check('a curve can follow the picture as well as the skeleton', () => {
  const frames = pathFrames([0, 0.02, 0.04, 0.06, 0.08], (t) => t).map((f) => ({ ...f, image: [point(5, 7 * f.t)] }))
  near(pathsThrough(frames, [0], 0.04, 0.2, 'image')!(0.03)[0].y, 0.21, 1e-9, 'y in the picture')
  near(pathsThrough(frames, [0], 0.04, 0.2)!(0.03)[0].y, -0.06, 1e-9, 'y in the skeleton')
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
const at30 = readAt(30)
const at20 = readAt(20)
const appRate = drift(at50, at30)
const lightRate = drift(at30, at20)

check('contact height reads the same at 30 fps as at 50, within its noise', () => {
  // Was 1.58 off the nearest sample; the top of the reach between samples is 0.68.
  note(`contact height moved ${appRate.contactHeight.toFixed(2)} noise deviations between 50 and 30 fps`)
  assert(appRate.contactHeight <= 1, `contact height moved ${appRate.contactHeight.toFixed(2)} deviations with the frame rate`)
})

check('KNOWN: contact ahead still moves with the frame rate, because the contact moment does', () => {
  /*
   * Read at the refined moment between samples, and still apart. The moment
   * itself is the cause: `refineExtremum` places contact up to 12 ms differently
   * at 30 fps than at 50, and the hand crosses the body at about seven metres a
   * second there, so 12 ms is five per cent of the body. This fails the day the
   * contact moment stops moving with the rate; contact ahead then wants its noise
   * re-measured, and this check retired.
   */
  note(`contact ahead moved ${appRate.contactAhead.toFixed(2)} deviations between 50 and 30 fps`)
  assert(appRate.contactAhead > 1, 'contact ahead now holds across frame rates: retire this check (L2.6)')
})

check('the two readings taken off curves stay steady at the app’s own rate', () => {
  // Off single samples these were 10.93° and 5.05 points at 32 fps.
  const worst = (id: string) =>
    Math.max(
      ...at30.map((takes) => {
        const xs = takes.map((t) => t?.[id]).filter((v): v is number => v !== undefined)
        return Math.sqrt(xs.reduce((sum, x) => sum + (x - mean(xs)) ** 2, 0) / (xs.length - 1))
      }),
    )
  const [arm, load] = [worst('armExtension'), worst('loadRatio')]
  note(`at 30 fps: arm extension ${arm.toFixed(2)}°, load ratio ${load.toFixed(2)} points`)
  assert(arm <= 9.5, `arm extension moves ${arm.toFixed(2)}° between takes at the app's rate`)
  assert(load <= 2.5, `load ratio moves ${load.toFixed(2)} points between takes at the app's rate`)
})

heading('The read of a file')

/** The card's readings of one take, through the app's own path. */
function engineValues(frames: Frame[]): Record<string, number> {
  const read = runEngine(unswapFrames(frames).frames, 32)
  if (!read.ok) return {}
  return Object.fromEntries(read.run.fundamentals.flatMap((f) => f.metrics).map((m) => [m.id, m.value]))
}

const spreadOf = (xs: number[]) => Math.sqrt(xs.reduce((sum, x) => sum + (x - mean(xs)) ** 2, 0) / (xs.length - 1))

check('a 30 fps file read on its frames is the film itself, half a frame later', () => {
  const film = buildServe({ ...DEPTH_AWARE, seed: 3 }, 30)
  const read = appRead(film, 30)
  assert(read.length === film.length, `read ${read.length} samples of ${film.length} frames`)
  read.forEach((sample, i) => {
    assert(sample.image === film[i].image, `sample ${i} is not frame ${i}`)
    near(sample.t, film[i].t + 1 / 60, 1e-9, `sample ${i}'s stamp`)
  })
})

check('walking the file’s frames steadies what is timed against them', () => {
  /*
   * A 30 fps file with a sampling phase per take, the six Bath serves from the
   * guide, pooled within each serve. Half of contact ahead's variance on the
   * even grid was the grid: a frame read twice, and stamps that slide (H35).
   */
  const rows = ['contactAhead', 'dropToContact', 'handUnderElbow', 'tossArmHold']
  const pooled = (read: 'frames' | 'even') => {
    const takes = REAL_SERVES.map((serve) => seeds(120).map((seed) => engineValues(realOnFile(serve, {}, seed, 30, read))))
    return Object.fromEntries(
      rows.map((id) => {
        const within = takes.map((t) => spreadOf(t.map((v) => v[id]).filter(Number.isFinite)) ** 2)
        return [id, Math.sqrt(mean(within))]
      }),
    )
  }
  const [frames, even] = [pooled('frames'), pooled('even')]
  for (const id of rows) {
    note(`${id}: ${even[id].toFixed(2)} on the even grid, ${frames[id].toFixed(2)} on the frames`)
    assert(frames[id] < even[id], `${id} is no steadier on the frames`)
  }
  assert(frames.contactAhead < 0.8 * even.contactAhead, 'contact ahead gained less than a fifth')
  assert(frames.dropToContact < 0.8 * even.dropToContact, 'drop to contact gained less than a fifth')
})

check('how long a read runs moves no reading', () => {
  /*
   * The toss path sized its window as 12% of the samples, so one toss from
   * behind read 1.40 at 64 samples and 4.60 at 120, on a band of 0 to 3 (H36).
   * The last pose held on, as a clip that keeps rolling after the serve.
   */
  const moved: Record<string, number> = {}
  for (const [phone, serves] of [
    [{}, REAL_SERVES],
    [{ bearing: 180, distance: 6 }, REAL_SERVES],
  ] as const) {
    for (const serve of serves) {
      for (const seed of SEEDS.slice(0, 8)) {
        const short = realOnFile(serve, phone, seed, 30)
        const last = short[short.length - 1]
        const held = Array.from({ length: 120 - short.length }, (_, i) => ({
          ...last,
          index: short.length + i,
          t: last.t + (i + 1) / 30,
        }))
        const [a, b] = [engineValues(short), engineValues([...short, ...held])]
        for (const id of Object.keys(CARD_NOISE_SD)) {
          if (Number.isFinite(a[id]) && Number.isFinite(b[id])) {
            moved[id] = Math.max(moved[id] ?? 0, Math.abs(a[id] - b[id]) / CARD_NOISE_SD[id])
          }
        }
      }
    }
  }
  const worst = Object.entries(moved).sort((x, y) => y[1] - x[1])[0]
  note(`the most any reading moved, going to 120 samples: ${worst[0]}, ${worst[1].toFixed(3)} of its noise`)
  assert(worst[1] < 0.5, `${worst[0]} moved ${worst[1].toFixed(2)} of its noise with the length of the read`)
})

check('KNOWN: past four seconds a 30 fps clip is read with frames left out, and one take can move', () => {
  /*
   * Where the check above ends. 120 samples is four seconds of a 30 fps clip;
   * past that the budget leaves frames out, spread over the clip (`readingPlan`),
   * and a frame left out at contact moves that take's contact. The even grid
   * there, whose stamps slid against the film, also named clean tosses from
   * behind (`rate.ts`). This fails the day a long clip reads like the same clip
   * read whole.
   */
  const moved: Record<string, number> = {}
  for (const phone of [{}, { bearing: 180, distance: 6 }]) {
    for (const serve of REAL_SERVES) {
      for (const seed of SEEDS.slice(0, 8)) {
        const short = realOnFile(serve, phone, seed, 30)
        const last = short[short.length - 1]
        const file = [...short, ...Array.from({ length: 132 - short.length }, () => last)].map((f, i) => ({ ...f, index: i, t: i / 30 }))
        const [a, b] = [engineValues(short), engineValues(appRead(file, 30))]
        for (const id of Object.keys(CARD_NOISE_SD)) {
          if (Number.isFinite(a[id]) && Number.isFinite(b[id])) moved[id] = Math.max(moved[id] ?? 0, Math.abs(a[id] - b[id]) / CARD_NOISE_SD[id])
        }
      }
    }
  }
  const worst = Object.entries(moved).sort((x, y) => y[1] - x[1])
  note(`a 4.4 s clip, the most a take moved: ${worst.slice(0, 3).map(([id, v]) => `${id} ${v.toFixed(2)}`).join(', ')} of its noise`)
  assert(worst[0][1] > 1, 'a long clip now reads like the same clip read whole: say so in rate.ts and drop this')
})

heading('A lighter read for sessions')

check('KNOWN: a 20 fps read loses readings a session needs, so sessions read at the report’s rate', () => {
  /*
   * L2.6's plan was a light read at 16 fps. At 16, a sixth of the takes were
   * refused outright (54 of 312). At 20 none were, and most readings held
   * within their noise of the full read; contact height and the toss arm did not,
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
