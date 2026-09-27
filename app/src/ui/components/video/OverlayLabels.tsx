/**
 * Overlay labels (DESIGN §2.7, §8.11): the measurement-label pill (#F4F6F2 text on the 72% dark
 * pill), placed at the end of the line away from the body and kept inside the video box. Numbers
 * render through <MetricValue> with the compact data-state glyph, so nothing on video is unlabelled.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { MetricValue } from '../MetricValue.tsx'
import { clampLabel, toBox, type Size, type ViewTransform } from './geometry.ts'
import type { LabelSpec, OverlayScene } from './overlayScene.ts'
import { usePlayhead, type Playhead } from './playhead.ts'

/**
 * Token overrides so MetricValue's ink, muted ink and chip fill read on the dark pill, and its body
 * size drops to the 13 px label size.
 */
const PILL_VARS = {
  '--ink': 'var(--overlay-line)',
  '--ink-2': 'var(--overlay-line)',
  '--ink-3': 'color-mix(in srgb, var(--overlay-line) 78%, transparent)',
  '--surface-2': 'color-mix(in srgb, var(--overlay-line) 18%, transparent)',
  '--line-strong': 'color-mix(in srgb, var(--overlay-line) 60%, transparent)',
  '--fs-body': '0.8125rem',
  '--fs-subhead': '0.8125rem',
} as CSSProperties

export function OverlayLabels({
  store,
  scene,
  transform,
  clip,
  box,
  insetTop = 8,
}: {
  store: Playhead
  scene: (frame: number) => OverlayScene
  transform: ViewTransform
  clip: Size
  box: Size
  /** Keep labels below the corner pills. */
  insetTop?: number
}) {
  const frame = usePlayhead(store, (s) => s.frame)
  const labels = scene(frame).labels
  if (!labels.length) return null
  return (
    <div className="pointer-events-none absolute inset-0" style={PILL_VARS}>
      {labels.map((l) => (
        <Label key={l.id} spec={l} transform={transform} clip={clip} box={box} insetTop={insetTop} />
      ))}
    </div>
  )
}

function Label({ spec, transform, clip, box, insetTop }: { spec: LabelSpec; transform: ViewTransform; clip: Size; box: Size; insetTop: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const anchor = toBox(transform, clip, spec.at.x, spec.at.y)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const gap = 10
    // Preferred side first; flip when it would leave the box, then keep it inside.
    const right = anchor.x + gap
    const left = anchor.x - gap - w
    const fitsRight = right + w <= box.width - 8
    const fitsLeft = left >= 8
    let next: { x: number; y: number }
    if (fitsRight || fitsLeft) {
      const x = spec.side === 'right' ? (fitsRight ? right : left) : fitsLeft ? left : right
      next = clampLabel(x, anchor.y - h / 2, w, h, box)
      next = { x: next.x, y: Math.max(insetTop, next.y) }
    } else {
      // Neither side fits: above the anchor (below when there is no room), centred and kept inside.
      const above = anchor.y - gap - h
      next = clampLabel(anchor.x - w / 2, above >= insetTop ? above : anchor.y + gap, w, h, box)
      next = { x: next.x, y: Math.max(insetTop, next.y) }
    }
    setPos((p) => (p && Math.abs(p.x - next.x) < 0.5 && Math.abs(p.y - next.y) < 0.5 ? p : next))
  }, [anchor.x, anchor.y, spec.side, box, insetTop, spec.text, spec.metric?.value, spec.metric2?.value])

  return (
    <div
      ref={ref}
      data-overlay-label={spec.id}
      className="absolute top-0 left-0 inline-flex max-w-[70%] flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full bg-(--overlay-label-bg) px-2.5 py-1 text-footnote font-label text-(--overlay-line)"
      style={{ transform: pos ? `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)` : undefined, visibility: pos ? 'visible' : 'hidden' }}
    >
      <span>{spec.text}</span>
      {spec.metric ? <MetricValue metricId={spec.metric.id} value={spec.metric.value} compactChip /> : null}
      {spec.metric2 ? (
        <>
          <span>{spec.metric2.joiner}</span>
          <MetricValue metricId={spec.metric2.id} value={spec.metric2.value} compactChip />
        </>
      ) : null}
    </div>
  )
}
