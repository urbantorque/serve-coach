/**
 * Scales and ticks for the hand-built SVG charts (DESIGN §9.1: at most 3 to 4 ticks, round values,
 * fixed domains where the ends mean something). Pure functions; no statistics here.
 */

export type Domain = [number, number]

export interface LinearScale {
  (value: number): number
  domain: Domain
  range: Domain
  invert: (px: number) => number
}

export function linear(domain: Domain, range: Domain): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0)
  const f = ((v: number) => r0 + (v - d0) * k) as LinearScale
  f.domain = domain
  f.range = range
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k)
  return f
}

export function extent(values: readonly number[]): Domain | null {
  const finite = values.filter((v) => Number.isFinite(v))
  if (!finite.length) return null
  return [Math.min(...finite), Math.max(...finite)]
}

/** Pads a domain by a fraction of its span each side (DESIGN §9.2: 10%); a zero span gets ±1. */
export function padDomain([a, b]: Domain, frac = 0.1): Domain {
  const span = b - a
  if (span === 0) return [a - 1, b + 1]
  return [a - span * frac, b + span * frac]
}

/** Union of domains, ignoring nulls. */
export function unionDomain(...ds: (Domain | null | undefined)[]): Domain | null {
  const all = ds.filter((d): d is Domain => Boolean(d))
  if (!all.length) return null
  return [Math.min(...all.map((d) => d[0])), Math.max(...all.map((d) => d[1]))]
}

const STEPS = [1, 2, 2.5, 5, 10]

/** Round step so that the domain holds at most `maxCount` ticks. */
export function tickStep([a, b]: Domain, maxCount = 4): number {
  const span = Math.abs(b - a)
  if (span === 0) return 1
  const raw = span / Math.max(1, maxCount - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  for (const s of STEPS) {
    const step = s * mag
    const count = Math.floor(b / step) - Math.ceil(a / step) + 1
    if (count <= maxCount) return step
  }
  return 10 * mag
}

/** Round tick values inside the domain (at most `maxCount`, DESIGN §9.1). */
export function niceTicks(domain: Domain, maxCount = 4): number[] {
  const [a, b] = domain[0] <= domain[1] ? domain : [domain[1], domain[0]]
  const step = tickStep([a, b], maxCount)
  const out: number[] = []
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out.slice(0, maxCount)
}

/** Decimals needed to print ticks of this step without noise ("3.2", "3.4", not "3.2000001"). */
export function stepDecimals(step: number): number {
  // The fewest decimals that print every multiple of the step exactly (0.25 needs 2, 0.2 needs 1).
  for (let d = 0; d < 4; d++) {
    const scaled = step * 10 ** d
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d
  }
  return 4
}

/** Plain tick label; the unit goes on the last tick or the axis title (DESIGN §9.3). */
export function formatTick(value: number, step: number): string {
  const d = stepDecimals(step % 1 === 0 ? step : step)
  const text = value.toFixed(d)
  return text === '-0' ? '0' : text
}
