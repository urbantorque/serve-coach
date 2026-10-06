import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FlawId } from '../lib/analysis/flaws'
import type { DemoServe, FaultDemo } from '../lib/faultDemo'
import { drawSkeleton, type DrawRect } from '../lib/pose/skeleton'
import { Icon } from './primitives'

interface Props {
  flaw: FlawId
  racket: 'left' | 'right'
}

/** The same three speeds the report's players offer, named the same way. */
const SPEEDS = [
  { rate: 1, label: 'Full' },
  { rate: 0.5, label: 'Half' },
  { rate: 0.25, label: 'Quarter' },
] as const

/** Room round each body, as a share of the box both bodies fit in. */
const PAD_X = 1.35
const PAD_Y = 1.12

/** How far back the racket hand's trail reaches, in frames of the 60 fps rig. */
const TRAIL = 24

/**
 * The named fault, moving, beside its fix — see `lib/faultDemo.ts`.
 *
 * The rig is loaded with the tap rather than with the report: it is the whole
 * synthetic serve, and the report is complete without a picture nobody asked
 * for. A demonstration that cannot be built removes itself rather than leaving
 * an empty box under a heading.
 */
export default function FaultDemoPanel({ flaw, racket }: Props) {
  const [demo, setDemo] = useState<FaultDemo | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    import('../lib/faultDemo')
      .then(({ faultDemo }) => live && setDemo(faultDemo(flaw, racket) ?? null))
      .catch(() => live && setDemo(null))
    return () => {
      live = false
    }
  }, [flaw, racket])

  if (demo === null) return null
  return (
    <div className="fault-demo">
      {demo ? <DemoPlayer demo={demo} /> : <div className="fault-demo-wait" aria-busy="true" />}
      <p className="player-note">
        A model serve, not yours. The left body has this fault and the right body has the fix.
      </p>
    </div>
  )
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
 * Two bodies on one clock, side by side, lined up at contact.
 *
 * Its own small player rather than `TrackPlayer`, which replays one stored
 * swing and draws any second one as a dim dashed ghost from the hips up — the
 * right picture for "your serve against your last one", and the wrong one for
 * a single difference a player is meant to spot. Both bodies here are drawn
 * through the same `drawSkeleton` the report uses, at one scale, so the only
 * thing that differs between the halves is the fault.
 */
function DemoPlayer({ demo }: { demo: FaultDemo }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  const still =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  /** The stretch both serves cover, from contact: the loop. */
  const span = useMemo(() => {
    const { fault, fix } = demo
    const lo = Math.max(fromContact(fault, 0), fromContact(fix, 0))
    const hi = Math.min(fromContact(fault, fault.frames.length - 1), fromContact(fix, fix.frames.length - 1))
    return { lo, hi }
  }, [demo])

  /** Where each keyframe of the fault serve sits on the shared clock. */
  const marks = useMemo(
    () =>
      demo.fault.phases.map((p) => ({
        id: p.id,
        label: p.label,
        caption: p.caption,
        tau: fromContact(demo.fault, p.frame),
      })),
    [demo],
  )

  const parkedAt = marks.find((m) => m.id === demo.moment)?.tau ?? span.lo
  const [tau, setTau] = useState(still ? parkedAt : span.lo)
  const tauRef = useRef(tau)
  const [playing, setPlaying] = useState(!still)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]['rate']>(0.5)

  /** One scale for both bodies, so a difference in height is a difference in the serve. */
  const layout = useMemo(() => {
    const a = extent(demo.fault)
    const b = extent(demo.fix)
    const w = Math.max(a.x1 - a.x0, b.x1 - b.x0) * PAD_X
    const h = (Math.max(a.y1, b.y1) - Math.min(a.y0, b.y0)) * PAD_Y
    return {
      aspect: (2 * w) / h,
      w,
      h,
      midY: (Math.max(a.y1, b.y1) + Math.min(a.y0, b.y0)) / 2,
      midX: [(a.x0 + a.x1) / 2, (b.x0 + b.x1) / 2],
    }
  }, [demo])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const s = canvas.height / layout.h
    const half = canvas.width / 2
    ;[demo.fault, demo.fix].forEach((serve, k) => {
      const i = frameAt(serve, tauRef.current)
      const rect: DrawRect = {
        ox: half * (k + 0.5) - s * layout.midX[k],
        oy: canvas.height / 2 - s * layout.midY,
        dw: s,
        dh: s,
      }
      ctx.save()
      ctx.beginPath()
      ctx.rect(half * k, 0, half, canvas.height)
      ctx.clip()
      drawSkeleton(ctx, {
        frame: serve.frames[i],
        aspect: 1,
        rect,
        racket: demo.racket,
        trail: { frames: serve.frames, from: Math.max(0, i - TRAIL), to: i },
      })
      ctx.restore()
    })
  }, [demo, layout])

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

  /** Wall time scaled by the speed, looping over the shared span. */
  useEffect(() => {
    if (!playing) return
    let last = 0
    const tick = (ts: number) => {
      const dt = last ? Math.min(0.25, (ts - last) / 1000) * speed : 0
      last = ts
      let next = tauRef.current + dt
      if (next > span.hi) next = span.lo
      moveTo(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, speed, span, moveTo])

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
    <div className="player" role="group" aria-label="A model serve with this fault, beside the same serve fixed.">
      <div
        className="player-stage player-stage--pose"
        ref={stageRef}
        style={{ aspectRatio: `${Math.max(0.7, Math.min(1.5, layout.aspect))}` }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Two stick figures serving side by side: on the left with this fault, on the right without it."
        />
      </div>
      <div className="fault-demo-labels" aria-hidden="true">
        <span>This fault</span>
        <span>The fix</span>
      </div>

      <div className="player-controls">
        <button
          className="icon-btn icon-btn--solid"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
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
