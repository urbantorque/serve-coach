import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { cx } from '../cx.ts'

export interface StepperProps {
  label: string
  /** null = not entered yet (the tally's "Serves in" starts empty, DESIGN §10.3 R7). */
  value: number | null
  onChange: (value: number) => void
  min?: number
  max?: number
  /** "of 15" beside the value. */
  suffix?: string
  size?: 'hero' | 'compact'
}

/**
 * Stepper (DESIGN §8.14 tally counter, §8.22): − / value / +, 64 px buttons for the main counter and
 * 44 px for the compact ones, tabular value. These are counts the player enters ("You logged"),
 * not measurements, so they carry no status chip.
 */
export function Stepper({ label, value, onChange, min = 0, max = 99, suffix, size = 'compact' }: StepperProps) {
  const hero = size === 'hero'
  const v = value ?? min
  const btn = cx(
    'grid shrink-0 place-items-center rounded-full border-token border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2 disabled:text-ink-disabled disabled:hover:bg-surface',
    hero ? 'size-16' : 'size-11',
  )
  return (
    <div className={cx('flex items-center', hero ? 'flex-col gap-2' : 'justify-between gap-3')}>
      <span className={cx(hero ? 'sr-only' : 'text-headline text-ink')}>{label}</span>
      <div className="flex items-center gap-4" role="group" aria-label={label}>
        <button type="button" className={btn} aria-label={`Fewer: ${label}`} disabled={value === null || v <= min} onClick={() => onChange(Math.max(min, v - 1))}>
          <MinusIcon size={hero ? 28 : 20} aria-hidden="true" />
        </button>
        <output
          aria-live="polite"
          className={cx('min-w-[3ch] text-center tabular-nums text-ink', hero ? 'text-metric-hero font-wide' : 'text-title-2')}
        >
          {value === null ? (
            <>
              <span aria-hidden="true" className="inline-block h-[0.9em] w-[2ch] border-b-2 border-dashed border-line-strong align-middle" />
              <span className="sr-only">Not entered</span>
            </>
          ) : (
            value
          )}
        </output>
        <button
          type="button"
          className={btn}
          aria-label={`More: ${label}`}
          disabled={value !== null && v >= max}
          onClick={() => onChange(value === null ? Math.min(max, min + 1) : Math.min(max, v + 1))}
        >
          <PlusIcon size={hero ? 28 : 20} aria-hidden="true" />
        </button>
      </div>
      {suffix ? <span className="text-footnote tabular-nums text-ink-2">{suffix}</span> : null}
    </div>
  )
}
