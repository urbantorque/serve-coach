import { readoutOf } from '../analysis/anatomy'
import { LM, jointAngle, type Side, sided } from '../analysis/geometry'
import { smoothedRacket } from '../analysis/racket'
import type { Frame, Landmark, PhaseId } from '../analysis/types'

export type Limb = ReturnType<typeof sided>

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
   * describe. Drawn first and faintly, so it reads as something to move towards
   * rather than as a second player in the frame.
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
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.42)'
    ctx.lineWidth = 3 * gscale
    const arms: [number, number][] = [
      [LM.leftShoulder, LM.leftElbow],
      [LM.leftElbow, LM.leftWrist],
      [LM.rightShoulder, LM.rightElbow],
      [LM.rightElbow, LM.rightWrist],
    ]
    for (const [a, b] of [...BONES, ...arms]) {
      const p = gp(a)
      const q = gp(b)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
      ctx.stroke()
    }
    const gnose = gp(LM.nose)
    const gspan = Math.abs(gp(LM.leftShoulder).x - gp(LM.rightShoulder).x)
    const gr = Math.max(9 * gscale, gspan * 0.42, 11)
    ctx.beginPath()
    ctx.arc(gnose.x, gnose.y - gr * 0.25, gr, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (o.trail && o.trail.to > o.trail.from + 1) {
    const { frames, from, to } = o.trail
    ctx.lineWidth = 3 * scale
    ctx.lineCap = 'round'
    const pt = (fr: Frame) => ({
      x: ox + (fr.image[arm.wrist].x / aspect) * dw,
      y: oy + fr.image[arm.wrist].y * dh,
    })
    for (let i = from + 1; i <= to; i++) {
      const a = pt(frames[i - 1])
      const b = pt(frames[i])
      const age = (i - from) / Math.max(1, to - from)
      ctx.strokeStyle = `rgba(205, 249, 74, ${0.08 + 0.5 * age})`
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  const bone = (a: number, b: number, color: string, width: number) => {
    const p = at(a)
    const q = at(b)
    ctx.strokeStyle = color
    ctx.lineWidth = width * scale
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
    ctx.stroke()
  }

  // A soft dark outline underneath keeps the skeleton legible on a pale court.
  for (const [a, b] of BONES) bone(a, b, 'rgba(0,0,0,0.45)', 7)
  for (const [a, b] of BONES) bone(a, b, 'rgba(238,242,246,0.82)', 3.4)

  for (const [a, b] of [
    [tossArm.shoulder, tossArm.elbow],
    [tossArm.elbow, tossArm.wrist],
  ] as [number, number][]) {
    bone(a, b, 'rgba(0,0,0,0.45)', 8)
    bone(a, b, 'rgba(120, 200, 255, 0.95)', 4)
  }

  for (const [a, b] of [
    [arm.shoulder, arm.elbow],
    [arm.elbow, arm.wrist],
  ] as [number, number][]) {
    bone(a, b, 'rgba(0,0,0,0.45)', 9)
    bone(a, b, 'rgb(205, 249, 74)', 4.6)
  }

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

      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 5.5 * scale
      ctx.beginPath()
      ctx.moveTo(grip.x, grip.y)
      ctx.lineTo(throatX, throatY)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(205, 249, 74, 0.7)'
      ctx.lineWidth = 2.6 * scale
      ctx.beginPath()
      ctx.moveTo(grip.x, grip.y)
      ctx.lineTo(throatX, throatY)
      ctx.stroke()

      // An ellipse with its long axis along the shaft, which is what a racket
      // head looks like from any angle that is not straight on.
      ctx.save()
      ctx.translate(head.x, head.y)
      ctx.rotate(Math.atan2(dy, dx))
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 4.5 * scale
      ctx.beginPath()
      ctx.ellipse(0, 0, len * 0.3, len * 0.23, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(205, 249, 74, 0.7)'
      ctx.lineWidth = 2.2 * scale
      ctx.beginPath()
      ctx.ellipse(0, 0, len * 0.3, len * 0.23, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  // The ball. Its own colour rather than the racket-arm green, because the
  // whole point is that it is a separate thing being tracked separately.
  if (o.ball) {
    const toPoint = (p: { x: number; y: number }) => ({ x: ox + p.x * dw, y: oy + p.y * dh })
    // The path is already the fitted arc, evaluated at a fine, even step —
    // not raw per-frame detections — so it is drawn as one smooth stroke
    // rather than a dashed polyline. Older stretches of the arc sit closer to
    // slate, and the curve warms toward the lime accent as it nears the
    // ball's current moment, which reads as a single intentional flight
    // rather than a trail of dots.
    if (o.ball.path && o.ball.path.length > 1) {
      const pts = o.ball.path.map(toPoint)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let i = 1; i < pts.length; i++) {
        const age = i / (pts.length - 1)
        const r = Math.round(152 + (205 - 152) * age)
        const g = Math.round(162 + (249 - 162) * age)
        const b = Math.round(179 + (74 - 179) * age)
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.16 + 0.4 * age})`
        ctx.lineWidth = (1.3 + 0.5 * age) * scale
        ctx.beginPath()
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
        ctx.lineTo(pts[i].x, pts[i].y)
        ctx.stroke()
      }
    }
    const b = toPoint(o.ball)
    ctx.fillStyle = 'rgba(255, 214, 92, 0.95)'
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = 2 * scale
    ctx.beginPath()
    ctx.arc(b.x, b.y, 5.5 * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  const nose = at(LM.nose)
  const shoulderSpan = Math.abs(at(LM.leftShoulder).x - at(LM.rightShoulder).x)
  const headR = Math.max(9 * scale, shoulderSpan * 0.42, 11)
  ctx.strokeStyle = 'rgba(238,242,246,0.85)'
  ctx.lineWidth = 3 * scale
  ctx.beginPath()
  ctx.arc(nose.x, nose.y - headR * 0.25, headR, 0, Math.PI * 2)
  ctx.stroke()

  for (const lm of [
    LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip,
    LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle,
    tossArm.elbow, tossArm.wrist,
  ]) {
    const p = at(lm)
    ctx.fillStyle = '#eef2f6'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.2 * scale, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const lm of [arm.elbow, arm.wrist]) {
    const p = at(lm)
    ctx.fillStyle = '#cdf94a'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4.6 * scale, 0, Math.PI * 2)
    ctx.fill()
  }

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

const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif'

/**
 * An arc at the joint, a hairline out to a card, and the position in words.
 *
 * The card is anchored rather than floating: the leader line runs from the arc
 * to the card edge, so on a frame with four things happening at once it is never
 * ambiguous which joint is being described. The phrase sets the card's width, so
 * the type shrinks — down to a floor — rather than the card growing past the
 * edge of the picture on a phone.
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

  ctx.strokeStyle = 'rgba(205, 249, 74, 0.95)'
  ctx.lineWidth = 2.4 * scale
  ctx.beginPath()
  ctx.arc(b.x, b.y, radius, a1, a1 + delta, delta < 0)
  ctx.stroke()

  const mid = a1 + delta / 2
  const lead = radius + 34 * scale
  const lx = b.x + Math.cos(mid) * lead
  const ly = b.y + Math.sin(mid) * lead

  // A body position needs more room than three digits did, so the type gives
  // way before the card does. The floor keeps it legible on a filmstrip still.
  const cap = Math.max(90 * scale, Math.min(maxWidth * 0.52, 260 * scale))
  let size = 14 * scale
  const measure = (px: number) => {
    ctx.font = `620 ${px}px ${UI_FONT}`
    return ctx.measureText(value).width
  }
  while (size > 8.5 * scale && measure(size) + 22 * scale > cap) size -= 0.5 * scale

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = Math.max(measure(size), ctx.measureText(label).width * 0.72) + 22 * scale
  const h = 38 * scale

  // Hairline from the arc to the card, so the words stay attached to the joint.
  ctx.strokeStyle = 'rgba(205, 249, 74, 0.55)'
  ctx.lineWidth = Math.max(0.6, 1 * scale)
  ctx.beginPath()
  ctx.moveTo(b.x + Math.cos(mid) * radius, b.y + Math.sin(mid) * radius)
  ctx.lineTo(lx - Math.cos(mid) * (w / 2), ly - Math.sin(mid) * (h / 2))
  ctx.stroke()

  ctx.fillStyle = 'rgba(10, 12, 16, 0.82)'
  roundRect(ctx, lx - w / 2, ly - h / 2, w, h, 9 * scale)
  ctx.fill()

  ctx.font = `620 ${size}px ${UI_FONT}`
  ctx.fillStyle = '#cdf94a'
  ctx.fillText(value, lx, ly - 6 * scale)
  ctx.font = `500 ${9.5 * scale}px ${UI_FONT}`
  ctx.fillStyle = 'rgba(238,242,246,0.72)'
  ctx.fillText(label.toUpperCase(), lx, ly + 9 * scale)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
