/** Seeded PRNG so noise injection is reproducible across runs and machines. */

export type Rng = () => number

/** mulberry32: small, fast, good enough statistical quality for test noise. Returns [0, 1). */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal sample (Box-Muller). */
export function gaussian(rng: Rng): number {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Geometric run length with the given mean (>= 1). */
export function geometricLength(rng: Rng, meanLength: number): number {
  if (meanLength <= 1) return 1
  const pStop = 1 / meanLength
  let length = 1
  while (rng() > pStop && length < 10_000) length++
  return length
}
