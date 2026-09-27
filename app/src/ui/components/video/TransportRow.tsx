/**
 * Transport row (DESIGN §8.11 item 2): speed chip on the left; −1 frame, play/pause, +1 frame in the
 * centre (48 px); previous and next serve on the right. Holding a frame-step button repeats at 10
 * frames a second. In key-frame stepping (video deleted) the step buttons move between key frames.
 * Without serve navigation, the right slot can hold ±10 frame steps instead ("Check this serve").
 */
import { CaretDoubleLeftIcon, CaretDoubleRightIcon, CaretLeftIcon, CaretRightIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '@phosphor-icons/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../cx.ts'
import { nextRate, rateLabel, rateSpoken, usePlayhead, type Playhead, type PlaybackRate } from './playhead.ts'

export interface TransportRowProps {
  store: Playhead
  onStep: (delta: -1 | 1) => void
  onToggle?: () => void
  onRate?: (rate: PlaybackRate) => void
  onPrevServe?: () => void
  onNextServe?: () => void
  /** ±10 frames (shown in the right slot when there is no serve navigation). */
  onBigStep?: (delta: -10 | 10) => void
  /** Why play is unavailable (no video); play is hidden when set. */
  playDisabledReason?: string | null
  stepLabel?: { back: string; forward: string }
  className?: string
}

/**
 * No size in BTN: each button sets its own (cx only joins classes, so a size here would beat the
 * caller's). Frame steps and play are 48 px (DESIGN §8.11), 44 px below 360 px so the row fits 320.
 */
const BTN =
  'relative inline-grid shrink-0 place-items-center rounded-full text-ink transition-transform duration-(--dur-press) ' +
  'hover:bg-surface-2 active:scale-[0.98] active:bg-surface-2 motion-reduce:active:scale-100 aria-disabled:text-ink-disabled aria-disabled:hover:bg-transparent'
const MAIN = 'size-12 max-[359px]:size-11'
const SIDE = 'size-11'

function RepeatButton({ label, onStep, children, className }: { label: string; onStep: () => void; children: ReactNode; className?: string }) {
  const timers = useRef<{ hold?: number; repeat?: number }>({})
  const stop = () => {
    window.clearTimeout(timers.current.hold)
    window.clearInterval(timers.current.repeat)
    timers.current = {}
  }
  useEffect(() => stop, [])
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(BTN, className ?? MAIN)}
      onClick={(e) => {
        // Pointer presses step on pointerdown; this handles keyboard activation.
        if (e.detail === 0) onStep()
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        onStep()
        stop()
        timers.current.hold = window.setTimeout(() => {
          timers.current.repeat = window.setInterval(onStep, 100)
        }, 400)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

export function TransportRow({
  store,
  onStep,
  onToggle,
  onRate,
  onPrevServe,
  onNextServe,
  onBigStep,
  playDisabledReason,
  stepLabel = { back: 'Back 1 frame', forward: 'Forward 1 frame' },
  className,
}: TransportRowProps) {
  const playing = usePlayhead(store, (s) => s.playing)
  const rate = usePlayhead(store, (s) => s.rate)
  const canPlay = !playDisabledReason && onToggle
  return (
    <div className={cx('gutter flex h-12 items-center justify-between gap-2 max-[359px]:gap-1', className)}>
      {/* Side slots share the spare width but never shrink below their buttons, so nothing overlaps. */}
      <div className="flex min-w-max flex-1 basis-0 items-center">
        {onRate && canPlay ? (
          <button
            type="button"
            onClick={() => onRate(nextRate(rate))}
            aria-label={`Playback speed: ${rateSpoken(rate)}. Change speed`}
            className="relative inline-flex h-9 min-w-12 items-center justify-center rounded-full border-token border-line-strong px-3 text-subhead tabular-nums text-ink after:absolute after:-inset-1 hover:bg-surface-2 active:bg-surface-2"
          >
            {rateLabel(rate)}
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2 max-[359px]:gap-1">
        <RepeatButton label={stepLabel.back} onStep={() => onStep(-1)}>
          <CaretLeftIcon size={24} aria-hidden="true" />
        </RepeatButton>
        {canPlay ? (
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={onToggle} className={cx(BTN, MAIN, 'bg-surface-2')}>
            {playing ? <PauseIcon size={24} aria-hidden="true" /> : <PlayIcon size={24} aria-hidden="true" />}
          </button>
        ) : null}
        <RepeatButton label={stepLabel.forward} onStep={() => onStep(1)}>
          <CaretRightIcon size={24} aria-hidden="true" />
        </RepeatButton>
      </div>
      <div className="flex min-w-max flex-1 basis-0 items-center justify-end gap-1 max-[359px]:gap-0">
        {onPrevServe !== undefined || onNextServe !== undefined ? (
          <>
            <button type="button" aria-label="Previous serve" aria-disabled={!onPrevServe || undefined} onClick={() => onPrevServe?.()} className={cx(BTN, SIDE)}>
              <SkipBackIcon size={22} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next serve" aria-disabled={!onNextServe || undefined} onClick={() => onNextServe?.()} className={cx(BTN, SIDE)}>
              <SkipForwardIcon size={22} aria-hidden="true" />
            </button>
          </>
        ) : onBigStep ? (
          <>
            <RepeatButton label="Back 10 frames" onStep={() => onBigStep(-10)} className={SIDE}>
              <CaretDoubleLeftIcon size={22} aria-hidden="true" />
            </RepeatButton>
            <RepeatButton label="Forward 10 frames" onStep={() => onBigStep(10)} className={SIDE}>
              <CaretDoubleRightIcon size={22} aria-hidden="true" />
            </RepeatButton>
          </>
        ) : null}
      </div>
    </div>
  )
}
