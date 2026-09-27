/**
 * A magnifier for placing a mark precisely (the finger covers the spot it marks): a 104 px circle in
 * the top corner away from the point, showing the paused frame around it at 3× the on-screen size, with
 * an open crosshair at the exact spot. Drawn from the video element, so nothing is decoded twice.
 */
import { useEffect, useRef } from 'react'
import { toBox, type Size, type ViewTransform } from '../../../components/video/geometry.ts'
import type { NPoint } from '../../../components/video/overlayScene.ts'

const SIZE = 104
const ZOOM = 3

export function Loupe({
  video,
  at,
  frame,
  view,
  insetTop = 52,
}: {
  video: HTMLVideoElement | null
  at: NPoint
  /** Redraw when the frame changes. */
  frame: number
  view: { transform: ViewTransform; box: Size; clip: Size }
  insetTop?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { transform, box, clip } = view
  const p = toBox(transform, clip, at.x, at.y)
  const left = p.x < box.width / 2 ? box.width - SIZE - 12 : 12
  // Below the corner pills, or at the bottom when the point itself is up there.
  const top = p.y < insetTop + SIZE + 16 && p.x > left - 16 && p.x < left + SIZE + 16 ? Math.max(insetTop, box.height - SIZE - 60) : insetTop
  const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext?.('2d')
    if (!canvas || !ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--letterbox').trim() || '#0b0f0d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (video && video.readyState >= 2 && video.videoWidth) {
      // Clip pixels shown across the loupe, then the video's own pixels for drawImage.
      const spanClip = SIZE / (transform.scale * ZOOM)
      const kx = video.videoWidth / clip.width
      const ky = video.videoHeight / clip.height
      const sw = spanClip * kx
      const sh = spanClip * ky
      const sx = at.x * video.videoWidth - sw / 2
      const sy = at.y * video.videoHeight - sh / 2
      try {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      } catch {
        // A frame that cannot be drawn leaves the plain background.
      }
    }
    // Open crosshair with a dark halo, so the marked pixel stays visible.
    const c = canvas.width / 2
    const inner = 5 * dpr
    const outer = 16 * dpr
    const lines = () => {
      ctx.beginPath()
      ctx.moveTo(c - outer, c)
      ctx.lineTo(c - inner, c)
      ctx.moveTo(c + inner, c)
      ctx.lineTo(c + outer, c)
      ctx.moveTo(c, c - outer)
      ctx.lineTo(c, c - inner)
      ctx.moveTo(c, c + inner)
      ctx.lineTo(c, c + outer)
    }
    ctx.lineCap = 'round'
    const cs = getComputedStyle(canvas)
    ctx.strokeStyle = cs.getPropertyValue('--overlay-halo').trim() || 'rgb(11 15 13 / 0.7)'
    ctx.lineWidth = 4 * dpr
    lines()
    ctx.stroke()
    ctx.strokeStyle = cs.getPropertyValue('--overlay-line').trim() || '#f4f6f2'
    ctx.lineWidth = 2 * dpr
    lines()
    ctx.stroke()
  }, [video, at.x, at.y, frame, transform, clip, dpr])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      width={SIZE * dpr}
      height={SIZE * dpr}
      className="pointer-events-none absolute rounded-full border-2 border-(--overlay-line) shadow-sheet"
      style={{ left, top, width: SIZE, height: SIZE }}
    />
  )
}
