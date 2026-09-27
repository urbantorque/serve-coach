import type { ReactNode } from 'react'
import { useDelayedFlag } from '../hooks/useDelayedFlag.ts'
import { cx } from './cx.ts'

/**
 * Static skeleton blocks (DESIGN §8.17): --surface-2 shapes that match the final layout. No shimmer.
 * variant text: a 12 px bar; tile: a metric-tile block; block: any size via className.
 */
export function Skeleton({ variant = 'block', className }: { variant?: 'text' | 'tile' | 'block' | 'row'; className?: string }) {
  const shape = {
    text: 'h-3 w-full rounded-full',
    tile: 'h-33 w-full rounded-card',
    block: 'rounded-card',
    row: 'h-14 w-full rounded-control',
  }[variant]
  return <div aria-hidden="true" className={cx('bg-surface-2', shape, className)} />
}

/**
 * Shows nothing for the first 150 ms, then the skeleton (local data is usually faster than that).
 * Wrap the loading branch of a screen: `{data === undefined ? <DelayedSkeleton>…</DelayedSkeleton> : …}`.
 */
export function DelayedSkeleton({ children, label = 'Loading…' }: { children: ReactNode; label?: string }) {
  const show = useDelayedFlag(150)
  return (
    <div role="status" aria-label={label} aria-busy="true">
      {show ? children : null}
    </div>
  )
}
