/**
 * A slow-motion clip of a serve, made on the phone.
 *
 * The figure plays through the swing, leaves its racket's path behind it, and
 * lands on the number. Two bodies side by side make a then-and-now, aligned on
 * the moment each met the ball, so the eye can compare one instant.
 *
 * Drawn onto a canvas and recorded by the browser's own `MediaRecorder`, so it
 * uses no library and no network, and nothing leaves the phone unless the player
 * sends the file from their own share sheet. It records in real time, so it takes
 * as long as it plays.
 *
 * Only the figure is in it: never the player's video. A browser without a recorder
 * is simply not offered this.
 */
import { smoothedRacket } from '../analysis/racket'
import { paintRibbon } from '../figure/athlete'
import { paintPose, placeSwing, type Placement } from '../figure/stage'
import type { Swing } from '../figure/swing'
import { brandMark, cardFonts, figureType, headType, stageBackground, textType } from './serveCard'

export interface ClipBody {
  swing: Swing
  /** Under the body at the end: a date, or "Then". */
  caption: string
  score: number
}

export interface ClipOptions {
  bodies: ClipBody[]
  headline: string
  foot: string
}

const W = 720
const H = 900
const FPS = 30
/** Share of real speed. A second and a half of swing becomes about five. */
const SLOW = 0.3
const LAND_S = 2.4
const LEAD_IN_S = 0.4
const LIME = '#cdf94a'
const FG = '#eef2f6'
const MUTED = '#a7b1c2'

/** MP4 first: it is what every phone's share sheet opens without asking. */
const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

const clipType = () => TYPES.find((t) => MediaRecorder.isTypeSupported?.(t))

/** Whether this browser can make a clip at all. */
export function clipsWork(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    clipType() !== undefined
  )
}

interface Player {
  body: ClipBody
  at: Placement
  /** The frames to play, and where the ball was met among them. */
  from: number
  to: number
  contact: number
  x: number
  path: { x: number; y: number }[]
}

const firstOf = (s: Swing) => s.moments.ready ?? s.moments.toss ?? 0

function indexAt(p: Player, clock: number) {
  const { frames } = p.body.swing
  const t = frames[p.contact].t + clock
  let i = p.from
  while (i < p.to && frames[i + 1].t <= t) i++
  return i
}

export async function recordSwingClip(o: ClipOptions): Promise<{ blob: Blob; extension: 'mp4' | 'webm' } | undefined> {
  const type = clipType()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx || !type || !o.bodies.length) return undefined
  await cardFonts()

  const cell = W / o.bodies.length
  const stageH = H * 0.8
  const players: Player[] = o.bodies.map((body, n) => {
    const s = body.swing
    const from = firstOf(s)
    const to = s.moments.finish ?? s.frames.length - 1
    const contact = s.moments.contact ?? to
    const at = placeSwing(s.frames, cell, stageH, { height: o.bodies.length > 1 ? 0.56 : 0.66, feet: 0.95 })
    const path: { x: number; y: number }[] = []
    for (let i = from; i <= to; i++) {
      const head = s.frames[i].racket?.head ?? (s.bodyHeight ? smoothedRacket(s.frames, i, s.racket, s.bodyHeight)?.head : undefined)
      if (head) path.push(at.place(head))
    }
    return { body, at, from, to, contact, x: n * cell, path }
  })

  // Every swing runs on one clock, nought at the ball.
  const before = Math.max(...players.map((p) => p.body.swing.frames[p.contact].t - p.body.swing.frames[p.from].t))
  const after = Math.max(...players.map((p) => p.body.swing.frames[p.to].t - p.body.swing.frames[p.contact].t))
  const play = LEAD_IN_S + (before + after) / SLOW
  const total = play + LAND_S

  const draw = (s: number) => {
    stageBackground(ctx, W, H)
    const clock = Math.min(s - LEAD_IN_S, play - LEAD_IN_S) * SLOW - before
    for (const p of players) {
      const { frames, racket, bodyHeight } = p.body.swing
      const i = indexAt(p, clock)
      const trail = p.path.slice(0, i - p.from + 1)
      ctx.save()
      ctx.translate(p.x, 0)
      if (trail.length > 1) paintRibbon(ctx, trail, p.at.stature * 0.022)
      paintPose(ctx, frames[i], p.at, { racket, swing: frames, index: i, bodyHeight, ground: 1, still: false })
      ctx.restore()
    }

    // Faint until the swing lands, so the body stays the subject.
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    brandMark(ctx, 40, 66, 26)

    const land = Math.max(0, Math.min(1, (s - play) / 0.5))
    if (land > 0) {
      ctx.globalAlpha = land * land * (3 - 2 * land)
      const veil = ctx.createLinearGradient(0, H * 0.46, 0, H * 0.84)
      veil.addColorStop(0, 'rgba(10,12,16,0)')
      veil.addColorStop(1, 'rgba(10,12,16,0.96)')
      ctx.fillStyle = veil
      ctx.fillRect(0, H * 0.46, W, H * 0.54)
      if (o.bodies.length === 1) {
        ctx.font = figureType(200)
        ctx.fillStyle = FG
        ctx.fillText(String(o.bodies[0].score), 40, H - 170)
      } else {
        o.bodies.forEach((b, n) => {
          const x = n * cell + 40
          ctx.font = figureType(150)
          ctx.fillStyle = n === o.bodies.length - 1 ? LIME : FG
          ctx.fillText(String(b.score), x, H - 190)
          ctx.font = textType(26, 600)
          ctx.fillStyle = MUTED
          ctx.fillText(b.caption, x, H - 150)
        })
      }
      ctx.font = headType(36)
      ctx.fillStyle = FG
      ctx.fillText(o.headline, 40, H - 96, W - 80)
      ctx.font = textType(23)
      ctx.fillStyle = MUTED
      ctx.fillText(o.foot, 40, H - 52, W - 80)
      ctx.globalAlpha = 1
    }
  }

  draw(0)
  const stream = canvas.captureStream(FPS)
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  recorder.start()

  await new Promise<void>((done) => {
    const begin = performance.now()
    let last = 0
    const tick = (now: number) => {
      const s = (now - begin) / 1000
      if (now - last >= 1000 / FPS - 2) {
        last = now
        draw(Math.min(s, total))
      }
      if (s < total) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  })

  recorder.stop()
  await stopped
  stream.getTracks().forEach((t) => t.stop())
  const blob = new Blob(chunks, { type: type.split(';')[0] })
  return blob.size ? { blob, extension: type.includes('mp4') ? 'mp4' : 'webm' } : undefined
}
