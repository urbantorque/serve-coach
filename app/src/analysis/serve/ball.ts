/**
 * Ball evidence for one serve window: the toss track and its lead-in, re-analysed on rectified
 * coordinates with the ball layer's analyseToss; the apex case of §2.4.3 (bracketed, fitted above
 * the frame, right-censored, too few samples); and the two ball methods for contact (§2.4.5):
 * `ball-intersection` (the outgoing line meets the toss parabola) and `ball-bracket` (the gap
 * between the last on-parabola frame and the first off-parabola evidence).
 */
import { analyseToss, gravityAccelerationPrior, type TossAnalysis } from '../ball/toss.ts'
import { scaleFromBodyHeight } from '../ball/scale.ts'
import { fitPolynomial } from '../ball/fit.ts'
import type { BallObservation, BallTrack } from '../types.ts'
import { rectifyPoint, unrectifyPoint, type CameraModel } from './geometry.ts'

export type ApexCase = 'bracketed' | 'fitted-above' | 'censored' | 'too-few' | 'none'

export interface Parabola {
  a: number
  b: number
  c: number
  /** x(t) = xa t² + xb t + xc (rectified normalised x), fitted to the inliers. */
  xa: number
  xb: number
  xc: number
}

export interface ServeBall {
  toss: TossAnalysis | null
  tossTrack: BallTrack | null
  outgoing: BallTrack | null
  parabola: Parabola | null
  apexCase: ApexCase
  /** Seconds between the last detection before and the first after the apex (above-frame case). */
  apexGapS?: number
  /** Detections before / after the apex on the parabola. */
  branchCounts?: [number, number]
  /** Rectified y of the frame top at the apex column (the censoring bound). */
  frameTopY?: number
  /** Median detection radius (normalised). */
  radius?: number
  /** Last on-parabola detection after the apex and the first off-parabola evidence. */
  lastOnT?: number
  firstOff?: { t: number; kind: 'outgoing' | 'missing' }
  /** Detections per free-flight frame (ball-visibility check). */
  visibility?: number
  /**
   * With no outgoing ball: the rectified y of the last on-parabola detection after the apex (the
   * lowest point the ball was seen on its path). Below 0.8 BH it is a swing and miss (§2.3.4).
   */
  continuesBelowY?: number
  detections: number
}

export interface ContactMethod {
  method: 'ball-intersection' | 'ball-bracket'
  t: number
  sigma: number
  q: number
}

export function yOf(p: Parabola, t: number): number {
  return p.a * t * t + p.b * t + p.c
}
export function xOf(p: Parabola, t: number): number {
  return p.xa * t * t + p.xb * t + p.xc
}

function rectObs(cam: CameraModel, o: BallObservation): BallObservation {
  const r = rectifyPoint(cam, o.x, o.y)
  return { ...o, x: r.x, y: r.y }
}

function periodOf(obs: readonly BallObservation[]): number {
  const steps: number[] = []
  const s = [...obs].sort((a, b) => a.tReal - b.tReal)
  for (let i = 1; i < s.length; i++) {
    const df = s[i].frameIndex - s[i - 1].frameIndex
    if (df > 0) steps.push((s[i].tReal - s[i - 1].tReal) / df)
  }
  steps.sort((a, b) => a - b)
  return steps.length ? steps[steps.length >> 1] : Number.NaN
}

/** Follows the ball backwards from the first track detection into the hand (like the tracker's lead-in). */
export function followLeadIn(track: BallTrack, all: readonly BallObservation[], maxS = 0.5): BallObservation[] {
  const det = track.observations.filter((o) => o.source !== 'predicted').sort((a, b) => a.tReal - b.tReal)
  if (det.length < 2) return []
  const byFrame = new Map<number, BallObservation[]>()
  for (const o of all) {
    if (o.source === 'predicted') continue
    const list = byFrame.get(o.frameIndex)
    if (list) list.push(o)
    else byFrame.set(o.frameIndex, [o])
  }
  const r = det[0].radius
  let pos = { x: det[0].x, y: det[0].y, t: det[0].tReal }
  let vel = { x: (det[1].x - det[0].x) / (det[1].tReal - det[0].tReal), y: (det[1].y - det[0].y) / (det[1].tReal - det[0].tReal) }
  const chain: BallObservation[] = []
  let misses = 0
  for (let f = det[0].frameIndex - 1; f >= 0; f--) {
    const cands = byFrame.get(f)
    const t = cands?.[0]?.tReal
    if (t === undefined) {
      if (++misses > 2) break
      continue
    }
    if (pos.t - t > maxS) break
    const dt = pos.t - t
    const px = pos.x - vel.x * dt
    const py = pos.y - vel.y * dt
    const gate = 3 * r + 0.5 * Math.hypot(vel.x, vel.y) * dt
    let best: BallObservation | null = null
    let bestD = Infinity
    for (const c of cands!) {
      const d = Math.hypot(c.x - px, c.y - py)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    if (best && bestD < gate && !det.includes(best)) {
      vel = { x: 0.5 * vel.x + 0.5 * ((pos.x - best.x) / dt), y: 0.5 * vel.y + 0.5 * ((pos.y - best.y) / dt) }
      pos = { x: best.x, y: best.y, t: best.tReal }
      chain.push(best)
      misses = 0
    } else if (++misses > 2) break
  }
  return chain.reverse()
}

export interface ServeBallInput {
  cam: CameraModel
  window: { start: number; end: number }
  tracks: readonly BallTrack[]
  observations: readonly BallObservation[]
  /** Ball-layer toss results (unrectified), used only when no toss track is given. */
  tossResults: readonly TossAnalysis[]
  /** Standing height (HU, rectified) and the entered height, for the gravity check and prior. */
  bodyHeightHU: number
  playerHeightM: number
  playerHeightEntered: boolean
  /** Real time known (proven, or gravity-consistent normal clip): allows the gravity prior. */
  realTime: boolean
}

/** Toss and outgoing evidence for one serve window, re-analysed in rectified coordinates. */
export function analyseServeBall(input: ServeBallInput): ServeBall {
  const { cam, window } = input
  const inWindow = (t: number) => t >= window.start - 1e-6 && t <= window.end + 1e-6
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[s.length >> 1] : Number.NaN
  }
  const tossTracks = input.tracks
    .filter((tr) => tr.kind === 'toss' && tr.observations.length > 0 && inWindow(median(tr.observations.map((o) => o.tReal))))
    .sort((a, b) => b.observations.length - a.observations.length)
  const empty: ServeBall = { toss: null, tossTrack: null, outgoing: null, parabola: null, apexCase: 'none', detections: 0 }
  const raw = tossTracks[0]
  if (!raw) {
    // Fall back to a ball-layer toss result in the window (not rectified; no track).
    const res = input.tossResults.find((r) => r.status === 'ok' && r.apex && inWindow(r.apex.tReal))
    if (!res?.fit) return empty
    // Its points are in raw image coordinates: rectify them like every other ball point (the apex,
    // the release, and the parabola shifted with the apex, a close approximation for small tilts).
    const apex = rectifyPoint(cam, res.apex!.x, res.apex!.y)
    const dy = apex.y - res.apex!.y
    const release = res.release ? { ...res.release, ...rectifyPoint(cam, res.release.x, res.release.y) } : res.release
    const toss: TossAnalysis = { ...res, apex: { ...res.apex!, x: apex.x, y: apex.y }, release }
    return { ...empty, toss, parabola: { a: res.fit.a, b: res.fit.b, c: res.fit.c + dy, xa: 0, xb: 0, xc: apex.x }, apexCase: res.apex!.aboveFrame ? 'censored' : res.apex!.bracketed ? 'bracketed' : 'too-few', detections: res.fit.detections }
  }
  const leadIn = followLeadIn(raw, input.observations).map((o) => rectObs(cam, o))
  const track: BallTrack = { ...raw, observations: raw.observations.map((o) => rectObs(cam, o)) }
  const scale = input.bodyHeightHU > 0 ? scaleFromBodyHeight(input.bodyHeightHU, 0.03, input.playerHeightEntered ? input.playerHeightM : null) : null
  const toss = analyseToss(track, leadIn, {
    aspect: cam.aspect,
    scale,
    accelerationPrior: input.realTime && scale ? gravityAccelerationPrior(scale) : undefined,
  })
  // The release fit needs the ball in the hand before free flight (the lead-in). When the caller
  // passed only track observations (no candidates to follow back), the ball layer's own release,
  // computed with the tracker's lead-in, is the better estimate: keep its time, rectify its point.
  if (leadIn.length === 0 && toss.status === 'ok' && toss.release) {
    const given = input.tossResults.find((r) => r.status === 'ok' && r.release && r.apex && Math.abs(r.apex.tReal - (toss.apex?.tReal ?? Infinity)) < 0.05)
    if (given?.release && /hinge/.test(given.release.method)) {
      const p = rectifyPoint(cam, given.release.x, given.release.y)
      toss.release = { ...given.release, x: p.x, y: p.y, confidence: Math.min(given.release.confidence, toss.confidence) }
    }
  }
  const det = track.observations.filter((o) => o.source !== 'predicted').sort((a, b) => a.tReal - b.tReal)
  const radius = median(det.map((o) => o.radius))
  const out: ServeBall = { ...empty, toss, tossTrack: track, radius, detections: det.length }
  if (toss.status !== 'ok' || !toss.fit || !toss.apex) return { ...out, apexCase: det.length >= 3 ? 'too-few' : 'none' }

  // Inliers on the final parabola (absolute-time coefficients from analyseToss).
  const { a, b, c } = toss.fit
  const resid = (o: BallObservation) => Math.abs(o.y - (a * o.tReal * o.tReal + b * o.tReal + c))
  const tol = Math.max(3 * toss.fit.rmse, 0.6 * radius, 0.002)
  const inliers = det.filter((o) => o.tReal >= toss.fit!.tStart - 1e-6 && resid(o) <= tol)
  // x(t): the tracker's linear model (the toss drifts slowly across the image).
  const xl = inliers.length >= 2 ? fitPolynomial(inliers.map((o) => o.tReal), inliers.map((o) => o.x), 1) : null
  const xb = xl ? xl.coeffs[1] : 0
  const xc = xl ? xl.coeffs[0] - xl.coeffs[1] * xl.t0 : toss.apex.x
  const parabola: Parabola = { a, b, c, xa: 0, xb, xc }
  out.parabola = parabola

  // Apex case (§2.4.3).
  const tA = toss.apex.tReal
  const before = inliers.filter((o) => o.tReal < tA)
  const after = inliers.filter((o) => o.tReal > tA)
  out.branchCounts = [before.length, after.length]
  const lastBefore = before[before.length - 1]
  const firstAfter = after[0]
  const period = periodOf(det)
  const gap = lastBefore && firstAfter ? firstAfter.tReal - lastBefore.tReal : Number.POSITIVE_INFINITY
  out.apexGapS = gap
  const rawApex = unrectifyPoint(cam, toss.apex.x, toss.apex.y)
  const top = rectifyPoint(cam, rawApex.x, 0)
  out.frameTopY = top.y
  const aboveFrame = rawApex.y < 0 || toss.apex.aboveFrame
  if (!aboveFrame) {
    out.apexCase = before.length >= 3 && after.length >= 3 ? 'bracketed' : before.length >= 2 && after.length >= 2 ? 'bracketed' : 'too-few'
  } else {
    const fittable = before.length >= 3 && after.length >= 3 && gap <= 0.65 && input.realTime
    out.apexCase = fittable ? 'fitted-above' : 'censored'
  }

  // Free-flight visibility: detections per frame between the first inlier and the last on-parabola one.
  if (inliers.length >= 2 && period > 0) {
    const frames = Math.round((inliers[inliers.length - 1].tReal - inliers[0].tReal) / period) + 1
    const aboveFrames = aboveFrame && Number.isFinite(gap) ? Math.max(0, Math.round(gap / period) - 1) : 0
    out.visibility = Math.min(1, inliers.length / Math.max(1, frames - aboveFrames))
  }

  // Contact evidence: last on-parabola detection after the apex, first off-parabola evidence.
  const lastOn = after.length ? after[after.length - 1] : undefined
  out.lastOnT = lastOn?.tReal
  const outgoing = input.tracks
    .filter((tr) => tr.kind === 'outgoing' && tr.observations.length > 0)
    .map((tr) => ({ ...tr, observations: tr.observations.map((o) => rectObs(cam, o)).sort((p, q) => p.tReal - q.tReal) }))
    .filter((tr) => tr.observations[0].tReal > tA && tr.observations[0].tReal <= Math.min(window.end, tA + 1.0))
    .sort((p, q) => p.observations[0].tReal - q.observations[0].tReal)[0]
  out.outgoing = outgoing ?? null
  if (lastOn && outgoing) {
    const firstOut = outgoing.observations.find((o) => o.source !== 'predicted' && o.tReal > lastOn.tReal)
    if (firstOut && firstOut.tReal - lastOn.tReal <= 0.2) out.firstOff = { t: firstOut.tReal, kind: 'outgoing' }
  }
  if (lastOn && !out.firstOff) {
    // No outgoing ball. How far the ball stayed on its path: the last on-parabola detection after the
    // apex (every later detection on the path is itself an inlier, so this is the lowest point seen).
    // Below 0.8 BH with no hit sound, the serve is a swing and miss (§2.3.4, analyse.ts).
    out.continuesBelowY = lastOn.y
    if (period > 0) {
      // The ball vanished from its predicted parabola. Weak evidence (the detector can miss a ball);
      // used only with a lower quality, and gated by the other contact methods.
      const tNext = lastOn.tReal + period
      const yPred = parabola.a * tNext * tNext + parabola.b * tNext + parabola.c
      if (yPred < 0.97) out.firstOff = { t: tNext, kind: 'missing' }
    }
  }
  return out
}

/** `ball-bracket` (§2.4.5): midpoint of the gap, σ = gap·√(1/12 + 1/16), q ≤ 0.7. */
export function ballBracketContact(ball: ServeBall, period: number, betaOccS = 0): ContactMethod | null {
  if (ball.lastOnT === undefined || !ball.firstOff) return null
  const gap = ball.firstOff.t - ball.lastOnT
  if (!(gap > 0)) return null
  const gapFrames = Math.max(1, gap / period)
  const sigma = gap * Math.sqrt(1 / 12 + 1 / 16)
  const q = Math.min(0.7, 0.7 / gapFrames) * (ball.firstOff.kind === 'missing' ? 0.5 : 1)
  return { method: 'ball-bracket', t: (ball.lastOnT + ball.firstOff.t) / 2 + betaOccS, sigma: ball.firstOff.kind === 'missing' ? Math.hypot(sigma, 0.5 * period) : sigma, q }
}

/**
 * `ball-intersection` (§2.4.5): the back-extrapolated outgoing line (≥ 2 detections within 60 ms
 * after the last on-parabola frame) comes closest to the toss parabola. σ from the position noise
 * over the closing speed; q = min(1, n/4) × fit quality.
 */
export function ballIntersectionContact(ball: ServeBall, aspect: number): ContactMethod | null {
  if (!ball.outgoing || !ball.parabola || ball.lastOnT === undefined) return null
  const p = ball.parabola
  const obs = ball.outgoing.observations.filter((o) => o.source !== 'predicted' && o.tReal > ball.lastOnT! && o.tReal <= ball.lastOnT! + 0.06 + 1e-6)
  if (obs.length < 2) return null
  const use = obs.slice(0, 4)
  // Linear fit x(t), y(t).
  const mt = use.reduce((s, o) => s + o.tReal, 0) / use.length
  const mx = use.reduce((s, o) => s + o.x, 0) / use.length
  const my = use.reduce((s, o) => s + o.y, 0) / use.length
  let stt = 0
  let stx = 0
  let sty = 0
  for (const o of use) {
    stt += (o.tReal - mt) ** 2
    stx += (o.tReal - mt) * (o.x - mx)
    sty += (o.tReal - mt) * (o.y - my)
  }
  if (!(stt > 0)) return null
  const vx = stx / stt
  const vy = sty / stt
  // Residual of the line fit (normalised), for quality.
  let rss = 0
  for (const o of use) rss += ((o.x - (mx + vx * (o.tReal - mt))) * aspect) ** 2 + (o.y - (my + vy * (o.tReal - mt))) ** 2
  const lineRms = use.length > 2 ? Math.sqrt(rss / (use.length - 2)) : 0
  const lo = ball.lastOnT - 0.05
  const hi = use[0].tReal
  let bestT = Number.NaN
  let bestD = Infinity
  for (let t = lo; t <= hi; t += 0.0002) {
    const dx = (xOf(p, t) - (mx + vx * (t - mt))) * aspect
    const dy = yOf(p, t) - (my + vy * (t - mt))
    const d = Math.hypot(dx, dy)
    if (d < bestD) {
      bestD = d
      bestT = t
    }
  }
  if (!Number.isFinite(bestT)) return null
  const vxT = (2 * p.xa * bestT + p.xb) * aspect
  const vyT = 2 * p.a * bestT + p.b
  const closing = Math.hypot(vx * aspect - vxT, vy - vyT)
  const r = ball.radius ?? 0.005
  const posSigma = Math.hypot(0.3 * r, lineRms)
  const sigma = Math.max(0.0005, posSigma / Math.max(closing, 1e-6) + 0.001)
  // A large miss distance means the paths never met: low quality.
  const missQ = Math.max(0, 1 - bestD / (6 * r))
  const q = Math.min(1, use.length / 4) * missQ * (lineRms < 2 * r ? 1 : 0.5)
  if (q <= 0) return null
  return { method: 'ball-intersection', t: bestT, sigma, q }
}
