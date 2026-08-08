import { readoutOf } from '../analysis/anatomy'
import { LM, jointAngle, type Side, sided } from '../analysis/geometry'
import { smoothedRacket } from '../analysis/racket'
import type { Frame, Landmark, PhaseId } from '../analysis/types'

export type Limb = ReturnType<typeof sided>

/* ---------------------------------------------------------------- palette ---
 *
 * Every colour this overlay can draw, in one place, with what it means. They
 * were scattered through the file as raw rgba() literals, which is how the same
 * green ended up meaning "racket arm" in one function and "ball trail" in
 * another — and how a change of palette becomes a hunt.
 *
 * Four meanings, and no fifth: neutral body, the chain being judged, the
 * reference shape, injury. If something new needs drawing it has to claim one
 * of those or explain itself.
 */
const PALETTE = {
  /**
   * Goes under every stroke before its colour does.
   *
   * This is the whole reason the overlay is readable, and it is not decoration.
   * Footage is not a backdrop: a white line crosses a white shirt, a yellow one
   * crosses the ball itself, and either vanishes at exactly the frame it was
   * drawn for. A wider near-black stroke of the same path, first, gives every
   * line its own edge no matter what it happens to be passing over. Every
   * drawn element in this file has one — bones, racket, ball, arcs, dots and
   * the leader line — and each is wide enough to leave ~1.6px of dark showing
   * on both sides of the colour.
   */
  under: 'rgba(10, 10, 10, 0.72)',

  /** Torso and legs: tracked, but not what any of the six positions is judged on. */
  neutral: 'rgba(250, 250, 250, 0.82)',

  /** Head and tossing arm — the same body, at full strength so the limbs lead. */
  limb: '#fafafa',

  /**
   * Optic yellow, and the only yellow in the overlay.
   *
   * It marks the racket arm and its callout, and nothing else, so that "the
   * yellow one" is always the answer to "which arm am I meant to be watching".
   */
  active: '#ccff00',

  /**
   * Hardcourt blue is the coaching voice everywhere else in the app, so here it
   * is the reference pose: the shape the targets describe. Never the player.
   */
  reference: 'rgba(37, 99, 235, 0.78)',

  /**
   * Injury risk, and nothing else — not a bad toss, not a low score.
   *
   * Nothing in this file draws it yet. It is named here so the colour is
   * already spoken for when a joint does have to be flagged, and so nobody
   * reaches for red to mean "worst rung of the ramp".
   */
  risk: '#ef4444',

  /**
   * The ball marker: white, not yellow.
   *
   * A yellow marker on a yellow tennis ball is an invisible marker, which is
   * the one thing a tracking overlay cannot be. White with a hard dark ring
   * separates from the ball, the sky and the court all at once.
   */
  ball: '#fafafa',

  /** Flight path, oldest → newest: muted grey warming to the marker's white. */
  ballOld: [163, 163, 163] as const,
  ballNew: [250, 250, 250] as const,

  /** Any text on the picture sits on this. Solid, square, opaque — never bare video. */
  plate: '#0a0a0a',
  plateLabel: 'rgba(250, 250, 250, 0.78)',
} as const

/* The token stacks, spelled out for canvas. Same families and same fallbacks as
   tokens.css, so a callout burned into a keyframe still matches the page it was
   captured from — and still reads if the vendored fonts were never fetched. */
const DISPLAY_FONT = "'Archivo Black', Impact, 'Haettenschweiler', 'Arial Black', sans-serif"
const MONO_FONT = "'Space Mono', ui-monospace, 'Cascadia Mono', 'Courier New', Consolas, monospace"

const BONES: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.leftAnkle, LM.leftToe],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  [LM.rightAnkle, LM.rightToe],
]

/**
 * Which joint each keyframe is judged on, for the on-image callout.
 *
 * `metric` is what turns the angle into words. The callout used to read "168°",
 * which is the same fact as "arm dead straight" and none of the same use: a
 * player watching their own contact frame cannot tell whether 168 is good, and
 * can tell instantly whether their arm is straight. The arc stays, because the
 * arc is the part that shows *where* on the body the reading came from.
 */
export const ANNOTATIONS: Partial<
  Record<
    PhaseId,
    {
      label: string
      metric: string
      joints: (racket: Limb, toss: Limb) => [number, number, number]
    }
  >
> = {
  toss: {
    label: 'Tossing elbow',
    metric: 'tossArmExtension',
    joints: (_r, t) => [t.shoulder, t.elbow, t.wrist],
  },
  trophy: { label: 'Knee bend', metric: 'kneeBend', joints: (r) => [r.hip, r.knee, r.ankle] },
  drop: {
    label: 'Hitting elbow',
    metric: 'elbowAtDrop',
    joints: (r) => [r.shoulder, r.elbow, r.wrist],
  },
  contact: {
    label: 'Arm extension',
    metric: 'armExtension',
    joints: (r) => [r.shoulder, r.elbow, r.wrist],
  },
}

/** Where the video actually sits inside a box, under `object-fit: contain`. */
export interface DrawRect {
  ox: number
  oy: number
  dw: number
  dh: number
}

/**
 * The video letterboxes inside its box whenever the two aspects differ, and
 * landmarks are normalised to the video frame — so they must be mapped into the
 * letterboxed rect rather than the box, or the skeleton sits off the body.
 */
export function fitContain(boxW: number, boxH: number, videoAspect: number): DrawRect {
  const boxAspect = boxW / Math.max(1, boxH)
  const dw = boxAspect > videoAspect ? boxH * videoAspect : boxW
  const dh = boxAspect > videoAspect ? boxH : boxW / videoAspect
  return { ox: (boxW - dw) / 2, oy: (boxH - dh) / 2, dw, dh }
}

export interface SkeletonOptions {
  frame: Frame
  /** Video width ÷ height. Image landmark x is pre-multiplied by this. */
  aspect: number
  rect: DrawRect
  racket: Side
  /** Fading trail of the racket hand across these frames, up to the current one. */
  trail?: { frames: Frame[]; from: number; to: number }
  /** Angle callout to draw, if this frame is a judged keyframe. */
  annotation?: PhaseId
  /**
   * Standing height in image units. Supplying it draws the estimated racket;
   * without it the arm simply ends at the hand, as before.
   */
  bodyHeight?: number
  /** All tracked frames and where we are in them, so the racket can be steadied. */
  sequence?: { frames: Frame[]; index: number }
  /** The tracked ball, drawn as a marker plus its flight path. */
  ball?: { x: number; y: number; path?: { x: number; y: number }[] }
  /**
   * A reference pose to draw behind the player — the shape the target bands
   * describe. Drawn first, dashed and thinner than the body, so it reads as
   * something to move towards rather than as a second player in the frame.
   */
  ghost?: Landmark[]
  /**
   * Enlarges the angle callout relative to the body. The stills are shown far
   * smaller than the player, so a callout sized for the player shrinks to a few
   * illegible pixels in the filmstrip.
   */
  calloutScale?: number
}

/**
 * Draw the tracked body over a video frame.
 *
 * Shared by the live player and the keyframe stills so the two cannot drift
 * apart — the stills are the only part of a serve that outlives the session, and
 * they should look like what the player showed.
 */
export function drawSkeleton(ctx: CanvasRenderingContext2D, o: SkeletonOptions): void {
  const { frame: f, aspect, rect } = o
  const { ox, oy, dw, dh } = rect
  const arm = sided(o.racket)
  const tossArm = sided(o.racket === 'right' ? 'left' : 'right')

  const at = (lm: number) => ({
    x: ox + (f.image[lm].x / aspect) * dw,
    y: oy + f.image[lm].y * dh,
  })
  const scale = Math.min(dw, dh) / 420

  // The reference shape goes down before anything else, so the player's own
  // skeleton always sits on top of it — the comparison only reads correctly if
  // it is obvious which one is you.
  if (o.ghost) {
    const g = o.ghost
    const gp = (lm: number) => ({
      x: ox + (g[lm].x / aspect) * dw,
      y: oy + g[lm].y * dh,
    })
    const gscale = Math.min(dw, dh) / 420
    ctx.lineCap = 'round'
    ctx.setLineDash([6 * gscale, 5 * gscale])
    const arms: [number, number][] = [
      [LM.leftShoulder, LM.leftElbow],
      [LM.leftElbow, LM.leftWrist],
      [LM.rightShoulder, LM.rightElbow],
      [LM.rightElbow, LM.rightWrist],
    ]
    // Every bone into one path with a subpath each, then two strokes over it.
    // Both run on the same dash pattern, so the underlay outlines each dash
    // rather than filling the gaps back in and reading as a solid line.
    ctx.beginPath()
    for (const [a, b] of [...BONES, ...arms]) {
      const p = gp(a)
      const q = gp(b)
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
    }
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = 6.2 * gscale
    ctx.stroke()
    ctx.strokeStyle = PALETTE.reference
    ctx.lineWidth = 3 * gscale
    ctx.stroke()
    const gnose = gp(LM.nose)
    const gspan = Math.abs(gp(LM.leftShoulder).x - gp(LM.rightShoulder).x)
    const gr = Math.max(9 * gscale, gspan * 0.42, 11)
    ctx.beginPath()
    ctx.arc(gnose.x, gnose.y - gr * 0.25, gr, 0, Math.PI * 2)
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = 6.2 * gscale
    ctx.stroke()
    ctx.strokeStyle = PALETTE.reference
    ctx.lineWidth = 3 * gscale
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (o.trail && o.trail.to > o.trail.from + 1) {
    const { frames, from, to } = o.trail
    ctx.lineCap = 'round'
    const pt = (fr: Frame) => ({
      x: ox + (fr.image[arm.wrist].x / aspect) * dw,
      y: oy + fr.image[arm.wrist].y * dh,
    })
    /*
     * The fade is quantised into a handful of polylines, not drawn per segment.
     *
     * A trail can be fifty frames long and a per-segment stroke costs a path
     * apiece, twice over — that is a hundred and eighty paths a frame for one
     * fading tail. Six steps of alpha are indistinguishable from a continuous
     * ramp at this width, and each step is a single polyline.
     *
     * The underlay is a whole pass rather than a second stroke per bucket
     * because it is wider than the trail: interleaved, each bucket's dark edge
     * would land back over the end of the bucket before it and bead the swing
     * path. Butt caps because consecutive buckets share their endpoint exactly
     * — a round cap there would double the alpha at six places along the arc.
     */
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'round'
    const steps = 6
    const segments = to - from
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = (pass === 0 ? 6 : 3) * scale
      for (let k = 0; k < steps; k++) {
        const lo = from + Math.floor((segments * k) / steps)
        const hi = from + Math.floor((segments * (k + 1)) / steps)
        if (hi <= lo) continue
        const alpha = 0.08 + (0.5 * (k + 1)) / steps
        ctx.strokeStyle =
          pass === 0 ? `rgba(10, 10, 10, ${alpha})` : `rgba(204, 255, 0, ${alpha})`
        ctx.beginPath()
        const first = pt(frames[lo])
        ctx.moveTo(first.x, first.y)
        for (let i = lo + 1; i <= hi; i++) {
          const q = pt(frames[i])
          ctx.lineTo(q.x, q.y)
        }
        ctx.stroke()
      }
    }
  }

  /*
   * A chain is one path with a subpath per bone, stroked twice: dark and wide,
   * then its own colour.
   *
   * Both halves of that matter. Two strokes of one path is half the path
   * construction of building it again for the underlay — and the underlay has
   * to cover the whole chain before any colour lands on it, because drawn bone
   * by bone the next bone's dark edge would cut a notch out of the one already
   * painted, at the joints, which are exactly what is being measured.
   */
  const chain = (pairs: [number, number][], under: number, color: string, width: number) => {
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [a, b] of pairs) {
      const p = at(a)
      const q = at(b)
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
    }
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = under * scale
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = width * scale
    ctx.stroke()
  }

  chain(BONES, 7, PALETTE.neutral, 3.4)

  chain(
    [
      [tossArm.shoulder, tossArm.elbow],
      [tossArm.elbow, tossArm.wrist],
    ],
    8,
    PALETTE.limb,
    4,
  )

  // The racket arm last and in yellow: it is drawn over the tossing arm on
  // purpose, because when the two cross it is the hitting arm you are watching.
  chain(
    [
      [arm.shoulder, arm.elbow],
      [arm.elbow, arm.wrist],
    ],
    9,
    PALETTE.active,
    4.6,
  )

  // The racket, where the hand can be seen well enough to point it. Drawn under
  // the joint dots so the hand still reads as the anchor, and skipped silently
  // when the knuckles are lost — a racket swinging off at a guessed angle is
  // worse than no racket at all.
  if (o.bodyHeight && o.bodyHeight > 0) {
    const est = o.sequence
      ? smoothedRacket(o.sequence.frames, o.sequence.index, o.racket, o.bodyHeight)
      : undefined
    if (est && est.confidence >= 0.5) {
      const grip = { x: ox + (est.grip.x / aspect) * dw, y: oy + est.grip.y * dh }
      const head = { x: ox + (est.head.x / aspect) * dw, y: oy + est.head.y * dh }
      const dx = head.x - grip.x
      const dy = head.y - grip.y
      const len = Math.hypot(dx, dy) || 1
      // Shaft stops short of the head so the two do not visually merge.
      const throatX = grip.x + dx * 0.62
      const throatY = grip.y + dy * 0.62

      // Shaft and head are each built once and stroked twice — dark and wide,
      // then yellow — so the underlay costs a stroke rather than a second path.
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(grip.x, grip.y)
      ctx.lineTo(throatX, throatY)
      ctx.strokeStyle = PALETTE.under
      ctx.lineWidth = 6 * scale
      ctx.stroke()
      ctx.strokeStyle = PALETTE.active
      ctx.lineWidth = 2.6 * scale
      ctx.stroke()

      // An ellipse with its long axis along the shaft, which is what a racket
      // head looks like from any angle that is not straight on.
      ctx.save()
      ctx.translate(head.x, head.y)
      ctx.rotate(Math.atan2(dy, dx))
      ctx.beginPath()
      ctx.ellipse(0, 0, len * 0.3, len * 0.23, 0, 0, Math.PI * 2)
      ctx.strokeStyle = PALETTE.under
      ctx.lineWidth = 5.6 * scale
      ctx.stroke()
      ctx.strokeStyle = PALETTE.active
      ctx.lineWidth = 2.2 * scale
      ctx.stroke()
      ctx.restore()
    }
  }

  // The ball. Not the racket arm's yellow, because the whole point is that it is
  // a separate thing being tracked separately — and because a yellow marker on a
  // tennis ball is no marker at all. See PALETTE.ball.
  if (o.ball) {
    const toPoint = (p: { x: number; y: number }) => ({ x: ox + p.x * dw, y: oy + p.y * dh })
    // The path is already the fitted arc, evaluated at a fine, even step —
    // not raw per-frame detections — so it is drawn as one smooth stroke
    // rather than a dashed polyline. Older stretches of the arc sit closer to
    // grey, and the curve brightens toward the marker's white as it nears the
    // ball's current moment, which reads as a single intentional flight
    // rather than a trail of dots.
    if (o.ball.path && o.ball.path.length > 1) {
      const pts = o.ball.path.map(toPoint)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      // One dark polyline under the whole flight before the graded segments go
      // down. Sky is the least predictable thing in the frame — a pale flight
      // path over an overcast one is the case this exists for — and doing it as
      // a single path keeps it to one extra stroke for the arc, not one each.
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.strokeStyle = PALETTE.under
      ctx.lineWidth = 4.4 * scale
      ctx.stroke()
      const [r0, g0, b0] = PALETTE.ballOld
      const [r1, g1, b1] = PALETTE.ballNew
      for (let i = 1; i < pts.length; i++) {
        const age = i / (pts.length - 1)
        const r = Math.round(r0 + (r1 - r0) * age)
        const g = Math.round(g0 + (g1 - g0) * age)
        const b = Math.round(b0 + (b1 - b0) * age)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.16 + 0.4 * age})`
        ctx.lineWidth = (1.3 + 0.5 * age) * scale
        ctx.beginPath()
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
        ctx.lineTo(pts[i].x, pts[i].y)
        ctx.stroke()
      }
    }
    const b = toPoint(o.ball)
    ctx.fillStyle = PALETTE.ball
    ctx.strokeStyle = PALETTE.under
    ctx.lineWidth = 2.8 * scale
    ctx.beginPath()
    ctx.arc(b.x, b.y, 5.5 * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  const nose = at(LM.nose)
  const shoulderSpan = Math.abs(at(LM.leftShoulder).x - at(LM.rightShoulder).x)
  const headR = Math.max(9 * scale, shoulderSpan * 0.42, 11)
  ctx.beginPath()
  ctx.arc(nose.x, nose.y - headR * 0.25, headR, 0, Math.PI * 2)
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 6.4 * scale
  ctx.stroke()
  ctx.strokeStyle = PALETTE.limb
  ctx.lineWidth = 3 * scale
  ctx.stroke()

  /*
   * The joint dots: all the ones sharing a colour in a single path, filled and
   * then ringed in the dark.
   *
   * The ring is not decoration — a white dot on a white sleeve is a hole in the
   * skeleton, and these mark the joints every angle in the report is read from.
   * `moveTo` before each arc keeps the discs as separate subpaths; without it
   * the path draws a line from one joint to the next on its way round.
   */
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 1.8 * scale
  ctx.fillStyle = PALETTE.limb
  const dotR = 3.2 * scale
  ctx.beginPath()
  for (const lm of [
    LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip,
    LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle,
    tossArm.elbow, tossArm.wrist,
  ]) {
    const p = at(lm)
    ctx.moveTo(p.x + dotR, p.y)
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()

  ctx.lineWidth = 2.2 * scale
  ctx.fillStyle = PALETTE.active
  const armR = 4.6 * scale
  ctx.beginPath()
  for (const lm of [arm.elbow, arm.wrist]) {
    const p = at(lm)
    ctx.moveTo(p.x + armR, p.y)
    ctx.arc(p.x, p.y, armR, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()

  const annotation = o.annotation ? ANNOTATIONS[o.annotation] : undefined
  if (annotation) {
    const [ai, bi, ci] = annotation.joints(arm, tossArm)
    const deg = jointAngle(f.world[ai], f.world[bi], f.world[ci])
    // The knee measurement is stored as how far the leg is bent away from
    // straight, not as the angle at the joint, so it is translated in the same
    // units it was measured in — otherwise a deep load would read as straight.
    const value = annotation.metric === 'kneeBend' ? 180 - deg : deg
    drawAngle(
      ctx,
      at(ai),
      at(bi),
      at(ci),
      readoutOf(annotation.metric, value),
      annotation.label,
      scale * (o.calloutScale ?? 1),
      o.rect.dw,
    )
  }
}

/* ------------------------------------------------------------------ callout */

type Pt = { x: number; y: number }

/**
 * An arc at the joint, a hairline out to a plate, and the position in words.
 *
 * The plate is anchored rather than floating: the leader line runs from the arc
 * to its edge, so on a frame with four things happening at once it is never
 * ambiguous which joint is being described. The phrase sets the plate's width, so
 * the type shrinks — down to a floor — rather than the plate growing past the
 * edge of the picture on a phone. It is opaque and square: type set straight
 * onto footage is legible right up until the frame it is not.
 */
function drawAngle(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  c: Pt,
  value: string,
  label: string,
  scale: number,
  maxWidth: number,
) {
  const a1 = Math.atan2(a.y - b.y, a.x - b.x)
  const a2 = Math.atan2(c.y - b.y, c.x - b.x)
  const radius = 26 * scale

  let delta = a2 - a1
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2

  ctx.beginPath()
  ctx.arc(b.x, b.y, radius, a1, a1 + delta, delta < 0)
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = 5.8 * scale
  ctx.stroke()
  ctx.strokeStyle = PALETTE.active
  ctx.lineWidth = 2.4 * scale
  ctx.stroke()

  const mid = a1 + delta / 2
  const lead = radius + 34 * scale
  const lx = b.x + Math.cos(mid) * lead
  const ly = b.y + Math.sin(mid) * lead

  // A body position needs more room than three digits did, so the type gives
  // way before the plate does. The floor keeps it legible on a filmstrip still.
  const cap = Math.max(90 * scale, Math.min(maxWidth * 0.52, 260 * scale))
  const measure = (px: number) => {
    ctx.font = `400 ${px}px ${DISPLAY_FONT}`
    return ctx.measureText(value).width
  }
  const size = fittedSize(value, cap, scale, measure)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const valueW = measure(size)
  // The overline is measured in the font it is actually set in. It used to be
  // measured in the value's font and scaled by a guess, which was close enough
  // for one sans face at two weights and is not close enough for two families —
  // and a plate that comes out too narrow puts the label back on bare video.
  const labelSize = 9.5 * scale
  ctx.font = `400 ${labelSize}px ${MONO_FONT}`
  const w = Math.max(valueW, ctx.measureText(label.toUpperCase()).width) + 22 * scale
  const h = 38 * scale

  // Hairline from the arc to the plate, so the words stay attached to the joint.
  ctx.beginPath()
  ctx.moveTo(b.x + Math.cos(mid) * radius, b.y + Math.sin(mid) * radius)
  ctx.lineTo(lx - Math.cos(mid) * (w / 2), ly - Math.sin(mid) * (h / 2))
  ctx.strokeStyle = PALETTE.under
  ctx.lineWidth = Math.max(2.4, 3.6 * scale)
  ctx.stroke()
  ctx.strokeStyle = PALETTE.active
  ctx.lineWidth = Math.max(0.6, 1 * scale)
  ctx.stroke()

  // Solid, square, and edged in yellow — an opaque black plate on dark footage
  // has no edge of its own, and the edge is what makes it read as a label
  // rather than as a hole punched in the picture.
  ctx.fillStyle = PALETTE.plate
  ctx.fillRect(lx - w / 2, ly - h / 2, w, h)
  ctx.strokeStyle = PALETTE.active
  ctx.lineWidth = Math.max(1.5, 2 * scale)
  ctx.strokeRect(lx - w / 2, ly - h / 2, w, h)

  ctx.font = `400 ${size}px ${DISPLAY_FONT}`
  ctx.fillStyle = PALETTE.active
  ctx.fillText(value, lx, ly - 6 * scale)
  ctx.font = `400 ${labelSize}px ${MONO_FONT}`
  ctx.fillStyle = PALETTE.plateLabel
  ctx.fillText(label.toUpperCase(), lx, ly + 9 * scale)
}

/**
 * The largest type size at which the phrase still fits the card, remembered.
 *
 * The search is a dozen `measureText` calls, and this runs inside the animation
 * loop — every frame the playhead sits on a keyframe, at sixty frames a second,
 * for a string that changes a handful of times in a whole report. The cache is
 * keyed on everything the answer depends on and capped, so a long session
 * cannot grow it without bound: it holds a few dozen entries and then recycles.
 */
const FIT_CACHE = new Map<string, number>()
const FIT_CACHE_MAX = 128

function fittedSize(
  value: string,
  cap: number,
  scale: number,
  measure: (px: number) => number,
): number {
  // Rounded into the key so sub-pixel jitter in the canvas size — a device
  // pixel ratio that is not a whole number — does not miss every single time.
  const key = `${value}|${Math.round(cap)}|${Math.round(scale * 20)}`
  const hit = FIT_CACHE.get(key)
  if (hit !== undefined) return hit

  let size = 14 * scale
  while (size > 8.5 * scale && measure(size) + 22 * scale > cap) size -= 0.5 * scale

  if (FIT_CACHE.size >= FIT_CACHE_MAX) FIT_CACHE.clear()
  FIT_CACHE.set(key, size)
  return size
}
