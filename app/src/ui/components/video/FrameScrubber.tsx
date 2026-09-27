/**
 * A neutral frame scrubber for "Check this serve" (DESIGN §8.10 anatomy without the phases). It shows
 * no app events, spans or phase names, so a person marking the serve is not steered by the app's
 * answers (METRICS §5.6 blinding). Ticks mark only the frames this person has marked. The readout gives
 * the clip's own frame number and time ("Frame 245 · 4.08 s"). The whole 44 px row is the hit area;
 * keyboard: arrows = 1 frame, Shift + arrows or Page keys = 10, Home/End.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { cx } from '../cx.ts'
import { frameToReal, type ClipTiming } from './phaseSync.ts'
import { usePlayhead, type Playhead } from './playhead.ts'

export interface FrameScrubberProps {
  store: Playhead
  window: { startFrame: number; endFrame: number }
  timing: ClipTiming
  onSeek: (frame: number) => void
  /** Called when a drag starts and ends (so playback can pause). */
  onScrub?: (active: boolean) => void
  /** This person's own marks (never the app's). */
  marks?: readonly { frame: number; label: string }[]
  /** Left side of the readout (what is being marked). */
  caption?: string
  className?: string
}

export function FrameScrubber({ store, window, timing, onSeek, onScrub, marks = [], caption, className }: FrameScrubberProps) {
  const frame = usePlayhead(store, (s) => s.frame)
  const trackRef = useRef<HTMLDivElement>(null)
  const press = useRef<{ x: number; moved: boolean } | null>(null)
  const span = Math.max(1, window.endFrame - window.startFrame)
  const pct = (f: number) => ((Math.min(window.endFrame, Math.max(window.startFrame, f)) - window.startFrame) / span) * 100

  const frameAtX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return frame
    const r = el.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)))
    return Math.round(window.startFrame + t * span)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    press.current = { x: e.clientX, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current
    if (!p) return
    if (!p.moved && Math.abs(e.clientX - p.x) > 4) {
      p.moved = true
      onScrub?.(true)
    }
    if (p.moved) onSeek(frameAtX(e.clientX))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current
    press.current = null
    if (!p) return
    onSeek(frameAtX(e.clientX))
    if (p.moved) onScrub?.(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 10 : 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = frame + big
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = frame - big
    else if (e.key === 'PageUp') next = frame + 10
    else if (e.key === 'PageDown') next = frame - 10
    else if (e.key === 'Home') next = window.startFrame
    else if (e.key === 'End') next = window.endFrame
    if (next === null) return
    e.preventDefault()
    onSeek(next)
  }

  const seconds = frameToReal(frame, timing).toFixed(2)
  const here = marks.filter((m) => m.frame === frame).map((m) => m.label)

  return (
    <div className={cx('gutter flex flex-col', className)}>
      <div className="flex h-5 items-center justify-between gap-3 text-footnote">
        <span className="min-w-0 truncate font-label text-ink">{here.length ? `Marked: ${here.join(', ')}` : (caption ?? '')}</span>
        <span className="shrink-0 tabular-nums text-ink-2">
          Frame {frame} · {seconds} s
        </span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Frame"
        aria-valuemin={window.startFrame}
        aria-valuemax={window.endFrame}
        aria-valuenow={frame}
        aria-valuetext={`Frame ${frame}, ${seconds} seconds${here.length ? `, marked ${here.join(', ')}` : ''}`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          if (press.current?.moved) onScrub?.(false)
          press.current = null
        }}
        className="relative h-11 cursor-pointer touch-none rounded-control outline-offset-0"
      >
        <div ref={trackRef} className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-2">
          {marks.map((m) => (
            <span
              key={`${m.label}-${m.frame}`}
              aria-hidden="true"
              title={m.label}
              className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink-2"
              style={{ left: `${pct(m.frame)}%` }}
            />
          ))}
          <span aria-hidden="true" className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct(frame)}%` }}>
            <span className="absolute top-1/2 left-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink" />
            <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-surface" />
          </span>
        </div>
      </div>
    </div>
  )
}
