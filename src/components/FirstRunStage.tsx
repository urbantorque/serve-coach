import { useEffect, useRef, useState } from 'react'
import { modelMotion } from '../lib/figure/modelMotion'
import { paintWorkOn } from '../lib/figure/athlete'
import { cropOn } from '../lib/figure/stage'
import { nearSide, statureOf } from '../lib/figure/shape'
import type { Swing } from '../lib/figure/swing'
import type { Frame } from '../lib/analysis/types'
import AthleteCanvas from './AthleteCanvas'

/**
 * The first thing a new player sees: a real serve, read by the app, played the
 * way the report plays the player's own (Apex F, "a landing that
 * demonstrates"). Full speed to the toss, slow into the moment the fix is
 * about, held there with that part of the body picked out, then on through the
 * swing and round again.
 *
 * The clip is openly licensed footage of someone else's serve, trimmed to the
 * serve; the read is the engine's own, saved beside it by
 * `scripts/landing-serve.mjs`, so the landing needs no engine and no download
 * past a small clip. `landingServe.test.ts` holds the words beside it to that
 * read.
 *
 * Where the clip cannot play (no decoder, data saver on, nothing after a short
 * wait) the drawn model serve stands in, as it did before. Its own chunk, so the
 * promise beside it draws at once and the serve arrives a moment later.
 */
export default function FirstRunStage({ racket = 'right', onDrawn }: { racket?: 'left' | 'right'; onDrawn?: () => void }) {
  const [replay, setReplay] = useState<LandingReplay | 'drawn'>()
  const drawn = replay === 'drawn'
  useEffect(() => {
    if (drawn) onDrawn?.()
  }, [drawn, onDrawn])
  useEffect(() => {
    const saver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    if (saver) return setReplay('drawn')
    let gone = false
    fetch(`${import.meta.env.BASE_URL}landing/serve.json`)
      .then((r) => (r.ok ? (r.json() as Promise<LandingReplay>) : Promise.reject(new Error(String(r.status)))))
      .then((j) => !gone && setReplay(j))
      .catch(() => !gone && setReplay('drawn'))
    return () => {
      gone = true
    }
  }, [])
  if (!replay) return null
  if (replay === 'drawn') return <DrawnServe racket={racket} />
  return <RealServe replay={replay} onFailed={() => setReplay('drawn')} />
}

/** What `scripts/landing-serve.mjs` writes: the replay's picture points, times from the trimmed clip's start. */
export interface LandingReplay {
  source: { title: string; author: string; licence: string; url: string }
  video: { width: number; height: number }
  handedness: 'left' | 'right'
  tilt: number
  moment: string
  work: string[]
  phases: { id: string; t: number; frame: number }[]
  end: number
  /** Picture points, x and y in turn for each of the 33 landmarks. */
  frames: { t: number; image: number[] }[]
  /** The 3D points at the held moment, for which side faces the camera. */
  world: [number, number, number][]
}

/** Slow into the moment, as the report's replay is. */
const SLOW = 0.4
/** How long the moment is held, with its part picked out, before the swing goes on. */
const HOLD_MS = 2600
/** A breath at the end before it plays again. */
const REST_MS = 700
/** How long the clip may take to give a first frame before the drawn serve stands in. */
const PATIENCE_MS = 2500

function RealServe({ replay, onFailed }: { replay: LandingReplay; onFailed: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const failed = useRef(onFailed)
  failed.current = onFailed

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !video || !ctx) return
    const box = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = Math.round((box.width || 390) * dpr)
    const H = Math.round((box.height || 560) * dpr)
    canvas.width = W
    canvas.height = H

    const aspect = replay.video.width / Math.max(1, replay.video.height)
    const frames = replay.frames.map((f) => ({
      image: Array.from({ length: f.image.length / 2 }, (_, i) => ({ x: f.image[2 * i], y: f.image[2 * i + 1] })),
    }))
    // The body framed in the top of the stage: the peek and the headline sit
    // over its foot, so the crop is fitted above them and the picture runs on
    // under them.
    const under = Math.min(H * 0.32, 190 * dpr)
    const fit = cropOn(frames as unknown as Frame[], W / (H - under), aspect)
    const crop = { ...fit, h: (fit.h * H) / (H - under) }
    const place = (p: { x: number; y: number }) => ({ x: ((p.x - crop.x) / crop.w) * W, y: ((p.y - crop.y) / crop.h) * H })
    const at = replay.phases.find((p) => p.id === replay.moment) ?? replay.phases[replay.phases.length - 1]
    const toss = replay.phases.find((p) => p.id === 'toss') ?? replay.phases[0]
    const placed = frames[at.frame]?.image.map(place)
    const world = replay.world.map(([x, y, z]) => ({ x, y, z }))
    const stature = placed ? statureOf(placed) : 0
    const near = placed ? nearSide(placed, world) : undefined

    const picture = () => {
      const vh = video.videoHeight
      if (!vh) return false
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(video, crop.x * vh, crop.y * vh, crop.w * vh, crop.h * vh, 0, 0, W, H)
      // Graded down, as the report's is, so the player stands out and the type over it reads.
      const v = ctx.createRadialGradient(W * 0.5, H * 0.36, H * 0.18, W * 0.5, H * 0.45, H * 0.8)
      v.addColorStop(0, 'rgba(9, 11, 16, 0.06)')
      v.addColorStop(1, 'rgba(9, 11, 16, 0.74)')
      ctx.fillStyle = v
      ctx.fillRect(0, 0, W, H)
      // Where the clip runs out above the stage's foot, its edge fades into the
      // stage rather than stopping on a line.
      const foot = ((1 - crop.y) / crop.h) * H
      if (foot < H) {
        const fade = ctx.createLinearGradient(0, foot - H * 0.22, 0, foot)
        fade.addColorStop(0, 'rgba(0, 0, 0, 0)')
        fade.addColorStop(1, 'rgba(0, 0, 0, 1)')
        ctx.save()
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = fade
        ctx.fillRect(0, foot - H * 0.22, W, H)
        ctx.restore()
      }
      return true
    }
    const paint = (alpha: number) => {
      if (placed && replay.work.length) paintWorkOn(ctx, placed, { racket: replay.handedness, work: replay.work, stature, near, alpha })
    }

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let timer = 0
    let gone = false
    let shown = true
    let stage: 'lead' | 'slow' | 'held' | 'on' | 'rest' = 'lead'

    const hold = () => {
      stage = 'held'
      video.pause()
      const t0 = performance.now()
      const fade = (now: number) => {
        if (gone) return
        const k = Math.min(1, (now - t0) / 420)
        picture()
        paint(k)
        if (k < 1) raf = requestAnimationFrame(fade)
        else if (!still) timer = window.setTimeout(goOn, HOLD_MS)
      }
      raf = requestAnimationFrame(fade)
    }
    const goOn = () => {
      if (gone) return
      stage = 'on'
      video.playbackRate = 1
      if (shown) void video.play().catch(() => {})
      raf = requestAnimationFrame(tick)
    }
    const again = () => {
      if (gone) return
      stage = 'lead'
      video.playbackRate = 1
      video.currentTime = 0
      if (shown) void video.play().catch(() => {})
      raf = requestAnimationFrame(tick)
    }
    const tick = () => {
      if (gone) return
      picture()
      const t = video.currentTime
      if (stage === 'lead' && t >= toss.t) {
        stage = 'slow'
        video.playbackRate = SLOW
      }
      if (stage === 'slow' && t >= at.t - 0.01) {
        video.currentTime = at.t
        video.addEventListener('seeked', hold, { once: true })
        return
      }
      if (stage === 'on' && (t >= replay.end - 0.02 || video.ended)) {
        stage = 'rest'
        video.pause()
        timer = window.setTimeout(again, REST_MS)
        return
      }
      raf = requestAnimationFrame(tick)
    }

    const patience = window.setTimeout(() => {
      if (!video.videoHeight) failed.current()
    }, PATIENCE_MS)
    const ready = () => {
      if (still) {
        video.currentTime = at.t
        video.addEventListener('seeked', hold, { once: true })
        return
      }
      void video.play().then(
        () => (raf = requestAnimationFrame(tick)),
        () => {
          // No autoplay here: the held moment, still, is the demonstration.
          video.currentTime = at.t
          video.addEventListener('seeked', hold, { once: true })
        },
      )
    }
    if (video.readyState >= 2) ready()
    else video.addEventListener('loadeddata', ready, { once: true })

    // Out of sight, it stops: no decoding a clip nobody is watching.
    const seen = new IntersectionObserver(([e]) => {
      shown = e.isIntersecting && !document.hidden
      if (!shown) video.pause()
      else if (stage === 'lead' || stage === 'slow' || stage === 'on') void video.play().catch(() => {})
    })
    seen.observe(canvas)
    const away = () => {
      shown = !document.hidden
      if (!shown) video.pause()
      else if (stage === 'lead' || stage === 'slow' || stage === 'on') void video.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', away)

    return () => {
      gone = true
      clearTimeout(patience)
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      seen.disconnect()
      document.removeEventListener('visibilitychange', away)
      video.removeEventListener('loadeddata', ready)
      video.removeEventListener('seeked', hold)
      video.pause()
    }
  }, [replay])

  return (
    <>
      <video
        ref={videoRef}
        src={`${import.meta.env.BASE_URL}landing/serve.mp4`}
        muted
        playsInline
        preload="auto"
        onError={() => failed.current()}
        aria-hidden="true"
        style={{ position: 'absolute', width: 2, height: 2, opacity: 0, pointerEvents: 'none' }}
      />
      <canvas
        ref={canvasRef}
        className="stage-canvas"
        role="img"
        aria-label="A real serve, slowed into the racket drop and held there with the hitting arm picked out."
      />
      <p className="first-credit">
        A real serve, filmed by {replay.source.author},{' '}
        <a href={replay.source.url} target="_blank" rel="noopener noreferrer">
          {replay.source.licence}
        </a>
      </p>
    </>
  )
}

function DrawnServe({ racket }: { racket: 'left' | 'right' }) {
  const [swing, setSwing] = useState<Swing>()
  useEffect(() => {
    const m = modelMotion(racket)
    if (m) setSwing({ frames: m.frames, moments: Object.fromEntries(m.phases.map((p) => [p.id, p.frame])), racket })
  }, [racket])
  if (!swing) return null
  return (
    <AthleteCanvas
      swing={swing}
      mode="loop"
      at={swing.moments.contact ?? 0}
      rate={0.4}
      // Feet at 70%, not 84% (N7.6): the peek sits under the serve.
      fit={{ height: 0.48, feet: 0.7, across: 0.44 }}
      label="A real serve from a motion capture lab, playing slowly."
      className="stage-canvas"
    />
  )
}
