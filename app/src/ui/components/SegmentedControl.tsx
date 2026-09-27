import { useRef, type KeyboardEvent } from 'react'
import { cx } from './cx.ts'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name of the radio group ("View", "Court side"). */
  label: string
  className?: string
}

/**
 * Segmented control (DESIGN §8.4): 2 to 4 mutually exclusive options that switch a view. 36 px track
 * inside a 44 px hit row; selected segment on --surface with a 1 px line-strong edge (ink fill in
 * Court-side). `role="radiogroup"` with roving tab index and arrow keys.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(0, options.findIndex((o) => o.value === value))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    let next = index
    if (delta) next = (index + delta + options.length) % options.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    else return
    e.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className={cx('flex h-11 items-center', className)}>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex h-9 w-full items-stretch gap-0.5 rounded-control bg-surface-2 p-0.5"
      >
        {options.map((o, i) => {
          const selected = i === index
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={cx(
                'relative flex-1 truncate rounded-control px-2 after:absolute after:inset-x-0 after:-inset-y-1.5',
                selected
                  ? 'border-token border-line-strong bg-surface text-headline text-ink court:border-ink court:bg-ink court:text-ink-inverse'
                  : 'text-subhead text-ink-2 hover:text-ink',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
