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
  paintFrame(ctx, video, lines, marks, aspect, w, h)
  const blob = await new Promise<Blob | null>((done) => out.toBlob(done, 'image/png'))
  if (blob) save(blob, `serve-${new Date(filedAt).toISOString().slice(0, 10)}.png`)
}

/** One frame as the studio shows it: the video, the body lines over it, and every mark with its read-out. */
function paintFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  lines: HTMLCanvasElement | null,
  marks: readonly StudioMark[],
  aspect: number,
  w: number,
  h: number,
): void {
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
}

/** Hand a file to the browser's download, here, with nothing sent anywhere. */
function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Whether this browser can record a clip on the device. */
export const canRecordClip = (): boolean =>
  typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype

/**
 * The serve as the studio shows it, recorded on the device (W6.5): the clip's
 * own window, played by the player at whatever speed it is set to, with the
 * body lines and every mark drawn on each frame, recorded by the browser's
 * `MediaRecorder`. It takes as long as it plays. Resolves when the file is
 * saved, or false when nothing could be recorded.
 */
export async function recordStudioClip(
  video: HTMLVideoElement,
  lines: HTMLCanvasElement | null,
  marks: readonly StudioMark[],
  aspect: number,
  end: number,
  filedAt: number,
  play: () => void,
  /** The longest it may run: a player that loops never reaches the end twice. */
  maxMs: number,
): Promise<boolean> {
  if (!canRecordClip()) return false
  const h = Math.min(720, video.videoHeight)
  const w = Math.round(h * aspect)
  if (!w || !h) return false
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return false
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
  if (!type) return false
  const recorder = new MediaRecorder(out.captureStream(30), { mimeType: type })
  const parts: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data)
  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
  paintFrame(ctx, video, lines, marks, aspect, w, h)
  recorder.start()
  play()
  const started = performance.now()
  let last = video.currentTime
  await new Promise<void>((resolve) => {
    const tick = () => {
      paintFrame(ctx, video, lines, marks, aspect, w, h)
      // The end, the loop jumping back to the start, or the time limit.
      const looped = video.currentTime < last - 0.2
      last = video.currentTime
      if (video.currentTime >= end - 0.03 || video.ended || looped || performance.now() - started > maxMs) return resolve()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  video.pause()
  recorder.stop()
  await done
  if (!parts.length) return false
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm'
  save(new Blob(parts, { type: type.split(';')[0] }), `serve-${new Date(filedAt).toISOString().slice(0, 10)}.${ext}`)
  return true
}
