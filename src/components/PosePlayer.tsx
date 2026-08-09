import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ballMarkerAt } from '../lib/analysis/analyze'
import { unlevelFrames } from '../lib/analysis/spatial'
import type { Analysis, Frame, PhaseId } from '../lib/analysis/types'
import { levelFlight } from '../lib/vision/ballTrack'
import { drawSkeleton, fitContain } from '../lib/pose/skeleton'
import { SkeletonSmoother } from '../lib/pose/smoothing'
import { Icon } from './primitives'

/** Playback speeds, named rather than written as multipliers. */
const SPEEDS = [
  { rate: 1, label: 'Full' },
  { rate: 0.5, label: 'Half' },
  { rate: 0.25, label: 'Quarter' },
] as const

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
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]['rate']>(0.5)
  const [activePhase, setActivePhase] = useState<PhaseId>('ready')
  const [skeletonOn, setSkeletonOn] = useState(true)
  const [cursor, setCursor] = useState(0)

  /**
   * Steadies the skeleton against per-frame pose noise, for drawing only.
   *
   * One instance per mount rather than per draw, so it keeps a continuous
   * sense of velocity across frames instead of restarting cold on every
   * render. See `SkeletonSmoother` for why a scrub or a loop resets it
   * instead of dragging the pose across the screen.
   */
  const smootherRef = useRef<SkeletonSmoother>()
  if (!smootherRef.current) smootherRef.current = new SkeletonSmoother()

  const { frames, phases, window: win, video } = analysis
  const aspect = video.width / Math.max(1, video.height)

  /**
   * The frames and flight as the *pixels* saw them.
   *
   * When the clip needed roll correction, everything on `analysis` lives in
   * the levelled space the measurements used — but the video underneath this
   * canvas is the raw recording, so a levelled skeleton drawn straight onto
   * it sits off the body by exactly the roll that was corrected. Drawing
   * inverts the transform once, up front; timestamps are untouched, so the
   * playback bookkeeping below stays on `frames`.
   */
  const drawFrames = useMemo(
    () => (analysis.tilt ? unlevelFrames(frames, analysis.tilt) : frames),
    [frames, analysis.tilt],
  )
  const drawBall = useMemo(
    () =>
      analysis.ball && analysis.tilt
        ? levelFlight(
            analysis.ball,
            -analysis.tilt.roll_deg,
            { cx: analysis.tilt.cx, cy: analysis.tilt.cy },
            aspect,
          )
        : analysis.ball,
    [analysis.ball, analysis.tilt, aspect],
  )

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
    const f: Frame | undefined = drawFrames[idx]
    if (!f) return

    const vw = videoEl.videoWidth || video.width
    const vh = videoEl.videoHeight || video.height
    const rect = fitContain(W, H, vw / Math.max(1, vh))

    // Only annotate when parked on the keyframe itself; mid-swing the callout
    // would be describing an angle the picture is no longer showing.
    const onKeyframe =
      Math.abs(t - (phases.find((p) => p.id === activePhase)?.t ?? -9)) < 0.09

    // Smoothed only for drawing — `f` itself, and everything derived from the
    // raw `frames` array below (the trail, the racket estimate), is left
    // untouched so the overlay's numbers never drift from what was measured.
    const renderFrame: Frame = { ...f, image: smootherRef.current!.frame(f.image, f.t) }

    drawSkeleton(ctx, {
      frame: renderFrame,
      aspect,
      rect,
      racket: analysis.handedness,
      trail: { frames: drawFrames, from: phases.find((p) => p.id === 'ready')?.frame ?? 0, to: idx },
      annotation: onKeyframe ? activePhase : undefined,
      bodyHeight: analysis.scale?.bodyHeight,
      sequence: { frames: drawFrames, index: idx },
      ball: ballMarkerAt(drawBall, t),
    })
  }, [activePhase, drawBall, analysis.handedness, analysis.scale, aspect, frameAt, drawFrames, phases, skeletonOn, video.height, video.width, win.end, win.start])

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
   *
   * Unitless 0–1 rather than a percentage: this runs on every animation frame,
   * and the two things that read it are both scaled or translated by it. A
   * length here would make each of these writes a layout on the same frames the
   * canvas overlay is being redrawn on. See `--played` in player.css.
   */
  const syncProgress = useCallback(() => {
    const videoEl = videoRef.current
    if (!videoEl || !progressRef.current) return
    const span = Math.max(0.01, win.end - win.start)
    const ratio = (videoEl.currentTime - win.start) / span
    progressRef.current.style.setProperty('--played', `${Math.max(0, Math.min(1, ratio))}`)
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
  /**
   * What the last painted overlay was of. See the redraw gate in the loop.
   */
  const drawnKey = useRef<string>()

  useEffect(() => {
    if (!playing) return
    // A loop that has just started always paints its first frame, whatever the
    // one before it left behind.
    drawnKey.current = undefined
    const tick = () => {
      const videoEl = videoRef.current
      let key: string | undefined
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
        key = `${idx}|${nearest.id}`
      }
      /*
       * And only repaint the canvas when the picture over it would differ.
       *
       * The body half of this overlay — the skeleton, the swing trail, the
       * estimated racket, the callout — is read off the nearest *sampled* frame,
       * and there are 32 of those a second at best. Playback defaults to half
       * speed, which is where a player leaves it, so the loop was rebuilding an
       * identical picture three times out of four: a whole skeleton, a
       * six-bucket fading trail and a 32-segment flight path, sixty times a
       * second, on a phone. That is not a dropped frame anywhere, it is the
       * handset getting warm — the same thing the loop was stopped from doing
       * while paused, still happening while it plays.
       *
       * The one thing this does change is the ball marker, which is read off the
       * fitted curve at the exact playhead and so used to glide between samples
       * while the body it belongs to stepped. It now steps with the body, which
       * is the more honest of the two: the flight is only known where the ball
       * was detected, and a marker moving smoothly over a skeleton that is not
       * says the arc is better measured than the swing.
       *
       * The bookkeeping above stays on every frame: the loop wrap and the
       * scrubber are cheap and the scrubber has to move smoothly.
       */
      if (key === undefined || key !== drawnKey.current) {
        drawnKey.current = key
        draw()
      }
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
   * the skeleton is on. Depending on it here is therefore
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
   * paused-and-hidden player should be doing nothing at all. The video itself is
   * paused too — cancelling only the loop left it running under a dead overlay,
   * with `playing` stranded at true so the first tap back did nothing. Pausing
   * through state keeps the button, the loop and the picture telling one story.
   * Coming back needs a redraw because the canvas may have been dropped away.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        videoRef.current?.pause()
        setPlaying(false)
        cancelAnimationFrame(rafRef.current)
      } else {
        drawRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /**
   * Loop from the media's own `ended` event, not just the rAF check.
   *
   * A serve window that runs to the end of the file — every tightly trimmed
   * clip — ends the media before the loop check can wrap it: the element
   * pauses itself, and a seek after `ended` does not resume. Without this the
   * player froze on the first frame showing a Pause button, with the loop
   * ticking forever over a video that had stopped.
   */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onEnded = () => {
      v.currentTime = win.start
      void v.play()
    }
    v.addEventListener('ended', onEnded)
    return () => v.removeEventListener('ended', onEnded)
  }, [win.start])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.playbackRate = speed
  }, [speed])

  /* ------------------------------------------------------------ controls --- */

  /**
   * Match the canvas to the video box. Reports whether the backing store was
   * actually reallocated, and so whether the overlay on it was destroyed.
   *
   * Assigning `canvas.width` resets the bitmap whether or not the value changed,
   * so an unguarded call on every resize event threw away a multi-megabyte
   * buffer, zeroed a new one and forced a full repaint of the overlay for
   * nothing. A phone fires a burst of these for the keyboard, the URL bar
   * collapsing and any rotation. The CSS size is still written every time — it
   * is a cheap string and it tracks the sub-pixel width the rounded bitmap
   * cannot.
   */
  const sizeCanvas = (): boolean => {
    const canvas = canvasRef.current
    const videoEl = videoRef.current
    if (!canvas || !videoEl) return false
    const rect = videoEl.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (canvas.width === w && canvas.height === h) return false
    canvas.width = w
    canvas.height = h
    return true
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
      if (sizeCanvas()) drawRef.current()
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

  // Keyed on the bump counter, not the object: `seek` is sticky, so when a
  // rescore hands down new `phases`/`seekTo` identities this effect re-fires —
  // and without the guard it would replay a jump the player asked for minutes
  // ago, yanking the video away from wherever they had scrubbed to.
  const seenSeek = useRef<number>()
  useEffect(() => {
    if (!seek || seek.n === seenSeek.current) return
    seenSeek.current = seek.n
    const target = phases.find((p) => p.id === seek.phase)
    if (target) seekTo(target.t)
  }, [seek, phases, seekTo])

  /**
   * Press-and-drag on the track, not just a single tap.
   *
   * The seek on press was already there; what was missing was following the
   * pointer while it stayed down. The listeners go on the window rather than
   * the track itself so a drag that strays outside the narrow strip — easy
   * to do on a phone — keeps tracking instead of freezing where it left.
   */
  const endScrubRef = useRef<() => void>()
  // A drag that never ends is a drag the component unmounted underneath —
  // tapping back, or switching serves inside a basket, mid-scrub. `onUp` is the
  // only thing that removes these, and it is a window listener closing over
  // `seekTo`, which closes over every tracked frame of the clip. Left behind it
  // keeps a megabyte or two alive and goes on seeking a video that is gone.
  useEffect(() => () => endScrubRef.current?.(), [])

  const scrub = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const el = progressRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()

      const seekAt = (clientX: number) => {
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        seekTo(win.start + ratio * (win.end - win.start))
      }

      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX
      if (clientX === undefined) return
      seekAt(clientX)

      const onMove = (ev: MouseEvent | TouchEvent) => {
        const x = 'touches' in ev ? ev.touches[0]?.clientX : ev.clientX
        if (x !== undefined) seekAt(x)
      }
      const onUp = () => {
        endScrubRef.current = undefined
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        window.removeEventListener('touchmove', onMove)
        window.removeEventListener('touchend', onUp)
        window.removeEventListener('touchcancel', onUp)
      }
      // A second press before the first one lifted — a mouse button held while a
      // finger lands — would otherwise strand the first drag's listeners.
      endScrubRef.current?.()
      endScrubRef.current = onUp
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      window.addEventListener('touchmove', onMove)
      window.addEventListener('touchend', onUp)
      // A touch the browser takes back — notification shade, incoming call —
      // ends in `touchcancel`, and without this the window-level move handler
      // outlives the drag and every later touch keeps seeking the video.
      window.addEventListener('touchcancel', onUp)
    },
    [seekTo, win.start, win.end],
  )

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
      // The phase follows the frame, exactly as it does when seeking — stepping
      // onto the contact keyframe must light its pill, caption and annotation,
      // not leave them describing wherever playback last was.
      const nearest = phases.reduce((best, p) =>
        Math.abs(p.t - frames[next].t) < Math.abs(best.t - frames[next].t) ? p : best,
      )
      setActivePhase(nearest.id)
    },
    [frameAt, frames, phases],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Space belongs to whichever button has focus. This handler sits on the
    // player's root div and every control in the component is inside it, so a
    // Space that bubbled up from a focused button was being cancelled here and
    // spent on play/pause instead — a browser activates a button on keyup and
    // only if the keydown was not cancelled. Tabbing to "Skeleton", "Half",
    // "Next frame" or a keyframe pill and pressing the habitual activation key
    // started the video and left the control alone, with nothing on screen to
    // explain it. The slider is deliberately not covered: it has no native
    // Space behaviour to protect, and play/pause from the scrubber is useful.
    if (e.key === ' ' && (e.target as HTMLElement).closest('button')) return

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
            // And the speed, again, here.
            //
            // The effect below sets it on mount, and the element's own load
            // algorithm then resets `playbackRate` to `defaultPlaybackRate` —
            // which is 1 — as part of selecting the resource. That is a task,
            // and React's effect is not, so which of the two lands last depends
            // on how quickly the blob resolves. Lose the race and the segmented
            // control reads Half while the clip runs at full speed, with nothing
            // on screen admitting it: the one control on this player whose whole
            // job is slowing a serve down enough to see it.
            if (videoRef.current) videoRef.current.playbackRate = speed
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
        <button
          className={`chip chip--toggle${skeletonOn ? ' is-on' : ''}`}
          onClick={() => setSkeletonOn((v) => !v)}
          aria-pressed={skeletonOn}
        >
          Skeleton
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
      {/* Announced when the player is parked on a phase, silent while it runs.
          The clip loops forever at half speed, so six phase captions crossed
          about once a second with no end — polite announcements queue faster
          than they drain, and a screen reader ended up talking over everything
          else on the report, including the hunt for the pause button that would
          have stopped it. Paused, stepped or seeked, the caption is exactly the
          thing worth reading aloud. */}
      <p className="player-caption" aria-live={playing ? 'off' : 'polite'}>
        {phases.find((p) => p.id === activePhase)?.caption}
      </p>
    </div>
  )
}

