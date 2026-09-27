import { CheckIcon } from '@phosphor-icons/react'
import type { Weekday } from '../../../../data/records.ts'
import { cx } from '../../../components/cx.ts'
import { inOptionOrder, toggleChoice } from './choiceLogic.ts'
import { WEEKDAYS } from './words.ts'

/**
 * Match-night day chips (DESIGN §10.1 O3): two rows (Mon to Thu, Fri to Sun), 44 px, 8 px gaps,
 * multi-select. Selected = ink fill with a CheckIcon (never colour alone, never optic).
 */
export function DayChips({ value, onChange, labelledBy }: { value: Weekday[]; onChange: (v: Weekday[]) => void; labelledBy: string }) {
  const rows = [WEEKDAYS.slice(0, 4), WEEKDAYS.slice(4)]
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-col gap-2">
      {rows.map((row, r) => (
        <div key={r} className="flex flex-wrap gap-2">
          {row.map((d) => {
            const on = value.includes(d.value)
            return (
              <button
                key={d.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={d.long.replace(/s$/, '')}
                onClick={() => onChange(inOptionOrder(toggleChoice(value, d.value), WEEKDAYS))}
                className={cx(
                  'inline-flex h-11 min-w-[72px] items-center justify-center gap-1.5 rounded-full px-4 text-subhead transition-colors duration-(--dur-fast) motion-reduce:transition-none',
                  on ? 'bg-ink font-label text-ink-inverse' : 'border-token border-line-strong text-ink hover:bg-surface-2',
                )}
              >
                {on ? <CheckIcon size={16} aria-hidden="true" /> : null}
                {d.label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
