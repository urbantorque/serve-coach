import { CaretLeftIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { cx } from './cx.ts'

export interface AppBarProps {
  title: string
  /**
   * root: tab roots, large `display` title under the bar that collapses into a centred title on scroll.
   * pushed: back button + centred title + one optional icon action.
   */
  variant?: 'root' | 'pushed'
  /** Pushed screens: where Back goes and the previous title (shown if 12 characters or fewer). */
  back?: { to?: string; label?: string }
  /** Replaces the back button (for example a close X on full-screen flows). */
  leading?: ReactNode
  /** One icon action (DESIGN §8.1: never an optic button, never more than one text action). */
  trailing?: ReactNode
}

/**
 * App bar (DESIGN §8.1): 52 px under the top safe area; transparent at rest, level-2 glass once
 * content scrolls under it. The page's h1 is the large title (root) or the centred title (pushed).
 */
export function AppBar({ title, variant = 'pushed', back, leading, trailing }: AppBarProps) {
  const sentinel = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // Root: collapse once the large title has scrolled under the bar. Pushed: glass once anything scrolls.
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { rootMargin: '-52px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // The bar is at least 52 px and grows when large text wraps a slot (finding 72): publish its real
  // height as --appbar-h so scroll-padding and anything pinned under the bar follow it.
  useEffect(() => {
    const el = bar.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const publish = () => {
      const h = el.offsetHeight
      if (h > 52) root.style.setProperty('--appbar-h', `${h}px`)
      else root.style.removeProperty('--appbar-h')
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--appbar-h')
    }
  }, [])

  const backLabel = back?.label && back.label.length <= 12 ? back.label : 'Back'
  const backButton =
    variant === 'pushed' && !leading ? (
      back?.to ? (
        <Link
          to={back.to}
          className="-ml-2 inline-flex h-11 max-w-full min-w-11 items-center gap-0.5 rounded-control pr-2 text-subhead text-ink active:bg-surface-2"
          aria-label={`Back to ${back.label ?? 'previous screen'}`}
        >
          <CaretLeftIcon aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 truncate">{backLabel}</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="-ml-2 inline-flex h-11 max-w-full min-w-11 items-center gap-0.5 rounded-control pr-2 text-subhead text-ink active:bg-surface-2"
          aria-label="Back"
        >
          <CaretLeftIcon aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 truncate">{backLabel}</span>
        </button>
      )
    ) : null

  const showBarTitle = variant === 'pushed' || scrolled

  return (
    <>
      <header
        data-scrolled={scrolled || undefined}
        className={cx(
          'sticky top-0 z-(--z-sticky) pad-safe-top transition-colors duration-(--dur-fast)',
          scrolled ? 'glass border-b border-line court:border-b-2' : 'border-b border-transparent',
        )}
      >
        {/* Three columns, the side ones equal so the title stays centred. At large text the title and the
            back label truncate inside their own columns instead of drawing over each other (DESIGN §12),
            and a slot that wraps (a trailing counter) grows the bar instead of spilling out of it. */}
        <div ref={bar} className="gutter mx-auto grid min-h-13 max-w-(--content-max) grid-cols-[minmax(2.75rem,1fr)_minmax(0,auto)_minmax(2.75rem,1fr)] items-center gap-2">
          <div className="flex min-w-0 items-center">{leading ?? backButton}</div>
          {variant === 'pushed' ? (
            <h1 className="min-w-0 truncate text-center text-headline text-ink">{title}</h1>
          ) : (
            <p
              aria-hidden="true"
              className={cx(
                'min-w-0 truncate text-center text-headline text-ink transition-opacity duration-(--dur-fast)',
                showBarTitle ? 'opacity-100' : 'opacity-0',
              )}
            >
              {title}
            </p>
          )}
          <div className="flex min-w-0 items-center justify-end">{trailing}</div>
        </div>
      </header>
      {variant === 'root' ? (
        <div className="gutter mx-auto w-full max-w-(--content-max)">
          <h1 className="flex min-h-11 items-end text-display text-ink">{title}</h1>
        </div>
      ) : null}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
    </>
  )
}
