import { cx } from '../components/cx.ts'

export interface WilsonBarProps {
  /** Observed rate, 0 to 1. */
  rate: number
  /** Wilson CI95, 0 to 1 (computed by the screen, never here). */
  low: number
  high: number
  /** Spoken summary, e.g. "8 of 12 in, likely 39 to 86 percent". */
  label: string
  className?: string
}

/**
 * Inline Wilson interval bar for rates in tiles (DESIGN §9.8): 137 × 12, a 1 px baseline from 0 to
 * 100% with ticks at 0, 50 and 100, the CI95 as a 6 px bar at 25% of --good and the observed rate as a
 * 2 × 12 --ink tick. No filled track (it is not a progress bar). Callers show it only from n ≥ 10.
 */
export function WilsonBar({ rate, low, high, label, className }: WilsonBarProps) {
  const W = 137
  const x = (v: number) => 1 + Math.min(1, Math.max(0, v)) * (W - 2)
  return (
    <svg width={W} height={12} viewBox={`0 0 ${W} 12`} role="img" aria-label={label} className={cx('block shrink-0', className)}>
      <line x1={1} x2={W - 1} y1={6} y2={6} stroke="var(--line-strong)" strokeWidth={1} />
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={4} y2={8} stroke="var(--line-strong)" strokeWidth={1} />
      ))}
      <rect x={x(low)} y={3} width={Math.max(3, x(high) - x(low))} height={6} rx={3} fill="var(--good)" fillOpacity={0.25} />
      <rect x={x(rate) - 1} y={0} width={2} height={12} fill="var(--ink)" />
    </svg>
  )
}
