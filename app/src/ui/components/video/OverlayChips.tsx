/**
 * Overlay chips (DESIGN §8.11 item 3, §8.4): one overlay at a time as a radio group of choice chips
 * (Body, Toss, Contact, Legs, None) in a horizontally scrolling row with 20 px end padding. Selected =
 * ink fill with a check glyph (not colour alone). A chip whose data is missing stays in the row,
 * disabled, and its reason shows in the legend line below.
 */
import { CheckIcon } from '@phosphor-icons/react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { cx } from '../cx.ts'
import { OVERLAY_META } from './overlayMeta.ts'
import { OVERLAY_IDS, type OverlayId } from './overlayScene.ts'


export interface OverlayChipsProps {
  value: OverlayId
  onChange: (id: OverlayId) => void
  /** Reason per disabled chip ("Ball not tracked on this serve"). */
  disabled?: Partial<Record<OverlayId, string | null>>
  /** Replaces the legend line (compare legend, disabled reason). */
  legend?: string
  className?: string
}

export function OverlayChips({ value, onChange, disabled = {}, legend, className }: OverlayChipsProps) {
  const refs = useRef<Partial<Record<OverlayId, HTMLButtonElement | null>>>({})
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = refs.current[value]
    const row = rowRef.current
    if (!el || !row || typeof row.scrollTo !== 'function') return
    const left = el.offsetLeft - 20
    const right = el.offsetLeft + el.offsetWidth + 20 - row.clientWidth
    if (row.scrollLeft > left) row.scrollTo({ left })
    else if (row.scrollLeft < right) row.scrollTo({ left: right })
  }, [value])

  const enabled = OVERLAY_IDS.filter((id) => !disabled[id])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const i = Math.max(0, enabled.indexOf(value))
    const next = enabled[(i + delta + enabled.length) % enabled.length]
    onChange(next)
    refs.current[next]?.focus()
  }

  const reason = disabled[value] ?? null
  const legendText = legend ?? reason ?? OVERLAY_META[value].legend

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div
        ref={rowRef}
        role="radiogroup"
        aria-label="Overlay"
        onKeyDown={onKeyDown}
        className="relative flex h-11 items-center gap-2 overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {OVERLAY_IDS.map((id) => {
          const meta = OVERLAY_META[id]
          const selected = id === value
          const why = disabled[id] ?? null
          const G = selected ? CheckIcon : meta.icon
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[id] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={why ? true : undefined}
              aria-describedby={why ? `overlay-why-${id}` : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                if (!why) onChange(id)
              }}
              className={cx(
                'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-subhead after:absolute after:inset-x-0 after:-inset-y-1',
                'transition-colors duration-(--dur-fast) motion-reduce:transition-none',
                selected
                  ? 'bg-ink text-ink-inverse font-label'
                  : why
                    ? 'border-token border-dashed border-line text-ink-disabled'
                    : 'border-token border-line-strong text-ink hover:bg-surface-2',
              )}
            >
              <G size={16} aria-hidden="true" />
              {meta.label}
              {why ? (
                <span id={`overlay-why-${id}`} className="sr-only">
                  {why}
                </span>
              ) : null}
            </button>
          )
        })}
        <span aria-hidden="true" className="w-3 shrink-0" />
      </div>
      <p className="gutter line-clamp-2 text-footnote text-ink-2" aria-live="polite">
        {legendText}
      </p>
    </div>
  )
}
