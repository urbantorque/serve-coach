import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** Above this share of the screen (with the app bar), the pinned player leaves too little room: unpin. */
const MAX_SHARE = 0.55

/**
 * Keeps the pinned player (video, scrubber, transport) from hiding what it pins over (WCAG 2.4.11):
 * - measures the pinned block and unpins it when it would take more than about half the screen
 *   (short screens, iOS Larger Text or Android font scaling);
 * - while pinned, scrolls a newly focused control below it, and sets the page's scroll-padding-top to
 *   the app bar plus the block, so find-in-page and anchors land clear of it too.
 * Returns whether the block should be pinned.
 */
export function usePinnedBlock(ref: RefObject<HTMLElement | null>): boolean {
  const [pinned, setPinned] = useState(true)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const h = el.getBoundingClientRect().height
      const appBar = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--appbar-h')) || 52
      setHeight(h)
      setPinned(h + appBar <= window.innerHeight * MAX_SHARE || window.innerHeight <= 0)
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el || !pinned || !height) return
    const root = document.documentElement
    const before = root.style.scrollPaddingTop
    root.style.scrollPaddingTop = `calc(var(--appbar-h) + env(safe-area-inset-top) + ${Math.round(height)}px)`
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      if (!target || el.contains(target) || typeof target.getBoundingClientRect !== 'function') return
      if (getComputedStyle(el).position !== 'sticky') return
      const limit = el.getBoundingClientRect().bottom + 8
      const r = target.getBoundingClientRect()
      if (r.top < limit) window.scrollBy({ top: r.top - limit, behavior: 'instant' as ScrollBehavior })
    }
    document.addEventListener('focusin', onFocus)
    return () => {
      root.style.scrollPaddingTop = before
      document.removeEventListener('focusin', onFocus)
    }
  }, [ref, pinned, height])

  return pinned
}
