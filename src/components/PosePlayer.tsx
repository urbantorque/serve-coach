import { useCallback, useEffect, useRef, useState } from 'react'
import { ballMarkerAt } from '../lib/analysis/analyze'
import type { Analysis, Frame, PhaseId } from '../lib/analysis/types'
import { drawSkeleton, fitContain } from '../lib/pose/skeleton'
import { Icon } from './primitives'

const SPEEDS = [1, 0.5, 0.25] as const

interface Props {
  videoUrl: string
  analysis: Analysis
  /** Bump `n` to jump to a keyframe from elsewhere on the page. */
  seek?: { phase: PhaseId; n: number }
}

/**
 * The clip with the tracked skeleton drawn over it.
 *
 * Playback is confined to the detected serve and loops, because the useful
 * couple of seconds are the whole point — nobody wants to scrub past a walk-up
 * to find the toss. The racket hand leaves a trail so the swing path reads at a
 * glance, and each keyframe annotates the joint angle it is judged on.
 */
export default function PosePlayer({ videoUrl, analysis, seek }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.5)
  const [activePhase, setActivePhase] = useState<PhaseId>('ready')
  const [skeletonOn, setSkeletonOn] = useState(true)
  const [modelOn, setModelOn] = useState(false)
  const [cursor, setCursor] = useState(0)
  /**
   * The reference pose, loaded on demand.
   *
   * Behind a dynamic import because it drags in the whole parametric rig, which
   * most sessions never ask for — and the first load of this app already has a
   * nine-megabyte pose model to fetch before it can do anything at all.
   */
  const [modelPose, setModelPose] = useState<typeof import('../lib/analysis/modelServe')>()

  useEffect(() => {
    if (!modelOn || modelPose) return
    let alive = true
    void import('../lib/analysis/modelServe').then((m) => {
      if (alive) setModelPose(m)
    })
    return () => {
      alive = false
    }
  }, [modelOn, modelPose])

  const { frames, phases, window: win, video } = analysis
  const aspect = video.width / Math.max(1, video.height)

  const frameAt = useCallback(
    (t: number): number => {
      let lo = 0
      let hi = frames.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (frames[mid].t < t) lo = mid + 1
        else hi = mid
      }
      if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) return lo - 1
      return lo
    },
    [frames],
  )

  /* ------------------------------------------------------------- drawing --- */

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const videoEl = videoRef.current
    if (!canvas || !videoEl) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    if (!skeletonOn) return

    const t = videoEl.currentTime
    if (t < win.start - 0.05 || t > win.end + 0.05) return

    const idx = frameAt(t)
    const f: Frame | undefined = frames[idx]
    if (!f) return

    const vw = videoEl.videoWidth || video.width
    const vh = videoEl.videoHeight || video.height
    const rect = fitContain(W, H, vw / Math.max(1, vh))

    // Only annotate when parked on the keyframe itself; mid-swing the callout
    // would be describing an angle the picture is no longer showing.
    const onKeyframe =
      Math.abs(t - (phases.find((p) => p.id === activePhase)?.t ?? -9)) < 0.09

    // The reference shape only means anything parked on the position it
    // describes — mid-swing it would be a second skeleton doing something else.
    const ghost =
      modelOn && onKeyframe && modelPose && analysis.scale?.bodyHeight
        ? modelPose.modelPoseAt(activePhase, {
            frame: f,
            bodyHeight: analysis.scale.bodyHeight,
            racket: analysis.handedness,
          })
        : undefined

    drawSkeleton(ctx, {
      frame: f,
      aspect,
      rect,
      racket: analysis.handedness,
      trail: { frames, from: phases.find((p) => p.id === 'ready')?.frame ?? 0, to: idx },
      annotation: onKeyframe ? activePhase : undefined,
      bodyHeight: analysis.scale?.bodyHeight,
      sequence: { frames, index: idx },
      ball: ballMarkerAt(analysis.ball, t),
      ghost,
    })
  }, [activePhase, analysis.ball, analysis.handedness, analysis.scale, aspect, frameAt, frames, modelOn, modelPose, phases, skeletonOn, video.height, video.width, win.end, win.start])

  /**
   * The latest `draw`, reachable from effects that must not re-run when it changes.
   *
   * `draw` is a `useCallback` whose identity changes whenever anything it renders
   * changes, which is most interactions. An effect that both registers a listener
   * and does setup work cannot depend on it: the setup would run again on every
   * redraw. That is not hypothetical — sizing the canvas is setup work, and
   * assigning `canvas.width` clears it, so a resize effect depending on `draw`
   * silently wiped every frame the moment after it was painted.
   */
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  }, [draw])

  /**
   * The scrubber's filled portion, which the animation loop used to own.
   *
   * It was written on every frame, so pausing simply froze it at the right place.
   * Now that the loop stops when the video does, seeking and stepping have to
   * move it themselves — otherwise the played bar sits wherever playback last
   * left it while the picture shows somewhere else entirely.
   */
  const syncProgress = useCallback(() => {
    const videoEl = videoRef.current
    if (!videoEl || !progressRef.current) return
    const span = Math.max(0.01, win.end - win.start)
    const pct = ((videoEl.currentTime - win.start) / span) * 100
    progressRef.current.style.setProperty('--played', `${Math.max(0, Math.min(100, pct))}%`)
  }, [win.end, win.start])

  /* ---------------------------------------------------------- rAF driver --- */

  /**
   * The animation loop, which runs only while the clip is actually moving.
   *
   * It used to run for as long as the report was on screen: sixty wake-ups a
   * second, each one re-rendering the whole skeleton, a racket and a ball trail,
   * for a paused video showing a picture that had not changed. A player reads
   * their report for a couple of minutes on a phone, and that is a couple of
   * minutes of continuous canvas work for no visible difference — it is the kind
   * of thing that shows up as the handset getting warm rather than as a bug.
   *
   * Paused, the overlay is instead redrawn only when something about it changes,
   * which the effect below handles.
   */
  useEffect(() => {
    if (!playing) return
    const tick = () => {
      const videoEl = videoRef.current
      if (videoEl) {
        // Loop inside the detected serve rather than the whole clip.
        if (videoEl.currentTime >= win.end || videoEl.currentTime < win.start - 0.25) {
          videoEl.currentTime = win.start
        }
        syncProgress()
        const nearest = phases.reduce((best, p) =>
          Math.abs(p.t - videoEl.currentTime) < Math.abs(best.t - videoEl.currentTime) ? p : best,
        )
        setActivePhase((prev) => (prev === nearest.id ? prev : nearest.id))
        // Only re-render when the frame actually changes, not 60 times a second.
        const idx = frameAt(videoEl.currentTime)
        setCursor((prev) => (prev === idx ? prev : idx))
      }
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, frameAt, phases, playing, syncProgress, win.end, win.start])

  /**
   * One redraw whenever the paused picture should look different.
   *
   * `draw` is a `useCallback`, so its identity changes exactly when something it
   * reads changes — the frame being shown, the phase being annotated, whether
   * the skeleton or the reference shape is on. Depending on it here is therefore
   * the same set of triggers the loop was covering by brute force, minus the
   * fifty-nine redraws a second that changed nothing.
   */
  useEffect(() => {
    if (playing) return
    draw()
    syncProgress()
  }, [draw, playing, cursor, syncProgress])

  /**
   * And once more when a seek finishes.
   *
   * Setting `currentTime` moves the skeleton immediately but the video underneath
   * only repaints when the browser has decoded the new frame. Without this the
   * overlay would be correct and the picture behind it stale for a moment on
   * every step — which is the one thing this player must never do.
   *
   * Registered once, via the ref, so a redraw cannot tear the listener down and
   * rebuild it.
   */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onSeeked = () => {
      if (v.paused) drawRef.current()
    }
    v.addEventListener('seeked', onSeeked)
    return () => v.removeEventListener('seeked', onSeeked)
  }, [])

  /**
   * Stop dead when the tab is hidden, and repaint when it comes back.
   *
   * Browsers throttle rAF in a background tab but do not reliably stop it, and a
   * paused-and-hidden player should be doing nothing at all. Coming back needs a
   * redraw because the canvas may have been dropped while it was away.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(rafRef.current)
      else drawRef.current()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.playbackRate = speed
  }, [speed])

  /* ------------------------------------------------------------ controls --- */

  const sizeCanvas = () => {
    const canvas = canvasRef.current
    const videoEl = videoRef.current
    if (!canvas || !videoEl) return
    const rect = videoEl.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }

  // Empty deps on purpose. Assigning `canvas.width` clears the canvas, so this
  // effect must never re-run on a redraw — it is declared after the paused-draw
  // effect, and would wipe the frame that had just been painted. The listener
  // reaches the current `draw` through the ref instead.
  useEffect(() => {
    sizeCanvas()
    // Resizing clears the canvas, so a paused player would otherwise be left
    // blank after a rotation until something else happened to trigger a redraw.
    const onResize = () => {
      sizeCanvas()
      drawRef.current()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime >= win.end - 0.02) v.currentTime = win.start
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  /**
   * Move to a time and update the readouts with it.
   *
   * The frame counter and phase label are otherwise only refreshed by the
   * animation loop, which browsers stop running for a backgrounded tab — so a
   * seek could leave the readout describing a moment the video is no longer at.
   * Deriving them here makes them a consequence of the action instead.
   */
  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current
      if (!v) return
      v.pause()
      setPlaying(false)
      v.currentTime = t
      setCursor(frameAt(t))
      const nearest = phases.reduce((best, p) =>
        Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best,
      )
      setActivePhase(nearest.id)
    },
    [frameAt, phases],
  )

  useEffect(() => {
    if (!seek) return
    const target = phases.find((p) => p.id === seek.phase)
    if (target) seekTo(target.t)
  }, [seek, phases, seekTo])

  const scrub = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const el = progressRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX
    if (clientX === undefined) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    seekTo(win.start + ratio * (win.end - win.start))
  }

  /**
   * Step to the next or previous *sampled* frame rather than by a fixed time.
   *
   * Landmarks only exist at the frames we tracked, so landing between two of
   * them would draw a stale skeleton over a fresh picture — the one thing this
   * player must never do. Stepping sample to sample keeps the overlay honest.
   */
  const step = useCallback(
    (dir: -1 | 1) => {
      const v = videoRef.current
      if (!v) return
      const next = Math.max(0, Math.min(frames.length - 1, frameAt(v.currentTime) + dir))
      v.pause()
      setPlaying(false)
      v.currentTime = frames[next].t
      setCursor(next)
    },
    [frameAt, frames],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => step(1),
      ArrowLeft: () => step(-1),
      ' ': toggle,
      Home: () => seekTo(win.start),
      End: () => seekTo(win.end - 0.01),
    }
    // 1–6 jump to the six keyframes, in the order they happen.
    const digit = Number(e.key)
    if (digit >= 1 && digit <= phases.length) {
      e.preventDefault()
      seekTo(phases[digit - 1].t)
      return
    }
    const action = keys[e.key]
    if (action) {
      e.preventDefault()
      action()
    }
  }

  const span = Math.max(0.01, win.end - win.start)

  const activeLabel = phases.find((p) => p.id === activePhase)?.label ?? ''

  return (
    // The whole player is one keyboard surface: arrows step frames, space plays,
    // 1–6 jump to the keyframes. Frame-by-frame is the reason people watch their
    // own serve at all, and it should not require a mouse.
    <div
      className="player"
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="group"
      aria-label="Serve video. Left and right arrows step one frame, space plays, keys 1 to 6 jump to each key position."
    >
      <div className="player-stage" style={{ aspectRatio: `${video.width} / ${video.height}` }}>
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          muted
          preload="auto"
          onLoadedMetadata={() => {
            sizeCanvas()
            if (videoRef.current) videoRef.current.currentTime = win.start
            // Paint immediately rather than waiting for the seek to land. If the
            // video already happens to sit at the start of the window no `seeked`
            // event ever fires, and now that the animation loop only runs during
            // playback there would be nothing else to draw the first frame.
            draw()
          }}
          onClick={toggle}
        />
        <canvas ref={canvasRef} onClick={toggle} />
        <button className="player-scrim" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} tabIndex={-1}>
          {!playing && (
            <span className="player-play">
              <Icon name="play" size={26} />
            </span>
          )}
        </button>
      </div>

      <div
        className="player-track"
        ref={progressRef}
        onMouseDown={scrub}
        onTouchStart={scrub}
        role="slider"
        tabIndex={0}
        aria-label="Position in the serve"
        aria-valuemin={0}
        aria-valuemax={frames.length - 1}
        aria-valuenow={cursor}
        aria-valuetext={`Frame ${cursor + 1} of ${frames.length}, ${activeLabel}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            e.stopPropagation()
            step(e.key === 'ArrowRight' ? 1 : -1)
          }
        }}
      >
        <div className="player-played" />
        {phases.map((p) => (
          <span
            key={p.id}
            className={`player-tick${activePhase === p.id ? ' is-active' : ''}`}
            style={{ left: `${((p.t - win.start) / span) * 100}%` }}
          />
        ))}
      </div>

      <div className="player-controls">
        <button className="icon-btn icon-btn--solid" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>

        <div className="stepper">
          <button
            className="icon-btn icon-btn--quiet"
            onClick={() => step(-1)}
            disabled={cursor <= 0}
            aria-label="Previous frame"
          >
            <Icon name="back" size={18} />
          </button>
          <span className="stepper-read tnum" aria-hidden="true">
            {cursor + 1}/{frames.length}
          </span>
          <button
            className="icon-btn icon-btn--quiet"
            onClick={() => step(1)}
            disabled={cursor >= frames.length - 1}
            aria-label="Next frame"
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>

        <div className="seg">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`seg-item${speed === s ? ' is-on' : ''}`}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
            >
              {s === 1 ? '1×' : `${s}×`}
            </button>
          ))}
        </div>
        <button
          className={`chip chip--toggle${skeletonOn ? ' is-on' : ''}`}
          onClick={() => setSkeletonOn((v) => !v)}
          aria-pressed={skeletonOn}
        >
          Skeleton
        </button>
        <button
          className={`chip chip--toggle${modelOn ? ' is-on' : ''}`}
          onClick={() => setModelOn((v) => !v)}
          aria-pressed={modelOn}
          title="Show the shape the targets describe, at each key position"
        >
          Target shape
        </button>
      </div>

      <div className="phase-pills">
        {phases.map((p) => (
          <button
            key={p.id}
            className={`phase-pill${activePhase === p.id ? ' is-active' : ''}`}
            onClick={() => seekTo(p.t)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="player-caption" aria-live="polite">
        {phases.find((p) => p.id === activePhase)?.caption}
      </p>
      {modelOn && (
        <p className="player-model-note">
          <span className="player-model-key" aria-hidden="true" />
          {modelPose?.MODEL_NOTES[activePhase] ??
            'The dashed figure is the shape the targets describe. It appears when you park on one of the six key positions.'}
        </p>
      )}
    </div>
  )
}

