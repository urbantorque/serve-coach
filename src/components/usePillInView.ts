import { useEffect, type RefObject } from 'react'

/**
 * Where a scrolling row of pills should sit so one pill is fully in view, or
 * `undefined` when it already is (N0.6).
 *
 * All in the row's own content coordinates: `left` is the pill's distance from
 * the start of the row's content, not from the screen. A pill off either edge
 * is brought in centred, so the next one along is visible too; a pill already
 * showing leaves the row alone, so a player's own swipe is never undone.
 */
export function scrollToShow(
  row: { scrollLeft: number; width: number; scrollWidth: number },
  pill: { left: number; width: number },
): number | undefined {
  const start = row.scrollLeft
  const end = start + row.width
  if (pill.left >= start && pill.left + pill.width <= end) return undefined
  const centred = pill.left - (row.width - pill.width) / 2
  return Math.max(0, Math.min(row.scrollWidth - row.width, Math.round(centred)))
}

/**
 * Keep the lit moment pill on screen while a serve plays (N0.6).
 *
 * The six pills overflow a phone's width, so on a loop the lit one ran off the
 * right edge at contact. The caption under the row then described a pill the
 * player could not see, and the one that was fading out still looked lit:
 * the model serve read as captioning the wrong moment.
 *
 * Scrolls the row only, never the page, which `scrollIntoView` would also do.
 */
export function usePillInView(row: RefObject<HTMLElement | null>, activeId: string | undefined, still = false): void {
  useEffect(() => {
    const el = row.current
    if (!el || !activeId) return
    const pill = el.querySelector<HTMLElement>('.phase-pill.is-active')
    if (!pill) return
    const rowBox = el.getBoundingClientRect()
    const box = pill.getBoundingClientRect()
    const left = box.left - rowBox.left + el.scrollLeft
    const to = scrollToShow(
      { scrollLeft: el.scrollLeft, width: el.clientWidth, scrollWidth: el.scrollWidth },
      { left, width: box.width },
    )
    if (to === undefined) return
    // Reduced motion is read here as well as passed in, so every player
    // honours it, not only the one that already knew.
    const reduce = still || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    if (typeof el.scrollTo === 'function') el.scrollTo({ left: to, behavior: reduce ? 'auto' : 'smooth' })
    else el.scrollLeft = to
  }, [row, activeId, still])
}
