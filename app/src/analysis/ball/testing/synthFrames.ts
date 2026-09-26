/**
 * Synthetic frame renderer for ball-detector tests (test support only; not used by the app).
 *
 * Renders a textured two-part background (upper: sky / windscreen fence, lower: grass /
 * blue hard court / clay), optional distractors and a player silhouette, then an
 * optic-yellow ball with physically averaged motion blur (the disc is integrated over the
 * exposure, so a long streak is translucent, as in real footage). Lighting gains model
 * sun, shade, dusk and white-balance casts; the frame then gets 4:2:0 chroma subsampling
 * (as in H.264/HEVC phone video), Gaussian sensor noise and 8-bit quantisation.
 */
import type { ImageDataLike } from '../../types.ts'
import { createRng, gaussian, type Rng } from '../random.ts'

export type Rgb = [number, number, number]
export type UpperKind = 'sky' | 'fence' | 'dusk-sky'
export type LowerKind = 'grass' | 'hardcourt' | 'clay'

export const LIGHTING: Record<string, Rgb> = {
  sun: [1.05, 1.05, 1.0],
  overcast: [0.8, 0.82, 0.86],
  shade: [0.5, 0.56, 0.68],
  dusk: [0.55, 0.43, 0.3],
  coolWhiteBalance: [0.86, 0.97, 1.22],
  warmWhiteBalance: [1.12, 0.96, 0.72],
}

/** Optic yellow felt as a phone typically records it in neutral light. */
export const BALL_RGB: Rgb = [206, 232, 42]

export interface SceneSpec {
  width: number
  height: number
  upper: UpperKind
  lower: LowerKind
  /** Normalised y where the upper background meets the court. */
  horizonY: number
  lighting: Rgb
  noiseSigma: number
  seed: number
  /** Add yellow-ish distractors: a spare ball on the ground, a yellow banner, dry-grass patches. */
  distractors?: boolean
  /** Draw a simple player silhouette (white shirt, skin, dark shorts) at this normalised x. */
  playerX?: number
  chromaSubsample?: boolean
}

export interface Capsule {
  ax: number
  ay: number
  bx: number
  by: number
  radius: number
  colour: Rgb
}

export interface BallState {
  /** Centre at mid-exposure, pixels. */
  x: number
  y: number
  radius: number
  /** Centre positions at exposure start and end, pixels (equal for a sharp ball). */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Extra edge softness in pixels (defocus). */
  softnessPx?: number
  /** Fraction of the disc hidden (0 = none); the hidden part is the lower half, as by fingers. */
  occludedBelowFraction?: number
}

export interface SceneRenderer {
  spec: SceneSpec
  render(ball: BallState | null, dynamic: Capsule[], frameSeed: number): ImageDataLike
}

const NOISE_TABLE_SIZE = 1 << 16
function makeNoiseTable(rng: Rng): Float32Array {
  const table = new Float32Array(NOISE_TABLE_SIZE)
  for (let i = 0; i < NOISE_TABLE_SIZE; i++) table[i] = gaussian(rng)
  return table
}

/** Smooth value noise in [-1, 1] on a coarse lattice, bilinear-interpolated. */
function valueNoise(width: number, height: number, cell: number, rng: Rng): Float32Array {
  const gw = Math.ceil(width / cell) + 2
  const gh = Math.ceil(height / cell) + 2
  const lattice = Float32Array.from({ length: gw * gh }, () => rng() * 2 - 1)
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const fy = y / cell
    const iy = Math.floor(fy)
    const ty = fy - iy
    for (let x = 0; x < width; x++) {
      const fx = x / cell
      const ix = Math.floor(fx)
      const tx = fx - ix
      const a = lattice[iy * gw + ix]
      const b = lattice[iy * gw + ix + 1]
      const c = lattice[(iy + 1) * gw + ix]
      const d = lattice[(iy + 1) * gw + ix + 1]
      out[y * width + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
    }
  }
  return out
}

function upperColour(kind: UpperKind, v: number, yFrac: number): Rgb {
  switch (kind) {
    case 'sky': {
      // Gradient from deeper blue at the top to pale near the horizon, soft cloud texture.
      const cloud = Math.max(0, v) * 60
      return [120 + 70 * yFrac + cloud, 165 + 50 * yFrac + cloud, 228 + 12 * yFrac + cloud * 0.4]
    }
    case 'dusk-sky': {
      const cloud = Math.max(0, v) * 30
      return [200 + 40 * yFrac + cloud, 150 + 40 * yFrac + cloud, 150 - 20 * yFrac + cloud]
    }
    case 'fence':
      return [34 + 10 * v, 64 + 14 * v, 48 + 10 * v]
  }
}

function lowerColour(kind: LowerKind, v: number, x: number): Rgb {
  switch (kind) {
    case 'grass': {
      const stripe = Math.floor(x / 37) % 2 === 0 ? 1.06 : 0.95
      return [(68 + 18 * v) * stripe, (122 + 26 * v) * stripe, (44 + 10 * v) * stripe]
    }
    case 'hardcourt':
      return [52 + 8 * v, 96 + 10 * v, 150 + 12 * v]
    case 'clay':
      return [182 + 14 * v, 96 + 10 * v, 62 + 8 * v]
  }
}

function drawCapsuleOpaque(buf: Float32Array, width: number, height: number, cap: Capsule): void {
  const pad = cap.radius + 1
  const xMin = Math.max(0, Math.floor(Math.min(cap.ax, cap.bx) - pad))
  const xMax = Math.min(width - 1, Math.ceil(Math.max(cap.ax, cap.bx) + pad))
  const yMin = Math.max(0, Math.floor(Math.min(cap.ay, cap.by) - pad))
  const yMax = Math.min(height - 1, Math.ceil(Math.max(cap.ay, cap.by) + pad))
  const dx = cap.bx - cap.ax
  const dy = cap.by - cap.ay
  const len2 = dx * dx + dy * dy
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - cap.ax) * dx + (py - cap.ay) * dy) / len2)) : 0
      const d = Math.hypot(px - (cap.ax + t * dx), py - (cap.ay + t * dy))
      const cov = Math.max(0, Math.min(1, cap.radius + 0.5 - d))
      if (cov <= 0) continue
      const i = (y * width + x) * 3
      for (let c = 0; c < 3; c++) buf[i + c] = buf[i + c] * (1 - cov) + cap.colour[c] * cov
    }
  }
}

function drawRect(buf: Float32Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number, colour: Rgb): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
      const i = (y * width + x) * 3
      buf[i] = colour[0]
      buf[i + 1] = colour[1]
      buf[i + 2] = colour[2]
    }
  }
}

/** Time-integrated moving disc with simple top-lit shading and felt texture. */
function drawBall(buf: Float32Array, width: number, height: number, ball: BallState, rng: Rng): void {
  const soft = 1 + (ball.softnessPx ?? 0)
  const travel = Math.hypot(ball.x1 - ball.x0, ball.y1 - ball.y0)
  const samples = Math.min(96, Math.max(1, Math.ceil(travel / 0.35) + 1))
  const pad = ball.radius + soft + 1
  const xMin = Math.max(0, Math.floor(Math.min(ball.x0, ball.x1) - pad))
  const xMax = Math.min(width - 1, Math.ceil(Math.max(ball.x0, ball.x1) + pad))
  const yMin = Math.max(0, Math.floor(Math.min(ball.y0, ball.y1) - pad))
  const yMax = Math.min(height - 1, Math.ceil(Math.max(ball.y0, ball.y1) + pad))
  const occlusion = ball.occludedBelowFraction ?? 0
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let cov = 0
      let shadeSum = 0
      for (let k = 0; k < samples; k++) {
        const s = samples === 1 ? 0.5 : k / (samples - 1)
        const cx = ball.x0 + (ball.x1 - ball.x0) * s
        const cy = ball.y0 + (ball.y1 - ball.y0) * s
        const d = Math.hypot(px - cx, py - cy)
        let c = Math.max(0, Math.min(1, (ball.radius + soft / 2 - d) / soft))
        if (c <= 0) continue
        if (occlusion > 0 && py - cy > ball.radius * (1 - 2 * occlusion)) c = 0
        // Top-left key light: up to 30% darker on the far side.
        const shade = 1 - 0.15 * (((px - cx) * 0.4 + (py - cy) * 0.9) / ball.radius)
        cov += c
        shadeSum += c * shade
      }
      if (cov <= 0) continue
      const meanShade = shadeSum / cov
      const alpha = cov / samples
      const felt = 1 + 0.04 * (rng() * 2 - 1)
      const i = (y * width + x) * 3
      for (let c = 0; c < 3; c++) {
        buf[i + c] = buf[i + c] * (1 - alpha) + BALL_RGB[c] * meanShade * felt * alpha
      }
    }
  }
}

function subsampleChroma(buf: Float32Array, width: number, height: number): void {
  for (let y = 0; y + 1 < height; y += 2) {
    for (let x = 0; x + 1 < width; x += 2) {
      let cbSum = 0
      let crSum = 0
      const idx = [(y * width + x) * 3, (y * width + x + 1) * 3, ((y + 1) * width + x) * 3, ((y + 1) * width + x + 1) * 3]
      const lumas: number[] = []
      for (const i of idx) {
        const r = buf[i]
        const g = buf[i + 1]
        const b = buf[i + 2]
        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        lumas.push(luma)
        cbSum += (b - luma) * 0.564
        crSum += (r - luma) * 0.713
      }
      const cb = cbSum / 4
      const cr = crSum / 4
      idx.forEach((i, k) => {
        const luma = lumas[k]
        buf[i] = luma + 1.403 * cr
        buf[i + 1] = luma - 0.344 * cb - 0.714 * cr
        buf[i + 2] = luma + 1.773 * cb
      })
    }
  }
}

export function createScene(spec: SceneSpec): SceneRenderer {
  const { width, height } = spec
  const rng = createRng(spec.seed)
  const coarse = valueNoise(width, height, 48, rng)
  const fine = valueNoise(width, height, 5, rng)
  const base = new Float32Array(width * height * 3)
  const horizon = Math.round(spec.horizonY * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const v = 0.7 * coarse[i] + 0.3 * fine[i]
      const colour = y < horizon ? upperColour(spec.upper, v, y / Math.max(1, horizon)) : lowerColour(spec.lower, v, x)
      base.set(colour, i * 3)
    }
  }
  // Court lines on the lower part.
  if (spec.lower !== 'grass' || spec.distractors) {
    drawRect(base, width, height, 0, horizon + 0.3 * (height - horizon), width, horizon + 0.3 * (height - horizon) + 3, [235, 235, 230])
  }
  if (spec.distractors) {
    // Dry, sun-bleached patches (yellow hue, large and static).
    for (let k = 0; k < 3; k++) {
      const cx = width * (0.15 + 0.3 * k)
      const cy = horizon + (height - horizon) * (0.55 + 0.1 * k)
      drawCapsuleOpaque(base, width, height, { ax: cx - 25, ay: cy, bx: cx + 25, by: cy + 6, radius: 14, colour: [168, 160, 74] })
    }
    // Spare ball on the ground (right size and colour, static).
    drawCapsuleOpaque(base, width, height, {
      ax: width * 0.8,
      ay: height * 0.9,
      bx: width * 0.8,
      by: height * 0.9,
      radius: 6,
      colour: [200, 215, 60],
    })
    // Yellow sponsor banner on the fence / sky.
    drawRect(base, width, height, width * 0.05, horizon - 40, width * 0.4, horizon - 10, [228, 196, 52])
  }
  if (spec.playerX !== undefined) {
    const px = spec.playerX * width
    const floor = height * 0.9
    const stature = height * 0.45
    drawCapsuleOpaque(base, width, height, { ax: px - 8, ay: floor, bx: px - 6, by: floor - 0.45 * stature, radius: 7, colour: [190, 140, 110] })
    drawCapsuleOpaque(base, width, height, { ax: px + 8, ay: floor, bx: px + 6, by: floor - 0.45 * stature, radius: 7, colour: [190, 140, 110] })
    drawRect(base, width, height, px - 18, floor - 0.55 * stature, px + 18, floor - 0.42 * stature, [30, 30, 40])
    drawRect(base, width, height, px - 20, floor - 0.82 * stature, px + 20, floor - 0.55 * stature, [236, 236, 232])
    drawCapsuleOpaque(base, width, height, { ax: px, ay: floor - 0.93 * stature, bx: px, by: floor - 0.9 * stature, radius: 11, colour: [196, 146, 116] })
  }
  const noise = makeNoiseTable(rng)

  return {
    spec,
    render(ball, dynamic, frameSeed) {
      const frameRng = createRng(frameSeed)
      const buf = base.slice()
      for (const cap of dynamic) drawCapsuleOpaque(buf, width, height, cap)
      if (ball) drawBall(buf, width, height, ball, frameRng)
      const [gr, gg, gb] = spec.lighting
      for (let i = 0; i < buf.length; i += 3) {
        buf[i] *= gr
        buf[i + 1] *= gg
        buf[i + 2] *= gb
      }
      if (spec.chromaSubsample ?? true) subsampleChroma(buf, width, height)
      const data = new Uint8ClampedArray(width * height * 4)
      // Odd stride through a power-of-two table visits every entry once per cycle.
      const mask = NOISE_TABLE_SIZE - 1
      const stride = 1 + 2 * Math.floor(frameRng() * 4000)
      let n = Math.floor(frameRng() * NOISE_TABLE_SIZE)
      for (let p = 0, i = 0; p < data.length; p += 4, i += 3) {
        data[p] = buf[i] + spec.noiseSigma * noise[(n = (n + stride) & mask)]
        data[p + 1] = buf[i + 1] + spec.noiseSigma * noise[(n = (n + stride) & mask)]
        data[p + 2] = buf[i + 2] + spec.noiseSigma * noise[(n = (n + stride) & mask)]
        data[p + 3] = 255
      }
      return { width, height, data }
    },
  }
}

/** Ball state for a centre path p(t) (pixels) with an exposure of exposureS centred on t. */
export function ballAt(path: (t: number) => { x: number; y: number }, t: number, exposureS: number, radius: number): BallState {
  const mid = path(t)
  const start = path(t - exposureS / 2)
  const end = path(t + exposureS / 2)
  return { x: mid.x, y: mid.y, radius, x0: start.x, y0: start.y, x1: end.x, y1: end.y }
}
