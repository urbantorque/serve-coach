import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { MetricValue as MetricValueData } from '../../analysis/types.ts'
import { metricName } from '../copy/metricNames.ts'
import { STATUS_LABEL, UI } from '../copy/strings.ts'
import { formatMetric } from '../format/metricFormat.ts'
import { Badge } from './Badge.tsx'
import { cx } from './cx.ts'
import { MetricValue } from './MetricValue.tsx'
import { StatusChip } from './StatusChip.tsx'

export interface MetricTileProps {
  metricId: string
  value: MetricValueData
  /** Tile label; defaults to the metrics.json name. */
  label?: string
  /** The player's usual range in the metric's display unit, e.g. "0.88 to 0.98 s" (METRICS owns the definition). */
  usual?: string
  /** Where the tile goes (Metric info). Tiles are tappable as a whole. */
  to?: string
  onOpen?: () => void
  className?: string
}

/**
 * Standard metric tile (DESIGN §8.7): label, value + unit, context (usual or likely range), n, and
 * the data-state chip bottom-left. "Early read" is a text badge after the chip. The whole tile is one
 * tap target whose accessible name is the full sentence.
 */
export function MetricTile({ metricId, value, label, usual, to, onOpen, className }: MetricTileProps) {
  const f = formatMetric(metricId, value)
  const name = label ?? metricName(metricId)
  const context = usual ? `usual ${usual}` : f.detail
  const sentence = [
    f.aria.startsWith(metricName(metricId)) ? f.aria.replace(metricName(metricId), name) : f.aria,
    usual ? `usual range ${usual}` : undefined,
    value.provisional ? UI.earlyRead : undefined,
  ]
    .filter(Boolean)
    .join(', ')
  const body = (
    <>
      <span className="line-clamp-2 text-footnote font-label text-ink-2">{name}</span>
      <MetricValue metricId={metricId} value={value} size="metric" chip={false} />
      {context && value.status !== 'unavailable' ? <span className="text-footnote text-ink-3">{context}</span> : null}
      {f.nLine && value.status !== 'unavailable' ? <span className="text-footnote tabular-nums text-ink-3">{f.nLine}</span> : null}
      {f.note ? (
        <span className="text-footnote text-ink-2" data-metric-note>
          {f.note}
        </span>
      ) : null}
      <span className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <StatusChip status={value.status} />
        {value.provisional ? <Badge>{UI.earlyRead}</Badge> : null}
      </span>
    </>
  )
  const classes = cx(
    'card flex min-h-33 flex-col items-start gap-1 p-4 text-left',
    (to || onOpen) && 'transition-transform duration-(--dur-press) hover:border-line-strong active:scale-[0.98] motion-reduce:active:scale-100',
    className,
  )
  const common = {
    'data-metric-tile': metricId,
    'data-status': value.status,
    'aria-label': sentence || `${name}, ${STATUS_LABEL[value.status]}`,
    className: classes,
  }
  if (to) {
    return (
      <Link to={to} {...common}>
        {body}
      </Link>
    )
  }
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} {...common}>
        {body}
      </button>
    )
  }
  return (
    <div role="group" {...common}>
      {body}
    </div>
  )
}

/**
 * Tile grid (DESIGN §8.7): auto-fit columns with a 10.5 rem minimum, so tiles drop to one column at
 * large Dynamic Type sizes.
 */
export function MetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-3', className)}>{children}</div>
}
