/**
 * The relative toss strip's words and scale: how far each toss peak sat from the middle one. Used by
 * the report's toss hero when absolute peak heights are experimental, and by the Welcome screen's
 * sample strip (finding 48).
 */

/** "≈ 12 cm higher" / "≈ 8 cm lower" / "at the middle" for a peak against the middle toss. */
export function relWords(d: number): string {
  const cm = Math.round(Math.abs(d))
  if (cm === 0) return 'at the middle'
  return `≈ ${cm} cm ${d > 0 ? 'higher' : 'lower'}`
}

/** Symmetric domain around the middle toss, at least ±20 cm, in 10 cm steps. */
export function relDomain(ds: number[]): [number, number] {
  const m = Math.max(20, Math.ceil((Math.max(...ds.map((d) => Math.abs(d))) + 3) / 10) * 10)
  return [-m, m]
}

/** Axis ticks for the relative strip: "+10", "0", "-10". */
export const relTick = (v: number) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)
