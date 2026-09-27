import {
  ApproximateEqualsIcon,
  EyeSlashIcon,
  FlaskIcon,
  PencilSimpleLineIcon,
  RulerIcon,
  type Icon,
} from '@phosphor-icons/react'
import type { MetricStatus } from '../../analysis/types.ts'
import { STATUS_LABEL } from '../copy/strings.ts'
import { cx } from './cx.ts'

const STATUS_ICON: Record<MetricStatus, Icon> = {
  measured: RulerIcon,
  estimated: ApproximateEqualsIcon,
  'player-entered': PencilSimpleLineIcon,
  experimental: FlaskIcon,
  unavailable: EyeSlashIcon,
}

/**
 * Container style echoes the chart mark (DESIGN §3.1): solid (measured, estimate), hollow outline
 * (you logged), dashed outline (experimental), no container (not available).
 */
const CONTAINER: Record<MetricStatus, string> = {
  measured: 'bg-surface-2 text-ink-2',
  estimated: 'bg-surface-2 text-ink-2',
  'player-entered': 'border-token border-solid border-line-strong text-ink-2',
  experimental: 'border-token border-dashed border-line-strong text-ink-2',
  unavailable: 'text-ink-3',
}

export interface StatusGlyphProps {
  status: MetricStatus
  /** 14 px in chips; 20 px in the compact chip; 24 px in ghost rows. */
  size?: number
  /** Accessible name when the glyph stands alone; decorative otherwise. */
  label?: string
  className?: string
}

/** The data-state glyph alone (Phosphor, regular weight). */
export function StatusGlyph({ status, size = 14, label, className }: StatusGlyphProps) {
  const G = STATUS_ICON[status]
  return label ? (
    <G size={size} role="img" aria-label={label} className={className} />
  ) : (
    <G size={size} aria-hidden="true" className={className} />
  )
}

export interface StatusChipProps {
  status: MetricStatus
  /** Glyph only (20 x 20). Allowed only where a legend on the same screen names the glyphs. */
  compact?: boolean
  /** Opens Metric info at "How sure we are". Makes the chip a button with a 44 px hit area. */
  onOpenInfo?: () => void
  className?: string
}

/**
 * Data-state chip (DESIGN §3.1): glyph + word + container, never colour alone. Every number on
 * screen carries one (use `<MetricValue>` or `<MetricTile>`, which render it for you).
 */
export function StatusChip({ status, compact = false, onOpenInfo, className }: StatusChipProps) {
  const label = STATUS_LABEL[status]
  const classes = cx(
    'chip relative inline-flex shrink-0 items-center gap-1 rounded-full whitespace-nowrap text-caption',
    CONTAINER[status],
    compact ? 'size-5 justify-center' : status === 'unavailable' ? 'h-6 px-0.5' : 'h-6 px-2',
    className,
  )
  const content = (
    <>
      <StatusGlyph status={status} size={compact ? 12 : 14} />
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </>
  )
  if (onOpenInfo) {
    return (
      <button
        type="button"
        onClick={onOpenInfo}
        data-status={status}
        className={cx(
          classes,
          'cursor-pointer after:absolute after:-inset-x-1 after:-inset-y-2.5 active:bg-surface-2',
          compact && 'after:-inset-3',
        )}
      >
        {content}
        <span className="sr-only">, how sure we are</span>
      </button>
    )
  }
  return (
    <span data-status={status} className={classes}>
      {content}
    </span>
  )
}
