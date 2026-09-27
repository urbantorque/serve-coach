import type { ReactNode } from 'react'
import { cx } from './cx.ts'

/** Level-1 card (DESIGN §5.4): radius 20, padding 16 (20 on the focus card), no shadow. */
export function Card({
  children,
  className,
  padding = 'default',
  as: Tag = 'section',
  label,
}: {
  children: ReactNode
  className?: string
  padding?: 'default' | 'focus' | 'none'
  as?: 'section' | 'div' | 'article' | 'figure'
  /** Accessible name when the card is a landmark-like region. */
  label?: string
}) {
  return (
    <Tag aria-label={label} className={cx('card', padding === 'default' && 'p-4', padding === 'focus' && 'p-5', className)}>
      {children}
    </Tag>
  )
}

/** Section label (DESIGN §4.2): footnote 600 in --ink-3, sentence case. Never an uppercase eyebrow. */
export function SectionLabel({ children, className, as: Tag = 'h2' }: { children: ReactNode; className?: string; as?: 'h2' | 'h3' | 'p' }) {
  return <Tag className={cx('text-footnote font-label text-ink-3', className)}>{children}</Tag>
}
