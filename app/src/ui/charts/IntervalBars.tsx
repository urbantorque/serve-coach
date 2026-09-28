import type { OutcomeMarkKind } from '../copy/strings.ts'
import { beeswarm, packUnits } from './layout.ts'
import { ServeMark } from './marks.tsx'
import { BAND_CLASS, INTERVAL_FILL } from './markStyle.ts'
import { PlotSurface, type PlotTarget } from './PlotSurface.tsx'
import { useChartWidth } from './useChartWidth.ts'
import { formatTick as defaultTick, linear, niceTicks, tickStep, type Domain } from './scale.ts'

export interface IntervalRow {
  key: string
  /** "Before" / "After" (64 px left column, footnote 600). */
  label: string
  /** "1 session, 20 serves" (caption under the label). */
  sublabel?: string
  /** Emphasis form (DESIGN §2.5b): before = neutral, after = good. */
  tone: 'neutral' | 'good'
  estimate: number
  ci95: Domain
  ci80: Domain
  /** Per-serve values, drawn as r 3.5 dots beeswarmed within ± 14 px (centres). */
  dots?: { id: string; value: number; callout: string }[]
  /** Rates: a unit row of n tiny outcome marks (ins first), instead of dots. */
  units?: OutcomeMarkKind[]
  /** Callout for the estimate tick. */
  callout: string
}

export interface IntervalBarsProps {
  rows: IntervalRow[]
  domain: Domain
  /** "About the same" zone: before estimate ± SWC (METRICS §4.5). */
  sameZone?: Domain | null
  /** Unit on the last tick ("cm"). */
  unit?: string
  formatTick?: (value: number, step: number) => string
  /** Direction label at the axis end for lower-is-better metrics ("← Steadier"). */
  directionLabel?: string
  label: string
  onOpen?: (id: string) => void
}

const LEFT = 72
const RIGHT = 10
const TOP = 20
const ROW_H = 66
const AXIS_H = 24

/**
 * Before / after comparison with gradient interval bars (DESIGN §9.7): per row, the CI95 bar as an
 * outlined tint and the CI80 bar solid in the row colour (INTERVAL_FILL), the estimate as a 2 × 18 px tick, per-serve dots or a
 * unit row of outcome marks, and the "About the same" zone behind both rows so the picture and the
 * verdict agree. Never a T-shaped error bar.
 */
export function IntervalBars({ rows, domain, sameZone, unit, formatTick = defaultTick, directionLabel, label, onOpen }: IntervalBarsProps) {
  const { ref, width } = useChartWidth()
  const height = TOP + rows.length * ROW_H + AXIS_H
  const x = linear(domain, [LEFT, width - RIGHT])
  const clamp = (v: number) => Math.min(width - RIGHT, Math.max(LEFT, x(v)))
  const ticks = niceTicks(domain, 3)
  const step = tickStep(domain, 3)
  const targets: PlotTarget[] = []

  const rowEls = rows.map((r, ri) => {
    const cy = TOP + ri * ROW_H + ROW_H / 2 - 6
    const colour = r.tone === 'good' ? 'var(--good)' : 'var(--neutral)'
    const barY = cy - 5
    targets.push({ id: `${r.key}-estimate`, x: clamp(r.estimate), y: cy, callout: r.callout })
    let dotEls = null
    if (r.dots?.length) {
      const xs = r.dots.map((d) => clamp(d.value))
      const off = beeswarm(xs, { diameter: 7, step: 7, maxSteps: 2 })
      dotEls = r.dots.map((d, i) => {
        const dy = cy + 18 + off[i] * 0.5
        targets.push({ id: d.id, x: xs[i], y: dy, callout: d.callout })
        return <circle key={d.id} cx={xs[i]} cy={dy} r={3.5} fill={colour} stroke="var(--surface)" strokeWidth={1.5} paintOrder="stroke" />
      })
    }
    let unitEls = null
    if (r.units?.length) {
      const pitch = r.units.length > 30 ? 7 : 9
      const pts = packUnits(r.units.length, width - LEFT - RIGHT, pitch, 0)
      unitEls = r.units.map((k, i) => (
        <ServeMark key={i} kind={k} x={LEFT + pts[i].x} y={cy + 12 + pts[i].y} size={pitch - 3} />
      ))
    }
    return (
      <g key={r.key}>
        <text x={0} y={cy - 2} className="fill-ink-2 text-footnote font-label">
          {r.label}
        </text>
        {r.sublabel ? (
          <text x={0} y={cy + 13} className="fill-ink-3 text-caption tabular-nums">
            {r.sublabel}
          </text>
        ) : null}
        {/* The 95% range carries a full-colour outline so its ends pass 3:1 in every set (WCAG 1.4.11);
            the 80% range is solid, >= 3:1 against the 95% tint in Day, Night and Court-side (in sun the
            95% tint is stronger, 30%). The estimate tick is ink with a surface halo, so it never merges
            with the solid 80% bar. */}
        <rect x={clamp(r.ci95[0]) + 0.5} width={Math.max(4, clamp(r.ci95[1]) - clamp(r.ci95[0])) - 1} y={barY + 0.5} height={9} rx={4.5} fill={colour} fillOpacity={INTERVAL_FILL.ci95} stroke={colour} strokeWidth={1} className="court:[fill-opacity:0.3]" data-interval="95" />
        <rect x={clamp(r.ci80[0])} width={Math.max(4, clamp(r.ci80[1]) - clamp(r.ci80[0]))} y={barY} height={10} rx={5} fill={colour} fillOpacity={INTERVAL_FILL.ci80} data-interval="80" />
        <rect x={clamp(r.estimate) - 1} y={cy - 9} width={2} height={18} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} paintOrder="stroke" data-interval="estimate" />
        {dotEls}
        {unitEls}
      </g>
    )
  })

  const axisY = TOP + rows.length * ROW_H
  return (
    <div ref={ref} className="w-full">
      <PlotSurface width={width} height={height} label={label} targets={targets} onOpen={onOpen}>
        {sameZone ? (
          <g>
            <rect
              x={clamp(sameZone[0])}
              width={Math.max(2, clamp(sameZone[1]) - clamp(sameZone[0]))}
              y={TOP - 4}
              height={rows.length * ROW_H}
              rx={6}
              className={BAND_CLASS}
            />
            <text x={(clamp(sameZone[0]) + clamp(sameZone[1])) / 2} y={TOP - 8} textAnchor="middle" className="fill-ink-3 text-caption">
              About the same
            </text>
          </g>
        ) : null}
        {rowEls}
        <line x1={LEFT} x2={width - RIGHT} y1={axisY} y2={axisY} stroke="var(--line-strong)" strokeWidth={1} />
        {ticks.map((t, i) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 4} stroke="var(--line-strong)" strokeWidth={1} />
            <text
              x={x(t)}
              y={axisY + 17}
              textAnchor={i === ticks.length - 1 && x(t) > width - 36 ? 'end' : 'middle'}
              className="fill-ink-3 text-caption tabular-nums"
            >
              {formatTick(t, step)}
              {unit && i === ticks.length - 1 ? ` ${unit}` : ''}
            </text>
          </g>
        ))}
        {directionLabel ? (
          <text x={LEFT - 6} y={axisY + 17} textAnchor="end" className="fill-ink-3 text-caption">
            {directionLabel}
          </text>
        ) : null}
      </PlotSurface>
    </div>
  )
}
