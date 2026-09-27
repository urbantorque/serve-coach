import { FilmStripIcon } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { cx } from '../cx.ts'

export interface ClipCardProps {
  /** "Sat 26 Sep, 0:42" */
  title: string
  /** "Side view, deuce, first serves" */
  line: string
  /** "1080p, 60 fps" */
  tech: string
  orientation: 'portrait' | 'landscape'
  /** The clip itself when still in memory, for a still thumbnail. */
  file?: Blob
  className?: string
}

/**
 * One blob URL per clip for the thumbnail, or null (no file, or a runtime that cannot make one).
 * Cached per Blob rather than revoked on unmount: the running job keeps the clip in memory anyway,
 * and revoking on a remount (StrictMode, leaving and returning to Processing) would break the still.
 */
const urls = new WeakMap<Blob, string>()
function objectUrl(file: Blob | undefined): string | null {
  if (!file || typeof URL.createObjectURL !== 'function') return null
  const known = urls.get(file)
  if (known) return known
  try {
    const url = URL.createObjectURL(file)
    urls.set(file, url)
    return url
  } catch {
    // No thumbnail is better than no screen: the film glyph stands in.
    return null
  }
}

/**
 * Clip card (DESIGN §10.4): a still from the clip (64 × 36, or 36 × 64 upright), the date and length,
 * the set-up and the delivered size and rate. Without the file it shows a film glyph instead.
 */
export function ClipCard({ title, line, tech, orientation, file, className }: ClipCardProps) {
  const url = useMemo(() => objectUrl(file), [file])
  const upright = orientation === 'portrait'
  return (
    <div className={cx('card flex items-center gap-4 p-4', className)}>
      <span className={cx('relative grid shrink-0 place-items-center overflow-hidden rounded-media bg-letterbox text-ink-inverse', upright ? 'h-16 w-9' : 'h-9 w-16')}>
        {url ? (
          <video
            src={`${url}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
            className="size-full object-cover"
          />
        ) : (
          <FilmStripIcon size={20} aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-headline text-ink">{title}</span>
        <span className="truncate text-footnote text-ink-2">{line}</span>
        <span className="text-footnote tabular-nums text-ink-3">{tech}</span>
      </span>
    </div>
  )
}
