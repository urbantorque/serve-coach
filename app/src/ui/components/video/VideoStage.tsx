/**
 * The video box (DESIGN §8.11): the clip at its own aspect ratio (fit, zoomed to the player, or the
 * fixed Tagging crop), the overlay canvas above it, value labels as DOM pills, corner pills and a
 * bottom scrim while controls show. Letterbox bars are the letterbox token. Tap toggles the controls;
 * a horizontal swipe changes serve; in Player zoom a horizontal drag pans instead.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { cx } from '../cx.ts'
import { drawnRect, fitTransform, panLimits, regionTransform, type ClipRegion, type Size, type ViewTransform } from './geometry.ts'
import { OverlayLabels } from './OverlayLabels.tsx'
import { paintScene, readPalette } from './overlayPaint.ts'
import type { OverlayScene } from './overlayScene.ts'
import type { Playhead } from './playhead.ts'

export interface VideoStageProps {
  /** Displayed clip size in pixels (after rotation). */
  clip: Size
  /** CSS height of the box, e.g. 'min(45dvh, 693px)' or 219. */
  height: CSSProperties['height']
  /** Fit the whole frame, or fill the box height with `region`. */
  region?: ClipRegion | null
  /** Allow a horizontal drag to pan (Player zoom). */
  pannable?: boolean
  /** Video source (object URL); omit for key-frame stepping or no media. */
  src?: string
  videoRef?: (el: HTMLVideoElement | null) => void
  /** The clip cannot be decoded on this device (PRODUCT §6.6 decode error). */
  onVideoError?: () => void
  /** A still frame drawn instead of the video (key-frame stepping after the video was deleted). */
  still?: string | null
  /** Second clip blended at 40% (ghost "Show video ghost"). */
  ghostSrc?: string
  ghostRef?: (el: HTMLVideoElement | null) => void
  store: Playhead
  /** Scene for a frame; the canvas follows the playhead. */
  scene?: ((frame: number) => OverlayScene) | null
  /** Value labels on the video (off in narrow side-by-side boxes; the values are listed below). */
  labels?: boolean
  /** Top-left and top-right pills, shown with the controls. */
  topLeft?: ReactNode
  topRight?: ReactNode
  /** Bottom-right control (zoom pill), shown with the controls; always in the accessibility tree. */
  bottomRight?: ReactNode
  controlsVisible?: boolean
  onTap?: () => void
  onSwipe?: (direction: 1 | -1) => void
  /** Accessible description of what the box shows. */
  label: string
  /** Placeholder content when there is no media. */
  children?: ReactNode
  className?: string
}

export function VideoStage({
  clip,
  height,
  region,
  pannable = false,
  src,
  videoRef,
  onVideoError,
  still,
  ghostSrc,
  ghostRef,
  store,
  scene,
  labels = true,
  topLeft,
  topRight,
  bottomRight,
  controlsVisible = true,
  onTap,
  onSwipe,
  label,
  children,
  className,
}: VideoStageProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Size>({ width: 0, height: 0 })
  // Pan is kept per region: a new region (another serve, zoom toggled) starts centred.
  const regionKey = region ? `${region.centerX}:${region.top}:${region.bottom}:${pannable}` : 'fit'
  const [panState, setPanState] = useState({ key: regionKey, pan: 0 })
  const pan = panState.key === regionKey ? panState.pan : 0
  const drag = useRef<{ x: number; y: number; t: number; pan: number; moved: boolean } | null>(null)
  // Stored pan never exceeds the clip edge, so reversing a drag responds at once.
  const setPan = (value: number) => {
    const lim = region && box.width ? panLimits(clip, box, region) : { min: 0, max: 0 }
    setPanState({ key: regionKey, pan: Math.min(lim.max, Math.max(lim.min, value)) })
  }

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const transform: ViewTransform | null = useMemo(() => {
    if (!box.width || !box.height || !clip.width || !clip.height) return null
    if (!region) return fitTransform(clip, box)
    const lim = pannable ? panLimits(clip, box, region) : { min: 0, max: 0 }
    return regionTransform(clip, box, region, Math.min(lim.max, Math.max(lim.min, pan)))
  }, [box, clip, region, pan, pannable])

  const rect = transform ? drawnRect(transform, clip) : null
  const mediaStyle: CSSProperties | undefined = rect
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    : undefined

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button,a,[role="button"]')) return
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), pan, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 6 || Math.abs(e.clientY - d.y) > 6) d.moved = true
    if (pannable && d.moved) setPan(d.pan + dx)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    const dt = performance.now() - d.t
    if (!d.moved) {
      onTap?.()
      return
    }
    if (!pannable && onSwipe && Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && dt < 700) onSwipe(dx < 0 ? 1 : -1)
  }

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={pannable ? `${label} Zoomed to you: use the left and right arrow keys to pan.` : label}
      // Player zoom: the box takes focus so arrow keys pan (keyboard alternative to the drag).
      tabIndex={pannable ? 0 : undefined}
      onKeyDown={(e) => {
        if (!pannable || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
        e.preventDefault()
        setPan(pan + (e.key === 'ArrowLeft' ? 32 : -32))
      }}
      className={cx('group relative w-full overflow-hidden bg-letterbox select-none', pannable ? 'touch-none' : 'touch-pan-y', className)}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      {src ? (
        <video
          ref={videoRef}
          src={src}
          onError={onVideoError}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          className="pointer-events-none absolute max-w-none"
          style={mediaStyle ?? { inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : still ? (
        <img
          src={still}
          alt=""
          aria-hidden="true"
          width={rect ? Math.round(rect.width) : undefined}
          height={rect ? Math.round(rect.height) : undefined}
          className="pointer-events-none absolute max-w-none"
          style={mediaStyle}
        />
      ) : null}
      {ghostSrc ? (
        <video
          ref={ghostRef}
          src={ghostSrc}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          className="pointer-events-none absolute max-w-none opacity-40"
          style={mediaStyle}
        />
      ) : null}
      {scene && transform ? <OverlayCanvas store={store} scene={scene} transform={transform} clip={clip} box={box} /> : null}
      {scene && transform && labels ? (
        <OverlayLabels store={store} scene={scene} transform={transform} clip={clip} box={box} insetTop={topLeft || topRight ? 48 : 8} />
      ) : null}
      {children}
      <div
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-(--overlay-label-bg) to-transparent',
          'transition-opacity duration-(--dur-fast) motion-reduce:transition-none',
          controlsVisible ? 'opacity-100' : 'opacity-0',
        )}
      />
      {topLeft || topRight ? (
        <div
          className={cx(
            'absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2',
            'transition-opacity duration-(--dur-fast) motion-reduce:transition-none',
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100',
          )}
        >
          <div className="min-w-0">{topLeft}</div>
          <div className="shrink-0">{topRight}</div>
        </div>
      ) : null}
      {bottomRight ? (
        <div
          className={cx(
            'absolute right-2 bottom-2',
            'transition-opacity duration-(--dur-fast) motion-reduce:transition-none',
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100',
          )}
        >
          {bottomRight}
        </div>
      ) : null}
    </div>
  )
}

/** Canvas sized to the box × devicePixelRatio, repainted when the playhead moves. */
function OverlayCanvas({
  store,
  scene,
  transform,
  clip,
  box,
}: {
  store: Playhead
  scene: (frame: number) => OverlayScene
  transform: ViewTransform
  clip: Size
  box: Size
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext?.('2d')
    if (!canvas || !ctx) return
    const palette = readPalette(canvas)
    const font = getComputedStyle(canvas).fontFamily
    const draw = (frame: number) => paintScene({ ctx, transform, clip, palette, font }, scene(frame), box, dpr)
    draw(store.getState().frame)
    return store.subscribe((s, prev) => {
      if (s.frame !== prev.frame) draw(s.frame)
    })
  }, [store, scene, transform, clip, box, dpr])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      width={Math.round(box.width * dpr)}
      height={Math.round(box.height * dpr)}
      className="pointer-events-none absolute inset-0 size-full"
    />
  )
}
