/**
 * `repeatability` (METRICS §3.17, experimental): time-normalised 7-point trajectories (event-anchored
 * samples), a pointwise median reference, per-serve noise-corrected RMS deviations and the index
 * R = 100·exp(−median(d)/τ). The serve closest to the reference is the representative serve.
 */
import { LM } from '../types.ts'
import type { ServeCore } from '../serve/analyse.ts'
import { heightOf, WRIST } from '../serve/events.ts'
import { xOf, yOf } from '../serve/ball.ts'
import { indexAt, midHip, midShoulder, pt, type PoseTrack } from '../serve/track.ts'
import { bootstrapPercentile } from '../stats/intervals.ts'
import { median } from '../stats/descriptive.ts'

/** τ (BH): initial value; sets the scale only. */
export const REPEATABILITY_TAU_BH = 0.06
/** Cleaned pose noise per point (BH), planning value (§1.2). */
export const POSE_NOISE_BH = 0.02

type P = { x: number; y: number } | null

function sampleTimes(core: ServeCore): number[] | null {
  const r = core.events.tossRelease?.tReal
  const tr = core.events.trophy?.event.tReal
  const c = core.events.contact?.tReal
  if (r === undefined || tr === undefined || c === undefined || !(tr > r) || !(c > tr)) return null
  const out: number[] = []
  for (let k = 0; k < 20; k++) out.push(r + ((tr - r) * k) / 20)
  for (let k = 0; k < 20; k++) out.push(tr + ((c - tr) * k) / 20)
  for (let k = 0; k < 10; k++) out.push(c + (0.25 * k) / 9)
  return out
}

function interp(track: PoseTrack, t: number, get: (i: number) => P): P {
  const i = indexAt(track, t)
  if (i < 0) return null
  const j = track.t[i] <= t ? Math.min(track.t.length - 1, i + 1) : Math.max(0, i - 1)
  const a = get(Math.min(i, j))
  const b = get(Math.max(i, j))
  if (!a || !b) return a ?? b
  const ta = track.t[Math.min(i, j)]
  const tb = track.t[Math.max(i, j)]
  const f = tb > ta ? (t - ta) / (tb - ta) : 0
  return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }
}

/** Trajectory in BH relative to S0 (PPF orientation by netDir): [sample][point] or null. */
export function serveTrajectory(core: ServeCore, track: PoseTrack): (P)[][] | null {
  const ts = sampleTimes(core)
  if (!ts || !core.ref || !core.s0) return null
  const ref = core.ref
  const s0 = core.s0
  const bh = ref.bodyHeightHU
  const toBH = (p: P): P => (p ? { x: (core.netDir * (p.x - s0.x) * track.aspect) / bh, y: heightOf(ref, p.y) } : null)
  const hitElbow = core.hitWrist === 'left' ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW
  const getters: ((i: number) => P)[] = [
    (i) => pt(track, i, WRIST[core.hitWrist], 0.5),
    (i) => pt(track, i, WRIST[core.tossWrist], 0.5),
    (i) => pt(track, i, hitElbow, 0.5),
    (i) => midShoulder(track, i, 0.5),
    (i) => midHip(track, i, 0.5),
    (i) => pt(track, i, LM.NOSE, 0.5),
  ]
  const c = core.events.contact!.tReal
  const par = core.ball.parabola
  return ts.map((t) => {
    const pts: P[] = getters.map((g) => toBH(interp(track, t, g)))
    pts.push(par && t <= c ? toBH({ x: xOf(par, t), y: yOf(par, t) }) : null)
    return pts
  })
}

export interface RepeatabilityResult {
  index: number
  ci95: [number, number] | null
  deviations: { serveIndex: number; d: number }[]
  representativeServeIndex: number
  n: number
}

/**
 * Repeatability over the serves of one stratum (n ≥ 5), with a seeded bootstrap interval. The
 * representative serve is the one closest to the reference among the `preferred` serves (clean
 * events, COACHING §8.1) when any is, else among all.
 */
export function repeatability(trajectories: { serveIndex: number; traj: P[][]; preferred?: boolean }[], seed: string | number = 'repeatability'): RepeatabilityResult | null {
  const n = trajectories.length
  if (n < 5) return null
  const S = trajectories[0].traj.length
  const K = trajectories[0].traj[0].length
  const refX: (number | null)[][] = []
  const refY: (number | null)[][] = []
  for (let s = 0; s < S; s++) {
    refX.push([])
    refY.push([])
    for (let k = 0; k < K; k++) {
      const xs = trajectories.map((t) => t.traj[s][k]?.x).filter((v): v is number => v !== undefined)
      const ys = trajectories.map((t) => t.traj[s][k]?.y).filter((v): v is number => v !== undefined)
      refX[s].push(xs.length >= 3 ? median(xs) : null)
      refY[s].push(ys.length >= 3 ? median(ys) : null)
    }
  }
  const sigmaN = POSE_NOISE_BH * Math.sqrt(1 + 1 / n)
  const deviations = trajectories.map(({ serveIndex, traj, preferred }) => {
    let ss = 0
    let m = 0
    for (let s = 0; s < S; s++)
      for (let k = 0; k < K; k++) {
        const p = traj[s][k]
        const rx = refX[s][k]
        const ry = refY[s][k]
        if (!p || rx === null || ry === null) continue
        ss += (p.x - rx) ** 2 + (p.y - ry) ** 2
        m++
      }
    const d = m ? Math.sqrt(ss / m) : Number.NaN
    return { serveIndex, d, dc: Math.sqrt(Math.max(d * d - sigmaN * sigmaN, 0)), preferred: preferred !== false }
  })
  const ok = deviations.filter((d) => Number.isFinite(d.d))
  if (ok.length < 5) return null
  const idx = (ds: number[]) => 100 * Math.exp(-median(ds) / REPEATABILITY_TAU_BH)
  const values = ok.map((d) => d.dc)
  const boot = bootstrapPercentile(values, idx, 0.95, { seed, resamples: 1000 })
  const candidates = ok.some((d) => d.preferred) ? ok.filter((d) => d.preferred) : ok
  const rep = candidates.reduce((a, b) => (b.d < a.d ? b : a))
  return {
    index: idx(values),
    ci95: Number.isFinite(boot.low) ? [boot.low, boot.high] : null,
    deviations: ok.map((d) => ({ serveIndex: d.serveIndex, d: d.d })),
    representativeServeIndex: rep.serveIndex,
    n: ok.length,
  }
}
