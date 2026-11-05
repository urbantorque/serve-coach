import { useEffect, useRef, type MutableRefObject } from 'react'
import type { Frame } from '../lib/analysis/types'
import { paintExposure, paintPose, placeSwing, type Placement } from '../lib/figure/stage'

/** Few enough a second to leave the pose model the phone's main thread. */
const MIN_GAP_MS = 110
/** Enough of the swing's start to take the body's size from. */
const SIZE_FROM = 6
const FIT = { height: 0.62, feet: 0.9 }

interface Props {
  /** Filled by the tracker as it reads. Watched here, so it renders nothing above. */
  feed: MutableRefObject<Frame[]>
  racket: 'left' | 'right'
  /** The tracker has finished: lay the whole swing down as one picture. */
  done?: boolean
  /** The first body has been drawn. */
  onSeen?: () => void
}

/**
 * The player's own body, as the tracker reads it. The most honest thing a waiting
 * screen can show: not a spinner standing in for the work, but the work.
 *
 * Its size is taken from the first few frames and then held, so the body moves
 * through the picture the way it moved through the clip. When the last frame is
 * in, the swing is laid down as one exposure.
 */
export default function LiveBody({ feed, racket, done, onSeen }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const seen = useRef(onSeen)
  seen.current = onSeen

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    let last = 0
    let drawn = 0
    let at: Placement | undefined

    const fit = (frames: Frame[]) => {
      const box = canvas.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) return false
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(box.width * dpr)
      canvas.height = Math.round(box.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      at = placeSwing(frames.slice(0, SIZE_FROM), box.width, box.height, FIT)
      return true
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const frames = feed.current
      if (frames.length === drawn || frames.length < SIZE_FROM || now - last < MIN_GAP_MS) return
      if (!at && !fit(frames)) return
      last = now
      drawn = frames.length
      const box = canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, box.width, box.height)
      const bodyHeight = at!.stature / at!.scale
      paintPose(ctx, frames[frames.length - 1], at!, { racket, swing: frames, index: frames.length - 1, bodyHeight, ground: 1, still: false })
      if (drawn >= SIZE_FROM) seen.current?.()
    }
    if (!done) raf = requestAnimationFrame(tick)
    else if (feed.current.length >= SIZE_FROM && fit(feed.current)) {
      const frames = feed.current
      const bodyHeight = at!.stature / at!.scale
      paintExposure(ctx, frames, at!, { racket, bodyHeight, from: 0, to: frames.length - 1 })
    }
    return () => cancelAnimationFrame(raf)
  }, [feed, racket, done])

  return <canvas ref={ref} className="stage-canvas" aria-hidden="true" />
}
