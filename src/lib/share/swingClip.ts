/**
 * A slow-motion clip of a serve, made on the device.
 *
 * It builds the poster (N5.6). The swing plays slowing into the ball, laying
 * down its traces and the racket's path as it goes, and stops at contact as the
 * same single exposure the poster is; then the number counts up and the words
 * land where the poster has them. Its last frame is the poster at two thirds,
 * drawn by the same functions, so the clip and the picture cannot drift apart.
 *
 * Two bodies side by side make a then-and-now, on one clock with nought at the
 * ball, so the eye compares one instant. Each is sized, racket and all, to stay
 * inside its own half and under the header.
 *
 * Drawn onto a canvas and recorded by the browser's own `MediaRecorder`, so it
 * uses no library and no network, and nothing leaves the device unless the
 * player sends the file from their own share sheet. It records in real time, so
 * it takes as long as it plays.
 *
 * Only the figure is in it: never the player's video. A browser without a recorder
 * is simply not offered this.
 */
import { PHASE_COPY } from '../analysis/phases'
import type { Analysis, PhaseId } from '../analysis/types'
import { paintExposure, placeSwing, racketPath, type Placement } from '../figure/stage'
import { swingOf, type Swing } from '../figure/swing'
import type { Session } from '../storage/db'
import { deviceNoun } from '../device'
import {
  POSTER_H,
  POSTER_W,
  cardFonts,
  figureType,
  headType,
  posterHeader,
  posterSwing,
  posterWords,
  longDate,
  stageBackground,
  stageVeil,
  textType,
} from './serveCard'

export interface ClipBody {
  swing: Swing
  /** Under the body at the end: a date. */
  caption: string
  score: number
  /** A rough read, said in the foot because the clip outlives the report. */
  soft?: boolean
}

/** The poster at two thirds: 4:5, what a feed shows without cropping. */
export const CLIP_W = 720
export const CLIP_H = 900
const K = CLIP_W / POSTER_W
const FPS = 30
const PAD = 72

/* The timeline, in seconds of clip. */
const LEAD_S = 0.5
/** Share of real speed at the start of the swing and at the ball: steady through
 *  the wind-up, slowing into contact, so the fast part is the slow part. */
const FAST = 0.42
const SLOWEST = 0.16
/** Held at the ball before the words come. */
const BEAT_S = 0.35
const LAND_S = 1.3
const HOLD_S = 2.2

const FG = '#eef2f6'
const MUTED = '#a7b1c2'
const FAINT = '#7b8799'
const LIME = '#cdf94a'
const AMBER = '#ffb648'

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

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

export interface Painter {
  draw: (s: number) => void
  total: number
}

/**
 * When things happen, from how long the longest swing takes to reach the ball.
 * `clock` is the swing's own time, nought at contact; `land` runs nought to one
 * as the words arrive.
 */
export function timeline(before: number) {
  const play = (2 * before) / (FAST + SLOWEST)
  const landAt = LEAD_S + play + BEAT_S
  return {
    play,
    total: landAt + LAND_S + HOLD_S,
    clock: (s: number) => {
      const t = Math.max(0, Math.min(play, s - LEAD_S))
      return play ? FAST * t + ((SLOWEST - FAST) * t * t) / (2 * play) - before : 0
    },
    land: (s: number) => clamp01((s - landAt) / LAND_S),
  }
}

const firstOf = (s: Swing) => s.moments.ready ?? s.moments.toss ?? 0
const contactOf = (s: Swing) => s.moments.contact ?? s.frames.length - 1

/**
 * Where a swing has got at `clock`, as a frame and a share of the way to the
 * next, so slow motion glides rather than steps. Never past the ball.
 */
export function frameAt(s: Swing, from: number, to: number, clock: number) {
  const t = s.frames[to].t + clock
  let i = from
  while (i < to && s.frames[i + 1].t <= t) i++
  if (i >= to) return to
  const span = s.frames[i + 1].t - s.frames[i].t
  return span > 0 ? i + Math.max(0, Math.min(1, (t - s.frames[i].t) / span)) : i
}

const ORDER: PhaseId[] = ['ready', 'toss', 'trophy', 'drop', 'contact']

/** The last moment this swing has passed, in the app's own words. */
function phaseAt(s: Swing, i: number): string | undefined {
  let id: PhaseId | undefined
  for (const p of ORDER) if (s.moments[p] !== undefined && s.moments[p]! <= i) id = p
  return id ? PHASE_COPY[id].label : undefined
}

/** The moment's name, where the words will land, until they do. */
function phaseLabel(ctx: CanvasRenderingContext2D, label: string | undefined, y: number, land: number) {
  const a = clamp01(1 - land * 4)
  if (!label || a <= 0) return
  ctx.globalAlpha = a
  ctx.textAlign = 'left'
  ctx.font = textType(38, 620)
  ctx.fillStyle = MUTED
  ctx.fillText(label, PAD, y)
  ctx.globalAlpha = 1
}

/**
 * One serve: the poster, built. Undefined when the report carries no swing to
 * draw, which is the one case the poster draws without a figure.
 */
export function serveClipPainter(
  ctx: CanvasRenderingContext2D,
  report: Analysis | Session,
  o: { streak?: string; bestScore?: string; device?: string } = {},
): Painter | undefined {
  const swing = swingOf(report)
  if (!swing) return undefined
  const { at, to } = posterSwing(swing)
  const from = 0
  const path = racketPath(swing.frames, at, { racket: swing.racket, bodyHeight: swing.bodyHeight, from, to })
  const time = timeline(swing.frames[to].t - swing.frames[from].t)
  const date = longDate(report.createdAt)
  const draw = (s: number) => {
    ctx.setTransform(K, 0, 0, K, 0, 0)
    stageBackground(ctx, POSTER_W, POSTER_H)
    const i = frameAt(swing, from, to, time.clock(s))
    paintExposure(ctx, swing.frames, at, { racket: swing.racket, bodyHeight: swing.bodyHeight, from, to, now: i, path })
    stageVeil(ctx)
    posterHeader(ctx, date)
    const land = time.land(s)
    phaseLabel(ctx, phaseAt(swing, i), POSTER_H - 404 + 56, land)
    if (land > 0) posterWords(ctx, report, { ...o, land })
  }
  return { draw, total: time.total }
}

/* ------------------------------------------------------------ then and now */

/** Where the two stand, as a poster's height: the words take the rest. */
const PAIR_FEET = POSTER_H * 0.62
const PAIR_TOP = PAD + 64 + 24
const CELL = POSTER_W / 2
const SIDE = 28

export interface PairPlacement {
  at: Placement
  from: number
  to: number
  path: ReturnType<typeof racketPath>
}

/**
 * Two swings at one size, each with all of its motion to the ball, racket
 * included, inside its own half and under the header. Each is centred on its
 * motion rather than its body, because the racket goes further to one side
 * than the other, and the pair share the smaller of the two sizes that fit, so
 * neither looks bigger for being taller in the picture.
 */
export function pairLayout(swings: readonly Swing[]): PairPlacement[] {
  const fit = (s: Swing, height: number, across: number) => {
    const from = firstOf(s)
    const to = contactOf(s)
    const at = placeSwing(s.frames, CELL, PAIR_FEET / 0.97, { height, feet: 0.97, across })
    const path = racketPath(s.frames, at, { racket: s.racket, bodyHeight: s.bodyHeight, from, to })
    const pad = at.stature * 0.1
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    for (let i = from; i <= to; i++) {
      for (const p of s.frames[i].image) {
        const q = at.place(p)
        x0 = Math.min(x0, q.x)
        x1 = Math.max(x1, q.x)
        y0 = Math.min(y0, q.y)
      }
    }
    for (const q of path) {
      if (!q) continue
      x0 = Math.min(x0, q.x - pad)
      x1 = Math.max(x1, q.x + pad)
      y0 = Math.min(y0, q.y - pad)
    }
    return { at, from, to, path, x0, x1, y0 }
  }
  const TRY = 0.6
  const shares = swings.map((s) => {
    const f = fit(s, TRY, 0.5)
    const floor = f.at.floor
    const across = Math.min(1, (CELL - 2 * SIDE) / Math.max(1, f.x1 - f.x0))
    const up = Math.min(1, (floor - PAIR_TOP) / Math.max(1, floor - f.y0))
    return { shrink: Math.min(across, up, 0.72 / TRY), centre: (f.x0 + f.x1) / 2 - CELL / 2 }
  })
  const height = TRY * Math.min(...shares.map((x) => x.shrink))
  return swings.map((s, n) => {
    // Shift so the motion, not the body, is centred in the half.
    const k = height / TRY
    const across = 0.5 - (shares[n].centre * k) / CELL
    const f = fit(s, height, across)
    return { at: f.at, from: f.from, to: f.to, path: f.path }
  })
}

export function thenNowPainter(
  ctx: CanvasRenderingContext2D,
  o: { then: ClipBody; now: ClipBody; headline: string; device?: string },
): Painter {
  const bodies = [o.then, o.now]
  const placed = pairLayout(bodies.map((b) => b.swing))
  const before = Math.max(...bodies.map((b, n) => b.swing.frames[placed[n].to].t - b.swing.frames[placed[n].from].t))
  const time = timeline(before)
  const soft = bodies.some((b) => b.soft)
  const foot = `Two serves, measured on a ${o.device ?? 'phone'}. The video never left it.${soft ? ' One is a rough read.' : ''}`
  const draw = (s: number) => {
    ctx.setTransform(K, 0, 0, K, 0, 0)
    stageBackground(ctx, POSTER_W, POSTER_H)
    const clock = time.clock(s)
    let label: string | undefined
    bodies.forEach((b, n) => {
      const p = placed[n]
      const i = frameAt(b.swing, p.from, p.to, clock)
      if (n === 1) label = phaseAt(b.swing, i)
      ctx.save()
      // A safety net under the fit: neither swing ever reaches the other's half.
      ctx.beginPath()
      ctx.rect(n * CELL, 0, CELL, POSTER_H)
      ctx.clip()
      ctx.translate(n * CELL, 0)
      paintExposure(ctx, b.swing.frames, p.at, {
        racket: b.swing.racket,
        bodyHeight: b.swing.bodyHeight,
        from: p.from,
        to: p.to,
        now: i,
        path: p.path,
      })
      ctx.restore()
    })
    stageVeil(ctx, POSTER_W, PAIR_FEET / 0.97)
    posterHeader(ctx, 'Then and now')

    const land = time.land(s)
    phaseLabel(ctx, label, POSTER_H - 150, land)
    if (land <= 0) return
    const beat = (k: number) => {
      const t = clamp01((land - k * 0.14) / 0.44)
      return t * t * (3 - 2 * t)
    }
    ctx.textAlign = 'left'
    ctx.globalAlpha = beat(0)
    bodies.forEach((b, n) => {
      const x = n * CELL + PAD
      ctx.font = figureType(200)
      ctx.fillStyle = n === 1 ? LIME : FG
      ctx.fillText(String(Math.round(b.score * clamp01(land / 0.7))), x - 4, POSTER_H - 290)
      ctx.font = textType(32, 600)
      ctx.fillStyle = MUTED
      ctx.fillText(b.caption, x, POSTER_H - 236)
    })
    ctx.globalAlpha = beat(1)
    ctx.font = headType(52)
    ctx.fillStyle = FG
    ctx.fillText(o.headline, PAD, POSTER_H - 132, POSTER_W - PAD * 2)
    ctx.globalAlpha = beat(2)
    ctx.font = textType(28)
    ctx.fillStyle = soft ? AMBER : FAINT
    ctx.fillText(foot, PAD, POSTER_H - 46, POSTER_W - PAD * 2)
    ctx.globalAlpha = 1
  }
  return { draw, total: time.total }
}

/* -------------------------------------------------------------- recording */

async function record(paint: (ctx: CanvasRenderingContext2D) => Painter | undefined): Promise<{ blob: Blob; extension: 'mp4' | 'webm' } | undefined> {
  const type = clipType()
  const canvas = document.createElement('canvas')
  canvas.width = CLIP_W
  canvas.height = CLIP_H
  const ctx = canvas.getContext('2d')
  if (!ctx || !type) return undefined
  await cardFonts()
  const painter = paint(ctx)
  if (!painter) return undefined
  const { draw, total } = painter

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

/** The serve's clip: the poster, built. */
export function recordServeClip(report: Analysis | Session, o: { streak?: string; bestScore?: string } = {}) {
  return record((ctx) => serveClipPainter(ctx, report, { ...o, device: deviceNoun() }))
}

/** Then and now, side by side, the two bodies aligned on the ball. */
export function recordThenNowClip(then: ClipBody, now: ClipBody, headline: string) {
  return record((ctx) => thenNowPainter(ctx, { then, now, headline, device: deviceNoun() }))
}
