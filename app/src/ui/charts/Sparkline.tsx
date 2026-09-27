import { formatTick as defaultTick, linear, niceTicks, padDomain, tickStep, unionDomain, extent, type Domain } from './scale.ts'
import { ValuePoint } from './marks.tsx'
import { BAND_CLASS } from './markStyle.ts'
import { PlotSurface, type PlotTarget } from './PlotSurface.tsx'
import { useChartWidth } from './useChartWidth.ts'

export interface SparkPoint {
  /** Session id (or any stable key). */
  key: string
  value: number
  /** 95% interval (detail variant draws it as a gradient interval, DESIGN §9.2). */
  low?: number
  high?: number
  /** 80% interval; derived by the caller when only the 95% one is known. */
  low80?: number
  high80?: number
  /** Early read: r 2 in --ink-3 (DESIGN §9.2). */
  provisional?: boolean
  /** Short x label ("12 Sep"). */
  label: string
  /** Callout ("11 cm · Sat 26 Sep, 21 serves"). */
  callout: string
}

export interface SparklineProps {
  /** Matched sessions, oldest first. The last 8 are drawn (DESIGN §9.2). */
  points: SparkPoint[]
  /** The player's usual range, drawn only when the caller has ≥ 2 earlier sessions. */
  band?: Domain | null
  /** Fixed display domain; otherwise the span of points and band padded by 10%. */
  domain?: Domain
  /** tile 318 × 72, no axes; detail 318 × 180 with axes and intervals (Metric info). */
  variant?: 'tile' | 'detail'
  /** Player-entered series: hollow points; the latest is a 2.5 px --good ring. */
  hollow?: boolean
  /** Direct label text for the latest value, already formatted by the display layer. */
  latestLabel: string
  formatTick?: (value: number, step: number) => string
  /** Accessible summary of the series. */
  label: string
  onOpen?: (key: string) => void
}

const MAX_POINTS = 8

/**
 * Sparkline with a typical-range band (DESIGN §9.2): x = matched sessions in order (not calendar
 * days), y = the metric's fixed domain; the "usual" band is a full-width --band rectangle; the latest
 * point is r 5 in --good with a direct label.
 */
export function Sparkline({ points: all, band, domain, variant = 'tile', hollow = false, latestLabel, formatTick = defaultTick, label, onOpen }: SparklineProps) {
  const { ref, width } = useChartWidth()
  const points = all.slice(-MAX_POINTS)
  const detail = variant === 'detail'
  const height = detail ? 180 : 72
  // With a band, the tile leaves room at the left for its "usual" label so points never cover it.
  const m = detail ? { top: 22, right: 28, bottom: 26, left: band ? 44 : 8 } : { top: 20, right: 28, bottom: 8, left: band ? 44 : 6 }
  const valueExtent = extent(points.flatMap((p) => (detail && p.low !== undefined && p.high !== undefined ? [p.value, p.low, p.high] : [p.value])))
  const dom: Domain = domain ?? padDomain(unionDomain(valueExtent, band ?? null) ?? [0, 1], 0.1)
  const x = linear([0, Math.max(1, points.length - 1)], [m.left + (points.length === 1 ? (width - m.left - m.right) / 2 : 0), width - m.right])
  const y = linear(dom, [height - m.bottom, m.top])
  const ticks = detail ? niceTicks(dom, 4) : []
  const step = tickStep(dom, 4)
  const last = points.length - 1
  const targets: PlotTarget[] = points.map((p, i) => ({ id: p.key, x: x(i), y: y(p.value), callout: p.callout }))
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const lx = x(last)
  const ly = last >= 0 ? y(points[last].value) : 0
  const labelBelow = ly - m.top < 16
  // "usual" sits inside the band's left end (below it when the band is thinner than the text).
  const bandLabelY = band ? (y(band[0]) - y(band[1]) >= 14 ? y(band[0]) - 4 : Math.min(height - 2, y(band[0]) + 12)) : null
  // Keep the direct label inside the plot: about 7 px per character at footnote 600.
  const labelW = latestLabel.length * 7
  const labelAnchor = lx + labelW / 2 > width - 2 ? 'end' : lx - labelW / 2 < 0 ? 'start' : 'middle'
  const labelX = labelAnchor === 'end' ? width - 2 : labelAnchor === 'start' ? 0 : lx

  return (
    <div ref={ref} className="w-full">
      <PlotSurface width={width} height={height} label={label} targets={targets} onOpen={onOpen}>
        {detail
          ? ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={width - 4} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                {/* Tick labels sit at the left above their gridline; one that would meet the band's label is left out. */}
                {bandLabelY !== null && Math.abs(y(t) - 4 - bandLabelY) < 12 ? null : (
                  <text x={2} y={y(t) - 4} className="fill-ink-3 text-caption tabular-nums">
                    {formatTick(t, step)}
                  </text>
                )}
              </g>
            ))
          : null}
        {band ? (
          <g>
            <rect x={0} width={width} y={y(band[1])} height={Math.max(2, y(band[0]) - y(band[1]))} rx={4} className={BAND_CLASS} />
            <text x={4} y={bandLabelY ?? 0} className="fill-ink-3 text-caption">
              usual
            </text>
          </g>
        ) : null}
        {detail ? <line x1={0} x2={width - 4} y1={height - m.bottom} y2={height - m.bottom} stroke="var(--line-strong)" strokeWidth={1} /> : null}
        {detail
          ? points.map((p, i) =>
              p.low !== undefined && p.high !== undefined ? (
                <g key={`ci-${p.key}`}>
                  <rect x={x(i) - 4} width={8} y={y(p.high)} height={Math.max(2, y(p.low) - y(p.high))} rx={4} fill="var(--ink-2)" fillOpacity={0.12} />
                  {p.low80 !== undefined && p.high80 !== undefined ? (
                    <rect x={x(i) - 4} width={8} y={y(p.high80)} height={Math.max(2, y(p.low80) - y(p.high80))} rx={4} fill="var(--ink-2)" fillOpacity={0.22} />
                  ) : null}
                </g>
              ) : null,
            )
          : null}
        {points.length > 1 ? <path d={line} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {points.map((p, i) =>
          i === last ? null : (
            <ValuePoint key={p.key} x={x(i)} y={y(p.value)} r={p.provisional ? 2 : 3} tone={p.provisional ? 'muted' : 'ink'} hollow={hollow} />
          ),
        )}
        {last >= 0 ? (
          <g>
            <ValuePoint x={lx} y={ly} r={5} tone="good" hollow={hollow} />
            <text
              x={labelX}
              y={labelBelow ? ly + 20 : ly - 10}
              textAnchor={labelAnchor}
              className="fill-ink text-footnote font-label tabular-nums"
            >
              {latestLabel}
            </text>
          </g>
        ) : null}
        {detail && points.length ? (
          <g className="fill-ink-3 text-caption">
            <text x={x(0)} y={height - 6} textAnchor={points.length === 1 ? 'middle' : 'start'}>
              {points[0].label}
            </text>
            {points.length > 1 ? (
              <text x={x(last)} y={height - 6} textAnchor="end">
                {points[last].label}
              </text>
            ) : null}
          </g>
        ) : null}
      </PlotSurface>
    </div>
  )
}
