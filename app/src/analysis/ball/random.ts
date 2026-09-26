/** Deterministic PRNG so RANSAC results are reproducible run to run. */

export type Rng = () => number

/** mulberry32: fast 32-bit seeded generator returning floats in [0, 1). */
export function createRng(seed: number): Rng {
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
  let u = rng()
  while (u <= Number.MIN_VALUE) u = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.min(maxExclusive - 1, Math.floor(rng() * maxExclusive))
}
