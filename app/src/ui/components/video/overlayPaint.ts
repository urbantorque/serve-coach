/**
 * Canvas painter for overlay scenes (DESIGN §2.7, §13.8). Every stroke gets a dark halo (the same path
 * 2 px wider in the halo colour) so it reads over acrylic, sky, fences and trees. Colours come from the
 * `--overlay-*` and `--optic` tokens on the canvas element; nothing here animates on its own.
 */
import { toBox, type Size, type ViewTransform } from './geometry.ts'
import type { Ink, NPoint, OverlayScene, Prim } from './overlayScene.ts'

export interface OverlayPalette {
  optic: string
  line: string
  ball: string
  halo: string
}

/** Reads the overlay tokens from an element (falls back to the DESIGN §2.7 values). */
export function readPalette(el: Element): OverlayPalette {
  const cs = getComputedStyle(el)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    optic: v('--optic', '#d4ee48'),
    line: v('--overlay-line', '#f4f6f2'),
    ball: v('--overlay-ball', '#56b4e9'),
    halo: v('--overlay-halo', 'rgb(11 15 13 / 0.7)'),
  }
}

function inkColour(p: OverlayPalette, ink: Ink): string {
  return ink === 'optic' ? p.optic : ink === 'ball' ? p.ball : p.line
}

export interface PaintContext {
  ctx: CanvasRenderingContext2D
  transform: ViewTransform
  clip: Size
  palette: OverlayPalette
  /** Font family for ruler graduations. */
  font?: string
}

function pt(c: PaintContext, p: NPoint): { x: number; y: number } {
  return toBox(c.transform, c.clip, p.x, p.y)
}

function strokeWithHalo(c: PaintContext, draw: () => void, colour: string, width: number, dash: readonly number[] | undefined, alpha: number): void {
  const { ctx } = c
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  ctx.globalAlpha = Math.min(1, alpha + 0.15)
  ctx.strokeStyle = c.palette.halo
  ctx.lineWidth = width + 2
  draw()
  ctx.stroke()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.setLineDash(dash ? [...dash] : [])
  draw()
  ctx.stroke()
  ctx.restore()
}

function paintPrim(c: PaintContext, prim: Prim): void {
  const { ctx } = c
  switch (prim.kind) {
    case 'segment': {
      const a = pt(c, prim.a)
      const b = pt(c, prim.b)
      strokeWithHalo(
        c,
        () => {
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
        },
        inkColour(c.palette, prim.ink),
        prim.width,
        prim.dash,
        prim.alpha ?? 1,
      )
      break
    }
    case 'polyline': {
      const pts = prim.points.map((p) => pt(c, p))
      if (pts.length < 2) return
      strokeWithHalo(
        c,
        () => {
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        },
        inkColour(c.palette, prim.ink),
        prim.width,
        prim.dash,
        prim.alpha ?? 1,
      )
      break
    }
    case 'dot': {
      const p = pt(c, prim.at)
      ctx.save()
      ctx.globalAlpha = prim.alpha ?? 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, prim.r + 1, 0, Math.PI * 2)
      ctx.fillStyle = c.palette.halo
      ctx.fill()
      ctx.beginPath()
      ctx.arc(p.x, p.y, prim.r, 0, Math.PI * 2)
      ctx.fillStyle = inkColour(c.palette, prim.ink)
      ctx.fill()
      if (prim.ring) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, prim.r + 2, 0, Math.PI * 2)
        ctx.lineWidth = 2
        ctx.strokeStyle = c.palette.line
        ctx.stroke()
      }
      ctx.restore()
      break
    }
    case 'dots': {
      let last: { x: number; y: number } | null = null
      prim.points.forEach((q, i) => {
        const p = pt(c, q)
        const isLast = i === prim.points.length - 1
        if (last && !isLast && Math.hypot(p.x - last.x, p.y - last.y) < prim.minGapPx) return
        last = p
        paintPrim(c, { kind: 'dot', at: q, r: prim.r, ink: prim.ink, alpha: q.faded ? 0.45 : 1 })
      })
      break
    }
    case 'ring': {
      const p = pt(c, prim.at)
      strokeWithHalo(
        c,
        () => {
          ctx.beginPath()
          ctx.arc(p.x, p.y, prim.r, 0, Math.PI * 2)
        },
        inkColour(c.palette, prim.ink),
        prim.width,
        undefined,
        1,
      )
      break
    }
    case 'tick': {
      const p = pt(c, prim.at)
      const h = prim.lengthPx / 2
      strokeWithHalo(
        c,
        () => {
          ctx.beginPath()
          if (prim.orient === 'h') {
            ctx.moveTo(p.x - h, p.y)
            ctx.lineTo(p.x + h, p.y)
          } else {
            ctx.moveTo(p.x, p.y - h)
            ctx.lineTo(p.x, p.y + h)
          }
        },
        inkColour(c.palette, prim.ink),
        prim.width,
        undefined,
        1,
      )
      break
    }
    case 'text': {
      const p = pt(c, prim.at)
      ctx.save()
      ctx.font = `600 11px ${c.font ?? 'system-ui, sans-serif'}`
      ctx.textBaseline = 'middle'
      ctx.textAlign = prim.align === 'right' ? 'left' : 'right'
      const x = prim.align === 'right' ? p.x + prim.dx : p.x - prim.dx
      ctx.lineWidth = 3
      ctx.strokeStyle = c.palette.halo
      ctx.lineJoin = 'round'
      ctx.strokeText(prim.text, x, p.y)
      ctx.fillStyle = c.palette.line
      ctx.fillText(prim.text, x, p.y)
      ctx.restore()
      break
    }
  }
}

/** Clears the canvas (CSS px box × dpr) and paints the scene. */
export function paintScene(c: PaintContext, scene: OverlayScene, box: Size, dpr: number): void {
  const { ctx } = c
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, box.width * dpr, box.height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const prim of scene.prims) paintPrim(c, prim)
}
