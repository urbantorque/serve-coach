/**
 * Heights in metres from the toss's own gravity (N2.9), across how far the
 * phone stands and how it is tilted up or down.
 */
import { gravityHeights, MAX_RULER_ERROR } from '../heights'
import { GRAVITY, tossPath, type StruckSample } from '../serveSpeed'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const ASPECT = 16 / 9
const CONTACT = 2.6
const RELEASE = 1.9
const APEX = 3.1

/** A side-on phone `dist` metres away, tilted `tilt` frame heights; returns frame-height y for a height in metres. */
function camera(dist: number, tilt: number) {
  const f = 0.8 * ASPECT
  const camY = 1.2
  return (h: number) => 0.5 + tilt - (f * (h - camY)) / dist
}

function scene(dist: number, tilt: number, noisePx: number, seed: number) {
  let s = seed >>> 0
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296 - 0.5)
  const y = camera(dist, tilt)
  const fall = APEX - CONTACT
  const samples: StruckSample[] = []
  const tApex = -Math.sqrt((2 * fall) / GRAVITY)
  for (let t = -0.85; t < -0.02; t += 1 / 30) {
    const h = APEX - 0.5 * GRAVITY * (t - tApex) ** 2
    samples.push({ t, x: ASPECT / 2 + rand() * noisePx / 1080, y: y(h) + (rand() * noisePx) / 1080 })
  }
  const toss = tossPath(samples, { noise: noisePx / 1080, aspect: ASPECT, t0: -0.004 })
  return { toss, at: { groundY: y(0), contactY: y(CONTACT), releaseY: y(RELEASE), apexY: y(APEX) } }
}

heading('Heights ruled by gravity')

check('contact and the toss above the hand come out in metres, wherever the phone stands', () => {
  const rows: string[] = []
  let worst = 0
  for (const dist of [4, 5, 6]) {
    for (const tilt of [-0.05, 0, 0.05]) {
      const { toss, at } = scene(dist, tilt, 1, Math.round(dist * 100 + tilt * 1000))
      const h = gravityHeights(toss, at)
      assert(Boolean(h), `no heights at ${dist} m, tilt ${tilt}`)
      const e = Math.max(Math.abs(h!.contactM / CONTACT - 1), Math.abs(h!.tossAboveHandM / (APEX - RELEASE) - 1))
      worst = Math.max(worst, e)
      rows.push(`${dist}m ${tilt}: contact ${h!.contactM.toFixed(2)} m, toss ${h!.tossAboveHandM.toFixed(2)} m`)
    }
  }
  note(rows.join(' · '))
  assert(worst < 0.05, `a height was ${(worst * 100).toFixed(1)}% off`)
})

check('a ruler unsure of itself gives no heights, and the body\'s ruler stands', () => {
  const { at } = scene(5, 0, 1, 9)
  const unsure = { t0: 0, terms: [0, 0, 0, 0, 1, 0] as [number, number, number, number, number, number], cx: 0, cy: 0, unitsPerMetre: 0.2, scaleError: MAX_RULER_ERROR + 0.01 }
  assert(gravityHeights(unsure, at) === undefined, 'an unsure ruler gave heights')
  assert(gravityHeights(undefined, at) === undefined, 'no toss gave heights')
})

report()
