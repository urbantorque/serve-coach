import { CheckIcon } from '@phosphor-icons/react'
import { useId } from 'react'
import { cx } from '../cx.ts'

export interface ToggleProps {
  label: string
  /** Helper under the label (footnote --ink-2). */
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/**
 * Switch (DESIGN §8.23): 51 × 31 visual in a 44 px row; on = optic track with a CheckIcon in the knob
 * (ink track in Court-side), so the state is never colour alone. `role="switch"`.
 */
export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center gap-4">
      <span className="flex flex-1 flex-col">
        <span id={`${id}-label`} className="text-headline text-ink">
          {label}
        </span>
        {description ? (
          <span id={`${id}-desc`} className="text-footnote text-ink-2">
            {description}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className="relative grid h-11 w-[51px] shrink-0 place-items-center"
      >
        <span
          aria-hidden="true"
          className={cx(
            'relative h-[31px] w-[51px] rounded-full border-token transition-colors duration-(--dur-fast)',
            checked ? 'border-optic-edge bg-optic court:border-ink court:bg-ink' : 'border-line-strong bg-surface-2',
          )}
        >
          <span
            className={cx(
              'absolute top-[2px] grid size-[25px] place-items-center rounded-full bg-surface text-ink shadow-sheet transition-transform duration-(--dur-fast) ease-standard motion-reduce:transition-none',
              checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
            )}
          >
            {checked ? <CheckIcon size={12} /> : null}
          </span>
        </span>
      </button>
    </div>
  )
}
