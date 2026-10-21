/**
 * Where the struck ball is in one frame, round or smeared (N2.2).
 *
 * `findCandidates` looks for a disc and `findStreaks` for a smear, and both
 * read the frame difference without its sign: a moving ball lights up where it
 * is now and where it was a frame ago, and either centre can come back. A
 * speed is a position against a time, so that will not do. This keeps only the
 * pixels that got brighter — the ball is the brightest thing in its patch, so
 * where it arrived brightens and where it left darkens — and measures each such
 * region as an ellipse, whatever its shape: a round ball at 240 fps, a short
 * streak at 120, a long one at 60.
 *
 * WHERE ON THE CLOCK. A smear's centre is where the ball was halfway through
 * the exposure, not at the frame's timestamp. For a speed that is a constant
 * offset on every sample and moves nothing; for the impact moment it is half
 * a shutter, a millisecond or two, inside `IMPACT`'s window by a wide margin.
 *
 * Coordinates come back as `serveSpeed.ts` wants them: frame heights from the
 * top-left, x already multiplied by the aspect.
 */
import type { Bitmap } from './ballTrack'

export interface StruckBlob {
  /** Centre, frame heights, x times the aspect. */
  x: number
  y: number
  /** Long axis over short; a disc is 1. */
  elongation: number
  /** Long axis, frame heights. */
  length: number
  pixels: number
}

/**
 * Regions that brightened since the previous frame, measured as ellipses.
 *
 * `region` limits the search to a window of the frame (pixels), so a pass that
 * reads only the net side of the player does not pay for the rest.
 */
export function struckCandidates(
  frame: Bitmap,
  previous: Bitmap | undefined,
  opts: {
    threshold?: number
    minPixels?: number
    /** Longest smear accepted, frame heights: past this it is not one ball's exposure. */
    maxLength?: number
    region?: { x0: number; y0: number; x1: number; y1: number }
  } = {},
): StruckBlob[] {
  if (!previous || previous.width !== frame.width || previous.height !== frame.height) return []
  const { width: w, height: h } = frame
  const threshold = opts.threshold ?? 12
  const minPixels = opts.minPixels ?? 4
  const maxLength = opts.maxLength ?? 0.5
  const r = opts.region ?? { x0: 0, y0: 0, x1: w, y1: h }
  const x0 = Math.max(0, Math.floor(r.x0))
  const y0 = Math.max(0, Math.floor(r.y0))
  const x1 = Math.min(w, Math.ceil(r.x1))
  const y1 = Math.min(h, Math.ceil(r.y1))

  // Brightened in green: where the ball is now. Weighted by how much, so a
  // smear's faint ends pull its centre less than its core.
  //
  // Grown with hysteresis: a region starts on a pixel past `threshold` and
  // spreads into neighbours past half of it. A long smear is faint — at 1/60 s
  // each pixel sees the ball for a sliver of the exposure — and cut off at the
  // full threshold it lost one end, which put its centre 31 px from the truth.
  const grow = threshold / 2
  const weight = new Float32Array(w * h)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x
      const d = frame.data[i * 4 + 1] - previous.data[i * 4 + 1]
      if (d > grow) weight[i] = d
    }
  }

  const seen = new Uint8Array(w * h)
  const out: StruckBlob[] = []
  const stack: number[] = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const start = y * w + x
      if (weight[start] <= threshold || seen[start]) continue
      stack.length = 0
      stack.push(start)
      seen[start] = 1
      let n = 0
      let sw = 0
      let sx = 0
      let sy = 0
      let sxx = 0
      let syy = 0
      let sxy = 0
      while (stack.length) {
        const i = stack.pop()!
        const px = i % w
        const py = (i / w) | 0
        const k = weight[i]
        n++
        sw += k
        // Pixel centres, so a one-pixel blob sits in the middle of its pixel.
        const cx = px + 0.5
        const cy = py + 0.5
        sx += k * cx
        sy += k * cy
        sxx += k * cx * cx
        syy += k * cy * cy
        sxy += k * cx * cy
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx
            const ny = py + dy
            if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue
            const j = ny * w + nx
            if (weight[j] && !seen[j]) {
              seen[j] = 1
              stack.push(j)
            }
          }
        }
      }
      if (n < minPixels) continue
      const mx = sx / sw
      const my = sy / sw
      const cxx = sxx / sw - mx * mx
      const cyy = syy / sw - my * my
      const cxy = sxy / sw - mx * my
      const half = (cxx + cyy) / 2
      const gap = Math.sqrt(Math.max(0, ((cxx - cyy) / 2) ** 2 + cxy * cxy))
      const major = Math.sqrt(Math.max(0, half + gap))
      const minor = Math.sqrt(Math.max(0, half - gap))
      const length = (4 * major) / h
      if (length > maxLength) continue
      out.push({ x: mx / h, y: my / h, elongation: major / Math.max(minor, 0.5), length, pixels: n })
    }
  }
  // Biggest first: `trackStruckBall` reads the first few candidates a frame.
  return out.sort((a, b) => b.pixels - a.pixels)
}
