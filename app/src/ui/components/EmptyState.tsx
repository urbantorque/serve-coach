import type { Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cx } from './cx.ts'

export interface EmptyStateProps {
  icon: Icon
  title: string
  /** Two lines at most (callout, --ink-2). */
  body: string
  /** One action (usually a Button); a second tertiary link is allowed where DESIGN §8.16 lists one. */
  action?: ReactNode
  className?: string
}

/**
 * Empty state (DESIGN §8.16): centred, max 300 px wide, a 32 px icon in a 64 px --surface-2 circle,
 * headline title, callout body, one action. Never an illustration.
 */
export function EmptyState({ icon: G, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cx('mx-auto flex max-w-[300px] flex-col items-center gap-3 py-8 text-center', className)}>
      <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink-2">
        <G size={32} aria-hidden="true" />
      </span>
      <h2 className="text-headline text-ink">{title}</h2>
      <p className="text-callout text-ink-2">{body}</p>
      {action ? <div className="mt-2 flex w-full flex-col items-center gap-3">{action}</div> : null}
    </div>
  )
}
