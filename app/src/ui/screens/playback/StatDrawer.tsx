/**
 * "This serve" drawer (DESIGN §8.11 item 4, §10.7): a persistent bottom sheet. Peek shows two values
 * (portrait clip) or three (landscape clip), the focus metric first. Expanded shows the outcome tag,
 * serve attributes, exclusions, every per-serve value grouped by phase, the experimental group when
 * the toggle is on, and unavailable rows with their reasons at the end. Tap the handle or swipe it.
 */
import { CaretUpIcon } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MetricValue, SectionLabel, UnavailableRow } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { metricName } from '../../copy/metricNames.ts'
import { UI } from '../../copy/strings.ts'
import { paths } from '../../shell/paths.ts'
import type { MetricGroup, MetricRow, UnavailableItem } from './serveView.ts'

export function MetricLine({ row, focus = false }: { row: MetricRow; focus?: boolean }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 text-subhead text-ink-2">
        {metricName(row.id)}
        {focus ? <span className="sr-only"> (focus)</span> : null}
      </span>
      <MetricValue metricId={row.id} value={row.value} className="items-end text-right" detail={false} />
    </li>
  )
}

export interface StatDrawerProps {
  peek: MetricRow[]
  focusIds: readonly string[]
  groups: MetricGroup[]
  experimental: MetricRow[]
  unavailable: UnavailableItem[]
  /** Outcome, attributes, exclusions and actions shown first when expanded. */
  header: ReactNode
  /** Key-frame strip and compare (portrait clips put them in the drawer). */
  extras?: ReactNode
  expanded: boolean
  onExpandedChange: (open: boolean) => void
}

export function StatDrawer({ peek, focusIds, groups, experimental, unavailable, header, extras, expanded, onExpandedChange }: StatDrawerProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const [peekH, setPeekH] = useState(0)
  const peekRef = useRef<HTMLDivElement>(null)

  const expandedRef = useRef(expanded)
  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  useEffect(() => {
    const el = peekRef.current
    if (!el) return
    // Only the collapsed layout sets the peek height.
    const measure = () => {
      if (!expandedRef.current) setPeekH(el.offsetHeight)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExpandedChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, onExpandedChange])

  return (
    <>
      {expanded ? <div aria-hidden="true" className="fixed inset-0 z-(--z-sheet) bg-(--scrim)" onClick={() => onExpandedChange(false)} /> : null}
      <section
        ref={panel}
        aria-labelledby={titleId}
        data-expanded={expanded || undefined}
        className={cx(
          'fixed inset-x-0 bottom-0 z-(--z-sheet) mx-auto flex h-[88dvh] max-w-(--content-max) flex-col rounded-t-sheet border-t border-sheet-edge bg-sheet shadow-sheet court:border-t-2',
          'transition-transform duration-(--dur-base) ease-standard motion-reduce:transition-none',
        )}
        style={{ transform: expanded ? 'translateY(0)' : `translateY(calc(100% - ${peekH}px))` }}
      >
        <div ref={peekRef} className="shrink-0 pb-[max(8px,env(safe-area-inset-bottom))]">
          <div className="relative flex w-full flex-col items-center gap-1 pt-2">
            <span aria-hidden="true" className="h-[5px] w-9 rounded-full bg-ink-3 opacity-40" />
            <div className="gutter flex h-9 w-full items-center justify-between">
              <h2 id={titleId} className="text-headline text-ink">
                This serve
              </h2>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${titleId}-body`}
            onClick={() => onExpandedChange(!expanded)}
            onPointerDown={(e) => (drag.current = e.clientY)}
            onPointerUp={(e) => {
              const start = drag.current
              drag.current = null
              if (start === null) return
              const dy = e.clientY - start
              if (dy < -30 && !expanded) {
                e.preventDefault()
                onExpandedChange(true)
              } else if (dy > 30 && expanded) {
                e.preventDefault()
                onExpandedChange(false)
              }
            }}
            className="flex h-11 touch-none items-center gap-1 rounded-control text-footnote font-label text-ink-2 after:absolute after:inset-0"
          >
            {expanded ? 'Show less' : 'All values'}
            <CaretUpIcon size={16} aria-hidden="true" className={cx('transition-transform duration-(--dur-fast) motion-reduce:transition-none', expanded && 'rotate-180')} />
          </button>
            </div>
          </div>
          {!expanded ? (
            <ul className="gutter flex flex-col" aria-label="Values for this serve">
              {peek.length ? (
                peek.map((r) => <MetricLine key={r.id} row={r} focus={focusIds.includes(r.id)} />)
              ) : (
                <li className="py-2 text-footnote text-ink-3">No values measured on this serve.</li>
              )}
            </ul>
          ) : null}
        </div>
        <div id={`${titleId}-body`} hidden={!expanded} className="gutter min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-6 pt-1">
            {header}
            {extras}
            {groups.map((g) => (
              <section key={g.title} aria-label={g.title} className="flex flex-col">
                <SectionLabel as="h3">{g.title}</SectionLabel>
                <ul className="divide-y divide-line">
                  {g.rows.map((r) => (
                    <MetricLine key={r.id} row={r} focus={focusIds.includes(r.id)} />
                  ))}
                </ul>
              </section>
            ))}
            {experimental.length ? (
              <section aria-label={UI.experimentalHeader} className="flex flex-col gap-1">
                <SectionLabel as="h3">{UI.experimentalHeader}</SectionLabel>
                <p className="text-footnote text-ink-3">{UI.experimentalLine}</p>
                <ul className="divide-y divide-line">
                  {experimental.map((r) => (
                    <MetricLine key={r.id} row={r} />
                  ))}
                </ul>
              </section>
            ) : null}
            {unavailable.length ? (
              <section aria-label={UI.notAvailableHeader} className="flex flex-col gap-1">
                <SectionLabel as="h3">{UI.notAvailableHeader}</SectionLabel>
                <ul className="-mx-4">
                  {unavailable.map((u) => (
                    <UnavailableRow key={u.id} metricId={u.id} reasonCode={u.reasonCode} to={paths.metricInfo(u.id)} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </>
  )
}
