/** Seeded PRNG so every clip is exactly reproducible from its seed. */

export type Rng = () => number

/** mulberry32: small, fast, good-enough 32-bit PRNG returning [0,1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal sample (Box-Muller). */
export function gaussian(rng: Rng): number {
  let u = 0
  while (u <= 1e-12) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Normal(mean, sd) truncated at +/- kSd standard deviations by resampling.
 * Truncation at 2.5 sd shrinks the realised SD by about 4%; the truth file reports realised values.
 */
export function truncatedNormal(rng: Rng, mean: number, sd: number, kSd = 2.5): number {
  if (sd <= 0) return mean
  for (let i = 0; i < 100; i++) {
    const z = gaussian(rng)
    if (Math.abs(z) <= kSd) return mean + sd * z
  }
  return mean
}

/** Derive an independent child seed from a parent seed and a label (FNV-1a). */
export function childSeed(seed: number, label: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
