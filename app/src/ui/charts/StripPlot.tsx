import type { OutcomeMarkKind } from '../copy/strings.ts'
import { beeswarm } from './layout.ts'
import { ServeMark } from './marks.tsx'
import { BAND_CLASS } from './markStyle.ts'
import { PlotSurface, type PlotTarget } from './PlotSurface.tsx'
import { useChartWidth } from './useChartWidth.ts'
import { formatTick as defaultTick, linear, niceTicks, tickStep, type Domain } from './scale.ts'

export interface StripDatum {
  id: string
  value: number
  kind: OutcomeMarkKind
  hollow?: boolean
  experimental?: boolean
  /** Soft-flagged or early-read marks: --ink-3. */
  muted?: boolean
  callout: string
}

export interface StripRow {
  key: string
  /** Row label in a 64 px left column (DESIGN §9.7 rows); omit for a single strip. */
  label?: string
  sublabel?: string
  data: StripDatum[]
  /** Median tick with its label ("median 3.42 m"). */
  median?: number
  medianLabel?: string
  /** The player's usual range behind the row. */
  band?: Domain | null
}

export interface StripPlotProps {
  rows: StripRow[]
  domain: Domain
  /** Unit added to the last tick label ("3.6 m"). */
  unit?: string
  formatTick?: (value: number, step: number) => string
  /** Accessible summary. */
  label: string
  onOpen?: (id: string) => void
  rowHeight?: number
  /** Marks at r 3.5 (before/after evidence strips) instead of r 4. */
  size?: number
}

/**
 * Serve strip (DESIGN §9.3): one mark per serve in the outcome vocabulary, beeswarmed so overlapping
 * marks stay visible, a median tick and the player's usual band behind the row; x-axis at the bottom
 * with 3 ticks and the unit on the last one.
 */
export function StripPlot({ rows, domain, unit, formatTick = defaultTick, label, onOpen, rowHeight = 56, size = 8 }: StripPlotProps) {
  const { ref, width } = useChartWidth()
  const labelled = rows.some((r) => r.label)
  const left = labelled ? 72 : 8
  const right = 8
  const axisH = 22
  const top = rows.some((r) => r.medianLabel) ? 14 : 0
  const height = top + rows.length * rowHeight + axisH
  const x = linear(domain, [left, width - right])
  const ticks = niceTicks(domain, 3)
  const step = tickStep(domain, 3)
  const targets: PlotTarget[] = []
  const rowEls = rows.map((row, ri) => {
    const cy = top + ri * rowHeight + rowHeight / 2 + 4
    const xs = row.data.map((d) => x(Math.min(domain[1], Math.max(domain[0], d.value))))
    const offsets = beeswarm(xs, { diameter: size, step: Math.round(size + 1) })
    row.data.forEach((d, i) => targets.push({ id: d.id, x: xs[i], y: cy + offsets[i], callout: d.callout }))
    const mx = row.median !== undefined ? x(row.median) : null
    const flip = mx !== null && mx > (left + width - right) / 2
    return (
      <g key={row.key}>
        {row.band ? (
          <rect x={x(row.band[0])} width={Math.max(2, x(row.band[1]) - x(row.band[0]))} y={cy - 22} height={44} rx={6} className={BAND_CLASS} />
        ) : null}
        {row.band ? (
          <text x={x(row.band[0]) + 3} y={cy + 19} className="fill-ink-3 text-caption">
            usual
          </text>
        ) : null}
        {row.label ? (
          <g>
            <text x={0} y={cy - (row.sublabel ? 3 : -4)} className="fill-ink-2 text-footnote font-label">
              {row.label}
            </text>
            {row.sublabel ? (
              <text x={0} y={cy + 13} className="fill-ink-3 text-caption tabular-nums">
                {row.sublabel}
              </text>
            ) : null}
          </g>
        ) : null}
        {mx !== null ? (
          <g>
            <rect x={mx - 1} y={cy - 14} width={2} height={28} fill="var(--ink)" />
            {row.medianLabel ? (
              <text x={flip ? mx - 5 : mx + 5} y={cy - rowHeight / 2 - 2} textAnchor={flip ? 'end' : 'start'} className="fill-ink text-caption tabular-nums">
                {row.medianLabel}
              </text>
            ) : null}
          </g>
        ) : null}
        {row.data.map((d, i) => (
          <ServeMark key={d.id} kind={d.kind} x={xs[i]} y={cy + offsets[i]} size={size} hollow={d.hollow} experimental={d.experimental} muted={d.muted} />
        ))}
      </g>
    )
  })
  const axisY = top + rows.length * rowHeight + 4
  return (
    <div ref={ref} className="w-full">
      <PlotSurface width={width} height={height} label={label} targets={targets} onOpen={onOpen}>
        {rowEls}
        <line x1={left} x2={width - right} y1={axisY} y2={axisY} stroke="var(--line-strong)" strokeWidth={1} />
        {ticks.map((t, i) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 4} stroke="var(--line-strong)" strokeWidth={1} />
            <text
              x={x(t)}
              y={axisY + 17}
              textAnchor={i === ticks.length - 1 && x(t) > width - 30 ? 'end' : 'middle'}
              className="fill-ink-3 text-caption tabular-nums"
            >
              {formatTick(t, step)}
              {unit && i === ticks.length - 1 ? ` ${unit}` : ''}
            </text>
          </g>
        ))}
      </PlotSurface>
    </div>
  )
}
