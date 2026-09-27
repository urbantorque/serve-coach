/**
 * Event detection and fusion (METRICS §2.4). Every detector returns candidate method estimates;
 * `fuseEvent` applies the generic rule: gate at 3σ from the median, inverse-variance weights
 * q/σ², σ inflated by √(χ²/dof), confidence 1 − Π(1 − q) (× 0.8 with one method).
 */
import { LM, type EventEstimate } from '../types.ts'
import {
  indexAt,
  localQuadratic,
  lowestFootY,
  midHip,
  midShoulder,
  pointSpeed,
  pt,
  rangeIdx,
  velocityHalfWindow,
  type PoseTrack,
} from './track.ts'

export interface MethodEstimate {
  method: string
  t: number
  sigma: number
  q: number
}

export interface FusedEvent extends EventEstimate {
  /** Methods that survived the gate. */
  used: MethodEstimate[]
  dropped: MethodEstimate[]
}

/** The generic fusion rule (§2.4). Null when no method is given. */
export function fuseEvent(methods: readonly MethodEstimate[], track: PoseTrack | null): FusedEvent | null {
  const ms = methods.filter((m) => Number.isFinite(m.t) && m.sigma > 0 && m.q > 0)
  if (!ms.length) return null
  const sorted = [...ms].sort((a, b) => a.t - b.t)
  const mid = sorted[(sorted.length - 1) >> 1]
  const used: MethodEstimate[] = []
  const dropped: MethodEstimate[] = []
  for (const m of ms) {
    if (Math.abs(m.t - mid.t) > 3 * Math.hypot(m.sigma, mid.sigma)) dropped.push(m)
    else used.push(m)
  }
  let sw = 0
  let st = 0
  for (const m of used) {
    const w = m.q / (m.sigma * m.sigma)
    sw += w
    st += w * m.t
  }
  const t = st / sw
  let sigma = Math.sqrt(1 / sw)
  if (used.length >= 2) {
    let chi2 = 0
    for (const m of used) chi2 += ((m.t - t) / m.sigma) ** 2
    const perDof = chi2 / (used.length - 1)
    if (perDof > 1) sigma *= Math.sqrt(perDof)
  }
  let confidence = 1 - used.reduce((p, m) => p * (1 - Math.min(1, m.q)), 1)
  if (used.length === 1) confidence *= 0.8
  const method = used.length >= 2 ? 'fused' : used[0].method
  return {
    frameIndex: track && track.t.length ? track.frameIndex[indexAt(track, t)] : -1,
    tReal: t,
    uncertaintyS: sigma,
    confidence,
    method,
    used,
    dropped,
  }
}

export function asEvent(e: FusedEvent | EventEstimate | null | undefined): EventEstimate | undefined {
  if (!e) return undefined
  return { frameIndex: e.frameIndex, tReal: e.tReal, uncertaintyS: e.uncertaintyS, confidence: e.confidence, method: e.method }
}

export function eventAt(track: PoseTrack, t: number, sigma: number, confidence: number, method: string): EventEstimate {
  return { frameIndex: track.t.length ? track.frameIndex[indexAt(track, t)] : -1, tReal: t, uncertaintyS: sigma, confidence, method }
}

/** Frame of reference for heights: h(y) = (yFloor − y) / H_HU. */
export interface Reference {
  yFloor: number
  bodyHeightHU: number
}

export function heightOf(ref: Reference, y: number): number {
  return (ref.yFloor - y) / ref.bodyHeightHU
}

export type WristSide = 'left' | 'right'
export const WRIST: Record<WristSide, number> = { left: LM.LEFT_WRIST, right: LM.RIGHT_WRIST }
export const FOOT_TOE: Record<WristSide, number> = { left: LM.LEFT_FOOT_INDEX, right: LM.RIGHT_FOOT_INDEX }
export const FOOT_HEEL: Record<WristSide, number> = { left: LM.LEFT_HEEL, right: LM.RIGHT_HEEL }

// ---------- release: hand method ----------

/**
 * `pose-hand-separation` (§2.4.2): the first time the ball-to-tossing-wrist distance exceeds its
 * in-hand level by 0.06 BH (+ ball radius) and keeps growing for 3 frames. Ball positions are
 * detections only (lead-in and track).
 */
export function releaseFromHand(
  track: PoseTrack,
  ref: Reference,
  wrist: WristSide,
  ball: readonly { tReal: number; x: number; y: number; radius: number }[],
  approxT: number,
): MethodEstimate | null {
  const obs = ball.filter((o) => o.tReal >= approxT - 0.35 && o.tReal <= approxT + 0.35).sort((a, b) => a.tReal - b.tReal)
  if (obs.length < 4) return null
  const bh = ref.bodyHeightHU
  const series: { t: number; d: number; v: number }[] = []
  for (const o of obs) {
    const i = indexAt(track, o.tReal)
    if (i < 0 || Math.abs(track.t[i] - o.tReal) > 0.6 * track.dt) continue
    const w = pt(track, i, WRIST[wrist], 0.3)
    if (!w) continue
    series.push({ t: o.tReal, d: Math.hypot((o.x - w.x) * track.aspect, o.y - w.y) / bh, v: w.v })
  }
  if (series.length < 4) return null
  const early = series.filter((s) => s.t <= approxT - 0.03)
  const base = early.length >= 2 ? early.map((s) => s.d).sort((a, b) => a - b)[early.length >> 1] : Math.min(...series.slice(0, 2).map((s) => s.d))
  const radiusBH = (obs[0].radius ?? 0.005) / bh
  const thr = base + 0.06 + radiusBH
  for (let k = 1; k + 3 < series.length; k++) {
    if (series[k].d > thr && series[k - 1].d <= thr && series[k + 1].d > series[k].d && series[k + 2].d > series[k + 1].d && series[k + 3].d > series[k + 2].d) {
      const f = (thr - series[k - 1].d) / (series[k].d - series[k - 1].d)
      const t = series[k - 1].t + f * (series[k].t - series[k - 1].t)
      const vis = series.slice(Math.max(0, k - 3), k + 4).reduce((a, s) => a + s.v, 0) / Math.min(series.length, 7)
      return { method: 'pose-hand-separation', t, sigma: Math.max(track.dt, 0.02), q: 0.7 * Math.min(1, vis) }
    }
  }
  return null
}

// ---------- trophy (§2.4.4) ----------

export interface TrophyResult {
  event: EventEstimate
  /** Raw lowest mid-hip time and height (used by leg drive even on the fallback). */
  lowT: number
  lowH: number
  method: 'pelvis-min' | 'toss-arm-apex'
}

/**
 * Lowest mid-hip in [release, contact − 0.08 s] (pelvis-min). Accepted when the dip below the
 * release height, and below both window edges, is ≥ 3 × the measured mid-hip noise (floor
 * 0.01 BH; the initial 0.03 BH of §2.4.4 was set for the planning noise). σ grows with the
 * flatness of the minimum: √(2·σ_h / curvature), within 45–150 ms.
 */
export function detectTrophy(track: PoseTrack, ref: Reference, releaseT: number, contactT: number, tossWrist: WristSide, noise: NoiseProfile = PLANNING_NOISE): TrophyResult | null {
  const idx = rangeIdx(track, releaseT, contactT - 0.08)
  if (idx.length < 3) return null
  const h = (i: number) => {
    const m = midHip(track, i, 0.3)
    return m ? heightOf(ref, m.y) : null
  }
  const hw = velocityHalfWindow(track)
  let lowT = Number.NaN
  let lowH = Infinity
  const smooth: { t: number; h: number }[] = []
  for (const i of idx) {
    const f = localQuadratic(track, h, track.t[i], hw)
    if (!f) continue
    smooth.push({ t: track.t[i], h: f.value })
    if (f.value < lowH) {
      lowH = f.value
      lowT = track.t[i]
    }
  }
  if (!Number.isFinite(lowT) || smooth.length < 3) return null
  let curvature = 0
  const refine = localQuadratic(track, h, lowT, 0.1)
  if (refine && refine.curvature > 0) {
    curvature = refine.curvature
    const tv = lowT - refine.slope / refine.curvature
    if (Math.abs(tv - lowT) <= 0.1 && tv >= releaseT && tv <= contactT - 0.08) {
      const d = tv - lowT
      lowH = refine.value + refine.slope * d + 0.5 * refine.curvature * d * d
      lowT = tv
    }
  }
  const hRelease = localQuadratic(track, h, releaseT, hw)?.value ?? smooth[0].h
  const edgeA = smooth[0].h
  const edgeB = smooth[smooth.length - 1].h
  const depth = Math.max(0.01, 3 * noise.hipSd)
  const vis = idx.reduce((a, i) => a + (midHip(track, i, 0)?.v ?? 0), 0) / idx.length
  if (hRelease - lowH >= depth && edgeA - lowH >= depth && edgeB - lowH >= depth) {
    const sigma = curvature > 0 ? Math.min(0.15, Math.max(0.045, Math.sqrt((2 * noise.hipSd) / curvature))) : 0.15
    return { event: eventAt(track, lowT, sigma, Math.min(1, vis), 'pelvis-min'), lowT, lowH, method: 'pelvis-min' }
  }
  // Fallback: the tossing wrist's highest point after release.
  let bestT = Number.NaN
  let bestH = -Infinity
  for (const i of rangeIdx(track, releaseT, contactT - 0.05)) {
    const w = pt(track, i, WRIST[tossWrist], 0.3)
    if (w && heightOf(ref, w.y) > bestH) {
      bestH = heightOf(ref, w.y)
      bestT = track.t[i]
    }
  }
  if (!Number.isFinite(bestT)) return null
  return { event: eventAt(track, bestT, 0.07, 0.6 * Math.min(1, vis), 'toss-arm-apex'), lowT, lowH, method: 'toss-arm-apex' }
}

// ---------- contact: wrist apex ----------

/** Hitting-wrist height maximum within ±`halfWindowS` (0.15 s, §2.4.5 `wrist-apex`) of `around`. */
export function wristApex(track: PoseTrack, ref: Reference, wrist: WristSide, around: number, betaS = 0, halfWindowS = 0.15): MethodEstimate | null {
  let bestT = Number.NaN
  let bestH = -Infinity
  let vis = 0
  for (const i of rangeIdx(track, around - halfWindowS, around + halfWindowS)) {
    const w = pt(track, i, WRIST[wrist], 0.3)
    if (w && heightOf(ref, w.y) > bestH) {
      bestH = heightOf(ref, w.y)
      bestT = track.t[i]
      vis = w.v
    }
  }
  if (!Number.isFinite(bestT)) return null
  const f = localQuadratic(track, (i) => {
    const w = pt(track, i, WRIST[wrist], 0.3)
    return w ? heightOf(ref, w.y) : null
  }, bestT, Math.max(2.5 * track.dt, 0.03), 4)
  let t = bestT
  if (f && f.curvature < 0) {
    const tv = bestT - f.slope / f.curvature
    if (Math.abs(tv - bestT) <= 1.5 * track.dt) t = tv
  }
  return { method: 'wrist-apex', t: t + betaS, sigma: 0.03 + track.dt, q: 0.5 * Math.min(1, vis) }
}

/** A wrist counts as above the head from this height (BH), as in the classification (§2.3.4). */
export const ARM_UP_BH = 0.95
/** The swing peak is searched in the last part of the chosen arm-up stretch (s); see swingPeakTime. */
export const SWING_SEARCH_S = 0.25
/** An arm-up stretch counts as the swing only if its peak is within this of the highest peak (BH). */
export const SWING_PEAK_MARGIN_BH = 0.08

/**
 * The swing peak for the fused-event check (D2), found on its own: label-free and not anchored on
 * the ball or sound estimates, so it can disagree with them. Arm-up stretches are runs of frames in
 * [from, to] with either wrist above the head (≥ ARM_UP_BH; gaps up to 0.05 s). Contact ends the
 * swing, so the swing is the LAST stretch that reaches within SWING_PEAK_MARGIN_BH of the highest
 * peak: a lower blip after it (a mislocated wrist in the follow-through; production session clip,
 * serve 3, 0.38 s late) does not count. Within that stretch the peak is the highest wrist in its last
 * SWING_SEARCH_S: the tossing arm, still up at the trophy position, can be higher earlier in the same
 * stretch. Labels are not used: relabelling itself takes the ball's contact estimate as evidence, so
 * a wrong ball estimate could otherwise drag the wrist along with it. Returns the time and the wrist
 * that was higher there, or null.
 */
export function swingPeakTime(track: PoseTrack, ref: Reference, from: number, to: number): { t: number; wrist: WristSide } | null {
  const idx = rangeIdx(track, from, to)
  const top = (i: number): { h: number; wrist: WristSide } | null => {
    const l = pt(track, i, LM.LEFT_WRIST, 0.3)
    const r = pt(track, i, LM.RIGHT_WRIST, 0.3)
    const hl = l ? heightOf(ref, l.y) : -Infinity
    const hr = r ? heightOf(ref, r.y) : -Infinity
    if (!l && !r) return null
    return hl >= hr ? { h: hl, wrist: 'left' } : { h: hr, wrist: 'right' }
  }
  type Sample = { t: number; h: number; wrist: WristSide }
  const stretches: Sample[][] = []
  for (const i of idx) {
    const v = top(i)
    if (!v || v.h < ARM_UP_BH) continue
    const s: Sample = { t: track.t[i], h: v.h, wrist: v.wrist }
    const last = stretches[stretches.length - 1]
    if (last && s.t - last[last.length - 1].t <= 0.05 + 1e-9) last.push(s)
    else stretches.push([s])
  }
  if (!stretches.length) return null
  const peakOf = (st: Sample[]) => Math.max(...st.map((x) => x.h))
  const highest = Math.max(...stretches.map(peakOf))
  const swing = [...stretches].reverse().find((st) => peakOf(st) >= highest - SWING_PEAK_MARGIN_BH)!
  const tEnd = swing[swing.length - 1].t
  let best: Sample | null = null
  for (const x of swing) if (x.t >= tEnd - SWING_SEARCH_S && (!best || x.h > best.h)) best = x
  return best ? { t: best.t, wrist: best.wrist } : null
}

/** The wrist that is higher (and nearer the ball when given) within ±0.1 s of t. */
export function hittingWristAt(track: PoseTrack, t: number, ball?: { x: number; y: number } | null): WristSide | null {
  let scoreL = 0
  let scoreR = 0
  for (const i of rangeIdx(track, t - 0.1, t + 0.1)) {
    const l = pt(track, i, LM.LEFT_WRIST, 0.3)
    const r = pt(track, i, LM.RIGHT_WRIST, 0.3)
    if (!l || !r) continue
    if (l.y < r.y) scoreL++
    else scoreR++
    if (ball) {
      const dl = Math.hypot((l.x - ball.x) * track.aspect, l.y - ball.y)
      const dr = Math.hypot((r.x - ball.x) * track.aspect, r.y - ball.y)
      if (dl < dr) scoreL += 0.5
      else scoreR += 0.5
    }
  }
  if (scoreL === 0 && scoreR === 0) return null
  return scoreL >= scoreR ? 'left' : 'right'
}

// ---------- measured noise (§5.5) ----------

/**
 * Noise of the cleaned series in a still stretch (the settled stance before the toss): the median
 * smoothed speed of the mid-hip and wrists (BH/s), and each foot's standing level and scatter (BH).
 * Detection thresholds are ≥ 3 × these (§1.2), with floors for a clean synthetic render.
 */
export interface NoiseProfile {
  hipSpeed: number
  wristSpeed: number
  footBase: Record<WristSide, number | null>
  footSd: number
  hipSd: number
}

export const PLANNING_NOISE: NoiseProfile = { hipSpeed: 0.08, wristSpeed: 0.08, footBase: { left: null, right: null }, footSd: 0.01, hipSd: 0.01 }

function sdOf(xs: number[]): number {
  if (xs.length < 2) return Number.NaN
  const m = xs.reduce((p, q) => p + q, 0) / xs.length
  return Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / (xs.length - 1))
}
function medOf(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q)
  return s.length ? s[s.length >> 1] : Number.NaN
}

export function lowestFootOf(track: PoseTrack, ref: Reference, i: number, side: WristSide): number | null {
  const a = pt(track, i, FOOT_TOE[side], 0.3)
  const b = pt(track, i, FOOT_HEEL[side], 0.3)
  const ys = [a?.y, b?.y].filter((y): y is number => y !== undefined)
  if (!ys.length) return null
  return heightOf(ref, Math.max(...ys))
}

export function measureNoise(track: PoseTrack, ref: Reference, a: number, b: number): NoiseProfile {
  const idx = rangeIdx(track, a, b)
  if (idx.length < 5) return PLANNING_NOISE
  const hw = velocityHalfWindow(track)
  const bh = ref.bodyHeightHU
  const hip: number[] = []
  const wr: number[] = []
  const hipH: number[] = []
  for (const i of idx) {
    const s = pointSpeed(track, (j) => midHip(track, j, 0.3), track.t[i], hw, bh)
    if (s !== null) hip.push(s)
    for (const w of [LM.LEFT_WRIST, LM.RIGHT_WRIST]) {
      const v = pointSpeed(track, (j) => pt(track, j, w, 0.3), track.t[i], hw, bh)
      if (v !== null) wr.push(v)
    }
    const m = midHip(track, i, 0.3)
    if (m) hipH.push(heightOf(ref, m.y))
  }
  const footBase: Record<WristSide, number | null> = { left: null, right: null }
  const sds: number[] = []
  for (const side of ['left', 'right'] as const) {
    const hs = idx.map((i) => lowestFootOf(track, ref, i, side)).filter((h): h is number => h !== null)
    if (hs.length >= 3) {
      footBase[side] = medOf(hs)
      sds.push(sdOf(hs))
    }
  }
  return {
    hipSpeed: hip.length ? medOf(hip) : PLANNING_NOISE.hipSpeed,
    wristSpeed: wr.length ? medOf(wr) : PLANNING_NOISE.wristSpeed,
    footBase,
    footSd: sds.length ? Math.max(...sds.filter(Number.isFinite), 0.003) : PLANNING_NOISE.footSd,
    hipSd: hipH.length >= 3 ? Math.max(sdOf(hipH), 0.002) : PLANNING_NOISE.hipSd,
  }
}

// ---------- motion start and setup start (§2.4.1) ----------

/**
 * motionStart: stepping back from release, the end of the last stretch ≥ 0.2 s in which the
 * tossing wrist, and the hitting wrist when visible, stayed below max(0.1 BH/s, 3 × measured
 * noise). (The 0.25 BH/s floor of §2.4.1 was set for the planning noise; the measured smoothed
 * speed noise is about 0.01 BH/s, §5.5. Requiring both hands still stops the bottom of the
 * tossing arm's swing from reading as the settled stance.)
 */
export function detectMotionStart(track: PoseTrack, ref: Reference, tossWrist: WristSide, releaseT: number, windowStart: number, noise: NoiseProfile = PLANNING_NOISE): EventEstimate {
  const hw = velocityHalfWindow(track)
  const hitWrist: WristSide = tossWrist === 'left' ? 'right' : 'left'
  const speed = (side: WristSide, t: number) => pointSpeed(track, (i) => pt(track, i, WRIST[side], 0.3), t, hw, ref.bodyHeightHU)
  const thr = Math.max(0.1, 3 * noise.wristSpeed)
  const idx = rangeIdx(track, windowStart, releaseT)
  let stillEnd = Number.NaN
  let stillStart = Number.NaN
  for (let k = idx.length - 1; k >= 0; k--) {
    const t = track.t[idx[k]]
    const s = speed(tossWrist, t)
    const h = speed(hitWrist, t)
    if (s !== null && s <= thr && (h === null || h <= thr)) {
      if (!Number.isFinite(stillEnd)) stillEnd = t
      stillStart = t
      if (stillEnd - stillStart >= 0.2) return eventAt(track, stillEnd, 0.06, 0.8, 'pose-still-end')
    } else {
      stillEnd = Number.NaN
      stillStart = Number.NaN
    }
  }
  return eventAt(track, Math.max(windowStart, releaseT - 0.8), 0.2, 0.4, 'release-minus-0.8s')
}

export function detectSetupStart(track: PoseTrack, ref: Reference, motionStartT: number, notBefore: number): EventEstimate {
  const hw = velocityHalfWindow(track)
  const lo = Math.max(notBefore, motionStartT - 6)
  const hi = motionStartT - 0.5
  const idx = rangeIdx(track, lo, hi)
  let last = Number.NaN
  for (const i of idx) {
    for (const k of [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]) {
      const f = localQuadratic(track, (j) => {
        const p = pt(track, j, k, 0.3)
        return p ? p.x * track.aspect : null
      }, track.t[i], hw)
      if (f && Math.abs(f.slope) / ref.bodyHeightHU > 0.8) last = track.t[i]
    }
  }
  const t = Number.isFinite(last) ? Math.min(hi, Math.max(lo, last + 0.2)) : lo
  return eventAt(track, t, 0.15, Number.isFinite(last) ? 0.7 : 0.5, Number.isFinite(last) ? 'pose-walk-end' : 'window-start')
}

// ---------- landing (§2.4.6) ----------

export interface LandingResult {
  event: EventEstimate
  foot: WristSide | 'both' | 'unknown'
  airborne: boolean
  /** Airborne at the contact frame (both feet lifted). */
  airborneAtContact: boolean
}

/**
 * Landing: the first foot ground contact after contact. Each foot's lowest point is measured
 * against its OWN standing level (the far foot projects higher in the picture than the near one),
 * smoothed with a local quadratic. A foot that lifts by at least max(0.012 BH, 3 × the measured
 * foot noise) after contact lands when it comes back down through 35% of its lift (the
 * hysteresis midpoint for small recreational jumps); the earliest foot wins. With no lift, the
 * landing is the contact (no step). σ = 1.5 frames + 10 ms, widened for small lifts.
 */
export function detectLanding(
  track: PoseTrack,
  ref: Reference,
  trophyT: number,
  contactT: number,
  frontFoot: WristSide | null,
  _netDir: 1 | -1,
  noise: NoiseProfile = PLANNING_NOISE,
): LandingResult | null {
  const hw = velocityHalfWindow(track)
  const minLift = Math.max(0.012, 3 * noise.footSd)
  const lift = (side: WristSide) => {
    const base = noise.footBase[side]
    return (i: number) => {
      const hgt = lowestFootOf(track, ref, i, side)
      return hgt === null ? null : hgt - (base ?? 0)
    }
  }
  const after = rangeIdx(track, contactT - 0.2, contactT + 1.0)
  if (after.length < 4) return null
  const liftAt = (side: WristSide, t: number) => localQuadratic(track, lift(side), t, Math.max(hw * 0.75, 1.6 * track.dt))?.value ?? null
  const cands: { side: WristSide; t: number; peak: number }[] = []
  for (const side of ['left', 'right'] as const) {
    const series = after.map((i) => ({ t: track.t[i], l: liftAt(side, track.t[i]) }))
    let peak = -Infinity
    let peakK = -1
    series.forEach((s, k) => {
      if (s.l !== null && s.t >= contactT - 0.2 && s.t <= contactT + 0.6 && s.l > peak) {
        peak = s.l
        peakK = k
      }
    })
    if (peakK < 0 || peak < minLift) continue
    const level = 0.35 * peak
    for (let k = peakK + 1; k < series.length; k++) {
      const a = series[k - 1].l
      const b = series[k].l
      if (a === null || b === null) continue
      if (a > level && b <= level) {
        const f = (a - level) / (a - b)
        const t = series[k - 1].t + f * (series[k].t - series[k - 1].t)
        if (t > contactT) cands.push({ side, t, peak })
        break
      }
    }
  }
  // Airborne at contact: both feet lifted above the plant band.
  const plant = Math.max(0.01, 2 * noise.footSd)
  const liftedAtContact = (['left', 'right'] as const).map((side) => {
    const l = liftAt(side, contactT)
    return l !== null && l > plant
  })
  const airborneAtContact = liftedAtContact.every(Boolean)
  const sigmaBase = 1.5 * track.dt + 0.01
  const vis = (t: number) => {
    const i = indexAt(track, t)
    return Math.max(pt(track, i, LM.LEFT_FOOT_INDEX, 0)?.v ?? 0, pt(track, i, LM.RIGHT_FOOT_INDEX, 0)?.v ?? 0)
  }
  void trophyT
  if (cands.length) {
    cands.sort((a, b) => a.t - b.t)
    const c = cands[0]
    const small = c.peak < 0.03
    const sigma = small ? sigmaBase + 0.02 : sigmaBase
    return { event: eventAt(track, c.t, sigma, Math.min(1, vis(c.t)) * (small ? 0.7 : 1), 'foot-contact'), foot: c.side, airborne: airborneAtContact, airborneAtContact }
  }
  return { event: eventAt(track, contactT, sigmaBase * 2, 0.5, 'no-step'), foot: frontFoot ?? 'unknown', airborne: false, airborneAtContact }
}

/** Rear view: the first time after contact a foot becomes stationary after moving (§2.4.6). */
export function detectLandingRear(track: PoseTrack, ref: Reference, contactT: number): LandingResult | null {
  const hw = velocityHalfWindow(track)
  for (const side of ['left', 'right'] as const) {
    let moved = false
    let still = 0
    for (const i of rangeIdx(track, contactT, contactT + 1.0)) {
      const s = pointSpeed(track, (j) => pt(track, j, FOOT_TOE[side], 0.3), track.t[i], hw, ref.bodyHeightHU)
      if (s === null) continue
      if (s > 0.6) moved = true
      if (moved && s <= 0.3) {
        still++
        if (still >= 3) {
          const t = track.t[i] - 2 * track.dt
          return { event: eventAt(track, t, 2 * track.dt + 0.01, 0.64, 'foot-stationary'), foot: side, airborne: false, airborneAtContact: false }
        }
      } else still = 0
    }
  }
  return null
}

// ---------- recovery end (§2.4.7) ----------

/**
 * The start of the first ≥ 0.3 s stable window after landing: both feet within the plant band
 * of their own standing level, smoothed pelvis speed ≤ max(0.05 BH/s, 3 × measured noise) and
 * trunk lean ≤ 20°. Else landing + 1.5 s with confidence 0.3 ('timeout').
 */
export function detectRecoveryEnd(track: PoseTrack, ref: Reference, landingT: number, noise: NoiseProfile = PLANNING_NOISE): EventEstimate {
  const hw = velocityHalfWindow(track)
  const idx = rangeIdx(track, landingT, landingT + 2.5)
  const thr = Math.max(0.05, 3 * noise.hipSpeed)
  const band = Math.max(0.03, 4 * noise.footSd)
  let runStart = Number.NaN
  for (const i of idx) {
    const t = track.t[i]
    const hipSpeed = pointSpeed(track, (j) => midHip(track, j, 0.3), t, hw, ref.bodyHeightHU)
    const lf = lowestFootOf(track, ref, i, 'left')
    const rf = lowestFootOf(track, ref, i, 'right')
    const lOk = lf === null || lf - (noise.footBase.left ?? 0) < band
    const rOk = rf === null || rf - (noise.footBase.right ?? 0) < band
    const hip = midHip(track, i, 0.3)
    const sh = midShoulder(track, i, 0.3)
    const lean = hip && sh ? (Math.abs(Math.atan2((sh.x - hip.x) * track.aspect, hip.y - sh.y)) * 180) / Math.PI : 90
    const ok = hipSpeed !== null && hipSpeed <= thr && lOk && rOk && lean <= 20
    if (ok) {
      if (!Number.isFinite(runStart)) runStart = t
      if (t - runStart >= 0.3) return eventAt(track, runStart, 0.12, 0.7, 'pose-stable')
    } else runStart = Number.NaN
  }
  const last = track.t.length ? track.t[track.t.length - 1] : landingT
  return eventAt(track, Math.min(landingT + 1.5, Math.max(landingT, last)), 0.12, 0.3, 'timeout')
}

/** Lowest-foot floor row median over [a, b]. */
export function floorRow(track: PoseTrack, a: number, b: number, bodyHeightHU?: number): { y: number; n: number } | null {
  const ys: number[] = []
  for (const i of rangeIdx(track, a, b)) {
    const y = lowestFootY(track, i, 0.5, bodyHeightHU)
    if (y !== null) ys.push(y)
  }
  if (!ys.length) return null
  ys.sort((p, q) => p - q)
  return { y: ys[ys.length >> 1], n: ys.length }
}
