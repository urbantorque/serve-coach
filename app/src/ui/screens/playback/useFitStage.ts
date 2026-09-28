/**
 * Serve detail on short screens and with large text (finding 70): the video box gives up height so the
 * timeline, transport and overlay chips sit above the collapsed "This serve" drawer on load, instead of
 * starting under it. The page measures where the stage starts and how tall the controls under it are,
 * and publishes both on the stage's wrapper as CSS variables; the drawer publishes its own peek height
 * (--drawer-peek). The video never shrinks below FIT_MIN: on a phone in landscape the page still
 * scrolls, and focus is kept clear of the drawer (StatDrawer).
 */
import { useLayoutEffect, useState } from 'react'

/** The smallest video box the fit allows: 180 px on phones held upright, less on a phone in landscape. */
export const FIT_MIN = 'clamp(110px, 40dvh - 40px, 180px)'

/** The stage height: the design's box, lowered to what fits above the controls and the drawer. */
export function fitStageHeight(base: string): string {
  return `min(${base}, max(${FIT_MIN}, calc(100dvh - var(--stage-top, 0px) - var(--serve-controls-h, 0px) - var(--drawer-peek, 176px) - 16px)))`
}

/** Callback refs (element setters) for the stage's wrapper and the controls block under the video. */
export function useFitStage(): { setStage: (el: HTMLElement | null) => void; setControls: (el: HTMLElement | null) => void } {
  const [wrap, setWrap] = useState<HTMLElement | null>(null)
  const [controls, setControls] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const w = wrap
    if (!w) return
    const measure = () => {
      const top = w.getBoundingClientRect().top + window.scrollY
      const c = controls
      w.style.setProperty('--stage-top', `${Math.max(0, Math.round(top))}px`)
      w.style.setProperty('--serve-controls-h', `${c ? Math.round(c.getBoundingClientRect().height) : 0}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    if (controls) ro.observe(controls)
    // What sits above the stage (the app bar grows with large text; the sample banner).
    for (const el of Array.from(w.parentElement?.children ?? [])) if (el !== w) ro.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      ro.disconnect()
    }
  }, [wrap, controls])
  return { setStage: setWrap, setControls }
}
