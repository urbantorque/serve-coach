import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { drawSkeleton, fitContain } from '../lib/pose/skeleton'
import { SkeletonSmoother } from '../lib/pose/smoothing'
import { phaseSamples, trackFrameAt, type Replay, type SwingTrack } from '../lib/storage/poseTrack'
import { pairedLookup, type TrackPair } from '../lib/trackPair'
import type { Frame, Phase, PhaseId } from '../lib/analysis/types'
import { Icon } from './primitives'

/** The same three speeds the live player offers, named the same way. */
const SPEEDS = [
  { rate: 1, label: 'Full' },
  { rate: 0.5, label: 'Half' },
  { rate: 0.25, label: 'Quarter' },
] as const

interface Props {
  /** The stored swing. */
  track: SwingTrack
  /**
   * The instants that swing can be drawn at, from `replayFrom`.
   *
   * Passed in rather than derived here because the caller has to know whether
   * there is a replay at all before it commits to a heading and a section — and
   * two `replayFrom` calls on the same track is one more chance for the section
   * and the player inside it to disagree about whether this report can move.
   */
  replay: Replay
  phases: readonly Phase[]
  racket: 'left' | 'right'
  /**
   * Another of this player's saved serves, aligned onto this one by
   * `pairTracks`.
   *
   * Absent most of the time and that is the design: the pairing refuses a camera
   * that moved, a rubric change, a serve of another type and a contact nobody
   * tracked, silently in every case. A player who is not offered this comparison
   * is not told why, because the report is complete without it.
   */
  paired?: TrackPair
}

/**
 * An old serve, played back as motion, when its video is long gone.
 *
 * WHAT THIS IS FOR. A report keeps its numbers forever and its video not at all
 * — the clip is a blob the browser hands back on the way to the analysis and
 * nothing stores it, which is the privacy property the whole app is built on.
 * So a serve from two months ago could be read and could not be watched. The
 * swing track fixed the storage half of that (21 kB a report, `poseTrack.ts`);
 * this is the half a player can see.
 *
 * DELIBERATELY NOT A VIDEO, exactly as `PoseStill` is deliberately not a
 * photograph. It is the tracked body on the report's own surface — no court, no
 * light, no grip, no ball. The ball especially: the flight was measured in
 * pixels the track does not carry, so drawing one would be inventing an arc, and
 * a replay that showed a ball would be claiming to be a recording. What it shows
 * is exactly what the numbers on this report were read from, which is a more
 * useful thing to be than a bad copy of a video.
 *
 * THE SAME BODY, MOVING THE SAME WAY. It draws through `drawSkeleton` and
 * steadies through `SkeletonSmoother`, the two the live player uses, so a serve
 * looks the same whether the clip is still there or not. Timing comes from the
 * track's own sample times rather than an assumed frame rate, so a swing that
 * was filmed unevenly replays unevenly — see `replayFrom`.
 *
 * NO ROLL CORRECTION TO UNDO. The live player inverts the levelling because the
 * video underneath it is the raw recording; here there is no video, and levelled
 * image space is the only space in the room. A stored track is already in it.
 */
export default function TrackPlayer({ track, replay, phases, racket, paired }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]['rate']>(0.5)
  const [cursor, setCursor] = useState(0)

  /**
   * The sample on screen, readable the instant it changes.
   *
   * `cursor` is React state, so two presses inside one render both read the same
   * value and step once between them — a held arrow key can lose frames. The
   * live player never had this problem because it steps from the video's own
   * `currentTime`, which is a synchronous source of truth; this is that, for a
   * player with no video under it. Every write to `cursor` goes through
   * `moveTo`, so the two can never disagree.
   */
  const cursorRef = useRef(0)
  const moveTo = useCallback((i: number) => {
    cursorRef.current = i
    setCursor(i)
  }, [])

  /** As `PosePlayer` — one instance per mount, so velocity survives a frame. */
  const smootherRef = useRef<SkeletonSmoother>()
  if (!smootherRef.current) smootherRef.current = new SkeletonSmoother()

  /**
   * Every sample decoded once, at mount, rather than per paint.
   *
   * Fifty-odd rows of thirty-three landmarks is a few thousand objects and the
   * answer cannot change while a report is open, but the swing trail reads the
   * whole array on every painted frame — decoding inside `draw` would rebuild
   * the entire swing sixty times a second to draw one body.
   *
   * Non-null by construction: `replayFrom` only lists rows `trackFrameAt` can
   * decode. The filter is the type system's price for that being true, not a
   * second opinion about it.
   *
   * MEASURED RATHER THAN ASSUMED, since the paragraph above was a guess about
   * cost when it was written. Driven under playwright at an iPhone 15 viewport
   * on a 52-row swing: 180 animation frames over three seconds of playback, a
   * median interval of 16.7 ms, a 95th percentile of 17 and a worst frame of 19.
   * Not one frame over 20 ms — a clean sixty, with the trail redrawn every time.
   * The trail itself is why that holds: `drawSkeleton` quantises the fade into
   * six polylines per pass rather than stroking per segment, so its cost is
   * twelve paths regardless of how long the swing is.
   *
   * And no leak, including the case that would produce one. Mounting and
   * unmounting this player six times while it was still PLAYING — so a frame was
   * always scheduled at teardown — left the heap flat at 15.9–16.1 MB after the
   * first allocation, drifting under 300 kB with no trend. The listeners each
   * have their own removal and the scrub drag has `endScrubRef`, which is the
   * one that would otherwise survive an unmount mid-gesture holding every
   * decoded frame of the swing.
   */
  const frames = useMemo<Frame[]>(
    () =>
      replay.samples
        .map((s) => trackFrameAt(track, s.row))
        .filter((f): f is Frame => f !== undefined),
    [replay, track],
  )

  /** Which sample each keyframe is, by name — exact rows only. */
  const marks = useMemo(() => phaseSamples(replay, track, phases), [replay, track, phases])

  /**
   * Where the other serve was, at an instant of this one.
   *
   * The whole decision lives in `pairedLookup` — contact alignment, nearest
   * rather than last-started, and nothing at all outside the other swing's span
   * — because a rule inside a `useCallback` is a rule no test can reach, which
   * is the finding R47 made about this screen layer generally. Memoised because
   * it builds its search array once and is then called on every painted frame.
   */
  const pairedAt = useMemo(() => (paired ? pairedLookup(paired) : undefined), [paired])

  /**
   * The sample showing at a moment in the replay.
   *
   * The last one that has started, not the nearest one: a sample is on screen
   * from its own time until the next one's, which is what makes an unevenly
   * filmed swing hold still over a gap instead of easing across it.
   */
  const sampleAt = useCallback(
    (t: number) => {
      let i = 0
      while (i + 1 < replay.samples.length && replay.samples[i + 1].at <= t) i++
      return i
    },
    [replay],
  )

  /**
   * The keyframes this replay can actually park on.
   *
   * A phase whose own row was never tracked gets no pill and no tick rather than
   * a control that lands on its neighbour: the caption under this player names
   * the moment it is parked at, and a pill reading Contact that stops one frame
   * early would caption the wrong instant with a picture that still looks right.
   * The filmstrip below still shows all six.
   */
  const marked = useMemo(() => phases.filter((p) => marks.has(p.id)), [phases, marks])

  /** The keyframe nearest the cursor, for the caption and the lit pill. */
  const activePhase: PhaseId | undefined = useMemo(() => {
    let best: PhaseId | undefined
    let bestGap = Infinity
    for (const p of marked) {
      const gap = Math.abs((marks.get(p.id) as number) - cursor)
      if (gap < bestGap) {
        bestGap = gap
        best = p.id
      }
    }
    return best
  }, [marked, marks, cursor])

  /* ------------------------------------------------------------- drawing --- */

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const f = frames[cursor]
    if (!f) return

    /*
     * Smoothed against the REPLAY's clock, not the frame's stored timestamp.
     *
     * `SkeletonSmoother` reads discontinuity off the times it is handed: equal
     * times are a repaint and return the cached pose, a backwards jump or a gap
     * over half a second is a cut and snaps to the raw landmarks. That contract
     * is exactly right and it is why the stored time cannot be the thing fed to
     * it. `readSwingTrack` repairs a missing timestamp to zero rather than
     * dropping the row — the right trade for a filmstrip — so a track whose
     * times did not survive has every row at t = 0, every `dt` at zero, and the
     * smoother correctly returns its first pose forever. The scrubber advanced,
     * the counter counted, the captions changed, and the body sat still: a
     * replay that looked like it was working.
     *
     * `replay.samples[i].at` is the one clock that is always usable, because
     * `replayFrom` already had to solve this for playback — measured where the
     * timestamps were trustworthy and counted out at `REPLAY_ASSUMED_STEP`
     * where they were not. It differs from the stored time by a constant when
     * both exist, so every `dt` is identical and nothing changes on a healthy
     * track; where the stored time is unusable this is the only one left.
     */
    const shownAt = replay.samples[cursor]?.at ?? 0
    const renderFrame: Frame = { ...f, image: smootherRef.current!.frame(f.image, shownAt) }
    drawSkeleton(ctx, {
      frame: renderFrame,
      aspect: track.aspect,
      /*
       * `fitContain` against the track's own aspect, the same as the stills: the
       * body keeps the proportions it was filmed at, because every angle this
       * app measures would change if a portrait serve were stretched to fill a
       * landscape box.
       */
      rect: fitContain(canvas.width, canvas.height, track.aspect),
      racket,
      // From the first sample, which is the swing's start — the track spans
      // `ready` to `finish` and nothing before it exists to trail from.
      trail: { frames, from: 0, to: cursor },
      paired: pairedAt?.(shownAt),
    })
  }, [cursor, frames, racket, track.aspect, replay, pairedAt])

  const drawRef = useRef(draw)
  drawRef.current = draw

  /**
   * The scrubber, moved without a render — it steps once per stored sample.
   *
   * Through `--played` on the rail rather than a width on the fill, because the
   * fill is full-width and `scaleX`ed by that number: a length here would put a
   * layout on the same frames the body is being redrawn on, which is why the
   * live player writes the same property. Writing a width instead left the fill
   * scaled by an unset `--played` and so exactly zero wide — a scrubber that
   * never showed how far through the serve it was. See `--played` in
   * `player.css`.
   */
  const syncProgress = useCallback(() => {
    const el = progressRef.current
    if (!el) return
    const at = replay.samples[cursor]?.at ?? 0
    const ratio = at / Math.max(0.001, replay.duration)
    el.style.setProperty('--played', `${Math.max(0, Math.min(1, ratio))}`)
  }, [cursor, replay])

  /* ---------------------------------------------------------- rAF driver --- */

  /**
   * The clock, which runs only while the replay is moving.
   *
   * Wall time scaled by the speed, against the samples' own times — not one
   * sample per animation frame, which would play a 30 fps swing at double speed
   * on a 60 Hz screen and at four times on a 120 Hz one. The cursor is state so
   * the caption and pills follow it, and it changes at most once per stored
   * sample rather than once per repaint; `setCursor` bails out on an unchanged
   * value, so a screen refreshing four times per stored frame renders once.
   */
  const clockRef = useRef(0)
  const lastTickRef = useRef(0)

  useEffect(() => {
    if (!playing) return
    lastTickRef.current = 0
    const tick = (ts: number) => {
      const prev = lastTickRef.current || ts
      lastTickRef.current = ts
      // Clamped because a tab that was backgrounded mid-play returns with a
      // multi-second gap, and an unclamped one would jump the swing forward by
      // however long the player was looking at something else.
      const dt = Math.min(0.25, Math.max(0, (ts - prev) / 1000)) * speed
      clockRef.current += dt
      if (clockRef.current > replay.duration) clockRef.current = 0

      const i = sampleAt(clockRef.current)
      if (cursorRef.current !== i) moveTo(i)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, speed, replay, sampleAt, moveTo])

  /** One repaint whenever the picture should differ — playing or parked. */
  useEffect(() => {
    drawRef.current()
    syncProgress()
  }, [cursor, syncProgress])

  /**
   * Stop dead when the tab is hidden.
   *
   * Same rule the live player follows: a backgrounded replay should be doing
   * nothing at all, and pausing through state keeps the button, the loop and the
   * picture telling one story. Coming back needs a repaint because the canvas
   * may have been dropped away.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false)
      else drawRef.current()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /* ------------------------------------------------------------ controls --- */

  /**
   * Match the canvas bitmap to the stage box.
   *
   * Guarded because assigning `canvas.width` clears the bitmap whether or not
   * the value changed, and a phone fires a burst of resize events for the URL
   * bar alone. Reports whether the buffer was reallocated, and so whether what
   * was on it is gone.
   */
  const sizeCanvas = useCallback((): boolean => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return false
    const rect = stage.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (!w || !h) return false
    if (canvas.width === w && canvas.height === h) return false
    canvas.width = w
    canvas.height = h
    return true
  }, [])

  // Empty deps on purpose: this clears the canvas, so re-running it on a redraw
  // would wipe the frame that had just been painted. The listener reaches the
  // current `draw` through the ref instead.
  useEffect(() => {
    sizeCanvas()
    drawRef.current()
    const onResize = () => {
      if (sizeCanvas()) drawRef.current()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [sizeCanvas])

  /** Move the cursor and the clock together, and stop. */
  const parkAt = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(replay.samples.length - 1, i))
      setPlaying(false)
      clockRef.current = replay.samples[next].at
      moveTo(next)
    },
    [replay, moveTo],
  )

  const toggle = () => {
    setPlaying((p) => {
      if (p) return false
      // Restart from the top when parked at the end, so the button never looks
      // pressed with nothing moving.
      if (cursorRef.current >= replay.samples.length - 1) {
        clockRef.current = 0
        moveTo(0)
      }
      return true
    })
  }

  // From the ref, not from `cursor`: see `cursorRef`. A held arrow key that
  // repeats faster than this component renders must still step once per press.
  const step = (dir: -1 | 1) => parkAt(cursorRef.current + dir)

  const endScrubRef = useRef<() => void>()
  // A drag the component unmounted underneath — tapping back mid-scrub — is the
  // only thing that leaves these behind, and they close over every decoded frame
  // of the swing.
  useEffect(() => () => endScrubRef.current?.(), [])

  const scrub = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const el = progressRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()

      const seekAt = (clientX: number) => {
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        parkAt(sampleAt(ratio * replay.duration))
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
      endScrubRef.current?.()
      endScrubRef.current = onUp
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      window.addEventListener('touchmove', onMove)
      window.addEventListener('touchend', onUp)
      window.addEventListener('touchcancel', onUp)
    },
    [parkAt, replay, sampleAt],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Space belongs to whichever button has focus — see `PosePlayer`, where the
    // same guard stopped this handler eating the activation key off every
    // control inside it.
    if (e.key === ' ' && (e.target as HTMLElement).closest('button')) return

    const digit = Number(e.key)
    if (digit >= 1 && digit <= marked.length) {
      e.preventDefault()
      parkAt(marks.get(marked[digit - 1].id) as number)
      return
    }
    const keys: Record<string, () => void> = {
      ArrowRight: () => step(1),
      ArrowLeft: () => step(-1),
      ' ': toggle,
      Home: () => parkAt(0),
      End: () => parkAt(replay.samples.length - 1),
    }
    const action = keys[e.key]
    if (action) {
      e.preventDefault()
      action()
    }
  }

  const active = marked.find((p) => p.id === activePhase)

  return (
    <div
      className="player"
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="group"
      aria-label="Your serve as the tracked body. Left and right arrows step one frame, space plays, number keys jump to each key position."
    >
      {/* `--pose` rather than the video stage: this draws on the same surface
          the keyframe bodies use, so a drawn serve never sits in the black box
          that means a video. */}
      <div
        className="player-stage player-stage--pose"
        ref={stageRef}
        style={{ aspectRatio: `${track.aspect}` }}
      >
        <canvas ref={canvasRef} />
        <button
          className="player-scrim"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          tabIndex={-1}
        >
          {!playing && (
            <span className="player-play">
              <Icon name="play" size={20} />
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
        aria-valuemax={replay.samples.length - 1}
        aria-valuenow={cursor}
        aria-valuetext={`Frame ${cursor + 1} of ${replay.samples.length}${active ? `, ${active.label}` : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            e.stopPropagation()
            step(e.key === 'ArrowRight' ? 1 : -1)
          }
        }}
      >
        <div className="player-played" />
        {marked.map((p) => (
          <span
            key={p.id}
            className={`player-tick${activePhase === p.id ? ' is-active' : ''}`}
            // Placed by the sample's own time, so the ticks sit where the
            // keyframes actually fall in an unevenly sampled swing.
            style={{
              left: `${((replay.samples[marks.get(p.id) as number].at / Math.max(0.001, replay.duration)) * 100).toFixed(2)}%`,
            }}
          />
        ))}
      </div>

      <div className="player-controls">
        <button
          className="icon-btn icon-btn--solid"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
        >
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
            {cursor + 1}/{replay.samples.length}
          </span>
          <button
            className="icon-btn icon-btn--quiet"
            onClick={() => step(1)}
            disabled={cursor >= replay.samples.length - 1}
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
      </div>

      {marked.length > 0 && (
        <div className="phase-pills">
          {marked.map((p) => (
            <button
              key={p.id}
              className={`phase-pill${activePhase === p.id ? ' is-active' : ''}`}
              onClick={() => parkAt(marks.get(p.id) as number)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Silent while it runs, for the reason the live player's caption is:
          six captions crossed about once a second forever queue faster than a
          screen reader drains them. */}
      <p className="player-caption" aria-live={playing ? 'off' : 'polite'}>
        {active?.caption}
      </p>
    </div>
  )
}
