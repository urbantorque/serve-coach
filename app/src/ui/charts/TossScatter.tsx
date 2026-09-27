import type { OutcomeMarkKind } from '../copy/strings.ts'
import type { Ellipse } from './layout.ts'
import { CentroidMark, ServeMark } from './marks.tsx'
import { BAND_CLASS } from './markStyle.ts'
import { PlotSurface, type PlotTarget } from './PlotSurface.tsx'
import { useChartWidth } from './useChartWidth.ts'
import { linear, niceTicks } from './scale.ts'

export interface TossPoint {
  id: string
  /** Horizontal position in cm: forward of the front toe (side view, + = into the court). */
  xCm: number
  /** Apex height above the floor in cm. */
  yCm: number
  kind: OutcomeMarkKind
  /** Peak fitted above the picture (APEX_EXTRAPOLATED): drawn with its wider vertical interval. */
  extrapolated?: { lowCm: number; highCm: number }
  /** Soft-flagged value (DESIGN §3.3 rule 14): mark in --ink-3. */
  muted?: boolean
  experimental?: boolean
  callout: string
}

export interface TossCentroidPair {
  /** Centroids of the "in" serves and of the faults (METRICS §4.7 signature insight overlay). */
  inCentre: { xCm: number; yCm: number }
  faultCentre: { xCm: number; yCm: number }
  /** Difference label, already formatted ("12 cm"). */
  label: string
}

export interface TossScatterProps {
  points: TossPoint[]
  /** The player's usual area (1.5 SD ellipse of previous matched sessions), in cm. */
  usual?: Ellipse | null
  /** Centroid of this session, in cm (drawn as a "+"). */
  centroid?: { xCm: number; yCm: number } | null
  pair?: TossCentroidPair | null
  /** 180 in the hero tile, 240 in Metric info (DESIGN §9.4). */
  height?: number
  /** Bottom-right axis title ("Into court →"). */
  xTitle?: string
  /** Label of the vertical reference line at x = 0 ("Front toe"). */
  refLabel?: string
  /** Accessible summary of the data. */
  label: string
  onOpen?: (id: string) => void
}

const M = { top: 22, right: 10, bottom: 22, left: 10 }

/**
 * Toss map (DESIGN §9.4): each serve's toss peak, forward position against height, drawn at equal
 * scale (1 cm is the same number of px on both axes) so the width and height of the cloud compare
 * by eye. "Into court" is always to the right. The player's usual area is a --band ellipse; the
 * centroid is a "+". Per-serve uncertainty is not drawn except for peaks above the picture.
 */
export function TossScatter({
  points,
  usual,
  centroid,
  pair,
  height = 180,
  xTitle = 'Into court →',
  refLabel = 'Front toe',
  label,
  onOpen,
}: TossScatterProps) {
  const { ref, width } = useChartWidth()
  const plotW = Math.max(40, width - M.left - M.right)
  const plotH = Math.max(40, height - M.top - M.bottom)

  const xs = points.map((p) => p.xCm)
  const ys = points.map((p) => p.yCm)
  const cx = centroid?.xCm ?? (xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0)
  const cy = centroid?.yCm ?? (ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 300)
  // Horizontal span: max(80 cm, 1.3 × data extent), including the usual area; vertical from the aspect.
  const xExt = xs.length ? Math.max(...xs.map((x) => Math.abs(x - cx))) * 2 : 0
  const yExt = ys.length ? Math.max(...ys.map((y) => Math.abs(y - cy))) * 2 : 0
  const usualX = usual ? Math.max(Math.abs(usual.cx - cx) + Math.max(usual.rx, usual.ry), 0) * 2 : 0
  const usualY = usual ? Math.max(Math.abs(usual.cy - cy) + Math.max(usual.rx, usual.ry), 0) * 2 : 0
  let spanX = Math.max(80, 1.3 * xExt, 1.1 * usualX)
  let spanY = (spanX * plotH) / plotW
  const needY = Math.max(1.3 * yExt, 1.1 * usualY, 20)
  if (needY > spanY) {
    spanY = needY
    spanX = (spanY * plotW) / plotH
  }
  const x = linear([cx - spanX / 2, cx + spanX / 2], [M.left, M.left + plotW])
  const y = linear([cy - spanY / 2, cy + spanY / 2], [M.top + plotH, M.top])
  const pxPerCm = plotW / spanX
  const usualR = usual ? Math.max(usual.rx, usual.ry) * pxPerCm : 0
  const usualLabelY = usual
    ? y(usual.cy) + usualR + 12 <= M.top + plotH - 2
      ? y(usual.cy) + usualR + 12
      : Math.max(M.top + 10, y(usual.cy) - usualR - 4)
    : 0

  // Two horizontal gridlines at round heights (m), labelled at the left.
  const gridM = niceTicks([(cy - spanY / 2) / 100, (cy + spanY / 2) / 100], 3)
    .filter((t) => y(t * 100) > M.top + 12 && y(t * 100) < M.top + plotH - 4)
    .slice(0, 2)
  const zeroIn = x(0) >= M.left && x(0) <= M.left + plotW
  const clampX = (v: number) => Math.min(M.left + plotW, Math.max(M.left, x(v)))
  const clampY = (v: number) => Math.min(M.top + plotH, Math.max(M.top, y(v)))

  const targets: PlotTarget[] = points.map((p) => ({ id: p.id, x: clampX(p.xCm), y: clampY(p.yCm), callout: p.callout }))

  return (
    <div ref={ref} className="w-full">
      <PlotSurface width={width} height={height} label={label} targets={targets} onOpen={onOpen}>
        {gridM.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t * 100)} y2={y(t * 100)} stroke="var(--line)" strokeWidth={1} />
            <text x={M.left} y={y(t * 100) - 4} className="fill-ink-3 text-caption tabular-nums">
              {t.toFixed(1)} m
            </text>
          </g>
        ))}
        {usual ? (
          <g>
            <ellipse
              cx={x(usual.cx)}
              cy={y(usual.cy)}
              rx={Math.max(4, usual.rx * pxPerCm)}
              ry={Math.max(4, usual.ry * pxPerCm)}
              transform={`rotate(${-usual.angle} ${x(usual.cx)} ${y(usual.cy)})`}
              className={BAND_CLASS}
              stroke="var(--line-strong)"
              strokeWidth={1}
            />
            {/* "usual" sits just outside the ellipse (below it, or above when there is no room) so marks never cover it. */}
            <text x={x(usual.cx)} y={usualLabelY} textAnchor="middle" className="fill-ink-3 text-caption">
              usual
            </text>
          </g>
        ) : null}
        {zeroIn ? (
          <g>
            <line x1={x(0)} x2={x(0)} y1={M.top} y2={M.top + plotH} stroke="var(--line-strong)" strokeWidth={1} />
            <text
              x={x(0) + (x(0) > width - 70 ? -4 : 4)}
              y={M.top - 8}
              textAnchor={x(0) > width - 70 ? 'end' : 'start'}
              className="fill-ink-3 text-caption"
            >
              {refLabel}
            </text>
          </g>
        ) : (
          <text
            x={x(0) < M.left ? M.left : M.left + plotW}
            y={M.top - 8}
            textAnchor={x(0) < M.left ? 'start' : 'end'}
            className="fill-ink-3 text-caption tabular-nums"
          >
            {x(0) < M.left ? `← ${refLabel} ${Math.round(Math.abs(cx - spanX / 2))} cm` : `${refLabel} ${Math.round(Math.abs(cx + spanX / 2))} cm →`}
          </text>
        )}
        <line x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} stroke="var(--line-strong)" strokeWidth={1} />
        <text x={M.left + plotW} y={height - 5} textAnchor="end" className="fill-ink-3 text-caption">
          {xTitle}
        </text>
        {points.map((p) =>
          p.extrapolated ? (
            <line
              key={`ext-${p.id}`}
              x1={clampX(p.xCm)}
              x2={clampX(p.xCm)}
              y1={clampY(p.extrapolated.highCm)}
              y2={clampY(p.extrapolated.lowCm)}
              stroke="var(--ink-2)"
              strokeWidth={1}
            />
          ) : null,
        )}
        {points.map((p) => (
          <ServeMark key={p.id} kind={p.kind} x={clampX(p.xCm)} y={clampY(p.yCm)} muted={p.muted} experimental={p.experimental} />
        ))}
        {pair ? (
          <g>
            <line
              x1={x(pair.inCentre.xCm)}
              y1={y(pair.inCentre.yCm)}
              x2={x(pair.faultCentre.xCm)}
              y2={y(pair.faultCentre.yCm)}
              stroke="var(--ink-2)"
              strokeWidth={1}
            />
            <CentroidMark x={x(pair.inCentre.xCm)} y={y(pair.inCentre.yCm)} />
            <CentroidMark x={x(pair.faultCentre.xCm)} y={y(pair.faultCentre.yCm)} />
            <text x={x(pair.inCentre.xCm) + 8} y={y(pair.inCentre.yCm) - 8} className="fill-ink text-caption">
              In
            </text>
            <text x={x(pair.faultCentre.xCm) + 8} y={y(pair.faultCentre.yCm) - 8} className="fill-ink text-caption">
              Faults
            </text>
            <text
              x={(x(pair.inCentre.xCm) + x(pair.faultCentre.xCm)) / 2}
              y={(y(pair.inCentre.yCm) + y(pair.faultCentre.yCm)) / 2 + 14}
              textAnchor="middle"
              className="fill-ink-2 text-caption tabular-nums"
            >
              {pair.label}
            </text>
          </g>
        ) : centroid ? (
          <CentroidMark x={x(centroid.xCm)} y={y(centroid.yCm)} />
        ) : null}
      </PlotSurface>
    </div>
  )
}
