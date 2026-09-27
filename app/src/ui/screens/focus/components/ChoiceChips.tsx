import { CheckIcon } from '@phosphor-icons/react'
import { useId, useRef, type KeyboardEvent } from 'react'
import { cx } from '../../../components/index.ts'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
}

/**
 * Choice chips (DESIGN §8.4): pill, 36 px visual inside a 44 px hit area, subhead label. Selected is
 * an ink fill with a leading check (never colour alone, never optic). Single choice: a radiogroup
 * with arrow keys; `value` undefined means nothing chosen yet (no preselection).
 */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string
  options: ChoiceOption<T>[]
  value: T | undefined
  onChange: (v: T) => void
  hint?: string
}) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = options.findIndex((o) => o.value === value)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = ((index < 0 ? 0 : index + d) + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend id={id} className="mb-2 text-footnote font-label text-ink-2">
        {label}
      </legend>
      <div role="radiogroup" aria-labelledby={id} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
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
              tabIndex={selected || (index < 0 && i === 0) ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={cx(
                'relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-subhead',
                'transition-colors duration-(--dur-fast) motion-reduce:transition-none',
                'after:absolute after:inset-x-0 after:-inset-y-1',
                selected
                  ? 'bg-ink text-ink-inverse'
                  : 'border-token border-line-strong text-ink hover:bg-surface-2 active:bg-surface-2',
              )}
            >
              {selected ? <CheckIcon size={16} aria-hidden="true" /> : null}
              {o.label}
            </button>
          )
        })}
      </div>
      {hint ? <p className="text-footnote text-ink-3">{hint}</p> : null}
    </fieldset>
  )
}
