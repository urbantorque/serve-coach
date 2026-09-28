/**
 * Phase timeline and scrubber (DESIGN §8.10): the seven phase spans with 2 px gaps, event ticks, a
 * playhead with a 16 px handle and a readout ("Frame 142 · 2.37 s" and the phase name). The whole
 * 56 px row is the hit area. A tap jumps to the tapped phase's key frame (PRODUCT §6.6); a drag scrubs
 * frame by frame. Keyboard: arrows = 1 frame, Shift = 10, Home/End, 1 to 7 = phases.
 */
import { TargetIcon } from '@phosphor-icons/react'
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { PhaseSpan, ServeEvents, ServePhase } from '../../../analysis/types.ts'
import { PHASE_LABEL } from '../../copy/strings.ts'
import { cx } from '../cx.ts'
import { frameToReal, phaseAt, type ClipTiming } from './phaseSync.ts'
import { sliderText, TICK_EVENTS } from './timeline.ts'
import { usePlayhead, type Playhead } from './playhead.ts'

/** Forced colours: every phase outlined in CanvasText (the Canvas fill is the system's). */
const FORCED_PHASE = 'forced-colors:border forced-colors:border-[CanvasText]'
/** Forced colours: the focus phase filled with Highlight, kept as is by the system. */
const FORCED_FOCUS = 'forced-colors:border forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:[forced-color-adjust:none]'
/** Forced colours: event ticks and the playhead line in CanvasText, kept as is by the system. */
const FORCED_MARK = 'forced-colors:bg-[CanvasText] forced-colors:[forced-color-adjust:none]'

export interface PhaseTimelineProps {
  store: Playhead
  phases: readonly PhaseSpan[]
  events: ServeEvents
  window: { startFrame: number; endFrame: number }
  timing: ClipTiming
  focusPhase?: ServePhase | null
  onSeek: (frame: number) => void
  /** Called while dragging starts and ends (so playback can pause). */
  onScrub?: (active: boolean) => void
  className?: string
}

const fmtSeconds = (s: number) => `${s.toFixed(2)} s`

export function PhaseTimeline({ store, phases, events, window, timing, focusPhase, onSeek, onScrub, className }: PhaseTimelineProps) {
  const frame = usePlayhead(store, (s) => s.frame)
  const trackRef = useRef<HTMLDivElement>(null)
  const press = useRef<{ x: number; moved: boolean } | null>(null)
  const span = Math.max(1, window.endFrame - window.startFrame)
  const pct = (f: number) => ((Math.min(window.endFrame, Math.max(window.startFrame, f)) - window.startFrame) / span) * 100
  const current = phaseAt(phases, frame)

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
    if (p.moved) {
      onSeek(frameAtX(e.clientX))
      onScrub?.(false)
      return
    }
    const target = phaseAt(phases, frameAtX(e.clientX))
    onSeek(target ? target.keyFrame : frameAtX(e.clientX))
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
    else if (/^[1-7]$/.test(e.key) && phases[Number(e.key) - 1]) next = phases[Number(e.key) - 1].keyFrame
    if (next === null) return
    e.preventDefault()
    onSeek(next)
  }

  const realS = frameToReal(frame, timing)

  return (
    <div className={cx('gutter flex flex-col', className)}>
      <div className="flex h-5 items-center justify-between gap-3 text-footnote">
        <span className="flex items-center gap-1 font-label text-ink">
          {current ? PHASE_LABEL[current.phase] : 'Serve'}
          {current && focusPhase === current.phase ? (
            <span className="inline-flex items-center gap-1 text-ink-2">
              <TargetIcon size={14} aria-hidden="true" />
              Focus
            </span>
          ) : null}
        </span>
        <span className="tabular-nums text-ink-2">
          Frame {frame - window.startFrame + 1} · {fmtSeconds(realS)}
        </span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Serve timeline"
        aria-valuemin={window.startFrame}
        aria-valuemax={window.endFrame}
        aria-valuenow={frame}
        aria-valuetext={sliderText(frame, phases, window)}
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
        <div ref={trackRef} className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2">
          {phases.map((p, i) => {
            const left = pct(p.startFrame)
            const right = i < phases.length - 1 ? pct(phases[i + 1].startFrame) : pct(p.endFrame)
            const focus = focusPhase === p.phase
            return (
              <div
                key={p.phase}
                data-phase={p.phase}
                data-focus={focus || undefined}
                title={PHASE_LABEL[p.phase]}
                className={cx(
                  'absolute inset-y-0 rounded-full border-x border-surface',
                  // Forced colours (DESIGN §12): system colours as utilities, so they beat the token
                  // background whatever the app theme (finding 86).
                  focus ? FORCED_FOCUS : FORCED_PHASE,
                  focus ? 'bg-ink-3' : i % 2 === 0 ? 'bg-surface-2' : 'bg-band',
                )}
                style={{ left: `${left}%`, width: `${Math.max(0.6, right - left)}%` }}
              >
                {focus ? <TargetIcon size={12} aria-hidden="true" className="absolute -top-4 left-1/2 -translate-x-1/2 text-ink-2" /> : null}
              </div>
            )
          })}
          {TICK_EVENTS.map((k) => {
            const ev = events[k]
            if (!ev || ev.confidence < 0.5) return null
            return <span key={k} aria-hidden="true" data-tick className={cx('absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink', FORCED_MARK)} style={{ left: `${pct(ev.frameIndex)}%` }} />
          })}
          <span aria-hidden="true" className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct(frame)}%` }}>
            <span data-playhead-line className={cx('absolute top-1/2 left-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink', FORCED_MARK)} />
            <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-surface" />
          </span>
        </div>
      </div>
    </div>
  )
}
