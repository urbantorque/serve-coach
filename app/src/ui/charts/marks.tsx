import type { OutcomeMarkKind } from '../copy/strings.ts'
import { OUTCOME_COLOUR } from './markStyle.ts'

/**
 * SVG serve marks drawn inside a chart (DESIGN §2.6, §9.1): the same geometry as `<OutcomeMark>`, but
 * as `<g>` primitives so they share the chart's coordinate system. In = filled circle (--good);
 * Net = triangle (--bad); Long / Wide / Fault = cross (--bad); untagged = small circle (--neutral).
 * Every mark has a 2 px ring in the chart surface colour. `hollow` = player-entered continuous value;
 * `experimental` = dashed ring (the only place dashes appear in data marks).
 */
export interface ServeMarkProps {
  kind: OutcomeMarkKind
  x: number
  y: number
  /** Nominal mark size in px (8 = r 4). */
  size?: number
  hollow?: boolean
  experimental?: boolean
  /** Early read / provisional: drawn in --ink-3 (DESIGN §3.3 rule 4). */
  muted?: boolean
  selected?: boolean
}


export function ServeMark({ kind, x, y, size = 8, hollow = false, experimental = false, muted = false, selected = false }: ServeMarkProps) {
  const colour = muted ? 'var(--ink-3)' : OUTCOME_COLOUR[kind]
  const ring = 'var(--surface)'
  const dash = experimental ? '3 2' : undefined
  let mark
  if (kind === 'in' || kind === 'untagged') {
    const r = kind === 'untagged' ? (size * 3) / 8 : size / 2
    mark =
      hollow || experimental ? (
        <>
          <circle cx={x} cy={y} r={r + 1} fill={ring} />
          <circle cx={x} cy={y} r={r - 0.5} fill="none" stroke={colour} strokeWidth={experimental ? 1.5 : 2} strokeDasharray={dash} />
        </>
      ) : (
        <circle cx={x} cy={y} r={r} fill={colour} stroke={ring} strokeWidth={2} paintOrder="stroke" />
      )
  } else if (kind === 'net') {
    const w = (size * 9) / 8
    const pts = `${x},${y - size / 2} ${x + w / 2},${y + size / 2} ${x - w / 2},${y + size / 2}`
    mark = hollow ? (
      <polygon points={pts} fill={ring} stroke={colour} strokeWidth={2} strokeLinejoin="round" />
    ) : (
      <polygon points={pts} fill={colour} stroke={ring} strokeWidth={2} paintOrder="stroke" strokeLinejoin="round" />
    )
  } else {
    const h = size / 2
    mark = (
      <g strokeLinecap="round" strokeDasharray={dash}>
        <g stroke={ring} strokeWidth={size * 0.31 + 3}>
          <line x1={x - h} y1={y - h} x2={x + h} y2={y + h} />
          <line x1={x - h} y1={y + h} x2={x + h} y2={y - h} />
        </g>
        <g stroke={colour} strokeWidth={size * 0.31}>
          <line x1={x - h} y1={y - h} x2={x + h} y2={y + h} />
          <line x1={x - h} y1={y + h} x2={x + h} y2={y - h} />
        </g>
      </g>
    )
  }
  return (
    <g data-mark={kind}>
      {mark}
      {selected ? <circle cx={x} cy={y} r={size / 2 + 4} fill="none" stroke="var(--ink)" strokeWidth={2} /> : null}
    </g>
  )
}

/** A plain value point (sparklines, trend detail): filled, hollow for player-entered, muted for early reads. */
export function ValuePoint({
  x,
  y,
  r = 3,
  tone = 'ink',
  hollow = false,
  experimental = false,
  selected = false,
}: {
  x: number
  y: number
  r?: number
  tone?: 'ink' | 'good' | 'neutral' | 'muted'
  hollow?: boolean
  experimental?: boolean
  selected?: boolean
}) {
  const colour = tone === 'good' ? 'var(--good)' : tone === 'neutral' ? 'var(--neutral)' : tone === 'muted' ? 'var(--ink-3)' : 'var(--ink-2)'
  return (
    <g>
      {hollow || experimental ? (
        <>
          <circle cx={x} cy={y} r={r + 1.5} fill="var(--surface)" />
          <circle cx={x} cy={y} r={r} fill="none" stroke={colour} strokeWidth={tone === 'good' ? 2.5 : 2} strokeDasharray={experimental ? '3 2' : undefined} />
        </>
      ) : (
        <circle cx={x} cy={y} r={r} fill={colour} stroke="var(--surface)" strokeWidth={2} paintOrder="stroke" />
      )}
      {selected ? <circle cx={x} cy={y} r={r + 4} fill="none" stroke="var(--ink)" strokeWidth={2} /> : null}
    </g>
  )
}

/** Centroid "+" (DESIGN §9.4): 12 px, 2 px --ink, with a surface halo. */
export function CentroidMark({ x, y, size = 12, stroke = 'var(--ink)' }: { x: number; y: number; size?: number; stroke?: string }) {
  const h = size / 2
  return (
    <g strokeLinecap="round">
      <g stroke="var(--surface)" strokeWidth={5}>
        <line x1={x - h} y1={y} x2={x + h} y2={y} />
        <line x1={x} y1={y - h} x2={x} y2={y + h} />
      </g>
      <g stroke={stroke} strokeWidth={2}>
        <line x1={x - h} y1={y} x2={x + h} y2={y} />
        <line x1={x} y1={y - h} x2={x} y2={y + h} />
      </g>
    </g>
  )
}

/**
 * Hatch pattern for the typical-range band in Court-side (DESIGN §2.4: 45° hatch, 1.5 px
 * --line-strong strokes, 6 px pitch). Charts reference it through the `--band-fill` custom property.
 */
export function BandHatch({ id }: { id: string }) {
  return (
    <pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={6} height={6} fill="var(--band)" />
      <line x1={0} y1={0} x2={0} y2={6} stroke="var(--line-strong)" strokeWidth={1.5} />
    </pattern>
  )
}
