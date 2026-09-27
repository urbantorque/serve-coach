import { CaretRightIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from './cx.ts'

export interface ListRowProps {
  title: ReactNode
  /** Secondary line: footnote --ink-2, one line, truncated. */
  subtitle?: ReactNode
  /** Third line (e.g. a session headline): footnote --ink-2, 2 lines max. */
  detail?: ReactNode
  /** 40 x 40 media: a key-frame thumbnail, or use <RowIcon> for a 24 px icon in a 40 px circle. */
  leading?: ReactNode
  /** Trailing value (tabular figures) or control. */
  trailing?: ReactNode
  /** Show the 20 px caret; defaults to true when the row navigates. */
  chevron?: boolean
  to?: string
  onPress?: () => void
  className?: string
  /**
   * Let the subtitle and detail wrap instead of truncating (session rows: they carry n and the
   * early-read label, which DESIGN §12 says are never cut off).
   */
  wrap?: boolean
  /** Extra attributes for honesty tests (e.g. data-metric on ghost rows). */
  dataAttrs?: Record<`data-${string}`, string>
}

/**
 * List row (DESIGN §8.5): min 56 px, 12 px vertical padding, divider inset to the text start and only
 * between rows. Put rows inside <ListGroup> (a level-1 card) so dividers and grouping work.
 */
export function ListRow({ title, subtitle, detail, leading, trailing, chevron, to, onPress, className, dataAttrs, wrap = false }: ListRowProps) {
  const interactive = Boolean(to || onPress)
  const showChevron = chevron ?? interactive
  const inner = (
    <>
      {leading ? <span className="flex size-10 shrink-0 items-center justify-center">{leading}</span> : null}
      <span className="relative flex min-w-0 flex-1 items-center gap-3 self-stretch py-3">
        <span data-divider className="absolute inset-x-0 top-0 h-px bg-line court:h-0.5" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-headline text-ink">{title}</span>
          {subtitle ? <span className={cx(wrap ? 'break-words' : 'truncate', 'text-footnote text-ink-2')}>{subtitle}</span> : null}
          {detail ? <span className={cx(!wrap && 'line-clamp-2', 'text-footnote text-ink-2 text-pretty')}>{detail}</span> : null}
        </span>
        {trailing ? <span className="shrink-0 text-subhead tabular-nums text-ink-2">{trailing}</span> : null}
        {showChevron ? <CaretRightIcon size={20} aria-hidden="true" className="shrink-0 text-ink-3" /> : null}
      </span>
    </>
  )
  const rowClasses = cx(
    'flex min-h-14 w-full items-center gap-3 px-4 text-left',
    interactive && 'hover:bg-surface-2 active:bg-surface-2',
    className,
  )
  return (
    <li className="[&:first-child_[data-divider]]:hidden" {...dataAttrs}>
      {to ? (
        <Link to={to} className={rowClasses}>
          {inner}
        </Link>
      ) : onPress ? (
        <button type="button" onClick={onPress} className={rowClasses}>
          {inner}
        </button>
      ) : (
        <div className={rowClasses}>{inner}</div>
      )}
    </li>
  )
}

/** A grouped list in a level-1 card (DESIGN §8.5). */
export function ListGroup({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <ul aria-label={label} className={cx('card overflow-hidden', className)}>
      {children}
    </ul>
  )
}

/** 24 px icon in a 40 px --surface-2 circle, for ListRow's leading slot. */
export function RowIcon({ children }: { children: ReactNode }) {
  return <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2">{children}</span>
}
