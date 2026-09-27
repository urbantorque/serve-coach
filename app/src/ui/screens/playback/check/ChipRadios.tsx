/**
 * A wrapping row of chip radios for "Check this serve" (which point the next tap places, which radar
 * measured the serve). Chips wrap instead of truncating like a segmented control. Keyboard follows the
 * radio-group pattern of SegmentedControl: one tab stop (the selected chip, else the first), arrow keys
 * and Home/End move and select.
 */
import { CheckCircleIcon, CircleIcon } from '@phosphor-icons/react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../../components/cx.ts'

export interface ChipOption<T extends string> {
  value: T
  label: ReactNode
  /** Shown as a filled check (done) rather than an open circle. */
  done?: boolean
  /** Extra words for screen readers, e.g. ", marked on frame 30". */
  srSuffix?: string
}

export function ChipRadios<T extends string>({ labelId, options, value, onSelect }: { labelId: string; options: readonly ChipOption<T>[]; value: T | null; onSelect: (v: T) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = options.findIndex((o) => o.value === value)
  const tabStop = index >= 0 ? index : 0

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = index >= 0 ? index : 0
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    let next: number
    if (delta) next = (from + delta + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    else return
    e.preventDefault()
    onSelect(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onSelect(o.value)}
            className={cx(
              'relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-subhead after:absolute after:inset-x-0 after:-inset-y-1',
              'transition-colors duration-(--dur-fast) motion-reduce:transition-none',
              selected ? 'bg-ink font-label text-ink-inverse' : 'border-token border-line-strong text-ink hover:bg-surface-2',
            )}
          >
            {(o.done ?? selected) ? <CheckCircleIcon size={16} aria-hidden="true" /> : <CircleIcon size={16} aria-hidden="true" />}
            {o.label}
            {o.srSuffix ? <span className="sr-only">{o.srSuffix}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
