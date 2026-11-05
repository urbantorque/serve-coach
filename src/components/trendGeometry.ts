/** A repeatability bar's length, in percent: longer as the gap closes (L4.9). */
export function steadyWidth(gap: number, span: number): number {
  return Math.max(2, Math.min(100, (1 - gap / span) * 100))
}
