import type { MetricValue as MetricValueData } from '../../analysis/types.ts'
import { formatMetric } from '../format/metricFormat.ts'
import { cx } from './cx.ts'
import { StatusChip } from './StatusChip.tsx'

export interface MetricValueProps {
  metricId: string
  value: MetricValueData
  /** inline: body text; metric: tile value (28 px, wide figures); hero: one per view (44 px). */
  size?: 'inline' | 'metric' | 'hero'
  /** Render the data-state chip after the value (default true). Tiles place their own chip. */
  chip?: boolean
  /** Compact glyph-only chip (only where a legend names the glyphs on the same screen). */
  compactChip?: boolean
  /** Show the second line ("likely 2.49 to 2.63 m", or the speed quantity). */
  detail?: boolean
  onOpenInfo?: () => void
  className?: string
}

const VALUE_SIZE = {
  inline: 'text-body',
  metric: 'text-metric font-wide',
  hero: 'text-metric-hero font-wide',
} as const

/**
 * The only way a metric number reaches the screen (DESIGN §8.6). It formats the value (§4.3),
 * prefixes "≈" for estimates, writes experimental values as "about" ranges, replaces unavailable
 * values with their reason, and renders the data-state chip. It refuses to render a value without a
 * status: it throws in development and renders nothing in production.
 */
export function MetricValue({
  metricId,
  value,
  size = 'inline',
  chip = true,
  compactChip = false,
  detail = false,
  onOpenInfo,
  className,
}: MetricValueProps) {
  if (!value?.status) {
    const msg = `[MetricValue] ${metricId} has no status. Every number needs a data state (D2, DESIGN §8.6).`
    if (import.meta.env.DEV) throw new Error(msg)
    console.error(msg)
    return null
  }
  const f = formatMetric(metricId, value)
  const unavailable = value.status === 'unavailable'
  const wordSize = size === 'inline' ? 'text-body' : 'text-title-2'
  return (
    <span data-metric={metricId} data-status={value.status} className={cx('inline-flex flex-col gap-1', className)}>
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span aria-hidden="true" className={unavailable ? 'text-ink-3' : 'text-ink'}>
          {unavailable ? (
            <span className={cx(size === 'inline' ? 'text-body' : 'text-subhead', 'text-ink-3')}>{f.reason}</span>
          ) : f.words || value.status === 'experimental' ? (
            <span className={wordSize}>{f.text}</span>
          ) : (
            <>
              {/* "≈ 1.47" never splits; the unit moves to the next line as a whole when a tile is narrow. */}
              <span className="whitespace-nowrap">
                {f.approx ? <span className={cx(VALUE_SIZE[size], 'text-ink-3')}>≈&thinsp;</span> : null}
                <span className={VALUE_SIZE[size]}>{f.value}</span>
              </span>
              {f.unit ? (
                <>
                  {' '}
                  <span className="text-subhead whitespace-nowrap text-ink-2">{f.unit}</span>
                </>
              ) : null}
              {f.percent ? (
                <>
                  {' '}
                  <span className="text-subhead whitespace-nowrap text-ink-2">{f.percent}</span>
                </>
              ) : null}
            </>
          )}
        </span>
        <span className="sr-only">{f.aria}</span>
        {chip && onOpenInfo ? (
          <StatusChip status={value.status} compact={compactChip} onOpenInfo={onOpenInfo} className="self-center" />
        ) : chip ? (
          <span aria-hidden="true" className="inline-flex self-center">
            <StatusChip status={value.status} compact={compactChip} />
          </span>
        ) : null}
      </span>
      {detail && f.detail ? <span className="text-footnote text-ink-3">{f.detail}</span> : null}
    </span>
  )
}
