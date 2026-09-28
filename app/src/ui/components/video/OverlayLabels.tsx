/**
 * Overlay labels (DESIGN §2.7, §8.11): the measurement-label pill (#F4F6F2 text on the 72% dark
 * pill), placed at the end of the line away from the body and kept inside the video box. Numbers
 * render through <MetricValue> with the compact data-state glyph, so nothing on video is unlabelled.
 * All labels of a frame are measured together and placed so they never cover a ruler tick, its
 * graduation ("2×"), a marker ring or each other (labelPlacement.ts). Placement writes the pills'
 * position straight to the DOM after layout (measuring is a DOM job), so it never re-renders.
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { shortCaveat } from '../../format/metricFormat.ts'
import { MetricValue } from '../MetricValue.tsx'
import { toBox, type Size, type ViewTransform } from './geometry.ts'
import { labelObstacles, placeLabels, type LabelRequest } from './labelPlacement.ts'
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
  const { labels, prims } = scene(frame)
  const layer = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = layer.current
    if (!root) return
    const requests: LabelRequest[] = []
    const els = new Map<string, HTMLElement>()
    for (const l of labels) {
      const el = root.querySelector<HTMLElement>(`[data-overlay-label="${l.id}"]`)
      if (!el) continue
      els.set(l.id, el)
      requests.push({ id: l.id, anchor: toBox(transform, clip, l.at.x, l.at.y), w: el.offsetWidth, h: el.offsetHeight, side: l.side })
    }
    const obstacles = labelObstacles(prims, (p) => toBox(transform, clip, p.x, p.y))
    const placed = placeLabels(requests, { box, insetTop, obstacles })
    for (const [id, el] of els) {
      const p = placed[id]
      if (!p) continue
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`
      el.style.visibility = 'visible'
    }
  }, [labels, prims, transform, clip, box, insetTop])

  if (!labels.length) return null
  return (
    <div ref={layer} className="pointer-events-none absolute inset-0" style={PILL_VARS}>
      {labels.map((l) => (
        <Label key={l.id} spec={l} />
      ))}
    </div>
  )
}

function Label({ spec }: { spec: LabelSpec }) {
  // A relative-only value (leg drive) carries its caveat on the video too; the full sentence is in the
  // value's spoken text and beside it in the serve drawer (finding 50).
  const caveat = spec.metric ? shortCaveat(spec.metric.id, spec.metric.value) : undefined
  return (
    <div
      data-overlay-label={spec.id}
      className="invisible absolute top-0 left-0 inline-flex max-w-[70%] flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full bg-(--overlay-label-bg) px-2.5 py-1 text-footnote font-label text-(--overlay-line)"
    >
      <span>{spec.text}</span>
      {spec.metric ? <MetricValue metricId={spec.metric.id} value={spec.metric.value} compactChip /> : null}
      {caveat ? (
        <span aria-hidden="true" data-overlay-caveat>
          ({caveat})
        </span>
      ) : null}
      {spec.metric2 ? (
        <>
          <span>{spec.metric2.joiner}</span>
          <MetricValue metricId={spec.metric2.id} value={spec.metric2.value} compactChip />
        </>
      ) : null}
    </div>
  )
}
