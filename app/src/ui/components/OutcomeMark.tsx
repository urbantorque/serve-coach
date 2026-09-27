import type { OutcomeMarkKind } from '../copy/strings.ts'
import { cx } from './cx.ts'


/**
 * The serve-dot vocabulary (DESIGN §2.6): a data mark, not an icon. In = filled circle (--good);
 * Net = triangle point up (--bad); Long / Wide / Fault = cross (--bad); untagged = small circle
 * (--neutral). Player-entered marks in charts are hollow (`hollow`), experimental marks dashed.
 * Every mark carries a 2 px ring in the surface colour so overlapping marks stay legible.
 */
export function OutcomeMark({
  outcome,
  size = 8,
  hollow = false,
  experimental = false,
  label,
  className,
}: {
  outcome: OutcomeMarkKind
  size?: number
  hollow?: boolean
  experimental?: boolean
  /** Accessible name; decorative (aria-hidden) when omitted because a word sits beside it. */
  label?: string
  className?: string
}) {
  const box = size + 4
  const c = box / 2
  const colour = outcome === 'in' ? 'var(--good)' : outcome === 'untagged' ? 'var(--neutral)' : 'var(--bad)'
  const dash = experimental ? '3 2' : undefined
  const ring = 'var(--surface)'
  let mark
  if (outcome === 'in' || outcome === 'untagged') {
    const r = outcome === 'untagged' ? (size * 3) / 8 : size / 2
    mark = hollow || experimental ? (
      <circle cx={c} cy={c} r={r - 1} fill="none" stroke={colour} strokeWidth={experimental ? 1.5 : 2} strokeDasharray={dash} />
    ) : (
      <circle cx={c} cy={c} r={r} fill={colour} stroke={ring} strokeWidth={2} paintOrder="stroke" />
    )
  } else if (outcome === 'net') {
    const w = (size * 9) / 8
    const pts = `${c},${c - size / 2} ${c + w / 2},${c + size / 2} ${c - w / 2},${c + size / 2}`
    mark = hollow ? (
      <polygon points={pts} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" />
    ) : (
      <polygon points={pts} fill={colour} stroke={ring} strokeWidth={2} paintOrder="stroke" strokeLinejoin="round" />
    )
  } else {
    const h = size / 2
    mark = (
      <g stroke={colour} strokeWidth={size * 0.31} strokeLinecap="round" strokeDasharray={dash}>
        <line x1={c - h} y1={c - h} x2={c + h} y2={c + h} />
        <line x1={c - h} y1={c + h} x2={c + h} y2={c - h} />
      </g>
    )
  }
  return (
    <svg
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      className={cx('inline-block shrink-0', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      data-outcome={outcome}
    >
      {label ? <title>{label}</title> : null}
      {mark}
    </svg>
  )
}
