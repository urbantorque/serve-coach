/**
 * The picture a player sends a friend: their whole swing laid down as one
 * exposure, the number, and the one thing they are working on.
 *
 * It used to be a printed report: rings, five bars, six stills of the player and
 * a drill box, in a system font. Nobody forwards a form. The detail still travels,
 * in the coach's page, which is where someone reading it wants it. This also means
 * no photograph of anybody leaves on a card: the body drawn here is the figure.
 *
 * Honest on its own, because the image outlives the report: speed says "about"
 * and that no radar checked it, and a soft read says so in the foot.
 */
import { SERVE_TYPES } from '../analysis/coaching'
import { plain } from '../analysis/voice'
import { SOFT_READ, VERDICT, readQuality } from '../../components/statusLabels'
import { paintExposure, placeSwing, type Placement } from '../figure/stage'
import { swingOf, type Swing } from '../figure/swing'
import { deviceNoun } from '../device'
import { defaultSpeedUnit, speedFigures } from '../speedCopy'
import type { Analysis } from '../analysis/types'
import type { Session } from '../storage/db'
import { readPrefs } from '../storage/prefs'

type Report = Analysis | Session

const INK = '#0a0c10'
const FG = '#eef2f6'
const MUTED = '#a7b1c2'
const FAINT = '#7b8799'
const LIME = '#cdf94a'
const AMBER = '#ffb648'

const FAMILY = 'Archivo, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

/** Numerals, narrow and tall. A keyword, because a canvas takes no `wdth` axis directly. */
export const figureType = (size: number, weight = 800) => `extra-condensed ${weight} ${size}px ${FAMILY}`
/** Headlines, a little wide. */
export const headType = (size: number, weight = 720) => `expanded ${weight} ${size}px ${FAMILY}`
export const textType = (size: number, weight = 500) => `${weight} ${size}px ${FAMILY}`

/** The app's own face, ready for a canvas. A card drawn before it lands falls back cleanly. */
export async function cardFonts(): Promise<void> {
  const fonts = (globalThis as { document?: { fonts?: { load?: (f: string) => Promise<unknown> } } }).document?.fonts
  if (!fonts?.load) return
  await Promise.all([fonts.load(figureType(100)), fonts.load(headType(40)), fonts.load(textType(30))]).catch(() => undefined)
}

export function stageBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, w, h)
  const glow = ctx.createRadialGradient(w * 0.42, h * 0.3, 40, w * 0.42, h * 0.3, Math.max(w, h) * 0.62)
  glow.addColorStop(0, 'rgba(70,84,108,0.62)')
  glow.addColorStop(0.55, 'rgba(32,40,54,0.3)')
  glow.addColorStop(1, 'rgba(10,12,16,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
}

export function brandMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(x + size * 0.36, y - size * 0.34, size * 0.34, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = textType(size, 680)
  ctx.fillStyle = FG
  ctx.fillText('Serve Coach', x + size * 1.04, y)
}

/** Greedy lines, for the fix. Two at most: a card is not a paragraph. */
function linesOf(ctx: CanvasRenderingContext2D, text: string, width: number, most: number): string[] {
  const out: string[] = []
  let line = ''
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(next).width <= width || !line) {
      line = next
      continue
    }
    out.push(line)
    line = words[i]
    if (out.length === most - 1) {
      line = words.slice(i).join(' ')
      break
    }
  }
  out.push(line)
  return out
}

const speedOf = (r: Report) => (r.speed && 'speed' in r.speed ? r.speed.speed : undefined)

/** The poster's own size. The clip is the same picture at two thirds. */
export const POSTER_W = 1080
export const POSTER_H = 1350
const PAD = 72
/** Where the brand mark and the date end; nothing of the swing comes above it. */
const HEADER = PAD + 64
const STAGE_H = POSTER_H * 0.66

/**
 * Where the swing sits on the poster, laid down to the ball. Sized to the body,
 * then shrunk until the racket clears the header (N5.3): at contact the racket
 * head sits about 0.42 of a body above the hand, and a tall reach used to swing
 * it through the brand mark. Shared with the clip, which builds this picture.
 */
export function posterSwing(swing: Swing): { at: Placement; to: number } {
  const to = swing.moments.contact ?? swing.frames.length - 1
  const sized = (height: number) => placeSwing(swing.frames, POSTER_W, STAGE_H, { height, feet: 0.97, across: 0.52 })
  let at = sized(0.72)
  const top = Math.min(...swing.frames.slice(0, to + 1).flatMap((f) => f.image.map((p) => at.place(p).y))) - 0.42 * at.stature
  const feetY = STAGE_H * 0.97
  if (top < HEADER) at = sized((0.72 * (feetY - HEADER)) / (feetY - top))
  return { at, to }
}

/** The floor of the stage falling into the page, under the feet. */
export function stageVeil(ctx: CanvasRenderingContext2D, w = POSTER_W, stageH = STAGE_H) {
  const veil = ctx.createLinearGradient(0, stageH * 0.72, 0, stageH * 1.04)
  veil.addColorStop(0, 'rgba(10,12,16,0)')
  veil.addColorStop(1, INK)
  ctx.fillStyle = veil
  ctx.fillRect(0, stageH * 0.72, w, stageH * 0.4)
}

/** The brand on the left, and on the right whatever dates the picture. */
export function posterHeader(ctx: CanvasRenderingContext2D, right: string) {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  brandMark(ctx, PAD, PAD + 28, 34)
  ctx.font = textType(30)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'right'
  ctx.fillText(right, POSTER_W - PAD, PAD + 26)
  ctx.textAlign = 'left'
}

export const longDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * The line every shared picture ends on: what was read, how well, and where.
 * A soft read says so in amber, because the picture outlives the report.
 */
export function honestFoot(report: Report, device: string): { text: string; soft: boolean } {
  const soft = report.quality.confidence < SOFT_READ
  const kind = SERVE_TYPES[report.serveType ?? 'flat']?.word ?? 'flat'
  const read = soft ? 'a rough read' : readQuality(report.quality.confidence).toLowerCase()
  return { text: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} serve, ${read}. Measured on a ${device}. The video never left it.`, soft }
}

const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

/**
 * The poster's words: the number and the words for it, the speed with its
 * honesty, the one thing being worked on, and the foot. `land` runs nought to
 * one as they arrive in the clip, the number counting up and each group a beat
 * after the last; the poster is drawn landed.
 */
export function posterWords(
  ctx: CanvasRenderingContext2D,
  report: Report,
  o: { streak?: string; bestScore?: string; device?: string; land?: number } = {},
) {
  const W = POSTER_W
  const H = POSTER_H
  const land = o.land ?? 1
  const beat = (k: number) => ease((land - k * 0.14) / 0.44)

  /* --- the number -------------------------------------------------------- */
  const base = H - 404
  ctx.globalAlpha = beat(0)
  ctx.font = figureType(286)
  ctx.fillStyle = FG
  ctx.fillText(String(Math.round(report.overall * ease(land / 0.7))), PAD - 6, base)
  ctx.font = textType(38, 620)
  ctx.fillText(VERDICT[report.overallStatus], PAD, base + 56)

  const speed = speedOf(report)
  if (speed) {
    ctx.globalAlpha = beat(1)
    const unit = readPrefs().speedUnit ?? defaultSpeedUnit()
    const fig = speedFigures(speed, unit)
    ctx.textAlign = 'right'
    ctx.font = textType(32)
    ctx.fillStyle = MUTED
    ctx.fillText('about', W - PAD, base - 146)
    const label = ` ${fig.unit}`
    ctx.font = textType(40, 680)
    const unitW = ctx.measureText(label).width
    ctx.fillStyle = LIME
    ctx.fillText(label, W - PAD, base - 12)
    ctx.font = figureType(150)
    ctx.fillText(String(fig.best), W - PAD - unitW, base - 12)
    ctx.font = textType(30)
    ctx.fillStyle = MUTED
    ctx.fillText(`likely ${fig.low}–${fig.high}, no radar`, W - PAD, base + 56)
    ctx.textAlign = 'left'
  }

  /* --- the one thing ----------------------------------------------------- */
  ctx.globalAlpha = beat(2)
  const fixY = base + 136
  ctx.font = textType(32, 660)
  ctx.fillStyle = LIME
  ctx.fillText('Working on', PAD, fixY)
  ctx.font = headType(46)
  ctx.fillStyle = FG
  const lines = linesOf(ctx, plain(report.focus.title), W - PAD * 2, 2)
  lines.forEach((l, i) => ctx.fillText(l, PAD, fixY + 58 + i * 56))

  /* --- the foot ---------------------------------------------------------- */
  ctx.globalAlpha = beat(3)
  const record = o.bestScore ?? o.streak
  ctx.font = textType(28)
  if (record) {
    ctx.fillStyle = LIME
    ctx.fillText(record, PAD, H - 84, W - PAD * 2)
  }
  const foot = honestFoot(report, o.device ?? 'phone')
  ctx.fillStyle = foot.soft ? AMBER : FAINT
  ctx.fillText(foot.text, PAD, H - 46, W - PAD * 2)
  ctx.globalAlpha = 1
}

export async function renderReportCard(report: Report, streak?: string, bestScore?: string): Promise<Blob | undefined> {
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  await cardFonts()

  stageBackground(ctx, POSTER_W, POSTER_H)
  const swing = swingOf(report)
  if (swing) {
    const { at, to } = posterSwing(swing)
    paintExposure(ctx, swing.frames, at, { racket: swing.racket, bodyHeight: swing.bodyHeight, from: 0, to })
    stageVeil(ctx)
  }
  posterHeader(ctx, longDate(report.createdAt))
  posterWords(ctx, report, { streak, bestScore, device: deviceNoun() })

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}
