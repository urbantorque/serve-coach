import { useEffect, useRef, useState } from 'react'

/**
 * Counts a displayed number up to its target instead of popping in place.
 *
 * Only runs when `enabled` — the many small rings in a list stay static, the
 * same restraint the ring stroke itself already observes (see `animate` on
 * `ScoreRing`). Mirrors the ring's own ~1s fill so the number settles roughly
 * when the stroke does, rather than finishing early or lagging behind it.
 */
export function useCountUp(target: number, enabled: boolean): number {
  // Under reduced motion the first frame is already the final score (N4.6):
  // starting at 0 and jumping in an effect flashed a zero first.
  const moving = enabled && !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [value, setValue] = useState(moving ? 0 : target)
  const from = useRef(moving ? 0 : target)
  const raf = useRef(0)

  useEffect(() => {
    if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      from.current = target
      return
    }
    const start0 = from.current
    const t0 = performance.now()
    const duration = 1000
    cancelAnimationFrame(raf.current)
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      const eased = 1 - (1 - t) ** 3
      const shown = Math.round(start0 + (target - start0) * eased)
      setValue(shown)
      // Kept current every tick, not just at the end — if the target changes
      // mid-animation the next run must start from the number on screen, not
      // jump back to where the interrupted animation began.
      from.current = shown
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)

    /*
     * If the frames never come, land on the number anyway.
     *
     * `requestAnimationFrame` does not fire in a document that is not
     * compositing — a backgrounded tab, an inert or hidden frame, a headless
     * pane. The ring's stroke is plain SVG and draws the real score regardless,
     * so a starved animation leaves the arc showing sixty-eight per cent with a
     * hard zero in the middle of it: the two halves of one number disagreeing,
     * which is worse than either being wrong on its own.
     *
     * Well past the animation's own second, so it only ever catches the case
     * where the frames genuinely did not arrive.
     */
    const bail = setTimeout(() => {
      setValue(target)
      from.current = target
    }, 2500)

    return () => {
      cancelAnimationFrame(raf.current)
      clearTimeout(bail)
    }
  }, [target, enabled])

  return value
}
