/**
 * Capture-quality checks computable from engine data (METRICS §3.25; ids follow CAPTURE's `cq.*`).
 * Pixel checks (exposure, flicker, blur, background drift) need the frames and belong to the
 * pipeline. NONE IS COMPUTED YET: there is no luminance or flicker estimate, so the light condition
 * class comes only from the player's answer, and a clip with no answer is class 'unknown' (every
 * value at most experimental). Checks that block (§3.25 "Block") are applied to the values by
 * metrics/perServe.ts (per serve) and metrics/session.ts (block statistics), not only listed. The session
 * overall rule: good if every serve passes (info ignored); usable (Fair) with any warning and
 * ≥ 70% analysable; poor (Limited) on a session-level block or < 50% analysable.
 */
import type { QualityCheck, QualityReport } from '../types.ts'
import type { ServeCore } from '../serve/analyse.ts'
import type { CameraModel } from '../serve/geometry.ts'
import type { ConditionClass } from '../metrics/catalogue.ts'
import type { TimeBaseClass } from '../metrics/perServe.ts'

/** How the engine settled the time base (engine.ts timeBaseOf), for the cq.time-base wording. */
export type TimeBaseNote =
  | 'container'
  | 'toss-confirmed'
  | 'assumed'
  | 'toss-corrected'
  | 'declared-confirmed'
  | 'declared-contradicted'
  | 'declared-unconfirmed'
  | 'toss-contradicted'
  | 'unconfirmed-slomo'

export interface QualityInput {
  serves: readonly ServeCore[]
  cam: CameraModel
  captureFps: number
  timeBase: TimeBaseClass
  timeBaseNote?: TimeBaseNote
  /** Relative σ of the gravity-confirmed time base, for the message. */
  displayedHeightPx: number
  shortSidePx: number
  condition: ConditionClass
  audio: { usable: boolean; on: boolean; reason?: string }
  view: { declared: string; mismatch: boolean; mismatchShare: number }
  /** Per serve: share of frames missing in the serve window (dense pose only). */
  framesMissing: readonly (number | null)[]
  /** Per serve: hard plausibility rejects. */
  hardRejects: readonly number[]
  /** Per serve: raw-frame framing (landmarks outside a 3% margin): 'ok' | 'feet-at-landing' | 'contact-cut'. */
  framing: readonly ('ok' | 'feet-at-landing' | 'contact-cut' | 'unknown')[]
  /** Per serve: the tracker lost the server in the window. */
  lostTracking: readonly boolean[]
  /** A sustained orientation change > 1° during the serves (sustainedOrientationChange). */
  cameraBump: boolean
  /** Level assumed from the mount answer: the standing body axis against the image vertical (METRICS §1.1.3a). */
  standingRoll?: { rollDeg: number; flagged: boolean }
}

type Sev = QualityCheck['severity']

function check(id: string, pass: boolean, severity: Sev, message: string, extra: Partial<QualityCheck> = {}): QualityCheck {
  return { id, pass, severity, message, ...extra }
}

export interface QualityOutcome {
  report: QualityReport
  /** Serves that fail a blocking per-serve check. */
  blockedServeIds: Set<number>
  /** Internal 0–100 ranking score (never shown). */
  score: number
  /** Up to two plain headline reasons. */
  reasons: string[]
  /** Share of the block's serves with a hard plausibility reject (> 0.2 blocks its statistics, §3.25). */
  blockRejectShare: number
}

const medianOf = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** The player's standing height in pixels at a 1080p-equivalent resolution (short side 1080; §3.25 subject-size). */
export function bodyPx1080Of(serves: readonly ServeCore[], displayedHeightPx: number, shortSidePx: number): number | null {
  const hs = serves.filter((s) => s.classification === 'serve').map((s) => s.ref?.bodyHeightHU).filter((h): h is number => !!h).sort((a, b) => a - b)
  if (!hs.length || !(shortSidePx > 0)) return null
  return hs[hs.length >> 1] * displayedHeightPx * (1080 / shortSidePx)
}

/** Median toss gravity ÷ 9.81 over the served tosses (§3.25 scale), or null (no toss, or no time base). */
export function scaleRatioOf(serves: readonly ServeCore[], timeBase: TimeBaseClass): number | null {
  if (timeBase === 'unknown') return null
  const ratios = serves
    .filter((s) => s.classification === 'serve')
    .map((s) => s.ball.toss?.gravity?.apparentGravityMps2)
    .filter((g): g is number => g !== undefined && Number.isFinite(g))
    .map((g) => g / 9.81)
    .sort((a, b) => a - b)
  return ratios.length ? ratios[ratios.length >> 1] : null
}

/** A step this large (degrees) in the median pitch or roll counts as the phone moving (ARCHITECTURE, §3.25 stability). */
export const CAMERA_MOVE_DEG = 1
/** Each side of a candidate step is judged over this long (s). */
const MOVE_WINDOW_S = 1

/**
 * Did the phone move during the serves? A SUSTAINED change: the median pitch or roll over the second
 * after a moment differs by more than 1° from the second before it. Only samples from 1 s before the
 * first serve to 1 s after the last count, so the Record and Stop taps (and handling after Stop) are
 * left out, and a brief press on a springy mount (the level log is low-passed, τ 0.3 s) does not move
 * a one-second median. A clean knock of a few degrees does, even though no two 10 Hz samples differ
 * by more than 1°. Sample times are ms from the start of recording (≈ video time for in-app clips).
 */
export function sustainedOrientationChange(
  samples: readonly { tMs: number; pitchDeg: number; rollDeg: number }[] | undefined,
  spans: readonly { start: number; end: number }[],
): boolean {
  if (!samples || samples.length < 6 || !spans.length) return false
  const a = Math.min(...spans.map((s) => s.start)) - MOVE_WINDOW_S
  const b = Math.max(...spans.map((s) => s.end)) + MOVE_WINDOW_S
  const s = samples
    .map((x) => ({ t: x.tMs / 1000, p: x.pitchDeg, r: x.rollDeg }))
    .filter((x) => x.t >= a && x.t <= b && Number.isFinite(x.p) && Number.isFinite(x.r))
    .sort((p, q) => p.t - q.t)
  let lo = 0
  let hi = 0
  for (let k = 0; k < s.length; k++) {
    const t = s[k].t
    while (lo < k && s[lo].t < t - MOVE_WINDOW_S) lo++
    if (hi < k + 1) hi = k + 1
    while (hi < s.length && s[hi].t <= t + MOVE_WINDOW_S) hi++
    const before = s.slice(lo, k)
    const after = s.slice(k + 1, hi)
    if (before.length < 5 || after.length < 5) continue
    const dp = Math.abs(medianOf(after.map((x) => x.p)) - medianOf(before.map((x) => x.p)))
    const dr = Math.abs(medianOf(after.map((x) => x.r)) - medianOf(before.map((x) => x.r)))
    if (dp > CAMERA_MOVE_DEG || dr > CAMERA_MOVE_DEG) return true
  }
  return false
}

export function computeQuality(input: QualityInput): QualityOutcome {
  const checks: QualityCheck[] = []
  const serves = input.serves.filter((s) => s.classification === 'serve')
  const n = serves.length
  const blocked = new Set<number>()
  const perServeWeight = new Map<number, number>()
  const weigh = (index: number, w: number) => perServeWeight.set(index, (perServeWeight.get(index) ?? 1) * w)

  // Frame rate.
  const fps = input.captureFps
  if (fps >= 60) checks.push(check('cq.frame-rate', true, 'info', `Recorded at ${Math.round(fps)} fps.`, { value: fps, scope: 'clip' }))
  else if (fps >= 30) checks.push(check('cq.frame-rate', false, 'warn', `Recorded at ${Math.round(fps)} fps: timing is less precise.`, { value: fps, scope: 'clip', fix: 'Record at 60 fps.', affects: ['timing'] }))
  else checks.push(check('cq.frame-rate', false, 'block', `Recorded at ${Math.round(fps)} fps: too few frames to time the serve.`, { value: fps, scope: 'clip', fix: 'Record at 60 fps.', affects: ['timing'] }))

  // Time base (CAPTURE §11.3): only container evidence is "confirmed timestamps"; a player's answer or
  // a toss-corrected clip is checked against the toss's fall and never unlocks speed.
  const note = input.timeBaseNote
  if (input.timeBase === 'proven') checks.push(check('cq.time-base', true, 'info', 'Real-time timestamps confirmed.', { scope: 'clip' }))
  else if (input.timeBase === 'normal')
    checks.push(check('cq.time-base', true, 'info', note === 'assumed' ? "Normal-speed timing assumed; the toss's fall could not check it." : "Timing confirmed by the toss's fall.", { scope: 'clip' }))
  else if (input.timeBase === 'physics')
    checks.push(
      check('cq.time-base', false, 'warn', note === 'declared-confirmed' ? "Slow motion from your answer, confirmed by the toss's fall; speed is not available." : 'Slow motion was corrected using the toss; speed is not available.', { scope: 'clip', affects: ['speed-experimental'] }),
    )
  else if (note === 'declared-contradicted')
    checks.push(check('cq.time-base', false, 'block', "The toss fell at a rate that doesn't match the frame rate given for this clip, so timings are hidden.", { scope: 'clip', fix: 'Check the frame rate, or import the original slow-motion file.', affects: ['timing', 'speed'] }))
  else if (note === 'declared-unconfirmed')
    checks.push(check('cq.time-base', false, 'warn', "Slow motion from your answer couldn't be checked against the toss, so timings are hidden.", { scope: 'clip', fix: 'Import the original slow-motion file, or record in the app.', affects: ['timing', 'speed'] }))
  else checks.push(check('cq.time-base', false, 'block', 'This may be slow motion and its real timing could not be confirmed.', { scope: 'clip', fix: 'Import the original slow-motion file, or record in the app.', affects: ['timing', 'speed'] }))

  // Dropped frames (dense pose only).
  const dropped = input.framesMissing.map((m, i) => ({ m, i })).filter((x) => x.m !== null && x.m > 0.02)
  if (dropped.length) {
    const worst = Math.max(...dropped.map((x) => x.m!))
    const sev: Sev = worst > 0.1 ? 'block' : 'warn'
    for (const d of dropped) {
      if (d.m! > 0.1) blocked.add(input.serves[d.i].index)
      weigh(input.serves[d.i].index, d.m! > 0.1 ? 0.5 : 0.9)
    }
    checks.push(check('cq.dropped-frames', false, sev, `Frames were missing on ${dropped.length} serve${dropped.length > 1 ? 's' : ''}.`, { scope: 'serve', serveIds: dropped.map((d) => String(input.serves[d.i].index)), value: worst, fix: 'Close other apps while recording.' }))
  } else checks.push(check('cq.dropped-frames', true, 'info', 'No missing frames.', { scope: 'clip' }))

  // Player size at a 1080p-equivalent resolution (perServe gates the pose metrics on the same number).
  const bodyPx = bodyPx1080Of(input.serves, input.displayedHeightPx, input.shortSidePx)
  if (bodyPx !== null) {
    const px = Math.round(bodyPx)
    if (bodyPx >= 300) checks.push(check('cq.player-size', true, 'info', `You were about ${px} px tall in the picture.`, { value: px, scope: 'clip' }))
    else if (bodyPx >= 250) checks.push(check('cq.player-size', true, 'info', `You were ${px} px tall; 4K would help.`, { value: px, scope: 'clip', fix: 'Record in 4K, or move a little closer.' }))
    else if (bodyPx >= 150) checks.push(check('cq.player-size', false, 'warn', `You were small in the picture (${px} px), so body readings are less certain.`, { value: px, scope: 'clip', fix: 'Move the phone closer or record in 4K.', affects: ['pose'] }))
    else checks.push(check('cq.player-size', false, 'block', `You were too small in the picture (${px} px) for body readings.`, { value: px, scope: 'clip', fix: 'Move the phone closer or record in 4K.', affects: ['pose'] }))
  }

  // Framing.
  const cut = input.framing.map((f, i) => ({ f, i })).filter((x) => x.f === 'contact-cut' || x.f === 'feet-at-landing')
  if (cut.length) {
    const contactCut = cut.filter((c) => c.f === 'contact-cut')
    for (const c of contactCut) weigh(input.serves[c.i].index, 0.5)
    for (const c of cut.filter((c) => c.f === 'feet-at-landing')) weigh(input.serves[c.i].index, 0.9)
    checks.push(
      check('cq.player-in-frame', false, contactCut.length ? 'block' : 'warn', contactCut.length ? 'Your head or hitting arm left the picture at contact.' : 'Your feet left the picture at landing.', {
        scope: 'serve',
        serveIds: cut.map((c) => String(input.serves[c.i].index)),
        fix: 'Step the phone back so your whole body and the toss fit.',
      }),
    )
  } else checks.push(check('cq.player-in-frame', true, 'info', 'Your whole body stayed in the picture.', { scope: 'clip' }))

  // Toss headroom (recorded: the §2.4.3 apex case).
  const fitted = serves.filter((s) => s.ball.apexCase === 'fitted-above')
  const censored = serves.filter((s) => s.ball.apexCase === 'censored')
  if (fitted.length || censored.length) {
    for (const s of [...fitted, ...censored]) weigh(s.index, 0.9)
    const share = n ? censored.length / n : 0
    checks.push(
      check('cq.toss-headroom', false, 'warn', `The toss left the top of the picture on ${fitted.length + censored.length} of ${n} serve${n === 1 ? '' : 's'}.`, {
        scope: 'serve',
        serveIds: [...fitted, ...censored].map((s) => String(s.index)),
        value: share,
        fix: 'Next time, move the phone about 1 m back or raise it a little.',
      }),
    )
  } else if (n) checks.push(check('cq.toss-headroom', true, 'info', 'Every toss stayed in the picture.', { scope: 'clip' }))

  // Ball visibility.
  const vis = serves.map((s) => ({ s, v: s.ball.visibility ?? (s.ball.detections >= 6 ? 1 : 0) }))
  const poorBall = vis.filter((x) => x.v < 0.5 || x.s.ball.detections < 6)
  const fairBall = vis.filter((x) => x.v >= 0.5 && x.v < 0.8 && x.s.ball.detections >= 6)
  if (poorBall.length || fairBall.length) {
    for (const x of poorBall) weigh(x.s.index, 0.5)
    for (const x of fairBall) weigh(x.s.index, 0.9)
    checks.push(
      check('cq.ball-visibility', false, poorBall.length ? 'block' : 'warn', poorBall.length ? `The toss was hard to see on ${poorBall.length} serve${poorBall.length > 1 ? 's' : ''}.` : 'The toss was partly hidden on some serves.', {
        scope: 'serve',
        serveIds: [...poorBall, ...fairBall].map((x) => String(x.s.index)),
        fix: 'Toss against sky, a fence or a plain windbreak; avoid trees behind you.',
        affects: ['toss'],
      }),
    )
  } else if (n) checks.push(check('cq.ball-visibility', true, 'info', 'The toss was clearly visible.', { scope: 'clip' }))

  // Level (tilt).
  const t = input.cam.tiltStatus
  if (t === 'measured-level' || t === 'measured-corrected') {
    checks.push(check('cq.camera-level', true, 'info', t === 'measured-level' ? 'The phone was level.' : `The phone was tilted ${Math.abs(input.cam.pitch?.value ?? 0).toFixed(1)}°; we levelled the picture.`, { scope: 'clip', value: input.cam.pitch?.value }))
  } else if (t === 'assumed-level') {
    const roll = input.standingRoll
    const sigma = input.cam.pitch?.sigma ?? 0
    if (roll?.flagged) {
      checks.push(
        // No angle in the words (D5): the player sees that they look tilted, not a number of degrees.
        check('cq.camera-level', false, 'warn', 'You look tilted in the picture while standing, so the phone was probably not level. Heights are experimental.', {
          scope: 'clip',
          value: roll.rollDeg,
          fix: 'Use a fence clip or a tripod with a level, or record in the app.',
          affects: ['heights', 'angles'],
        }),
      )
    } else {
      checks.push(
        check('cq.camera-level', true, 'info', `Level taken from your answer about the mount${sigma > 2 ? ' (roughly level)' : ''}${roll ? ', and you stood upright in the picture' : ''}. Heights have wider ranges.`, { scope: 'clip', value: roll?.rollDeg }),
      )
    }
  } else if (t === 'unknown') {
    checks.push(check('cq.camera-level', false, 'info', 'Phone tilt unknown, so heights and angles are experimental.', { scope: 'clip', fix: 'Record in the app with motion access on, so we can level the picture.', affects: ['heights', 'angles'] }))
  } else {
    checks.push(check('cq.camera-level', false, 'block', 'The phone was tilted more than we can correct.', { scope: 'clip', value: input.cam.pitch?.value, fix: 'Keep the phone level; the guide turns green.', affects: ['heights', 'positions', 'angles'] }))
  }

  // Camera stability (orientation steps; background registration is the pipeline's).
  checks.push(input.cameraBump ? check('cq.camera-stability', false, 'block', 'The phone moved during recording.', { scope: 'clip', fix: 'Fix the phone firmly.', affects: ['spreads', 'positions'] }) : check('cq.camera-stability', true, 'info', 'The phone stayed still.', { scope: 'clip' }))

  // Roles.
  if (n) {
    const ambiguous = serves.filter((s) => s.frontFoot === null).length / n
    if (ambiguous > 0.1)
      checks.push(check('cq.roles', false, ambiguous > 0.3 ? 'warn' : 'warn', `We couldn't tell your front foot on ${Math.round(ambiguous * 100)}% of serves.`, { scope: 'serve', value: ambiguous }))
    else checks.push(check('cq.roles', true, 'info', 'Front and back foot were clear.', { scope: 'clip', value: ambiguous }))
  }

  // Extra people / lost tracking.
  const lost = input.lostTracking.map((l, i) => ({ l, i })).filter((x) => x.l)
  if (lost.length) {
    for (const x of lost) {
      blocked.add(input.serves[x.i].index)
      weigh(input.serves[x.i].index, 0.5)
    }
    checks.push(check('cq.extra-people', false, 'block', 'We lost track of you on some serves; someone else may have been near you.', { scope: 'serve', serveIds: lost.map((x) => String(input.serves[x.i].index)), fix: "Make sure you're the only person near your serving spot." }))
  }

  // Pose tracking quality.
  const lowPose = serves.filter((s) => s.trackingQuality < 0.5)
  const midPose = serves.filter((s) => s.trackingQuality >= 0.5 && s.trackingQuality < 0.7)
  if (lowPose.length || midPose.length) {
    for (const s of lowPose) weigh(s.index, 0.5)
    for (const s of midPose) weigh(s.index, 0.9)
    checks.push(check('cq.tracking', false, lowPose.length ? 'block' : 'warn', lowPose.length ? 'Body tracking was unreliable on some serves.' : 'Body tracking was a little shaky on some serves.', { scope: 'serve', serveIds: [...lowPose, ...midPose].map((s) => String(s.index)), fix: "Make sure you're the only person near your serving spot, with the light behind the camera.", affects: ['pose'] }))
  } else if (n) checks.push(check('cq.tracking', true, 'info', 'Body tracking was steady.', { scope: 'clip' }))

  // Segmentation completeness.
  const analysable = serves.filter((s) => s.events.tossRelease && s.events.tossApex && s.events.contact && s.events.contact.confidence >= 0.5).length
  const segShare = n ? analysable / n : 0
  if (n) checks.push(check('cq.serve-segmentation', segShare >= 0.9, segShare >= 0.9 ? 'info' : 'warn', `${analysable} of ${n} serves had toss release, peak and contact found.`, { scope: 'clip', value: segShare }))

  // Scale consistency: toss gravity vs body scale (perServe blocks the cm values above 15%).
  const med = scaleRatioOf(input.serves, input.timeBase)
  if (med !== null) {
    const off = Math.abs(med - 1)
    if (off <= 0.08) checks.push(check('cq.scale-consistency', true, 'info', 'The toss fell at the rate your height predicts.', { scope: 'clip', value: med }))
    else checks.push(check('cq.scale-consistency', false, off > 0.15 ? 'block' : 'warn', 'The toss fell at a different rate than your height predicts.', { scope: 'clip', value: med, fix: 'Check your height in Profile. If this was slow motion, import the original.', affects: off > 0.15 ? ['cm values'] : [] }))
  }

  // Plausibility: above 20% of the block's serves, the session aggregation makes its statistics unavailable.
  const rejects = input.serves.filter((s, i) => s.classification === 'serve' && (input.hardRejects[i] ?? 0) > 0).length
  const blockRejectShare = n ? rejects / n : 0
  if (n) {
    if (rejects === 0) checks.push(check('cq.plausibility', true, 'info', 'Every reading passed the plausibility checks.', { scope: 'clip' }))
    else
      checks.push(
        check('cq.plausibility', false, blockRejectShare > 0.2 ? 'block' : 'warn', blockRejectShare > 0.2 ? `${rejects} of ${n} serves had a reading that looked wrong, so this block's summaries are left out.` : `${rejects} serve${rejects > 1 ? 's' : ''} had a reading that looked wrong and was left out.`, {
          scope: 'serve',
          value: rejects,
          ...(blockRejectShare > 0.2 ? { affects: ['statistics'] } : {}),
        }),
      )
  }

  // Audio (off by default; info only).
  checks.push(check('cq.audio-timing', true, 'info', input.audio.on ? (input.audio.usable ? 'Hit-sound timing was used for contact.' : `Hit-sound timing was on but not usable${input.audio.reason ? `: ${input.audio.reason}` : ''}.`) : 'Hit-sound timing was off; contact was timed from the video.', { scope: 'clip' }))

  // View.
  checks.push(input.view.mismatch ? check('cq.view', false, 'block', "This clip doesn't look like the view you chose.", { scope: 'clip', value: input.view.mismatchShare, fix: 'Check where the phone is.' }) : check('cq.view', true, 'info', 'The camera view matched.', { scope: 'clip' }))

  // Condition class.
  if (input.condition === 'overcast') checks.push(check('cq.condition', true, 'info', 'Overcast light.', { scope: 'clip' }))
  else if (input.condition === 'night-lights' || input.condition === 'flicker')
    checks.push(check('cq.condition', false, 'warn', 'Under court lights, body-based readings are experimental until they are validated for night light.', { scope: 'clip', affects: ['pose'] }))
  else if (input.condition === 'unknown')
    checks.push(
      check('cq.condition', false, 'warn', "The light for this clip wasn't recorded, so readings checked only in daylight are experimental.", {
        scope: 'clip',
        fix: 'When you import, say whether it was daylight or under lights.',
        affects: ['pose', 'heights', 'timing'],
      }),
    )

  // Overall (§3.25).
  const sessionBlock = checks.some((c) => c.severity === 'block' && ['cq.view', 'cq.time-base', 'cq.frame-rate'].includes(c.id))
  const anyWarn = checks.some((c) => !c.pass && (c.severity === 'warn' || c.severity === 'block'))
  const analysableShare = input.serves.length ? analysable / Math.max(1, n) : 0
  let overall: QualityReport['overall'] = 'good'
  if (sessionBlock || analysableShare < 0.5 || n === 0) overall = 'poor'
  else if (anyWarn) overall = analysableShare >= 0.7 ? 'usable' : 'poor'
  const weights = serves.map((s) => perServeWeight.get(s.index) ?? 1)
  const score = Math.round(100 * (weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0) * (sessionBlock ? 0.5 : 1))
  const reasons = checks.filter((c) => !c.pass && c.severity !== 'info').sort((a, b) => (a.severity === 'block' ? 0 : 1) - (b.severity === 'block' ? 0 : 1)).slice(0, 2).map((c) => c.message)
  return { report: { overall, checks }, blockedServeIds: blocked, score, reasons, blockRejectShare }
}
