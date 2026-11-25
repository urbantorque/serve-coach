/**
 * Noise that behaves like a tracker (L5.9): the fitted model reproduces what
 * it was fitted to, the swap guard puts back what a tracker trades and leaves
 * clean clips alone, and under that noise the floors name nothing on a
 * skilled serve that they should not.
 */
import { filmMocap } from '../mocapServe'
import { buildServe } from '../syntheticServe'
import { LM } from '../geometry'
import { NOISE_FLOOR, SIGNALS } from '../tiers'
import {
  IN_PLANE_SD,
  MEDIAPIPE_FIT,
  RTMPOSE_FIT,
  correlationAt,
  withTrackerNoise,
  type TrackedPart,
  type TrackerFit,
} from '../trackerNoise'
import { unswapFrames } from '../swapGuard'
import type { FlawId } from '../flaws'
import type { Frame } from '../types'
import {
  DEPTH_BIAS,
  DEPTH_MULTIPLIER,
  FPS,
  REAL_SERVES,
  floorWanted,
  pooledDeviations,
  realiseFilmed,
  realiseReal,
  seeds,
} from './repeatability'
import { assert, check, heading, note, report } from './harness'

const stature = (f: Frame, w: 'image' | 'world') =>
  (Math.max(f[w][LM.leftAnkle].y, f[w][LM.rightAnkle].y) - f[w][LM.nose].y) / 0.93
const RIG_STATURE = 0.54
const PAIRS: [TrackedPart, number, number][] = [
  ['shoulder', LM.leftShoulder, LM.rightShoulder],
  ['elbow', LM.leftElbow, LM.rightElbow],
  ['wrist', LM.leftWrist, LM.rightWrist],
  ['hip', LM.leftHip, LM.rightHip],
  ['knee', LM.leftKnee, LM.rightKnee],
  ['ankle', LM.leftAnkle, LM.rightAnkle],
]
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

function noisy(clean: Frame[], fit: TrackerFit, fps: number, seed: number, extra: { noSwaps?: boolean } = {}) {
  const s = stature(clean[0], 'image')
  return withTrackerNoise(clean, {
    fit,
    fps,
    stature: s,
    statureM: stature(clean[0], 'world'),
    seed,
    depthMultiplier: DEPTH_MULTIPLIER,
    depthBias: DEPTH_BIAS * (s / RIG_STATURE),
    ...extra,
  })
}

heading('Noise that behaves like a tracker')

check('the fitted noise has the spread and the correlation it was fitted to', () => {
  // One still frame held for a long clip, so the residual is the noise alone.
  const still = filmMocap(REAL_SERVES[0], { fps: FPS }).slice(0, 1)
  const held = Array.from({ length: 2000 }, (_, i) => ({ ...still[0], index: i, t: i / FPS }))
  const s = stature(still[0], 'image')
  const out = noisy(held, MEDIAPIPE_FIT, FPS, 5, { noSwaps: true })
  const rows: string[] = []
  for (const [part, l] of PAIRS) {
    const r = out.map((f) => (f.image[l].x - held[0].image[l].x) / s)
    const spread = sd(r)
    const m = r.reduce((a, b) => a + b, 0) / r.length
    let num = 0
    let den = 0
    for (let i = 1; i < r.length; i++) num += (r[i] - m) * (r[i - 1] - m)
    for (const v of r) den += (v - m) ** 2
    const rho = num / den
    const want = correlationAt(MEDIAPIPE_FIT.benchRho[part], FPS)
    rows.push(`${part} ${(spread * 100).toFixed(2)}% ρ ${rho.toFixed(2)}`)
    // An AR(1) series this correlated wanders, so its spread over 2,000
    // frames is good to about a fifth.
    assert(Math.abs(spread / MEDIAPIPE_FIT.sd[part] - 1) < 0.25, `${part}: spread ${spread} against ${MEDIAPIPE_FIT.sd[part]}`)
    assert(Math.abs(rho - want) < 0.08, `${part}: correlation ${rho.toFixed(2)} against ${want.toFixed(2)}`)
  }
  note(`at ${FPS} fps: ${rows.join(' · ')}; the old jitter was ${(IN_PLANE_SD * 100).toFixed(2)}% and uncorrelated`)
})

check('swaps arrive at the fitted rate', () => {
  // A still frame from in front, where every pair stands apart, held long and
  // read with the spread all but off: a slot holding its partner is a swap.
  const still = filmMocap(REAL_SERVES[0], { fps: FPS, bearing: 0 }).slice(0, 1)
  const held = Array.from({ length: 6000 }, (_, i) => ({ ...still[0], index: i, t: i / FPS }))
  const s = stature(still[0], 'image')
  const out = withTrackerNoise(held, { fit: MEDIAPIPE_FIT, fps: FPS, stature: s, statureM: stature(still[0], 'world'), seed: 9, scale: 1e-6 })
  const rows: string[] = []
  for (const [part, l, r] of PAIRS) {
    const n = out.filter((f) => Math.hypot(f.image[l].x - held[0].image[r].x, f.image[l].y - held[0].image[r].y) < 1e-4).length
    const rate = n / held.length
    rows.push(`${part} ${(rate * 100).toFixed(1)}%`)
    // Binomial over 6,000 frames: within a third of the fitted rate.
    assert(Math.abs(rate - MEDIAPIPE_FIT.swap[part]) < MEDIAPIPE_FIT.swap[part] / 3, `${part}: ${rate} against ${MEDIAPIPE_FIT.swap[part]}`)
  }
  note(rows.join(' · '))
})

check('the guard leaves every clean clip alone', () => {
  const touched: string[] = []
  for (const serve of REAL_SERVES) {
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const fps of [30, 60, 120]) {
        const n = unswapFrames(filmMocap(serve, { fps, bearing })).corrected
        if (n) touched.push(`Bath bearing ${bearing} at ${fps} fps: ${n}`)
      }
    }
  }
  for (const cameraYaw of [82, 60, 45, 30, 8]) {
    for (const fps of [30, 50, 120]) {
      for (const dials of [{}, { landingTravel: 0.3 }, { landingLean: 0.12 }, { trophyArmLayOver: 1 }, { contactBehind: 1 }, { pinpointSlide: 1 }]) {
        const n = unswapFrames(buildServe({ cameraYaw, ...dials }, fps)).corrected
        if (n) touched.push(`rig yaw ${cameraYaw} at ${fps} fps ${JSON.stringify(dials)}: ${n}`)
      }
    }
  }
  assert(touched.length === 0, touched.join('; '))
})

check('the guard puts back what the tracker traded, and trades none of its own', () => {
  const tally: Record<string, { swapped: number; left: number; made: number }> = {}
  let frames = 0
  for (const serve of REAL_SERVES) {
    for (const fps of [30, 60]) {
      for (const seed of [1, 2, 3, 4]) {
        const clean = filmMocap(serve, { fps, bearing: 90 })
        const traded = noisy(clean, MEDIAPIPE_FIT, fps, seed)
        const fixed = unswapFrames(traded).frames
        const s = stature(clean[0], 'image')
        frames += clean.length
        for (const [part, l, r] of PAIRS) {
          const t = (tally[part] ??= { swapped: 0, left: 0, made: 0 })
          for (let i = 0; i < clean.length; i++) {
            if (Math.hypot(clean[i].image[l].x - clean[i].image[r].x, clean[i].image[l].y - clean[i].image[r].y) < 0.05 * s) continue
            const crossed = (f: Frame) =>
              Math.hypot(f.image[l].x - clean[i].image[r].x, f.image[l].y - clean[i].image[r].y) <
              Math.hypot(f.image[l].x - clean[i].image[l].x, f.image[l].y - clean[i].image[l].y)
            if (crossed(traded[i])) t.swapped++
            if (crossed(fixed[i])) t.left++
            if (!crossed(traded[i]) && crossed(fixed[i])) t.made++
          }
        }
      }
    }
  }
  note(Object.entries(tally).map(([p, t]) => `${p} ${t.swapped}→${t.left}`).join(' · ') + ', from the side')
  for (const [part, t] of Object.entries(tally)) {
    assert(t.made <= frames * 0.001, `${part}: the guard traded ${t.made} pairs that weren’t traded`)
  }
  // The arms, which most faults are named from, are put back all but whole.
  // The legs and hips less: side-on each pair nearly overlaps, so a swap is a
  // small move the noise crosses too, and a swap in the clip's last frames
  // has nothing after it to show the limb coming back.
  for (const part of ['shoulder', 'elbow', 'wrist']) {
    assert(tally[part].left <= tally[part].swapped * 0.05, `${part}: ${tally[part].left} of ${tally[part].swapped} left in`)
  }
  for (const part of ['hip', 'knee', 'ankle']) {
    assert(tally[part].left <= tally[part].swapped * 0.35, `${part}: ${tally[part].left} of ${tally[part].swapped} left in`)
  }
})

/*
 * The floors under the fitted noise, before and after: what each signal's
 * deviation on the six Bath serves asks for under the old jitter and under the
 * tracker measured on the bench, against the floor it has. Printed, not
 * asserted: the check below is the one that decides whether a floor is
 * inventing faults, which is what a floor is for.
 */
const OVER = seeds(24)
const fitted = (fit: TrackerFit) =>
  REAL_SERVES.map((serve) => {
    const clean = filmMocap(serve, { fps: FPS })
    return realiseFilmed((seed) => noisy(clean, fit, FPS, seed), 5, OVER, FPS)
  })
const underMediaPipe = fitted(MEDIAPIPE_FIT)
const underRtmPose = fitted(RTMPOSE_FIT)
{
  const before = new Map(pooledDeviations(realiseReal(undefined, OVER)).map((d) => [d.id, d.sd]))
  const after = new Map(pooledDeviations(underMediaPipe).map((d) => [d.id, d.sd]))
  const swing = new Map(pooledDeviations(underRtmPose).map((d) => [d.id, d.sd]))
  note('floor · asked for under the old jitter / MediaPipe / RTMPose · serious miss:')
  for (const id of Object.keys(NOISE_FLOOR)) {
    const ask = (m: Map<string, number>) => (m.has(id) ? String(floorWanted(m.get(id)!, id)) : '—')
    note(`  ${id}: ${NOISE_FLOOR[id]} · ${ask(before)} / ${ask(after)} / ${ask(swing)} · ${SIGNALS[id]?.seriousMiss ?? '—'}`)
  }
}

check('under the fitted tracker, the floors name next to nothing on a skilled serve', () => {
  const FLAWS: FlawId[] = [
    'waiters_tray', 'arming_the_ball', 'no_leg_drive', 'early_shoulder_rotation', 'posture_collapse', 'toss_drift',
    'shallow_drop', 'collapsed_elbow', 'pancake_contact', 'low_contact', 'toss_height', 'contact_behind', 'toss_arm_drops',
  ]
  const rate = (groups: typeof underMediaPipe, f: FlawId) => {
    const all = groups.flat()
    return all.filter((r) => r.named.has(f)).length / all.length
  }
  const rows: string[] = []
  for (const f of FLAWS) {
    const mp = rate(underMediaPipe, f)
    const rtm = rate(underRtmPose, f)
    if (mp || rtm) rows.push(`${f} ${(mp * 100).toFixed(1)}% / ${(rtm * 100).toFixed(1)}%`)
    // The swing is read again with RTMPose in the app, so contact and the
    // trophy are held to its noise; MediaPipe's is the whole clip's.
    assert(rtm <= 0.01, `${f} named on ${(rtm * 100).toFixed(1)}% of skilled takes under RTMPose's noise`)
    assert(mp <= 0.025, `${f} named on ${(mp * 100).toFixed(1)}% of skilled takes under MediaPipe's noise`)
  }
  assert(rate(underMediaPipe, 'toss_drift') === 0, 'a swap is naming a toss drift again')
  note(rows.length ? `named, MediaPipe / RTMPose: ${rows.join(' · ')}` : 'nothing named under either')
})

report()
