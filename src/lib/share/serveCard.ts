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
import { paintExposure, placeSwing } from '../figure/stage'
import { swingOf } from '../figure/swing'
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

export async function renderReportCard(report: Report, streak?: string, bestScore?: string): Promise<Blob | undefined> {
  const W = 1080
  const H = 1350
  const PAD = 72
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  await cardFonts()

  stageBackground(ctx, W, H)

  /* --- the swing --------------------------------------------------------- */
  const swing = swingOf(report)
  const stageH = H * 0.66
  if (swing) {
    const at = placeSwing(swing.frames, W, stageH, { height: 0.72, feet: 0.97, across: 0.52 })
    const to = swing.moments.contact ?? swing.frames.length - 1
    paintExposure(ctx, swing.frames, at, { racket: swing.racket, bodyHeight: swing.bodyHeight, from: 0, to })
    const veil = ctx.createLinearGradient(0, stageH * 0.72, 0, stageH * 1.04)
    veil.addColorStop(0, 'rgba(10,12,16,0)')
    veil.addColorStop(1, INK)
    ctx.fillStyle = veil
    ctx.fillRect(0, stageH * 0.72, W, stageH * 0.4)
  }

  /* --- header ------------------------------------------------------------ */
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  brandMark(ctx, PAD, PAD + 28, 34)
  ctx.font = textType(30)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'right'
  ctx.fillText(new Date(report.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), W - PAD, PAD + 26)
  ctx.textAlign = 'left'

  /* --- the number -------------------------------------------------------- */
  const base = H - 404
  ctx.font = figureType(286)
  ctx.fillStyle = FG
  ctx.fillText(String(report.overall), PAD - 6, base)
  ctx.font = textType(38, 620)
  ctx.fillText(VERDICT[report.overallStatus], PAD, base + 56)

  const speed = speedOf(report)
  if (speed) {
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
  const fixY = base + 136
  ctx.font = textType(32, 660)
  ctx.fillStyle = LIME
  ctx.fillText('Working on', PAD, fixY)
  ctx.font = headType(46)
  ctx.fillStyle = FG
  const lines = linesOf(ctx, plain(report.focus.title), W - PAD * 2, 2)
  lines.forEach((l, i) => ctx.fillText(l, PAD, fixY + 58 + i * 56))

  /* --- the foot ---------------------------------------------------------- */
  const record = bestScore ?? streak
  ctx.font = textType(28)
  if (record) {
    ctx.fillStyle = LIME
    ctx.fillText(record, PAD, H - 84, W - PAD * 2)
  }
  const soft = report.quality.confidence < SOFT_READ
  const kind = SERVE_TYPES[report.serveType ?? 'flat']?.word ?? 'flat'
  const read = soft ? 'a rough read' : readQuality(report.quality.confidence).toLowerCase()
  ctx.fillStyle = soft ? AMBER : FAINT
  ctx.fillText(`${kind.charAt(0).toUpperCase()}${kind.slice(1)} serve, ${read}. Measured on a phone. The video never left it.`, PAD, H - 46, W - PAD * 2)

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/png'))
}
