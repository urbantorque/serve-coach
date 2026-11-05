import { useEffect, useRef, useState } from 'react'
import AthleteCanvas from '../../components/AthleteCanvas'
import { unlevelFrames } from '../../lib/analysis/spatial'
import type { Analysis, PhaseId } from '../../lib/analysis/types'
import { paintWorkOn } from '../../lib/figure/athlete'
import { cropOn } from '../../lib/figure/stage'
import { nearSide, statureOf } from '../../lib/figure/shape'
import type { Swing } from '../../lib/figure/swing'
import type { Session } from '../../lib/storage/db'

interface Props {
  analysis: Analysis | Session
  swing?: Swing
  /** The clip, live or kept. Without one the stage draws the tracked body. */
  videoUrl?: string
  /** The moment to arrive at and hold. */
  moment: PhaseId
  /** The part of the body the fix is about: see `workParts`. */
  work: string[]
  /** Play the swing up to the moment, once. Off for a report opened again. */
  reveal: boolean
  /** The picture has arrived; the numbers can come in. */
  onSettled: () => void
  label: string
}

const REVEAL_RATE = 0.55

/** How long the picture may take to give a first frame before the body is drawn instead. */
const VIDEO_PATIENCE_MS = 2500

/**
 * The top of the report: the player's own serve, arriving at the moment the fix
 * is about, with the part of the body it is about drawn on it.
 *
 * With a clip, the real footage: cropped to the player and graded down so the
 * words on it stay readable. Without one, the tracked body. Either way it plays
 * through once for a report just made, then holds. A tap settles it at once, and
 * a player who asked for less motion arrives there directly.
 */
export default function RevealStage({ analysis, swing, videoUrl, moment, work, reveal, onSettled, label }: Props) {
  const [videoFailed, setVideoFailed] = useState(false)
  const useVideo = Boolean(videoUrl) && !videoFailed && Array.isArray((analysis as Analysis).frames)
  const settled = useRef(false)
  const settle = useRef(onSettled)
  settle.current = onSettled
  const done = () => {
    if (settled.current) return
    settled.current = true
    settle.current()
  }

  const still =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const moves = reveal && !still

  useEffect(() => {
    // Nothing to wait for: a report with no body at all still has to open.
    if (!useVideo && !swing) done()
  })

  const momentIndex = swing?.moments[moment] ?? (swing ? swing.frames.length - 1 : 0)

  if (useVideo) {
    return (
      <VideoStage
        analysis={analysis as Analysis}
        url={videoUrl!}
        moment={moment}
        work={work}
        reveal={moves}
        onSettled={done}
        onFailed={() => setVideoFailed(true)}
        label={label}
      />
    )
  }
  if (!swing) return <div className="stage-empty" aria-hidden="true" />
  return (
    <AthleteCanvas
      swing={swing}
      mode={moves ? 'reveal' : 'pose'}
      at={momentIndex}
      work={work}
      rate={REVEAL_RATE}
      fit={{ height: 0.6, feet: 0.8, across: 0.52 }}
      onSettled={done}
      label={label}
      className="stage-canvas"
    />
  )
}

function VideoStage({
  analysis,
  url,
  moment,
  work,
  reveal,
  onSettled,
  onFailed,
  label,
}: {
  analysis: Analysis
  url: string
  moment: PhaseId
  work: string[]
  reveal: boolean
  onSettled: () => void
  onFailed: () => void
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !video || !ctx) return
    const box = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = Math.round((box.width || 390) * dpr)
    const H = Math.round((box.height || 440) * dpr)
    canvas.width = W
    canvas.height = H

    const aspect = analysis.video.width / Math.max(1, analysis.video.height)
    // The picture is the raw recording, so the body goes back to its raw place.
    const raw = analysis.tilt ? unlevelFrames(analysis.frames, analysis.tilt) : analysis.frames
    const first = analysis.phases[0]?.frame ?? 0
    const last = analysis.phases[analysis.phases.length - 1]?.frame ?? raw.length - 1
    const crop = cropOn(raw.slice(first, last + 1), W / H, aspect)
    const place = (p: { x: number; y: number }) => ({ x: ((p.x - crop.x) / crop.w) * W, y: ((p.y - crop.y) / crop.h) * H })
    const at = analysis.phases.find((p) => p.id === moment) ?? analysis.phases[analysis.phases.length - 1]
    const start = analysis.phases.find((p) => p.id === 'toss') ?? analysis.phases[0]
    const held = raw[at.frame]
    const placed = held?.image.map(place)
    const stature = placed ? statureOf(placed) : 0

    const picture = () => {
      const vh = video.videoHeight
      if (!vh) return false
      ctx.drawImage(video, crop.x * vh, crop.y * vh, crop.w * vh, crop.h * vh, 0, 0, W, H)
      // Graded down, so the player stands out and the type on top can be read.
      const v = ctx.createRadialGradient(W * 0.5, H * 0.42, H * 0.2, W * 0.5, H * 0.5, H * 0.8)
      v.addColorStop(0, 'rgba(9, 11, 16, 0.06)')
      v.addColorStop(1, 'rgba(9, 11, 16, 0.74)')
      ctx.fillStyle = v
      ctx.fillRect(0, 0, W, H)
      return true
    }

    let raf = 0
    let gone = false
    let arrived = false
    const arrive = () => {
      if (arrived || gone) return
      arrived = true
      video.pause()
      picture()
      if (placed && work.length) {
        const t0 = performance.now()
        const fade = (now: number) => {
          if (gone) return
          const k = Math.min(1, (now - t0) / 420)
          picture()
          paintWorkOn(ctx, placed, {
            racket: analysis.handedness,
            work,
            stature,
            near: nearSide(placed, held.world),
            alpha: k,
          })
          if (k < 1) raf = requestAnimationFrame(fade)
          else onSettled()
        }
        if (reveal) raf = requestAnimationFrame(fade)
        else {
          paintWorkOn(ctx, placed, { racket: analysis.handedness, work, stature, near: nearSide(placed, held.world), alpha: 1 })
          onSettled()
        }
      } else onSettled()
    }

    const patience = setTimeout(() => {
      if (!video.videoHeight) onFailed()
    }, VIDEO_PATIENCE_MS)

    const play = () => {
      video.playbackRate = REVEAL_RATE
      video.currentTime = start.t
      const tick = () => {
        if (gone) return
        picture()
        if (video.currentTime >= at.t - 0.01 || video.ended) {
          video.currentTime = at.t
          video.addEventListener('seeked', arrive, { once: true })
          setTimeout(arrive, 400)
          return
        }
        raf = requestAnimationFrame(tick)
      }
      void video.play().then(
        () => {
          raf = requestAnimationFrame(tick)
        },
        () => {
          video.currentTime = at.t
          video.addEventListener('seeked', arrive, { once: true })
        },
      )
    }

    const ready = () => {
      if (reveal) play()
      else {
        video.currentTime = at.t
        video.addEventListener('seeked', arrive, { once: true })
        setTimeout(arrive, 1200)
      }
    }
    if (video.readyState >= 1) ready()
    else video.addEventListener('loadedmetadata', ready, { once: true })

    return () => {
      gone = true
      clearTimeout(patience)
      cancelAnimationFrame(raf)
      video.removeEventListener('loadedmetadata', ready)
      video.removeEventListener('seeked', arrive)
      video.pause()
    }
    // One reveal per report. The report is keyed, so a new serve is a new stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return (
    <>
      <video ref={videoRef} src={url} muted playsInline preload="auto" className="stage-video" onError={onFailed} aria-hidden="true" />
      <canvas ref={canvasRef} className="stage-canvas" role="img" aria-label={label} />
    </>
  )
}
