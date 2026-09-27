import { useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { cx } from '../components/cx.ts'
import { nearestPoint, stepSelection } from './layout.ts'
import { BandHatch } from './marks.tsx'
import { cssId } from './markStyle.ts'

export interface PlotTarget {
  id: string
  /** Mark centre in plot px. */
  x: number
  y: number
  /** Callout text, value first then label ("3.42 m · Serve 7, in"). */
  callout: string
}

export interface PlotSurfaceProps {
  width: number
  height: number
  /**
   * Accessible summary of the data. A static plot is role="img"; one you can move through with the
   * arrow keys is role="application" (so screen readers pass the keys through) with its key help.
   * The table view is the full equivalent either way.
   */
  label: string
  targets?: PlotTarget[]
  /** Opens the selected mark (Enter, or a second tap on a selected mark). */
  onOpen?: (id: string) => void
  /** Extra <defs>; a Court-side band hatch is always defined and exposed as --hatch. */
  defs?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Shared plot surface (DESIGN §9.1): an SVG in CSS px with a data summary (role="img", or
 * role="application" with aria-roledescription="chart" and key help when interactive); a
 * nearest-point tap layer with a 24 px radius; keyboard selection (Tab focuses, arrows move, Enter
 * opens, Escape clears); a callout pill in --surface-inverse, value first; a polite live region.
 */
export function PlotSurface({ width, height, label, targets = [], onOpen, defs, children, className }: PlotSurfaceProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const uid = useId()
  const hatchId = cssId(uid)
  const helpId = `${cssId(uid)}-help`
  const svgRef = useRef<SVGSVGElement>(null)
  const order = useMemo(() => [...targets].sort((a, b) => a.x - b.x || a.y - b.y).map((t) => targets.indexOf(t)), [targets])
  const sel = selected === null ? null : targets.find((t) => t.id === selected) ?? null
  const interactive = targets.length > 0

  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !interactive) return
    const r = svg.getBoundingClientRect()
    const sx = r.width ? width / r.width : 1
    const sy = r.height ? height / r.height : 1
    const i = nearestPoint(targets, (e.clientX - r.left) * sx, (e.clientY - r.top) * sy, 24)
    if (i < 0) {
      setSelected(null)
      return
    }
    const id = targets[i].id
    if (id === selected && onOpen) onOpen(id)
    else setSelected(id)
  }

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!interactive) return
    const current = sel ? targets.indexOf(sel) : null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = stepSelection(order, current, e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1)
      setSelected(next === null ? null : targets[next].id)
    } else if (e.key === 'Enter' && sel && onOpen) {
      e.preventDefault()
      onOpen(sel.id)
    } else if (e.key === 'Escape' && sel) {
      e.preventDefault()
      setSelected(null)
    }
  }

  // Callout placement: above the mark, flipped below near the top, kept inside the plot.
  const align = sel ? (sel.x < width * 0.3 ? 'left' : sel.x > width * 0.7 ? 'right' : 'centre') : 'centre'
  const below = sel ? sel.y < 40 : false

  return (
    <div className={cx('relative', className)}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role={interactive ? 'application' : 'img'}
        aria-roledescription={interactive ? 'chart' : undefined}
        aria-label={label}
        aria-describedby={interactive ? helpId : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={pick}
        onKeyDown={onKeyDown}
        onBlur={() => setSelected(null)}
        className={cx('block overflow-visible rounded-media select-none', interactive && 'cursor-pointer touch-manipulation')}
        style={{ ['--hatch' as string]: `url(#${hatchId})` }}
        data-chart-plot=""
      >
        <defs>
          <BandHatch id={hatchId} />
          {defs}
        </defs>
        {children}
        {sel ? <circle cx={sel.x} cy={sel.y} r={9} fill="none" stroke="var(--ink)" strokeWidth={2} pointerEvents="none" /> : null}
      </svg>
      {sel ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-(--z-sticky) max-w-60 rounded-full bg-surface-inverse px-3 py-1 text-footnote whitespace-nowrap text-ink-inverse tabular-nums"
          style={{
            left: align === 'left' ? Math.max(0, sel.x - 16) : align === 'right' ? undefined : sel.x,
            right: align === 'right' ? Math.max(0, width - sel.x - 16) : undefined,
            top: below ? sel.y + 14 : sel.y - 14,
            transform: `translate(${align === 'centre' ? '-50%' : '0'}, ${below ? '0' : '-100%'})`,
          }}
        >
          {sel.callout}
        </div>
      ) : null}
      {interactive ? (
        <span id={helpId} className="sr-only">
          {`Use the arrow keys to move between points${onOpen ? ', Enter to open the selected one' : ''}, Escape to clear.`}
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {sel ? sel.callout : ''}
      </span>
    </div>
  )
}
