import { CheckIcon } from '@phosphor-icons/react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../cx.ts'

export interface RadioCardOption<T extends string> {
  value: T
  title: string
  /** Secondary line, footnote --ink-2. */
  body?: ReactNode
  /** Trailing meta, tabular ("15 serves · 30 min"). */
  meta?: ReactNode
  /** Caption pill after the title ("Recommended"). */
  pill?: string
  /** Media above the body (the set-up diagrams on R2). */
  media?: ReactNode
}

export interface RadioCardsProps<T extends string> {
  label: string
  options: RadioCardOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/**
 * Full-width radio cards (DESIGN §10.3 R1 plans, R2 set-up choice). Selection is shown three ways:
 * a filled check disc, a 2 px ink edge and the accessible state, never colour alone. Arrow keys move
 * the choice (radio group).
 */
export function RadioCards<T extends string>({ label, options, value, onChange, className }: RadioCardsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (index + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cx('flex flex-col gap-2', className)}>
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
            tabIndex={i === index ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex min-h-16 w-full items-start gap-3 rounded-card bg-surface px-4 py-3 text-left transition-colors duration-(--dur-fast)',
              selected ? 'border-2 border-ink' : 'border-token border-line hover:border-line-strong',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full',
                selected ? 'bg-ink text-ink-inverse' : 'border-2 border-line-strong',
              )}
            >
              {selected ? <CheckIcon size={14} /> : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-headline text-ink">{o.title}</span>
                {o.pill ? (
                  <span className="inline-flex h-6 items-center rounded-full border-token border-line-strong px-2 text-caption text-ink-2">{o.pill}</span>
                ) : null}
              </span>
              {o.meta ? <span className="text-footnote tabular-nums text-ink-2">{o.meta}</span> : null}
              {o.media ? <span className="block py-1">{o.media}</span> : null}
              {o.body ? <span className="text-footnote text-ink-2">{o.body}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
