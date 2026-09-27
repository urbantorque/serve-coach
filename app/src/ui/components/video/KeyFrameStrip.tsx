/**
 * Key-frame strip (DESIGN §8.9): Release, Peak, Top of swing, Lowest point, Contact, Landing (plus
 * Setup and Recovery when detected), in time order, from stored key frames so it works after the video
 * is deleted. Thumbnails follow the clip orientation (88 × 50 or 50 × 88). The current one has a 2 px
 * ring; the focus event says "Focus" with a target glyph; a missing event is a plain slot that says
 * "Not clear on this serve" and is not tappable. Tap seeks (paused). With the pose track, each thumbnail
 * is cropped around the tracked body at its frame (thumbCrop.ts) so the player is not tiny.
 */
import { EyeSlashIcon, ImageIcon, TargetIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef } from 'react'
import type { KeyFrameEvent, ServeEvents } from '../../../analysis/types.ts'
import { currentItem, stripItems } from './keyFrames.ts'
import type { PoseTrackCompact } from '../../../data/domain.ts'
import type { KeyFrameRecord } from '../../../data/records.ts'
import { KEY_FRAME_LABEL } from '../../copy/strings.ts'
import { cx } from '../cx.ts'
import type { Size } from './geometry.ts'
import { useObjectUrls } from './objectUrls.ts'
import { usePlayhead, type Playhead } from './playhead.ts'
import { cropImageStyle, thumbCrop, type NRect } from './thumbCrop.ts'


function useFrameUrls(frames: KeyFrameRecord[]): Partial<Record<KeyFrameEvent, string>> {
  const blobs = useMemo(() => frames.map((k) => k.blob), [frames])
  const urls = useObjectUrls(blobs)
  return useMemo(() => {
    const out: Partial<Record<KeyFrameEvent, string>> = {}
    frames.forEach((k, i) => {
      const u = urls[i]
      if (u) out[k.event] = u
    })
    return out
  }, [frames, urls])
}

const THUMB: Record<'portrait' | 'landscape', Size> = { portrait: { width: 50, height: 88 }, landscape: { width: 88, height: 50 } }

export interface KeyFrameStripProps {
  events: ServeEvents
  frames: KeyFrameRecord[]
  orientation: 'portrait' | 'landscape'
  store: Playhead
  focusEvent?: KeyFrameEvent | null
  onSelect: (frame: number, event: KeyFrameEvent) => void
  /** Pose track, standing height (fraction of the frame height) and clip size: crop each thumbnail to the player. */
  pose?: PoseTrackCompact
  bodyHeightNorm?: number | null
  clip?: Size
  className?: string
}

export function KeyFrameStrip({ events, frames, orientation, store, focusEvent, onSelect, pose, bodyHeightNorm, clip, className }: KeyFrameStripProps) {
  const frame = usePlayhead(store, (s) => s.frame)
  const items = useMemo(() => stripItems(events), [events])
  const urls = useFrameUrls(frames)
  const current = currentItem(items, frame)
  const rowRef = useRef<HTMLUListElement>(null)
  const size = orientation === 'portrait' ? 'h-22 w-[50px]' : 'h-[50px] w-22'
  const thumb = THUMB[orientation]
  const crops = useMemo(() => {
    const out: Partial<Record<KeyFrameEvent, { crop: NRect; image?: NRect }>> = {}
    if (!pose || !clip) return out
    for (const k of frames) {
      const crop = thumbCrop({ pose, frame: k.frameIndex, bodyHeightNorm, clip, thumb })
      if (crop) out[k.event] = { crop, image: k.crop }
    }
    return out
  }, [frames, pose, bodyHeightNorm, clip, thumb])

  // Scroll the focus event into view on open.
  useEffect(() => {
    if (!focusEvent) return
    const el = rowRef.current?.querySelector<HTMLElement>(`[data-event="${focusEvent}"]`)
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [focusEvent])

  return (
    <ul
      ref={rowRef}
      aria-label="Key frames"
      className={cx('relative flex snap-x gap-2 overflow-x-auto px-5 pt-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      {items.map((it) => {
        const caption = KEY_FRAME_LABEL[it.event]
        const isFocus = focusEvent === it.event
        const isCurrent = current === it.event
        const url = urls[it.event]
        return (
          <li key={it.event} data-event={it.event} className="flex shrink-0 snap-start flex-col items-center gap-1">
            {it.clear && it.frame !== null ? (
              <button
                type="button"
                onClick={() => onSelect(it.frame!, it.event)}
                aria-label={`${caption}${isFocus ? ', focus' : ''}. Show this frame`}
                aria-current={isCurrent ? 'step' : undefined}
                className={cx(
                  'relative grid place-items-center overflow-hidden rounded-media bg-surface-2 text-ink-3 after:absolute after:-inset-1',
                  size,
                  isCurrent ? 'outline-2 outline-offset-2 outline-ink dark:outline-optic' : '',
                )}
              >
                {url && crops[it.event] ? (
                  <img
                    src={url}
                    alt=""
                    data-cropped=""
                    className="absolute max-w-none"
                    style={cropImageStyle(crops[it.event]!.crop, crops[it.event]!.image, thumb)}
                  />
                ) : url ? (
                  <img src={url} alt="" width={thumb.width} height={thumb.height} className="size-full object-cover" />
                ) : (
                  <ImageIcon size={18} aria-hidden="true" />
                )}
              </button>
            ) : (
              <span className={cx('grid place-items-center rounded-media bg-surface-2 px-1 text-center text-ink-3', size)} title="Not clear on this serve">
                <EyeSlashIcon size={16} aria-hidden="true" />
              </span>
            )}
            <span
              aria-hidden="true"
              className={cx(
                'text-center text-caption leading-tight',
                orientation === 'portrait' ? 'w-[58px]' : 'w-22',
                it.clear ? 'text-ink-2' : 'text-ink-3',
              )}
            >
              {caption}
            </span>
            {isFocus ? (
              <span aria-hidden="true" className="-mt-0.5 flex items-center gap-0.5 text-caption text-ink">
                <TargetIcon size={12} />
                Focus
              </span>
            ) : null}
            {!it.clear ? <span className="sr-only">Not clear on this serve</span> : null}
          </li>
        )
      })}
      <li aria-hidden="true" className="w-3 shrink-0" />
    </ul>
  )
}
