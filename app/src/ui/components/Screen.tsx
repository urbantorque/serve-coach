import type { ReactNode } from 'react'
import { useShell } from '../shell/shellContext.ts'
import { AppBar, type AppBarProps } from './AppBar.tsx'
import { cx } from './cx.ts'

/**
 * Sticky bottom action bar (DESIGN §5.1): level-2 glass holding the screen's primary action on long
 * pushed screens; sits above the tab bar when the tab bar shows.
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const { tabBar } = useShell()
  return (
    <div
      className={cx(
        'glass sticky z-(--z-sticky) border-t border-line court:border-t-2',
        tabBar ? 'bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))]' : 'bottom-0 pad-safe-bottom',
      )}
    >
      <div className="gutter mx-auto flex max-w-(--content-max) flex-col gap-3 py-3">{children}</div>
    </div>
  )
}

export interface ScreenProps extends AppBarProps {
  children: ReactNode
  /** Rendered under the app bar, full width (e.g. <SampleBanner />). */
  banner?: ReactNode
  /** The screen's primary action, in a sticky bottom action bar. */
  bottomAction?: ReactNode
  className?: string
}

/**
 * Page frame for every screen: app bar, optional banner, a 350 px content column with 20 px gutters
 * (max 560 px on wide screens), and an optional bottom action bar. Screens fill `children`.
 */
export function Screen({ children, banner, bottomAction, className, ...bar }: ScreenProps) {
  const { tabBar } = useShell()
  return (
    <div
      className={cx(
        'flex flex-col',
        tabBar ? 'min-h-[calc(100dvh-var(--tabbar-h)-env(safe-area-inset-bottom))]' : 'min-h-[100dvh]',
      )}
    >
      <AppBar {...bar} />
      {banner}
      <div className={cx('gutter mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-8 pt-4 pb-8', className)}>{children}</div>
      {bottomAction ? <BottomActionBar>{bottomAction}</BottomActionBar> : null}
    </div>
  )
}
