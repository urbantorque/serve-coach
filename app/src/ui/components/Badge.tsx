import type { ReactNode } from 'react'
import { cx } from './cx.ts'

/**
 * Text badge (DESIGN §8.21): "Plus", "Early read". Caption 600 in a pill with a 1 px line-strong
 * outline. Never a lock glyph, never a counter or a red dot.
 */
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'chip inline-flex h-6 items-center rounded-full border-token border-line-strong px-2 text-caption whitespace-nowrap text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  )
}
