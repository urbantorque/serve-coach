import type { ServeSide, TargetZone } from '../../analysis/types.ts'
import { packUnits } from './layout.ts'
import { ServeMark } from './marks.tsx'
import { PlotSurface, type PlotTarget } from './PlotSurface.tsx'
import { useChartWidth } from './useChartWidth.ts'

export type PlacementOutcome = 'in' | 'net' | 'long' | 'wide'

export interface PlacementServe {
  id: string
  outcome: PlacementOutcome
  /** The zone the player logged for this serve (result zone for ins, aimed zone for faults). */
  zone?: TargetZone
  callout: string
}

export interface PlacementMapProps {
  /** Court side served from: deuce boxes read Wide | Body | T from the left, ad boxes T | Body | Wide. */
  side: ServeSide
  serves: PlacementServe[]
  label: string
  onOpen?: (id: string) => void
}

const ZONES_DEUCE: TargetZone[] = ['wide', 'body', 'T']
const ZONES_AD: TargetZone[] = ['T', 'body', 'wide']
const ZONE_LABEL: Record<TargetZone, string> = { wide: 'Wide', body: 'Body', T: 'T' }

const BOX_W = 150
const BOX_H = 233
const STRIP = 32
const WIDE_STRIP = 40
const HEIGHT = 300
const MAX_MARKS = 12

interface Cell {
  key: string
  x: number
  y: number
  w: number
  h: number
  serves: PlacementServe[]
  label?: string
}

/**
 * Service-box map, side view (DESIGN §9.6): a schematic of the target box, to scale, with each
 * player-logged serve as a unit mark packed into the zone it was logged in. Net faults sit in the
 * Net strip under the column they were aimed at, long faults above the service line and wide faults
 * outside the outer sideline. It is not a measured landing spot; the caption says so.
 */
export function PlacementMap({ side, serves, label, onOpen }: PlacementMapProps) {
  const { ref, width } = useChartWidth()
  const zones = side === 'ad' ? ZONES_AD : ZONES_DEUCE
  const outerLeft = side === 'deuce'
  const bx = Math.round((width - BOX_W) / 2) + (outerLeft ? 12 : -12)
  const by = STRIP + 18
  const colW = BOX_W / 3
  const netY = by + BOX_H

  const colOf = (zone?: TargetZone) => (zone ? zones.indexOf(zone) : -1)
  const cells: Cell[] = zones.map((z, i) => ({
    key: `in-${z}`,
    x: bx + i * colW,
    y: by + 18,
    w: colW,
    h: BOX_H - 18,
    serves: serves.filter((s) => s.outcome === 'in' && s.zone === z),
  }))
  const netCells: Cell[] = zones.map((z, i) => ({
    key: `net-${z}`,
    x: bx + i * colW,
    y: netY + 4,
    w: colW,
    h: STRIP - 4,
    serves: serves.filter((s) => s.outcome === 'net' && colOf(s.zone) === i),
  }))
  const netUnaimed: Cell = {
    key: 'net-none',
    x: bx,
    y: netY + 4,
    w: BOX_W,
    h: STRIP - 4,
    serves: serves.filter((s) => s.outcome === 'net' && colOf(s.zone) < 0),
  }
  const longCell: Cell = { key: 'long', x: bx, y: by - STRIP, w: BOX_W, h: STRIP - 4, serves: serves.filter((s) => s.outcome === 'long'), label: 'Long' }
  const wideCell: Cell = {
    key: 'wide',
    x: outerLeft ? bx - WIDE_STRIP - 4 : bx + BOX_W + 4,
    y: by + 18,
    w: WIDE_STRIP,
    h: BOX_H - 18,
    serves: serves.filter((s) => s.outcome === 'wide'),
    label: 'Wide',
  }
  const inNoZone = serves.filter((s) => s.outcome === 'in' && colOf(s.zone) < 0)

  // Layout first (pure), then draw: every mark's centre is known before rendering.
  const layoutCell = (c: Cell) => {
    const many = c.serves.length > MAX_MARKS
    const shown = many ? c.serves.slice(0, 1) : c.serves
    const units = packUnits(shown.length, c.w, 12, 4)
    return shown.map((s, i) => ({ s, x: c.x + units[i].x, y: c.y + units[i].y }))
  }
  const placed = [...cells, ...netCells, netUnaimed, longCell, wideCell].flatMap(layoutCell)
  const targets: PlotTarget[] = placed.map((m) => ({ id: m.s.id, x: m.x, y: m.y, callout: m.s.callout }))
  const count = (c: Cell, x: number, y: number, anchor: 'start' | 'end' = 'end') =>
    c.serves.length ? (
      <text key={`n-${c.key}`} x={x} y={y} textAnchor={anchor} className="fill-ink text-headline tabular-nums">
        {c.serves.length}
      </text>
    ) : null

  const extraRow = inNoZone.length ? 22 : 0
  const height = HEIGHT + extraRow

  return (
    <div ref={ref} className="w-full">
      <PlotSurface width={width} height={height} label={label} targets={targets} onOpen={onOpen}>
        {/* Fault strips: labelled regions, no fill. */}
        <text x={bx + BOX_W / 2} y={by - STRIP - 6} textAnchor="middle" className="fill-ink-3 text-caption">
          Long
        </text>
        <text x={bx + BOX_W / 2} y={netY + STRIP + 14} textAnchor="middle" className="fill-ink-3 text-caption">
          Net
        </text>
        <text
          x={outerLeft ? bx - WIDE_STRIP / 2 - 4 : bx + BOX_W + WIDE_STRIP / 2 + 4}
          y={by + 12}
          textAnchor="middle"
          className="fill-ink-3 text-caption"
        >
          Wide
        </text>
        {/* The target box. */}
        <rect x={bx} y={by} width={BOX_W} height={BOX_H} fill="var(--surface-2)" stroke="var(--ink-2)" strokeWidth={2} />
        <line x1={bx + colW} x2={bx + colW} y1={by} y2={netY} stroke="var(--line)" strokeWidth={1} />
        <line x1={bx + 2 * colW} x2={bx + 2 * colW} y1={by} y2={netY} stroke="var(--line)" strokeWidth={1} />
        <line x1={bx - 40} x2={bx + BOX_W + 40} y1={netY} y2={netY} stroke="var(--ink-2)" strokeWidth={3} strokeLinecap="round" />
        {zones.map((z, i) => (
          <text key={z} x={bx + i * colW + 5} y={by + 14} className="fill-ink-2 text-caption">
            {ZONE_LABEL[z]}
          </text>
        ))}
        {placed.map((m) => (
          <ServeMark key={m.s.id} kind={m.s.outcome} x={m.x} y={m.y} size={8} />
        ))}
        {cells.map((c) => count(c, c.x + c.w - 4, by + 14))}
        {netCells.map((c) => count(c, c.x + c.w - 4, netY + STRIP + 14))}
        {count(netUnaimed, bx + BOX_W - 4, netY + STRIP + 14)}
        {count(longCell, bx + BOX_W - 4, by - STRIP - 6)}
        {count(wideCell, wideCell.x + wideCell.w / 2 + 6, by + BOX_H + 14, 'end')}
        {inNoZone.length ? (
          <g>
            <ServeMark kind="in" x={bx + 4} y={height - 10} size={8} />
            <text x={bx + 14} y={height - 6} className="fill-ink-2 text-footnote tabular-nums">
              In, zone not logged: {inNoZone.length}
            </text>
          </g>
        ) : null}
      </PlotSurface>
    </div>
  )
}
