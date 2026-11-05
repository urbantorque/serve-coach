/**
 * The figure, painted: a lit athletic body on a canvas.
 *
 * Shaded the way an illustrator shades a cylinder. Each solid gets one gradient
 * across its width, dark on the side away from the light and bright along the
 * edge that catches it, so a limb reads as round with a single fill. Then the
 * whole silhouette takes one rim of light, which is what makes it a body rather
 * than a set of parts, and one shadow on the court, which is what gives it
 * weight. No blur per limb: this has to redraw at the speed of a video on a
 * phone that is already warm.
 */
import { LM, type Side } from '../analysis/geometry'
import { LIGHT, shapesOf, type Placed, type Pt, type Shapes, type Solid } from './shape'

export type Material = 'graphite' | 'silver'

interface Tone {
  shade: string
  mid: string
  lit: string
  edge: string
}

/** The body's colours. Canvas cannot read CSS variables, so they live here. */
const TONES: Record<Material, Tone> = {
  graphite: { shade: '#0b0f16', mid: '#1f2735', lit: '#55637a', edge: '#b9c5d4' },
  silver: { shade: '#343e4f', mid: '#7f8ca0', lit: '#c8d1dc', edge: '#f4f7fa' },
}

/** Shorts and shirt: the same light on a darker cloth. */
const KIT: Tone = { shade: '#07090e', mid: '#10151e', lit: '#2b3546', edge: '#6a788e' }

const LIME = '#cdf94a'
const COOL = '#dfe8f2'
const WORK = '#ff7a6b'

export interface AthleteOptions {
  material?: Material
  racket: Side
  /** Where the racket is, if known; otherwise it is left out. */
  gear?: { grip: Pt; head: Pt }
  near?: Side
  stature?: number
  /** Solids to paint as the part to work on, by a fragment of their id. */
  work?: string[]
  /** How strongly the rims of light show, 0 to 1. Zero skips them, for a small figure. */
  rim?: number
  /** The shadow on the court, 0 to 1. */
  ground?: number
  /** A picture that holds still can afford a softer light. Off for playback. */
  still?: boolean
  /** Where the floor is, in canvas units, when the feet are off it. */
  floorY?: number
}

/** A closed curve through the points, as a canvas path. */
export function smoothClosed(points: readonly Pt[]): Path2D {
  const path = new Path2D()
  const n = points.length
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const start = mid(points[n - 1], points[0])
  path.moveTo(start.x, start.y)
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const m = mid(p, points[(i + 1) % n])
    path.quadraticCurveTo(p.x, p.y, m.x, m.y)
  }
  path.closePath()
  return path
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Between two colours, for a solid turned partly away from the light. */
function blend(a: string, b: string, t: number): string {
  const p = parseInt(a.slice(1), 16)
  const q = parseInt(b.slice(1), 16)
  const c = (s: number) => Math.round(((p >> s) & 255) + (((q >> s) & 255) - ((p >> s) & 255)) * t)
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`
}

function shadeOf(ctx: CanvasRenderingContext2D, s: Solid, tone: Tone): CanvasGradient {
  const [a, b] = s.across
  const k = 0.3 + 0.7 * s.facing
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
  g.addColorStop(0, tone.shade)
  g.addColorStop(0.5, tone.mid)
  g.addColorStop(0.86, blend(tone.mid, tone.lit, k))
  g.addColorStop(1, blend(tone.lit, tone.edge, k))
  return g
}

function paintSolid(ctx: CanvasRenderingContext2D, s: Solid, tone: Tone, work: boolean) {
  const path = smoothClosed(s.outline)
  ctx.fillStyle = shadeOf(ctx, s, tone)
  ctx.fill(path)
  const cover = clothOn(s)
  if (cover) paintCloth(ctx, s, path, cover)
  if (work) {
    const [a, b] = s.across
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
    g.addColorStop(0, withAlpha(WORK, 0.5))
    g.addColorStop(0.7, withAlpha(WORK, 0.84))
    g.addColorStop(1, withAlpha('#ffd9d3', 0.96))
    ctx.fillStyle = g
    ctx.fill(path)
  }
}

/**
 * How far along a solid the cloth reaches: all of the trunk, the top of a thigh
 * for shorts and the top of an upper arm for a sleeve. Painted in the same
 * outline as the limb, so a hem is a change of tone and not a step in the
 * silhouette.
 */
const clothOn = (s: Solid): number =>
  s.id === 'torso' ? 1 : s.id.endsWith('-thigh') ? 0.56 : s.id.endsWith('-upper') ? 0.42 : 0

function paintCloth(ctx: CanvasRenderingContext2D, s: Solid, path: Path2D, cover: number) {
  if (cover === 1) {
    ctx.fillStyle = shadeOf(ctx, s, KIT)
    ctx.fill(path)
    return
  }
  const [a, e] = s.axis
  const hem = { x: a.x + (e.x - a.x) * cover, y: a.y + (e.y - a.y) * cover }
  const n = { x: -(e.y - a.y), y: e.x - a.x }
  ctx.save()
  ctx.clip(path)
  ctx.beginPath()
  ctx.moveTo(a.x - (e.x - a.x) - n.x, a.y - (e.y - a.y) - n.y)
  ctx.lineTo(a.x - (e.x - a.x) + n.x, a.y - (e.y - a.y) + n.y)
  ctx.lineTo(hem.x + n.x, hem.y + n.y)
  ctx.lineTo(hem.x - n.x, hem.y - n.y)
  ctx.closePath()
  ctx.fillStyle = shadeOf(ctx, s, KIT)
  ctx.fill()
  ctx.restore()
}

/** The shadow a near limb lays on whatever is behind it, away from the light. */
function paintCast(ctx: CanvasRenderingContext2D, solids: Solid[], u: number) {
  ctx.save()
  ctx.translate(-LIGHT.x * u * 1.5, -LIGHT.y * u * 1.5)
  ctx.fillStyle = 'rgba(4, 6, 9, 0.34)'
  for (const s of solids) ctx.fill(smoothClosed(s.outline))
  ctx.restore()
}

function paintHead(ctx: CanvasRenderingContext2D, b: Shapes, tone: Tone) {
  const { centre: c, rx, ry, angle } = b.head
  const l = Math.max(rx, ry)
  const g = ctx.createLinearGradient(c.x + LIGHT.x * -l, c.y + LIGHT.y * -l, c.x + LIGHT.x * l, c.y + LIGHT.y * l)
  g.addColorStop(0, tone.shade)
  g.addColorStop(0.5, tone.mid)
  g.addColorStop(0.84, tone.lit)
  g.addColorStop(1, tone.edge)
  ctx.beginPath()
  ctx.ellipse(c.x, c.y, rx, ry, angle + Math.PI / 2, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
}

function paintRacket(ctx: CanvasRenderingContext2D, grip: Pt, head: Pt, u: number) {
  const dir = { x: head.x - grip.x, y: head.y - grip.y }
  const length = Math.hypot(dir.x, dir.y) || 1
  const ux = dir.x / length
  const uy = dir.y / length
  const nx = -uy
  const ny = ux
  const angle = Math.atan2(uy, ux)
  // A real frame: an oval head about 34 by 26 cm on a player of 178 cm, a V
  // throat and a handle. Its width is fixed rather than measured, because the
  // tracker cannot see which way the face is turned.
  const headR = 9.6 * u
  const headW = 7.3 * u
  const neck = { x: head.x - ux * headR * 1.52, y: head.y - uy * headR * 1.52 }
  const armA = { x: head.x - ux * headR * 0.86 + nx * headW * 0.56, y: head.y - uy * headR * 0.86 + ny * headW * 0.56 }
  const armB = { x: head.x - ux * headR * 0.86 - nx * headW * 0.56, y: head.y - uy * headR * 0.86 - ny * headW * 0.56 }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const shaft = () => {
    ctx.beginPath()
    ctx.moveTo(grip.x, grip.y)
    ctx.lineTo(neck.x, neck.y)
    ctx.moveTo(armA.x, armA.y)
    ctx.lineTo(neck.x, neck.y)
    ctx.lineTo(armB.x, armB.y)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(4, 6, 9, 0.7)'
  ctx.lineWidth = 2.1 * u
  shaft()
  ctx.strokeStyle = LIME
  ctx.lineWidth = 1.05 * u
  shaft()

  ctx.save()
  ctx.translate(head.x, head.y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.ellipse(0, 0, headR, headW, 0, 0, Math.PI * 2)
  ctx.fillStyle = withAlpha(LIME, 0.07)
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = withAlpha(LIME, 0.3)
  ctx.lineWidth = Math.max(0.4, 0.14 * u)
  ctx.beginPath()
  for (let y = -headW; y <= headW; y += 1.25 * u) {
    ctx.moveTo(-headR, y)
    ctx.lineTo(headR, y)
  }
  for (let x = -headR; x <= headR; x += 1.25 * u) {
    ctx.moveTo(x, -headW)
    ctx.lineTo(x, headW)
  }
  ctx.stroke()
  ctx.restore()
  ctx.beginPath()
  ctx.ellipse(0, 0, headR, headW, 0, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(4, 6, 9, 0.7)'
  ctx.lineWidth = 2.2 * u
  ctx.stroke()
  ctx.strokeStyle = LIME
  ctx.lineWidth = 1.15 * u
  ctx.stroke()
  ctx.restore()
}

/** One spare canvas for the silhouette, grown as needed and reused every frame. */
let spare: HTMLCanvasElement | undefined

function spareFor(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D | undefined {
  if (typeof document === 'undefined') return undefined
  spare ??= document.createElement('canvas')
  const { width, height } = ctx.canvas
  if (spare.width !== width || spare.height !== height) {
    spare.width = width
    spare.height = height
  }
  const out = spare.getContext('2d')
  if (!out) return undefined
  out.setTransform(1, 0, 0, 1, 0, 0)
  out.clearRect(0, 0, width, height)
  out.setTransform(ctx.getTransform())
  return out
}

function maskOf(out: CanvasRenderingContext2D, b: Shapes, colour = '#fff') {
  out.fillStyle = colour
  for (const part of b.parts) for (const s of part.solids) out.fill(smoothClosed(s.outline))
  const { centre: c, rx, ry, angle } = b.head
  out.beginPath()
  out.ellipse(c.x, c.y, rx, ry, angle + Math.PI / 2, 0, Math.PI * 2)
  out.fill()
}

/**
 * The same two rims for a figure in motion: the silhouette laid down twice,
 * shifted a little each way, before the body goes on top. What shows round the
 * edge is the rim. No second canvas and no blending, so it costs a tenth of the
 * soft version and can run under a video.
 */
function paintBackRims(ctx: CanvasRenderingContext2D, b: Shapes, strength: number) {
  const laid = (colour: string, dx: number, dy: number) => {
    ctx.save()
    ctx.translate(dx * b.u, dy * b.u)
    maskOf(ctx, b, colour)
    ctx.restore()
  }
  laid(withAlpha(LIME, 0.85 * strength), -LIGHT.x * 0.7, -LIGHT.y * 0.12)
  laid(withAlpha(COOL, 0.8 * strength), LIGHT.x * 0.72, LIGHT.y * 0.72)
}

/**
 * The silhouette's rims: light along the edge that faces it, and the accent
 * along the edge that does not. One pass over the whole body, so the light runs
 * across a shoulder into an arm without a seam.
 */
function paintRims(ctx: CanvasRenderingContext2D, b: Shapes, strength: number) {
  const out = spareFor(ctx)
  if (!out) return
  const pixel = ctx.getTransform().a || 1
  const rim = (colour: string, dx: number, dy: number, width: number, alpha: number) => {
    out.setTransform(1, 0, 0, 1, 0, 0)
    out.clearRect(0, 0, out.canvas.width, out.canvas.height)
    out.setTransform(ctx.getTransform())
    out.globalCompositeOperation = 'source-over'
    out.shadowBlur = 0
    maskOf(out, b)
    // Whatever the shifted body still covers goes, and an edge is left. The
    // blur on the erasing copy is what lets the edge fall off softly.
    out.globalCompositeOperation = 'destination-out'
    out.shadowColor = '#000'
    out.shadowBlur = width * pixel * 1.3
    out.save()
    out.translate(dx * width, dy * width)
    maskOf(out, b)
    out.restore()
    out.shadowBlur = 0
    out.globalCompositeOperation = 'source-in'
    out.setTransform(1, 0, 0, 1, 0, 0)
    out.fillStyle = colour
    out.fillRect(0, 0, out.canvas.width, out.canvas.height)
    out.globalCompositeOperation = 'source-over'
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha *= alpha * strength
    ctx.drawImage(out.canvas, 0, 0)
    ctx.restore()
  }
  rim(COOL, -LIGHT.x, -LIGHT.y, 1.3 * b.u, 0.85)
  rim(LIME, LIGHT.x * 1.1, LIGHT.y * 0.2, 1.0 * b.u, 0.9)
  rim(COOL, -LIGHT.x, -LIGHT.y, 3.4 * b.u, 0.22)
}

/**
 * The body's shadow on the court, thrown away from the light, and a pool of the
 * accent under the feet. It is the one thing that makes a figure stand on
 * something rather than float.
 */
function paintGround(ctx: CanvasRenderingContext2D, b: Shapes, strength: number, floorY: number | undefined, still: boolean) {
  const { centre, rx } = b.floor
  const y = (floorY ?? centre.y) + b.u * 1.2
  // A thrown shadow takes a second canvas, so it is for a picture that holds still.
  const out = still ? spareFor(ctx) : undefined
  if (out) {
    maskOf(out, b)
    out.globalCompositeOperation = 'source-in'
    out.fillStyle = '#04060a'
    out.setTransform(1, 0, 0, 1, 0, 0)
    out.fillRect(0, 0, out.canvas.width, out.canvas.height)
    out.globalCompositeOperation = 'source-over'
    ctx.save()
    ctx.globalAlpha *= 0.5 * strength
    // Flattened onto the floor and skewed away from the light. Drawn in pixels
    // through the caller's transform, so it lands the same at any density.
    const m = ctx.getTransform()
    const Y = y * m.d + m.f
    ctx.setTransform(1, 0, -0.7, -0.22, 0.7 * Y, 1.22 * Y)
    ctx.drawImage(out.canvas, 0, 0)
    ctx.restore()
  }
  ctx.save()
  ctx.translate(centre.x, y)
  ctx.scale(1, 0.15)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, withAlpha(LIME, 0.2 * strength))
  g.addColorStop(0.45, withAlpha(LIME, 0.06 * strength))
  g.addColorStop(1, withAlpha(LIME, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** One athlete, on the canvas, from landmarks already placed on it. */
export function paintAthlete(ctx: CanvasRenderingContext2D, placed: Placed, o: AthleteOptions): Shapes {
  const tone = TONES[o.material ?? 'graphite']
  const rim = o.rim ?? 1
  const shapes = shapesOf(placed, { stature: o.stature, near: o.near, racket: o.racket })
  const near = o.near ?? (shapes.parts[0].solids[0].id.startsWith('left') ? 'right' : 'left')
  const racketPart = near === o.racket ? 'nearArm' : 'farArm'
  const painted = (s: Solid) => paintSolid(ctx, s, tone, o.work?.some((w) => s.id.includes(w)) ?? false)

  if (o.ground) paintGround(ctx, shapes, o.ground, o.floorY, Boolean(o.still))
  if (rim > 0 && !o.still) paintBackRims(ctx, shapes, rim)

  // The racket goes down with its own arm, so a far arm's racket passes behind
  // the trunk and a near arm's passes in front of it.
  for (const part of shapes.parts) {
    if (part.id === racketPart && o.gear) paintRacket(ctx, o.gear.grip, o.gear.head, shapes.u)
    if (part.id === 'head') paintHead(ctx, shapes, tone)
    if (part.id === 'nearArm') paintCast(ctx, part.solids, shapes.u)
    part.solids.forEach(painted)
  }
  if (rim > 0 && o.still) paintRims(ctx, shapes, rim)
  // The part to work on stays visible even when the body stands in front of it.
  if (o.work?.length) {
    ctx.save()
    ctx.globalAlpha *= 0.55
    for (const part of shapes.parts) {
      for (const s of part.solids) if (o.work.some((w) => s.id.includes(w))) paintSolid(ctx, s, tone, true)
    }
    ctx.restore()
  }
  return shapes
}

/**
 * A body as light only, for the earlier moments of a multiple exposure: added
 * to what is behind it, so where the swing passes back over itself it brightens
 * the way a long exposure does, rather than going muddy.
 */
export function paintTrace(ctx: CanvasRenderingContext2D, placed: Placed, o: { racket: Side; stature?: number; near?: Side; alpha: number }) {
  const shapes = shapesOf(placed, { stature: o.stature, near: o.near, racket: o.racket })
  const out = spareFor(ctx)
  if (!out) return shapes
  maskOf(out, shapes)
  out.globalCompositeOperation = 'source-in'
  out.setTransform(1, 0, 0, 1, 0, 0)
  const g = out.createLinearGradient(0, 0, 0, out.canvas.height)
  g.addColorStop(0, '#b7c2d0')
  g.addColorStop(1, '#475266')
  out.fillStyle = g
  out.fillRect(0, 0, out.canvas.width, out.canvas.height)
  out.globalCompositeOperation = 'source-over'
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = o.alpha
  ctx.drawImage(out.canvas, 0, 0)
  ctx.restore()
  return shapes
}

/** A Catmull-Rom spline through a few points, so a 30 fps swing still draws a curve. */
function splined(path: readonly Pt[], steps = 5): Pt[] {
  const out: Pt[] = []
  const at = (i: number) => path[Math.max(0, Math.min(path.length - 1, i))]
  for (let i = 0; i < path.length - 1; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    for (let k = 0; k < steps; k++) {
      const u = k / steps
      const cr = (p: number, q: number, r: number, w: number) =>
        0.5 * (2 * q + (-p + r) * u + (2 * p - 5 * q + 4 * r - w) * u * u + (-p + 3 * q - 3 * r + w) * u * u * u)
      out.push({ x: cr(a.x, b.x, c.x, d.x), y: cr(a.y, b.y, c.y, d.y) })
    }
  }
  out.push(path[path.length - 1])
  return out
}

/**
 * The racket head's path through the swing, as a ribbon that widens and
 * brightens towards contact. One strip of quads, so where a segment meets the
 * next there is no overlap to bead.
 */
export function paintRibbon(ctx: CanvasRenderingContext2D, path: readonly Pt[], width: number) {
  if (path.length < 3) return
  const line = splined(path)
  const n = line.length
  const edge = (i: number, side: number): Pt => {
    const a = line[Math.max(0, i - 1)]
    const b = line[Math.min(n - 1, i + 1)]
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const t = i / (n - 1)
    const w = (width / 2) * (0.12 + 0.88 * t * t) * side
    return { x: line[i].x - ((b.y - a.y) / d) * w, y: line[i].y + ((b.x - a.x) / d) * w }
  }
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1)
    ctx.fillStyle = withAlpha(LIME, 0.03 + 0.62 * t * t)
    const [a, b, c, d] = [edge(i - 1, 1), edge(i, 1), edge(i, -1), edge(i - 1, -1)]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(c.x, c.y)
    ctx.lineTo(d.x, d.y)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/**
 * The part to work on, laid over a photograph: the same solids, in the
 * accent for work, translucent so the player's own arm shows through.
 */
export function paintWorkOn(
  ctx: CanvasRenderingContext2D,
  placed: Placed,
  o: { racket: Side; work: string[]; stature?: number; near?: Side; alpha: number },
) {
  const shapes = shapesOf(placed, { stature: o.stature, near: o.near, racket: o.racket })
  ctx.save()
  ctx.globalAlpha = o.alpha
  ctx.lineJoin = 'round'
  for (const part of shapes.parts) {
    for (const s of part.solids) {
      if (!o.work.some((w) => s.id.includes(w))) continue
      const path = smoothClosed(s.outline)
      const [a, b] = s.across
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
      g.addColorStop(0, withAlpha(WORK, 0.34))
      g.addColorStop(1, withAlpha(WORK, 0.66))
      ctx.fillStyle = g
      ctx.fill(path)
      ctx.strokeStyle = withAlpha('#ffd9d3', 0.9)
      ctx.lineWidth = Math.max(1, shapes.u * 0.34)
      ctx.stroke(path)
    }
  }
  ctx.restore()
}

/** The racket hand's grip, for a body whose racket is known only by its head. */
export function gripOf(placed: Placed, racket: Side): Pt {
  const a = placed[racket === 'left' ? LM.leftIndex : LM.rightIndex]
  const b = placed[racket === 'left' ? LM.leftPinky : LM.rightPinky]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
