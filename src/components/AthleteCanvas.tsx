import { useEffect, useRef } from 'react'
import type { Swing } from '../lib/figure/swing'
import { paintExposure, paintPose, placeSwing, type PlaceOptions, type Placement } from '../lib/figure/stage'

interface Props {
  swing: Swing
  /**
   * What to draw. `pose` holds one frame, `loop` plays the swing, `reveal`
   * plays it once up to `at` and holds, and `exposure` lays the whole swing
   * down as one picture.
   */
  mode: 'pose' | 'loop' | 'reveal' | 'exposure'
  /** The frame to hold, and where a loop rests for a player who asked for less motion. */
  at: number
  /** Solids to paint as the part to work on: see `workParts`. */
  work?: string[]
  /** Share of real speed a loop plays at. */
  rate?: number
  /** Most redraws a second, for a screen with the tracker running underneath. */
  maxFps?: number
  /** Where the body sits in the box. */
  fit?: PlaceOptions
  /** What the picture shows, for a screen reader. */
  label: string
  className?: string
  /** Holds a loop on `at`, when it is off screen or behind a sheet. */
  paused?: boolean
  /** A reveal has arrived, or a pose has been drawn. */
  onSettled?: () => void
}

const still = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The figure, on the page: one body drawn by `lib/figure`, on a transparent
 * canvas, so the surface behind it stays a CSS one.
 *
 * Sized to its box and redrawn when the box changes. A loop stops when it
 * leaves the screen: a phone at a court has better things to do with its
 * battery than animate a picture nobody can see.
 */
export default function AthleteCanvas({ swing, mode, at, work, rate = 0.42, maxFps, fit, label, className, paused, onSettled }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  // Kept in a ref so a parent's new array on every render does not restart a loop.
  const workRef = useRef(work)
  workRef.current = work
  const fitRef = useRef(fit)
  fitRef.current = fit
  const settledRef = useRef(onSettled)
  settledRef.current = onSettled

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { frames, racket, bodyHeight } = swing
    let placement: Placement | undefined
    let raf = 0
    let dpr = 1
    let width = 0
    let height = 0
    let index = Math.max(0, Math.min(frames.length - 1, at))
    let visible = true

    const clear = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const paint = (i: number, moving: boolean) => {
      if (!placement) return
      clear()
      if (mode === 'exposure') {
        paintExposure(ctx, frames, placement, { racket, bodyHeight, from: 0, to: Math.max(1, i) })
        return
      }
      paintPose(ctx, frames[i], placement, {
        racket,
        swing: frames,
        index: i,
        bodyHeight,
        work: workRef.current,
        ground: 1,
        still: !moving,
      })
    }

    const size = () => {
      const box = canvas.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) return false
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = box.width
      height = box.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      placement = placeSwing(frames, width, height, fitRef.current)
      return true
    }

    const moves = mode === 'loop' && !paused && !still() && frames.length > 2
    const reveals = mode === 'reveal' && !still() && frames.length > 2
    if (reveals) index = 0
    if (size()) paint(index, reveals)
    if (!reveals) settledRef.current?.()

    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => size() && paint(index, false))
    observer?.observe(canvas)

    if (reveals) {
      const first = frames[0].t
      const target = Math.max(1, Math.min(frames.length - 1, at))
      const span = Math.max(0.1, frames[target].t - first)
      const begin = performance.now()
      const run = (now: number) => {
        const t = first + ((now - begin) / 1000) * rate
        if (t - first >= span) {
          index = target
          paint(target, false)
          settledRef.current?.()
          return
        }
        let i = index
        while (i + 1 <= target && frames[i + 1].t <= t) i++
        if (i !== index) {
          index = i
          paint(i, true)
        }
        raf = requestAnimationFrame(run)
      }
      raf = requestAnimationFrame(run)
    }

    const seen =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver((entries) => {
            visible = entries[entries.length - 1].isIntersecting
          })
    seen?.observe(canvas)

    if (moves) {
      const first = frames[0].t
      const span = Math.max(0.2, frames[frames.length - 1].t - first)
      // A short rest at the end of the swing, so the eye gets to arrive.
      const rest = 0.5
      const minGap = maxFps ? 1000 / maxFps : 0
      let last = 0
      let start = performance.now()
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick)
        if (!visible || document.hidden) {
          start += 16
          return
        }
        if (now - last < minGap) return
        last = now
        const clock = (((now - start) / 1000) * rate) % (span + rest * rate)
        const t = first + Math.min(span, clock)
        let i = index
        while (i + 1 < frames.length && frames[i + 1].t <= t) i++
        while (i > 0 && frames[i].t > t) i--
        if (i !== index || last === now) {
          index = i
          paint(i, true)
        }
      }
      raf = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      seen?.disconnect()
    }
  }, [swing, mode, at, rate, maxFps, paused])

  return <canvas ref={ref} className={className ?? 'athlete'} role="img" aria-label={label} />
}
