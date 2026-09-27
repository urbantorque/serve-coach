import { CheckIcon } from '@phosphor-icons/react'
import { useRef, type KeyboardEvent } from 'react'
import { cx } from '../cx.ts'

export interface ChoiceOption<T extends string | number> {
  value: T
  label: string
}

export interface ChoiceChipsProps<T extends string | number> {
  /** Visible label for the row ("Side", "Serves"); also the group's accessible name. */
  label: string
  options: ChoiceOption<T>[]
  value: T | null
  /** Receives null only when an optional row is cleared. */
  onChange: (value: T | null) => void
  /** Optional rows can be cleared by tapping the selected chip again. */
  optional?: boolean
  /** Lay the label above the chips instead of beside them. */
  stacked?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Choice chips (DESIGN §8.4): pills with a 36 px visual and a 44 px hit area, `subhead` labels.
 * Selected = ink fill with a leading CheckIcon, so selection is never colour alone; never optic.
 * A radio group with roving focus and arrow keys.
 */
export function ChoiceChips<T extends string | number>({ label, options, value, onChange, optional, stacked, disabled, className }: ChoiceChipsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = options.findIndex((o) => o.value === value)
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta || disabled) return
    e.preventDefault()
    const next = (focusIndex + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className={cx('flex gap-x-2 gap-y-1', stacked ? 'flex-col' : 'flex-wrap items-center', className)}>
      <span className={cx('shrink-0 text-footnote font-label text-ink-2', !stacked && 'min-w-14')} aria-hidden="true">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} onKeyDown={onKeyDown} className="flex min-w-0 flex-wrap gap-2 py-1">
        {options.map((o, i) => {
          const selected = o.value === value
          return (
            <button
              key={String(o.value)}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === focusIndex ? 0 : -1}
              disabled={disabled}
              onClick={() => {
                if (selected && optional) onChange(null)
                else if (!selected) onChange(o.value)
              }}
              className={cx(
                'relative inline-flex min-h-9 min-w-11 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-subhead transition-colors duration-(--dur-fast)',
                'after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
                selected
                  ? 'border-token border-ink bg-ink text-ink-inverse'
                  : 'border-token border-line-strong bg-surface text-ink hover:bg-surface-2',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              {selected ? <CheckIcon size={16} aria-hidden="true" /> : null}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
