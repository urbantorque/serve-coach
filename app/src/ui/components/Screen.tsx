import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useShell } from '../shell/shellContext.ts'
import { AppBar, type AppBarProps } from './AppBar.tsx'
import { cx } from './cx.ts'

/** Controls a keyboard or tap can focus on purpose (never a tabindex="-1" container such as <main>). */
const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="slider"], [role="radio"], [role="tab"]'

/**
 * Sticky bottom action bar (DESIGN §5.1): level-2 glass holding the screen's primary action on long
 * pushed screens; sits above the tab bar when the tab bar shows.
 *
 * It grows with large text (two stacked buttons at 200% are about 160 px), so it publishes its measured
 * height as --action-bar-h for the page's scroll-padding-bottom (base.css), and scrolls a control that
 * takes focus under it clear of it (WCAG 2.4.11; finding 71: the marking steps in Check this serve).
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const { tabBar } = useShell()
  const bar = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const root = document.documentElement
    const measure = () => root.style.setProperty('--action-bar-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || el.contains(t) || typeof t.matches !== 'function' || !t.matches(FOCUSABLE)) return
      const top = el.getBoundingClientRect().top
      const r = t.getBoundingClientRect()
      // Only when it is partly or wholly under the bar and can be brought clear of it.
      if (r.bottom <= top - 8 || r.top >= top + el.offsetHeight || r.height > top - 8) return
      window.scrollBy({ top: r.bottom - (top - 8), behavior: 'instant' as ScrollBehavior })
    }
    document.addEventListener('focusin', onFocus)
    return () => {
      ro?.disconnect()
      document.removeEventListener('focusin', onFocus)
      root.style.removeProperty('--action-bar-h')
    }
  }, [])
  return (
    <div
      ref={bar}
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
