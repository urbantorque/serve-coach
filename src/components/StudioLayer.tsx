import { useEffect, useRef, useState } from 'react'
import type { StudioMark } from '../lib/storage/db'
import { labelAt, markLabel } from '../lib/studioMarks'

export type StudioTool = 'line' | 'angle'

interface Props {
  marks: StudioMark[]
  /** The picture's width for each unit of height. */
  aspect: number
  tool?: StudioTool
  /** The clip time a new mark is drawn at. */
  time: number
  onAdd: (mark: StudioMark) => void
  /** Zoomed in, a drag moves the picture: by this much of its own size. */
  onPan?: (dx: number, dy: number) => void
  zoomed: boolean
  /** A tap with no tool and no drag: the player's own play and pause. */
  onTap: () => void
}

type Pt = { x: number; y: number }

/**
 * The studio's drawing surface (E1.2): lines and angles over the picture, each
 * with its read-out, laid exactly over the video's contained picture so a
 * mark stays on the body it was drawn on at any size and any zoom.
 *
 * Sized in the stage's own pixels (its layout size, which a zoom transform does
 * not change) and mapped through `getScreenCTM`, which does count the zoom, so a
 * click lands where the eye put it.
 */
export default function StudioLayer({ marks, aspect, tool, time, onAdd, onPan, zoomed, onTap }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [draft, setDraft] = useState<Pt[]>([])
  const drag = useRef<{ x: number; y: number; moved: boolean } | undefined>()

  // The contained picture inside the stage: object-fit contain, worked out once per resize.
  useEffect(() => {
    const stage = svgRef.current?.parentElement
    if (!stage) return
    const fit = () => {
      const sw = stage.offsetWidth
      const sh = stage.offsetHeight
      const w = Math.min(sw, sh * aspect)
      const h = w / aspect
      setBox({ x: (sw - w) / 2, y: (sh - h) / 2, w, h })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [aspect])

  useEffect(() => setDraft([]), [tool])

  /** A pointer, as a point on the picture from 0 to 1. */
  const pointOf = (e: React.PointerEvent): Pt | undefined => {
    const svg = svgRef.current
    const m = svg?.getScreenCTM()
    if (!svg || !m || !box.w) return undefined
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: Math.min(1, Math.max(0, p.x / box.w)), y: Math.min(1, Math.max(0, p.y / box.h)) }
  }

  const down = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || tool || !zoomed || !onPan) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) < 3 && !d.moved) return
    d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    const r = svgRef.current!.getBoundingClientRect()
    onPan(dx / r.width, dy / r.height)
  }
  const up = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = undefined
    if (d?.moved) return
    if (!tool) return onTap()
    const p = pointOf(e)
    if (!p) return
    const pts = [...draft, p]
    if (pts.length === (tool === 'line' ? 2 : 3)) {
      onAdd({ kind: tool, pts, t: time })
      setDraft([])
    } else setDraft(pts)
  }

  const at = (p: Pt) => ({ x: p.x * box.w, y: p.y * box.h })
  const path = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${at(p).x},${at(p).y}`).join(' ')
  const active = Boolean(tool) || zoomed

  return (
    <svg
      ref={svgRef}
      role={tool ? 'img' : undefined}
      aria-label={tool ? `Drawing ${tool === 'line' ? 'a line: tap its two ends' : 'an angle: tap one end, the corner, then the other end'}` : undefined}
      aria-hidden={tool ? undefined : true}
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w || 1} ${box.h || 1}`}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        pointerEvents: active ? 'auto' : 'none',
        cursor: tool ? 'crosshair' : zoomed ? 'grab' : undefined,
        touchAction: active ? 'none' : undefined,
        overflow: 'visible',
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
    >
      {marks.map((m, i) => {
        const l = at(labelAt(m))
        return (
          <g key={i}>
            <path d={path(m.pts)} fill="none" style={{ stroke: 'var(--lime)', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
            {m.pts.map((p, j) => (
              <circle key={j} cx={at(p).x} cy={at(p).y} r={4} style={{ fill: 'var(--lime)' }} />
            ))}
            <text
              x={l.x + 8}
              y={l.y - 8}
              style={{ fill: 'var(--fg)', fontSize: 15, fontWeight: 700, paintOrder: 'stroke', stroke: 'var(--ink)', strokeWidth: 4 }}
            >
              {markLabel(m, aspect)}
            </text>
          </g>
        )
      })}
      {draft.map((p, j) => (
        <circle key={`d${j}`} cx={at(p).x} cy={at(p).y} r={5} style={{ fill: 'none', stroke: 'var(--lime)', strokeWidth: 2 }} />
      ))}
      {draft.length > 1 && <path d={path(draft)} fill="none" style={{ stroke: 'var(--lime)', strokeWidth: 2, strokeDasharray: '6 5' }} />}
    </svg>
  )
}
