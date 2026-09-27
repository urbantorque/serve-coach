/**
 * Presentational pieces shared by the insight screens: key-frame images with an honest placeholder,
 * the compact and large verdict blocks (DESIGN §8.13), the status legend for compact chips, and a
 * plain inline error. No data access here beyond the key-frame hooks.
 */
import { EyeSlashIcon, HourglassMediumIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { CameraOrientation, KeyFrameEvent, MetricStatus } from '../../../../analysis/types.ts'
import type { VerdictWord } from '../../../../data/domain.ts'
import { cx } from '../../../components/cx.ts'
import { StatusChip } from '../../../components/StatusChip.tsx'
import { VerdictChip } from '../../../components/VerdictChip.tsx'
import type { VerdictDisplayId } from '../../../copy/strings.ts'
import { useKeyFrameUrl, useServeFrameUrl } from './hooks.ts'

const FRAME_SIZE = {
  // Portrait clips are the D1 default: 9:16 frames. Landscape clips: 16:9.
  focus: { portrait: 'w-[72px] h-[128px]', landscape: 'w-[151px] h-[85px]' },
  compact: { portrait: 'w-[68px] h-[120px]', landscape: 'w-[120px] h-[68px]' },
  row: { portrait: 'w-[40px] h-[40px]', landscape: 'w-[40px] h-[40px]' },
} as const
/** Intrinsic sizes (CSS px) so images reserve their space before they load. */
const FRAME_PX = {
  focus: { portrait: [72, 128], landscape: [151, 85] },
  compact: { portrait: [68, 120], landscape: [120, 68] },
  row: { portrait: [40, 40], landscape: [40, 40] },
} as const

function FrameBox({
  url,
  alt,
  size,
  orientation,
  placeholder,
  className,
}: {
  url: string | null
  alt: string
  size: keyof typeof FRAME_SIZE
  orientation: CameraOrientation
  placeholder?: ReactNode
  className?: string
}) {
  const box = cx('shrink-0 overflow-hidden rounded-media bg-surface-2', FRAME_SIZE[size][orientation], className)
  const [w, h] = FRAME_PX[size][orientation]
  if (url) return <img src={url} alt={alt} width={w} height={h} loading={size === 'row' ? 'lazy' : undefined} className={cx(box, 'object-cover')} decoding="async" />
  return (
    <span role="img" aria-label={`${alt}: no frame kept`} className={cx(box, 'flex flex-col items-center justify-center gap-1 p-1 text-center text-ink-3')}>
      {placeholder ?? (
        <>
          <EyeSlashIcon size={size === 'row' ? 16 : 20} aria-hidden="true" />
          {size === 'row' ? null : <span className="text-caption">No frame kept</span>}
        </>
      )}
    </span>
  )
}

/** A stored key frame by id (coaching evidence). Placeholder when the frame was not kept. */
export function KeyFrameById(props: { id?: string; alt: string; size: keyof typeof FRAME_SIZE; orientation: CameraOrientation; className?: string }) {
  const { url } = useKeyFrameUrl(props.id)
  return <FrameBox url={url} {...props} />
}

/** A serve's key frame for one event (the per-serve list thumbnail). */
export function ServeFrame(props: {
  serveId: string
  event: KeyFrameEvent
  alt: string
  size: keyof typeof FRAME_SIZE
  orientation: CameraOrientation
  placeholder?: ReactNode
  className?: string
}) {
  const { url } = useServeFrameUrl(props.serveId, props.event)
  return <FrameBox url={url} {...props} />
}

export function VerdictLine({ verdict, context, more, className }: { verdict: VerdictWord | VerdictDisplayId; context?: ReactNode; more?: string | null; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <VerdictChip verdict={verdict} />
        {context ? <span className="text-footnote text-ink-2">{context}</span> : null}
      </span>
      {more ? (
        <span className="flex items-start gap-1.5 text-footnote text-ink-2">
          <HourglassMediumIcon size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{more}</span>
        </span>
      ) : null}
    </div>
  )
}

/** Legend for compact status chips in dense per-serve rows (DESIGN §3.1: allowed only with a legend). */
export function StatusLegend({ statuses }: { statuses: MetricStatus[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-3">
      <span>Key:</span>
      {statuses.map((s) => (
        <StatusChip key={s} status={s} />
      ))}
    </p>
  )
}

export function InlineError({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="card flex flex-col items-start gap-2 p-4">
      <p className="flex items-start gap-2 text-callout text-ink">
        <WarningCircleIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-attention" />
        <span>{children}</span>
      </p>
      {action}
    </div>
  )
}
