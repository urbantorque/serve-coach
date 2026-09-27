import { CheckIcon } from '@phosphor-icons/react'
import { useId, type ReactNode } from 'react'
import { cx } from '../../../components/cx.ts'

export interface SwitchRowProps {
  label: string
  /** One line under the label (footnote --ink-2). */
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  /** Leading 40 px media (for example a RowIcon). */
  leading?: ReactNode
  className?: string
}

/**
 * Switch row (DESIGN §8.23): a 51 × 31 switch in a row of at least 56 px. On = optic track with a
 * CheckIcon inside the knob (ink track in Court-side), so the state is never colour alone. The
 * whole row is the hit area; `role="switch"` names itself from the label and describes itself from
 * the line below.
 */
export function SwitchRow({ label, description, checked, onChange, leading, className }: SwitchRowProps) {
  const id = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-l`}
      aria-describedby={description ? `${id}-d` : undefined}
      onClick={() => onChange(!checked)}
      className={cx('flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 active:bg-surface-2', className)}
    >
      {leading ? <span className="flex size-10 shrink-0 items-center justify-center">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={`${id}-l`} className="text-headline text-ink">
          {label}
        </span>
        {description ? (
          <span id={`${id}-d`} className="text-footnote text-ink-2">
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          'relative h-[31px] w-[51px] shrink-0 rounded-full border-token transition-colors duration-(--dur-fast) motion-reduce:transition-none',
          checked ? 'border-optic-edge bg-optic court:border-ink court:bg-ink' : 'border-line-strong bg-surface-2',
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 left-0 grid size-[25px] -translate-y-1/2 place-items-center rounded-full bg-surface text-ink shadow-sheet',
            'transition-transform duration-(--dur-fast) ease-standard motion-reduce:transition-none',
            checked ? 'translate-x-[22px]' : 'translate-x-[2px] border border-line-strong',
          )}
        >
          {checked ? <CheckIcon size={12} /> : null}
        </span>
      </span>
    </button>
  )
}
