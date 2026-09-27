/**
 * Pass A -> Pass B planning (ARCHITECTURE §5.3 windows, §5.4 dense analysis). Pure.
 *
 * findServeWindows (engine-core) returns real-time spans. Here they become frame ranges (so a
 * later time-base correction cannot shift them), with:
 *   - a provisional contact time: the hitting wrist's highest point in the sparse poses (parabolic
 *     refinement), replaced by the strongest hit sound nearby when hit-sound timing is on;
 *   - the core range [contact - 1.6 s, contact + 0.6 s] (release to landing) where pose runs at
 *     full rate, and every 3rd frame outside it (every 2nd inside for 240 fps capture);
 *   - the ball range [contact - 1.9 s, contact + 0.6 s]: the toss starts at most 1.6 s before
 *     contact (plausibility bound), plus room for the detector's running background;
 *   - the ball crop: the player's box widened by 0.6 statures, up to the frame top (toss) and
 *     1.5 statures into the court (outgoing ball), as in §5.3 `roi`;
 *   - the post-contact corridor (side view): forward of the contact point, from 0.4 statures
 *     above it to 1.2 below, where a serve leaves within about 15 deg of horizontal.
 */
import { LM, type AudioOnset, type CameraView, type Handedness, type Landmark, type PoseFrame } from '../types.ts'
import type { RegionOfInterest } from '../ball/scale.ts'
import type { NormRect } from '../ball/workerCore.ts'

export interface EngineWindow {
  startReal: number
  endReal: number
  confidence: number
}

export interface ProvisionalContact {
  tReal: number
  frameIndex: number
  /** Half-width of doubt used for the ball search phases (s). */
  uncertaintyS: number
  source: 'pose' | 'audio' | 'window'
  /** Normalised image point of the hitting wrist at its highest (pose source only). */
  wrist?: { x: number; y: number }
}

export interface PlannedWindow {
  /** 0-based order. */
  index: number
  confidence: number
  startFrame: number
  endFrame: number
  coreStartFrame: number
  coreEndFrame: number
  ballStartFrame: number
  ballEndFrame: number
  contact: ProvisionalContact
  /** Stature in frame-height units from the sparse poses (0 when unknown). */
  statureNorm: number
  /** +1: the court is to the right of the player in the image; -1 to the left; 0 unknown. */
  forward: 1 | -1 | 0
  /** Ball crop (full-frame normalised). */
  crop: NormRect
  /** Post-contact corridor (full-frame normalised); null outside the side view or when unknown. */
  corridor: RegionOfInterest | null
}

export const CORE_BEFORE_S = 1.6
export const CORE_AFTER_S = 0.6
export const BALL_BEFORE_S = 1.9
export const BALL_AFTER_S = 0.6

/** Frame index whose real time is nearest `t` (times ascending). */
export function frameAt(times: ArrayLike<number>, t: number): number {
  const n = times.length
  if (n === 0) return 0
  let lo = 0
  let hi = n - 1
  if (t <= times[0]) return 0
  if (t >= times[hi]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid
  }
  return t - times[lo] <= times[hi] - t ? lo : hi
}

const visible = (l: Landmark | undefined, min = 0.3): l is Landmark => !!l && l.visibility >= min && Number.isFinite(l.x) && Number.isFinite(l.y)

function hittingWrist(handedness: Handedness): number {
  return handedness === 'right' ? LM.RIGHT_WRIST : LM.LEFT_WRIST
}

function midHip(landmarks: Landmark[]): { x: number; y: number } | null {
  const a = landmarks[LM.LEFT_HIP]
  const b = landmarks[LM.RIGHT_HIP]
  if (!visible(a) || !visible(b)) return null
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Longest gap (s) inside one arm-above-head run. */
const RUN_GAP_S = 0.3
/** Contact is the end of the upward swing: searched in the last part of the final run (s). */
const CONTACT_SEARCH_S = 0.6

/**
 * Provisional contact from pose: the highest wrist point (smallest y) in the last CONTACT_SEARCH_S
 * of the final arm-above-head run, refined with a parabola through its neighbours.
 *
 * Side-view left/right labels are unreliable (MediaPipe mirrors the whole body in about a third of
 * side-view frames, validation smoke summary), so both wrists count: the tossing arm is up first
 * (release to trophy), the hitting arm last (the swing to contact), and the run ends as the arm
 * comes down after contact. The handedness label is only a tie-breaker. Null when no wrist rises
 * above the head in the span.
 *
 * Noise guard (session clip, player at 6 m: the wrist clears the nose by only ~3% of the frame at
 * contact, and a lone mislocated wrist 0.5 s later made a one-sample "last run"): a wrist must clear
 * the nose by a tenth of the nose-to-hip distance, and a one-sample run is ignored when a longer
 * run exists.
 */
export function wristPeak(poses: readonly PoseFrame[], handedness: Handedness): { tReal: number; x: number; y: number } | null {
  const hitting = hittingWrist(handedness)
  const other = hitting === LM.RIGHT_WRIST ? LM.LEFT_WRIST : LM.RIGHT_WRIST
  const up: { t: number; x: number; y: number }[] = []
  for (const p of poses) {
    const l = p.landmarks
    if (!l || !visible(l[LM.NOSE])) continue
    const hip = midHip(l)
    const margin = hip ? 0.1 * Math.max(0, hip.y - l[LM.NOSE].y) : 0
    let best: Landmark | null = null
    for (const k of [hitting, other]) {
      const w = l[k]
      if (!visible(w) || w.y >= l[LM.NOSE].y - margin) continue
      // The hitting label wins ties within 1% of the frame height.
      if (!best || w.y < best.y - (k === hitting ? -0.01 : 0.01)) best = w
    }
    if (best) up.push({ t: p.tReal, x: best.x, y: best.y })
  }
  if (up.length === 0) return null
  // Runs of above-head samples; the last run of two or more samples (a lone one only if nothing else).
  const runs: { t: number; x: number; y: number }[][] = []
  for (const s of up) {
    const run = runs[runs.length - 1]
    if (run && s.t - run[run.length - 1].t <= RUN_GAP_S) run.push(s)
    else runs.push([s])
  }
  const run = [...runs].reverse().find((r) => r.length >= 2) ?? runs[runs.length - 1]
  const runEnd = run[run.length - 1].t
  const samples = run.filter((s) => s.t >= runEnd - CONTACT_SEARCH_S)
  let best = 0
  for (let i = 1; i < samples.length; i++) if (samples[i].y < samples[best].y) best = i
  const s = samples[best]
  if (best > 0 && best < samples.length - 1) {
    const a = samples[best - 1]
    const c = samples[best + 1]
    // Vertex of the parabola through three (t, y) points: y'(t) = d1 at the first midpoint and
    // y'' = 2A = curvature, so y' = 0 at midpoint - d1 / curvature. Kept inside the bracket.
    const d1 = (s.y - a.y) / (s.t - a.t)
    const d2 = (c.y - s.y) / (c.t - s.t)
    const curvature = (d2 - d1) / ((c.t - a.t) / 2)
    if (curvature > 0) {
      const tv = (s.t + a.t) / 2 - d1 / curvature
      if (tv > a.t && tv < c.t) return { tReal: tv, x: s.x, y: s.y }
    }
  }
  return { tReal: s.t, x: s.x, y: s.y }
}

/** Standing stature (frame heights) from nose-to-ankle spans, with head allowance; 0 when unknown. */
export function statureFromPoses(poses: readonly PoseFrame[]): number {
  const spans: number[] = []
  for (const p of poses) {
    const l = p.landmarks
    if (!l || !visible(l[LM.NOSE])) continue
    const feet = [l[LM.LEFT_HEEL], l[LM.RIGHT_HEEL], l[LM.LEFT_ANKLE], l[LM.RIGHT_ANKLE]].filter((f) => visible(f))
    if (feet.length === 0) continue
    const floor = Math.max(...feet.map((f) => f.y))
    spans.push(floor - l[LM.NOSE].y)
  }
  if (spans.length === 0) return 0
  spans.sort((a, b) => a - b)
  // Upper quartile: the standing frames, not the crouch; nose-to-floor is about 0.93 of stature.
  return spans[Math.floor(spans.length * 0.75)] / 0.93
}

/** Box of all visible landmarks over the poses (normalised), or null. */
export function playerBox(poses: readonly PoseFrame[]): RegionOfInterest | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of poses) {
    for (const l of p.landmarks ?? []) {
      if (!visible(l)) continue
      x0 = Math.min(x0, l.x)
      x1 = Math.max(x1, l.x)
      y0 = Math.min(y0, l.y)
      y1 = Math.max(y1, l.y)
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null
}

/** Which way the court lies in the image: from the hip travel (landing is inside the court) and the contact point. */
export function forwardDirection(poses: readonly PoseFrame[], contact: { x: number } | undefined, statureNorm: number, aspect: number): 1 | -1 | 0 {
  const hips = poses.map((p) => (p.landmarks ? midHip(p.landmarks) : null)).filter((h): h is { x: number; y: number } => !!h)
  if (hips.length < 2) return 0
  const first = hips.slice(0, Math.max(1, Math.floor(hips.length / 4)))
  const last = hips.slice(-Math.max(1, Math.floor(hips.length / 4)))
  const mean = (v: { x: number }[]) => v.reduce((s, h) => s + h.x, 0) / v.length
  let score = mean(last) - mean(first)
  if (contact) score += contact.x - mean(first)
  // Ignore travel under 0.1 stature (in x units).
  const threshold = statureNorm > 0 ? (0.1 * statureNorm) / aspect : 0.01
  if (Math.abs(score) < threshold) return 0
  return score > 0 ? 1 : -1
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function toRect(r: RegionOfInterest): NormRect {
  const x0 = clamp01(r.x0)
  const y0 = clamp01(r.y0)
  const x1 = clamp01(r.x1)
  const y1 = clamp01(r.y1)
  return { x: x0, y: y0, w: Math.max(1e-3, x1 - x0), h: Math.max(1e-3, y1 - y0) }
}

export interface PlanOptions {
  /** Real time of every frame (presentation order). */
  frameTimes: ArrayLike<number>
  /** Sparse (Pass A) poses, cleaned, full-frame normalised. */
  sparsePoses: readonly PoseFrame[]
  handedness: Handedness
  view: CameraView
  /** Frame width / height. */
  aspect: number
  /** Contact onsets (hit-sound timing on and audio usable only). */
  onsets?: readonly AudioOnset[]
  /** Sound travel time phone <- player (s) removed from an onset. */
  soundDelayS?: number
}

/** Engine windows -> planned frame ranges, in time order, without overlap. */
export function planWindows(windows: readonly EngineWindow[], options: PlanOptions): PlannedWindow[] {
  const { frameTimes, aspect } = options
  const last = frameTimes.length - 1
  if (last < 0) return []
  const sorted = [...windows]
    .filter((w) => Number.isFinite(w.startReal) && Number.isFinite(w.endReal) && w.endReal > w.startReal)
    .sort((a, b) => a.startReal - b.startReal)
  // Overlapping neighbours are split at the midpoint of the overlap (§5.3 "clamped to the neighbouring window's midpoint").
  const spans = sorted.map((w) => ({ ...w }))
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].startReal < spans[i - 1].endReal) {
      const mid = (spans[i].startReal + spans[i - 1].endReal) / 2
      spans[i - 1].endReal = mid
      spans[i].startReal = mid
    }
  }
  const planned: PlannedWindow[] = []
  for (const w of spans) {
    const startFrame = frameAt(frameTimes, w.startReal)
    const endFrame = Math.max(startFrame, frameAt(frameTimes, w.endReal))
    if (endFrame - startFrame < 2) continue
    const inWindow = options.sparsePoses.filter((p) => p.tReal >= frameTimes[startFrame] && p.tReal <= frameTimes[endFrame])
    const contact = provisionalContact(w, inWindow, options)
    const statureNorm = statureFromPoses(inWindow)
    const forward = forwardDirection(inWindow, contact.wrist, statureNorm, aspect)
    const clampFrame = (tr: number) => Math.min(endFrame, Math.max(startFrame, frameAt(frameTimes, tr)))
    const box = playerBox(inWindow)
    const bh = statureNorm > 0 ? statureNorm : box ? box.y1 - box.y0 : 0.5
    const bhx = bh / aspect
    let region: RegionOfInterest
    if (box) {
      region = { x0: box.x0 - 0.6 * bhx, x1: box.x1 + 0.6 * bhx, y0: 0, y1: box.y1 + 0.05 * bh }
      if (forward > 0) region.x1 += 1.5 * bhx
      else if (forward < 0) region.x0 -= 1.5 * bhx
      else {
        region.x0 -= 1.5 * bhx
        region.x1 += 1.5 * bhx
      }
    } else {
      region = { x0: 0, y0: 0, x1: 1, y1: 1 }
    }
    let corridor: RegionOfInterest | null = null
    if (options.view === 'side' && contact.wrist) {
      // The ball at contact is about a racket length above the wrist.
      const cx = contact.wrist.x
      const cy = contact.wrist.y - 0.3 * bh
      const back = 0.3 * bhx
      corridor =
        forward > 0
          ? { x0: cx - back, x1: 1, y0: cy - 0.4 * bh, y1: cy + 1.2 * bh }
          : forward < 0
            ? { x0: 0, x1: cx + back, y0: cy - 0.4 * bh, y1: cy + 1.2 * bh }
            : { x0: 0, x1: 1, y0: cy - 0.4 * bh, y1: cy + 1.2 * bh }
      corridor = { x0: clamp01(corridor.x0), y0: clamp01(corridor.y0), x1: clamp01(corridor.x1), y1: clamp01(corridor.y1) }
      region = {
        x0: Math.min(region.x0, corridor.x0),
        y0: Math.min(region.y0, corridor.y0),
        x1: Math.max(region.x1, corridor.x1),
        y1: Math.max(region.y1, corridor.y1),
      }
    }
    planned.push({
      index: planned.length,
      confidence: w.confidence,
      startFrame,
      endFrame,
      coreStartFrame: clampFrame(contact.tReal - CORE_BEFORE_S),
      coreEndFrame: clampFrame(contact.tReal + CORE_AFTER_S),
      ballStartFrame: clampFrame(contact.tReal - BALL_BEFORE_S),
      ballEndFrame: clampFrame(contact.tReal + BALL_AFTER_S),
      contact: { ...contact, frameIndex: frameAt(frameTimes, contact.tReal) },
      statureNorm,
      forward,
      crop: toRect(region),
      corridor,
    })
  }
  return planned
}

/**
 * The ball worker's crop for a window. In the side view with a toss band and a post-contact corridor,
 * the detector only ever searches those two (BallWindowProcessor: toss band, then their union, then
 * the corridor), so the crop shrinks to their bounding box plus `marginH` (frame heights; room for
 * the detector's refinement box and its running background at the edges). Otherwise, or when the
 * box would not be smaller, the window's crop. Pure.
 */
export function ballSearchCrop(
  crop: NormRect,
  tossRoi: RegionOfInterest | null | undefined,
  corridor: RegionOfInterest | null | undefined,
  view: CameraView,
  aspect: number,
  marginH: number,
): NormRect {
  if (view !== 'side' || !tossRoi || !corridor) return crop
  const mx = marginH / aspect
  const x0 = Math.max(crop.x, Math.min(tossRoi.x0, corridor.x0) - mx)
  const y0 = Math.max(crop.y, Math.min(tossRoi.y0, corridor.y0) - marginH)
  const x1 = Math.min(crop.x + crop.w, Math.max(tossRoi.x1, corridor.x1) + mx)
  const y1 = Math.min(crop.y + crop.h, Math.max(tossRoi.y1, corridor.y1) + marginH)
  if (x1 - x0 <= 1e-3 || y1 - y0 <= 1e-3) return crop
  const tight = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  return tight.w * tight.h < crop.w * crop.h ? tight : crop
}

/** Hitting-wrist peak (sparse poses), refined by the strongest hit sound within 0.4 s when available. */
export function provisionalContact(window: EngineWindow, poses: readonly PoseFrame[], options: PlanOptions): ProvisionalContact {
  const peak = wristPeak(poses, options.handedness)
  // Sparse sampling at ~15 Hz: the peak is known to about a frame period; allow two.
  const spacing = poses.length > 1 ? (poses[poses.length - 1].tReal - poses[0].tReal) / (poses.length - 1) : 0.1
  let contact: ProvisionalContact = peak
    ? { tReal: peak.tReal, frameIndex: 0, uncertaintyS: Math.min(0.25, Math.max(0.08, 2 * spacing)), source: 'pose', wrist: { x: peak.x, y: peak.y } }
    : // §5.3: window = anchor - 2.2 s .. anchor + 1.6 s, so the anchor sits at 58% of it.
      { tReal: window.startReal + 0.58 * (window.endReal - window.startReal), frameIndex: 0, uncertaintyS: 0.3, source: 'window' }
  const onsets = options.onsets ?? []
  if (onsets.length > 0) {
    const around = onsets.filter((o) => o.kind !== 'bounce' && Math.abs(o.tReal - contact.tReal) <= 0.4 && o.tReal >= window.startReal && o.tReal <= window.endReal)
    const loudest = around.sort((a, b) => b.strength - a.strength)[0]
    if (loudest) {
      contact = { ...contact, tReal: loudest.tReal - (options.soundDelayS ?? 0.02), uncertaintyS: 0.05, source: 'audio' }
    }
  }
  return contact
}

/**
 * Full-rate span of the core around the provisional contact when the slow parts are thinned
 * (poseIndices slowCoreHz): from the drive (after the lowest hip) to landing, where the fast events
 * are (contact, landing, the wrist and knee velocities); release and the trophy position move slowly.
 */
export const FULL_RATE_BEFORE_S = 0.55
export const FULL_RATE_AFTER_S = 0.45

/** Real rate of Pass B pose outside the core (§5.4 step 2: every 3rd frame at 60 fps). */
export const CONTEXT_POSE_HZ = 20
/**
 * A context frame is skipped when Pass A already has a pose within this many seconds (Pass A runs
 * at 15 Hz around every serve, so its poses are at most 33 ms from any frame there).
 */
export const CONTEXT_COVERED_S = 0.05

/**
 * Pose frame indices for a window: every frame in the core (every 2nd at >= 200 fps capture), and
 * a 20 Hz grid outside it (§5.4 step 2). Always includes the window's first and last frame.
 *
 * `covered` (Pass A pose frames): outside the core a grid frame is skipped when Pass A already
 * has a pose within CONTEXT_COVERED_S, so the context (setup, recovery) is not estimated twice.
 * The core is always estimated in full by Pass B, so its frames come from one source.
 */
export function poseIndices(
  w: Pick<PlannedWindow, 'startFrame' | 'endFrame' | 'coreStartFrame' | 'coreEndFrame'> & { contact?: Pick<ProvisionalContact, 'frameIndex' | 'uncertaintyS'> },
  captureFps: number,
  covered?: ReadonlySet<number>,
  options: { slowCoreHz?: number } = {},
): number[] {
  const coreStep = captureFps >= 200 ? 2 : 1
  const contextStep = Math.max(1, Math.round(captureFps / CONTEXT_POSE_HZ))
  // Optional thinning of the slow parts of the core (see FULL_RATE_BEFORE_S): the full-rate span
  // around the provisional contact, widened by its doubt, keeps every core frame.
  const slowStep = options.slowCoreHz && w.contact ? Math.max(coreStep, Math.round(captureFps / options.slowCoreHz)) : coreStep
  const doubt = w.contact ? Math.ceil(w.contact.uncertaintyS * captureFps) : 0
  const fullFrom = w.contact ? w.contact.frameIndex - Math.ceil(FULL_RATE_BEFORE_S * captureFps) - doubt : w.coreStartFrame
  const fullTo = w.contact ? w.contact.frameIndex + Math.ceil(FULL_RATE_AFTER_S * captureFps) + doubt : w.coreEndFrame
  const near = Math.max(0, Math.round(CONTEXT_COVERED_S * captureFps))
  const isCovered = (f: number) => {
    if (!covered || covered.size === 0) return false
    for (let d = 0; d <= near; d++) if (covered.has(f - d) || covered.has(f + d)) return true
    return false
  }
  const out: number[] = []
  for (let f = w.startFrame; f <= w.endFrame; f++) {
    const inCore = f >= w.coreStartFrame && f <= w.coreEndFrame
    if (inCore) {
      const step = f >= fullFrom && f <= fullTo ? coreStep : slowStep
      if ((f - w.coreStartFrame) % step === 0) out.push(f)
    } else if (f === w.startFrame || f === w.endFrame || ((f - w.startFrame) % contextStep === 0 && !isCovered(f))) {
      out.push(f)
    }
  }
  return out
}

/** Ball detection runs at this real rate or more in the toss phase (200+ fps capture is thinned to it). */
export const BALL_TOSS_MIN_HZ = 100
/** Full-rate ball frames start this long before the provisional contact's doubt band (s). */
export const BALL_FULL_RATE_MARGIN_S = 0.1

/**
 * Ball frame indices: every frame of the ball range, except that at 200 fps and above the toss
 * phase (up to BALL_FULL_RATE_MARGIN_S before the provisional contact's doubt band) keeps every
 * 2nd frame. A 120 Hz toss still gives the release hinge fit, apex fit and gravity check about 150
 * points; contact, the outgoing ball and the experimental speed keep the full rate.
 */
export function ballIndices(w: Pick<PlannedWindow, 'ballStartFrame' | 'ballEndFrame'> & { contact?: Pick<ProvisionalContact, 'frameIndex' | 'uncertaintyS'> }, captureFps = 60): number[] {
  const step = Math.max(1, Math.floor(captureFps / BALL_TOSS_MIN_HZ))
  const fullFrom =
    step > 1 && w.contact ? w.contact.frameIndex - Math.ceil((w.contact.uncertaintyS + BALL_FULL_RATE_MARGIN_S) * captureFps) : w.ballStartFrame
  const out: number[] = []
  for (let f = w.ballStartFrame; f <= w.ballEndFrame; f++) {
    if (f >= fullFrom || (f - w.ballStartFrame) % step === 0) out.push(f)
  }
  return out
}

/** Real seconds around an arm-above-head sample where Pass A samples at the fine rate. */
export const ACTIVITY_PAD_BEFORE_S = 2.5
export const ACTIVITY_PAD_AFTER_S = 2.0

/**
 * Spans (real s) where a serve may be: around every coarse pose with either wrist above the head
 * (every serve raises the tossing arm, then the hitting arm, for about a second), padded to
 * cover a serve window (anchor - 2.2 s .. + 1.6 s) and merged.
 */
export function activitySpans(poses: readonly PoseFrame[], padBefore = ACTIVITY_PAD_BEFORE_S, padAfter = ACTIVITY_PAD_AFTER_S): [number, number][] {
  const spans: [number, number][] = []
  for (const p of poses) {
    const l = p.landmarks
    if (!l || !visible(l[LM.NOSE])) continue
    const up = [LM.LEFT_WRIST, LM.RIGHT_WRIST].some((k) => visible(l[k]) && l[k].y < l[LM.NOSE].y)
    if (!up) continue
    const span: [number, number] = [p.tReal - padBefore, p.tReal + padAfter]
    const last = spans[spans.length - 1]
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1])
    else spans.push(span)
  }
  return spans
}

/** Frame indices on a `step` grid inside the spans, excluding `skip`. */
export function framesInSpans(frameTimes: ArrayLike<number>, spans: readonly [number, number][], step: number, skip: ReadonlySet<number>): number[] {
  const seen = new Set<number>()
  for (const [a, b] of spans) {
    const from = frameAt(frameTimes, Math.max(0, a))
    const to = frameAt(frameTimes, b)
    for (let f = from - (from % step); f <= to; f += step) if (f >= from && !skip.has(f)) seen.add(f)
  }
  return [...seen].sort((x, y) => x - y)
}

/** Sparse-pass frame step for a target real rate (Hz). */
export function sparseStep(captureFps: number, targetHz = 15): number {
  return Math.max(1, Math.round(captureFps / targetHz))
}
