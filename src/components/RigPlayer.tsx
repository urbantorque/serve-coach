import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DemoServe } from '../lib/faultDemo'
import type { PhaseId } from '../lib/analysis/types'
import { drawSkeleton, type DrawRect } from '../lib/pose/skeleton'
import { Icon } from './primitives'

/** The same three speeds the report's players offer, named the same way. */
const SPEEDS = [
  { rate: 1, label: 'Full' },
  { rate: 0.5, label: 'Half' },
  { rate: 0.25, label: 'Quarter' },
] as const

/** Room round each body, as a share of the box every body fits in. */
const PAD_X = 1.35
const PAD_Y = 1.12

/** How far back the racket hand's trail reaches, in frames of the 60 fps rig. */
const TRAIL = 24

interface Props {
  /** One body or two, side by side, on one clock lined up at contact. */
  serves: DemoServe[]
  /** Which half is which, under the picture. Omitted for one body. */
  labels?: string[]
  /** Where the picture parks for a player who asked for less motion. */
  moment: PhaseId
  racket: 'left' | 'right'
  /** What the group is, for a screen reader. */
  groupLabel: string
  /** What the drawing shows, for a screen reader. */
  canvasLabel: string
  /** Offer the three speeds. Off where the screen is busy enough already. */
  speeds?: boolean
  /**
   * Most redraws a second. The analysing screen caps it, because the device
   * is running pose estimation underneath and a looping drawing should not
   * take frames from it.
   */
  maxFps?: number
}

/** Seconds from contact, for a frame of one serve. */
const fromContact = (s: DemoServe, i: number) => s.frames[i].t - s.contactT

/** The frame of one serve showing at a shared instant — nearest, clamped to its span. */
function frameAt(s: DemoServe, tau: number): number {
  const want = s.contactT + tau
  const first = s.frames[0].t
  const step = s.frames.length > 1 ? (s.frames[s.frames.length - 1].t - first) / (s.frames.length - 1) : 1
  return Math.max(0, Math.min(s.frames.length - 1, Math.round((want - first) / step)))
}

/** The box a serve's body moves through, in image units. */
function extent(s: DemoServe) {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const f of s.frames) {
    for (const p of f.image) {
      if (p.x < x0) x0 = p.x
      if (p.x > x1) x1 = p.x
      if (p.y < y0) y0 = p.y
      if (p.y > y1) y1 = p.y
    }
  }
  return { x0, x1, y0, y1 }
}

/**
 * Rig serves, moving: the fault beside its fix (`FaultDemoPanel`), or the
 * clean serve on its own as the model to watch (`ModelServe`, L4.3).
 *
 * Its own small player rather than `TrackPlayer`, which replays one stored
 * swing and draws any second one as a dim dashed ghost from the hips up — the
 * right picture for "your serve against your last one", and the wrong one for
 * a single difference a player is meant to spot. Every body here is drawn
 * through the same `drawSkeleton` the report uses, at one scale, so between
 * two halves the only thing that differs is the serve.
 *
 * The moment pills and the caption under them are the six keyframes of the
 * first serve, with `PHASE_COPY`'s checkpoint for each: what that moment
 * should look like.
 */
export default function RigPlayer({
  serves,
  labels,
  moment,
  racket,
  groupLabel,
  canvasLabel,
  speeds = true,
  maxFps,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  const still =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  /** The stretch every serve covers, from contact: the loop. */
  const span = useMemo(() => {
    const lo = Math.max(...serves.map((s) => fromContact(s, 0)))
    const hi = Math.min(...serves.map((s) => fromContact(s, s.frames.length - 1)))
    return { lo, hi }
  }, [serves])

  /** Where each keyframe of the first serve sits on the shared clock. */
  const marks = useMemo(
    () =>
      serves[0].phases.map((p) => ({
        id: p.id,
        label: p.label,
        caption: p.caption,
        tau: fromContact(serves[0], p.frame),
      })),
    [serves],
  )

  const parkedAt = marks.find((m) => m.id === moment)?.tau ?? span.lo
  const [tau, setTau] = useState(still ? parkedAt : span.lo)
  const tauRef = useRef(tau)
  const [playing, setPlaying] = useState(!still)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]['rate']>(0.5)

  /** One scale for every body, so a difference in height is a difference in the serve. */
  const layout = useMemo(() => {
    const boxes = serves.map(extent)
    const w = Math.max(...boxes.map((b) => b.x1 - b.x0)) * PAD_X
    const top = Math.min(...boxes.map((b) => b.y0))
    const bottom = Math.max(...boxes.map((b) => b.y1))
    const h = (bottom - top) * PAD_Y
    return {
      aspect: (serves.length * w) / h,
      h,
      midY: (top + bottom) / 2,
      midX: boxes.map((b) => (b.x0 + b.x1) / 2),
    }
  }, [serves])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const s = canvas.height / layout.h
    const part = canvas.width / serves.length
    serves.forEach((serve, k) => {
      const i = frameAt(serve, tauRef.current)
      const rect: DrawRect = {
        ox: part * (k + 0.5) - s * layout.midX[k],
        oy: canvas.height / 2 - s * layout.midY,
        dw: s,
        dh: s,
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(part * k, 0, part, canvas.height)
      ctx.clip()
      drawSkeleton(ctx, {
        frame: serve.frames[i],
        aspect: 1,
        rect,
        racket,
        trail: { frames: serve.frames, from: Math.max(0, i - TRAIL), to: i },
      })
      ctx.restore()
    })
  }, [serves, layout, racket])

  /** Match the bitmap to the box, at the screen's own density. */
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(stage.clientWidth * dpr)
      canvas.height = Math.round(stage.clientHeight * dpr)
      draw()
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [draw])

  const moveTo = useCallback(
    (t: number) => {
      tauRef.current = t
      setTau(t)
      draw()
    },
    [draw],
  )

  /** Wall time scaled by the speed, looping over the shared span, at most `maxFps` redraws a second. */
  useEffect(() => {
    if (!playing) return
    const gap = maxFps ? 1000 / maxFps : 0
    let last = 0
    let drawn = 0
    const tick = (ts: number) => {
      const dt = last ? Math.min(0.25, (ts - last) / 1000) * speed : 0
      last = ts
      let next = tauRef.current + dt
      if (next > span.hi) next = span.lo
      tauRef.current = next
      if (ts - drawn >= gap) {
        drawn = ts
        moveTo(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, speed, span, moveTo, maxFps])

  // Stops dead in a hidden tab, as both of the report's players do.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const active = marks.reduce<(typeof marks)[number] | undefined>(
    (best, m) => (!best || Math.abs(m.tau - tau) < Math.abs(best.tau - tau) ? m : best),
    undefined,
  )

  return (
    <div className="player" role="group" aria-label={groupLabel}>
      <div
        className="player-stage player-stage--pose"
        ref={stageRef}
        style={{ aspectRatio: `${Math.max(0.7, Math.min(1.5, layout.aspect))}` }}
      >
        <canvas ref={canvasRef} role="img" aria-label={canvasLabel} />
      </div>
      {labels && (
        <div className="fault-demo-labels" aria-hidden="true">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}

      <div className="player-controls">
        <button
          className="icon-btn icon-btn--solid"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        {speeds && (
          <div className="seg">
            {SPEEDS.map((s) => (
              <button
                key={s.rate}
                className={`seg-item${speed === s.rate ? ' is-on' : ''}`}
                onClick={() => setSpeed(s.rate)}
                aria-pressed={speed === s.rate}
                aria-label={`${s.label} speed`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="phase-pills">
        {marks.map((m) => (
          <button
            key={m.id}
            className={`phase-pill${active?.id === m.id ? ' is-active' : ''}`}
            onClick={() => {
              setPlaying(false)
              moveTo(m.tau)
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="player-caption" aria-live={playing ? 'off' : 'polite'}>
        {active?.caption}
      </p>
    </div>
  )
}
