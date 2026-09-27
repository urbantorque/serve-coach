import { ArrowDownIcon, ArrowUpIcon } from '@phosphor-icons/react'
import { useId, useState, type ReactNode } from 'react'
import type { MetricStatus } from '../../analysis/types.ts'
import { Badge } from '../components/Badge.tsx'
import { cx } from '../components/cx.ts'
import { StatusChip, StatusGlyph } from '../components/StatusChip.tsx'
import { UI } from '../copy/strings.ts'

export interface ChartTable {
  /** Visually hidden caption naming what the rows are. */
  caption: string
  columns: string[]
  rows: { key: string; cells: ReactNode[] }[]
}

export interface ChartFrameProps {
  /** Takeaway sentence, not just the metric name (DESIGN §9.1). */
  title: ReactNode
  /** Matched conditions in words ("Side view, deuce, first serves"). */
  subtitle?: ReactNode
  /** Data state of what is plotted: the chip on the title row (every number carries its status). */
  status?: MetricStatus
  /** Metric id for the honesty tests (`data-metric` + `data-status`). */
  metricId?: string
  earlyRead?: boolean
  /** Direction hint for metrics with a direction, never a red/green arrow (DESIGN §9.1). */
  direction?: 'lower-steadier' | 'lower-better' | 'higher-better'
  /** The plot. Replaced by `insufficient` when there is not enough data (DESIGN §9.1). */
  children?: ReactNode
  insufficient?: ReactNode
  /** Notes under the plot (caption lines, legend). */
  footer?: ReactNode
  /** The table view: the accessible equivalent of the plot. */
  table?: ChartTable
  /** 'card' wraps the figure in a level-1 card; 'plain' when it sits inside another card. */
  variant?: 'card' | 'plain'
  /** Heading level for the title (h3 by default; h2 when the chart starts a section). */
  headingLevel?: 'h2' | 'h3'
  className?: string
}

const DIRECTION = {
  'lower-steadier': { icon: ArrowDownIcon, text: 'Lower is steadier' },
  'lower-better': { icon: ArrowDownIcon, text: 'Lower is better' },
  'higher-better': { icon: ArrowUpIcon, text: 'Higher is better' },
} as const

/**
 * Chart container (DESIGN §9.1): a <figure> with a takeaway title, the data-state chip on the title
 * row, a subtitle naming the matched conditions, the plot, and a "Show as table" toggle revealing a
 * <table> with the same rows. Tooltips never hold information the table lacks.
 */
export function ChartFrame({
  title,
  subtitle,
  status,
  metricId,
  earlyRead,
  direction,
  children,
  insufficient,
  footer,
  table,
  variant = 'card',
  headingLevel: H = 'h3',
  className,
}: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false)
  const titleId = useId()
  const tableId = useId()
  const dir = direction ? DIRECTION[direction] : null
  return (
    <figure
      aria-labelledby={titleId}
      className={cx('flex min-w-0 flex-col gap-3', variant === 'card' && 'card p-4', className)}
      data-chart=""
    >
      <figcaption className="flex flex-col gap-1">
        <span className="flex items-start justify-between gap-3">
          <H id={titleId} className="text-headline text-ink text-balance">
            {title}
          </H>
          {status ? (
            <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5" {...(metricId ? { 'data-metric': metricId, 'data-status': status } : {})}>
              <StatusChip status={status} />
              {earlyRead ? <Badge>{UI.earlyRead}</Badge> : null}
            </span>
          ) : null}
        </span>
        {subtitle ? <span className="text-footnote text-ink-3">{subtitle}</span> : null}
        {dir ? (
          <span className="flex items-center gap-1 text-footnote text-ink-3">
            <dir.icon size={12} aria-hidden="true" />
            {dir.text}
          </span>
        ) : null}
      </figcaption>
      {insufficient ? (
        <p className="flex items-start gap-2 text-callout text-ink-2">
          <StatusGlyph status="unavailable" size={16} className="mt-1 shrink-0 text-ink-3" />
          <span>{insufficient}</span>
        </p>
      ) : (
        children
      )}
      {footer ? <div className="flex flex-col gap-1 text-footnote text-ink-3">{footer}</div> : null}
      {table && !insufficient && table.rows.length ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={showTable}
            aria-controls={tableId}
            onClick={() => setShowTable((v) => !v)}
            className="-ml-1 inline-flex h-11 items-center self-start rounded-control px-1 text-footnote font-label text-ink underline underline-offset-[3px] hover:bg-surface-2 active:bg-surface-2"
          >
            {showTable ? 'Hide table' : 'Show as table'}
          </button>
          {showTable ? (
            <div id={tableId} className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-left text-footnote tabular-nums text-ink-2">
                <caption className="sr-only">{table.caption}</caption>
                <thead>
                  <tr className="border-b border-line">
                    {table.columns.map((c) => (
                      <th key={c} scope="col" className="px-1 py-2 font-label text-ink-3">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((r) => (
                    <tr key={r.key} className="border-b border-line last:border-b-0">
                      {r.cells.map((cell, i) =>
                        i === 0 ? (
                          <th key={i} scope="row" className="px-1 py-2 font-label text-ink">
                            {cell}
                          </th>
                        ) : (
                          <td key={i} className="px-1 py-2 align-top">
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </figure>
  )
}
