import { CheckIcon } from '@phosphor-icons/react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../../components/cx.ts'
import { toggleChoice } from './choiceLogic.ts'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  /** Optional second line (footnote --ink-2). */
  detail?: ReactNode
}

export interface ChoiceListProps<T extends string> {
  /** Accessible name of the group (the visible question usually labels it via `labelledBy`). */
  label?: string
  labelledBy?: string
  options: ChoiceOption<T>[]
  /** single: a radio group (one answer); multi: checkboxes. */
  mode: 'single' | 'multi'
  value: readonly T[]
  onChange: (next: T[]) => void
  /** Multi only: options that clear the others when chosen ("None", "No comp"). */
  exclusive?: readonly T[]
  /** row: 64 px full-width rows (onboarding); compact: 52 px rows; pair: two 52 px buttons side by side. */
  size?: 'row' | 'compact' | 'pair'
  className?: string
}

/**
 * Full-width choice rows (DESIGN §10.1 question template, §8.4): none preselected, a filled check
 * disc plus a 2 px ink edge when selected (never colour alone, never optic). Single-choice rows are a
 * radio group with arrow keys; multi-choice rows are checkboxes.
 */
export function ChoiceList<T extends string>({
  label,
  labelledBy,
  options,
  mode,
  value,
  onChange,
  exclusive = [],
  size = 'row',
  className,
}: ChoiceListProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const single = mode === 'single'
  const selectedIndex = options.findIndex((o) => value.includes(o.value))
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!single) return
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (focusIndex + delta + options.length) % options.length
    onChange([options[next].value])
    refs.current[next]?.focus()
  }

  return (
    <div
      role={single ? 'radiogroup' : 'group'}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className={cx(size === 'pair' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2', className)}
    >
      {options.map((o, i) => {
        const selected = value.includes(o.value)
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role={single ? 'radio' : 'checkbox'}
            aria-checked={selected}
            tabIndex={single ? (i === focusIndex ? 0 : -1) : 0}
            onClick={() => onChange(single ? [o.value] : toggleChoice(value, o.value, exclusive))}
            className={cx(
              'flex w-full items-center gap-3 rounded-control bg-surface text-left transition-colors duration-(--dur-fast) motion-reduce:transition-none',
              size === 'row' ? 'min-h-16 px-4 py-3' : 'min-h-13 px-4 py-2',
              // Selected adds a 1 px inset ring to the 1 px ink border (2 px edge) without shifting layout.
              selected
                ? 'border-token border-ink shadow-[inset_0_0_0_1px_var(--ink)]'
                : 'border-token border-line-strong hover:bg-surface-2 active:bg-surface-2',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'grid size-6 shrink-0 place-items-center rounded-full',
                selected ? 'bg-ink text-ink-inverse' : 'border-2 border-line-strong',
              )}
            >
              {selected ? <CheckIcon size={14} /> : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-headline text-ink">{o.label}</span>
              {o.detail ? <span className="text-footnote text-ink-2">{o.detail}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
