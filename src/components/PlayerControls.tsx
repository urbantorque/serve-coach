import { useRef } from 'react'
import type { PhaseId } from '../lib/analysis/types'
import { Icon } from './primitives'
import { usePillInView } from './usePillInView'

/** How fast a serve plays, in words. Slow is where a player starts: it is why they are watching. */
export const WATCH_SPEEDS = [
  { rate: 0.5, label: 'Slow' },
  { rate: 0.25, label: 'Very slow' },
  { rate: 1, label: 'Real speed' },
] as const

export type WatchRate = (typeof WATCH_SPEEDS)[number]['rate']

interface Moment {
  id: PhaseId
  label: string
  /** A tick where this moment was on target, a cross where it was not. */
  mark?: 'tick' | 'cross'
}

interface Props {
  playing: boolean
  onToggle: () => void
  rate: WatchRate
  onRate: (rate: WatchRate) => void
  /** Frame by frame. Absent where the player has no frames to step through. */
  onStep?: (by: 1 | -1) => void
  canBack?: boolean
  canForward?: boolean
  moments: Moment[]
  active?: PhaseId
  onMoment: (id: PhaseId) => void
  caption?: string
  /** Pauses the speed button on a screen too busy for it. */
  speeds?: boolean
  /** Anything else that belongs on the row. */
  extra?: React.ReactNode
}

/**
 * Watching a serve, not operating a tool.
 *
 * The players used to show a frame counter ("1/52"), a three-way "Full, Half,
 * Quarter" and a "Skeleton" switch: three controls that described the software.
 * What a player wants is to watch it slowly and stop at a moment. So there is
 * one button to play, one that says how fast in words, the two arrows for going
 * a frame at a time, and the six moments by name, each marked by how it went.
 */
export default function PlayerControls({
  playing,
  onToggle,
  rate,
  onRate,
  onStep,
  canBack = true,
  canForward = true,
  moments,
  active,
  onMoment,
  caption,
  speeds = true,
  extra,
}: Props) {
  const pills = useRef<HTMLDivElement>(null)
  usePillInView(pills, active)
  const next = WATCH_SPEEDS[(WATCH_SPEEDS.findIndex((s) => s.rate === rate) + 1) % WATCH_SPEEDS.length]
  const now = WATCH_SPEEDS.find((s) => s.rate === rate) ?? WATCH_SPEEDS[0]

  return (
    <>
      <div className="watch-controls">
        <button className="watch-play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        {speeds && (
          <button className="watch-speed" onClick={() => onRate(next.rate)} aria-label={`Speed: ${now.label}. Change to ${next.label}.`}>
            {now.label}
          </button>
        )}
        <span className="watch-gap" />
        {extra}
        {onStep && (
          <span className="watch-step">
            <button className="icon-btn" onClick={() => onStep(-1)} disabled={!canBack} aria-label="Back one frame">
              <Icon name="back" size={18} />
            </button>
            <button className="icon-btn" onClick={() => onStep(1)} disabled={!canForward} aria-label="Forward one frame">
              <Icon name="chevron" size={18} />
            </button>
          </span>
        )}
      </div>

      {moments.length > 0 && (
        <div className="watch-moments" ref={pills}>
          {moments.map((m) => (
            <button
              key={m.id}
              className={`watch-moment${active === m.id ? ' is-active' : ''}`}
              aria-pressed={active === m.id}
              onClick={() => onMoment(m.id)}
            >
              {m.mark && (
                <span className={`watch-mark watch-mark--${m.mark}`}>
                  <Icon name={m.mark === 'tick' ? 'check' : 'close'} size={11} />
                  <span className="sr-only">{m.mark === 'tick' ? 'On target. ' : 'Off target. '}</span>
                </span>
              )}
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Silent while it runs: six captions a second, for ever, queue faster
          than a screen reader drains them. Parked, it is worth reading out. */}
      <p className="watch-caption" aria-live={playing ? 'off' : 'polite'}>
        {caption}
      </p>
    </>
  )
}
