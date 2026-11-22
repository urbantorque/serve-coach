/**
 * A still of the serve with what was drawn on it (E1.3), made on this device:
 * the video frame at its own size, the body lines over it, and every mark with
 * its read-out. Saved as a picture file; nothing is sent anywhere.
 */
import type { StudioMark } from './storage/db'
import { labelAt, markLabel } from './studioMarks'

/** A colour token's value, so the still is drawn in the app's own ink. */
const token = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

export async function exportStill(
  video: HTMLVideoElement,
  lines: HTMLCanvasElement | null,
  marks: readonly StudioMark[],
  aspect: number,
  filedAt: number,
): Promise<void> {
  const h = video.videoHeight
  const w = Math.round(h * aspect)
  if (!w || !h) return
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return
  ctx.drawImage(video, 0, 0, w, h)
  if (lines && lines.width && lines.height) {
    // The body lines are drawn over the contained picture inside the stage; take that part.
    const r = Math.min(lines.width / w, lines.height / h)
    const sw = w * r
    const sh = h * r
    ctx.drawImage(lines, (lines.width - sw) / 2, (lines.height - sh) / 2, sw, sh, 0, 0, w, h)
  }
  const lime = token('--lime', 'lime')
  const fg = token('--fg', 'white')
  const ink = token('--ink', 'black')
  const unit = h / 540
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const m of marks) {
    ctx.strokeStyle = lime
    ctx.lineWidth = 3 * unit
    ctx.beginPath()
    m.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)))
    ctx.stroke()
    const at = labelAt(m)
    ctx.font = `700 ${Math.round(18 * unit)}px system-ui, sans-serif`
    ctx.lineWidth = 5 * unit
    ctx.strokeStyle = ink
    ctx.fillStyle = fg
    const text = markLabel(m, aspect)
    ctx.strokeText(text, at.x * w + 10 * unit, at.y * h - 10 * unit)
    ctx.fillText(text, at.x * w + 10 * unit, at.y * h - 10 * unit)
  }
  const blob = await new Promise<Blob | null>((done) => out.toBlob(done, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `serve-${new Date(filedAt).toISOString().slice(0, 10)}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
