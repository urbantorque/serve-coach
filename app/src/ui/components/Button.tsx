import { TrashIcon, type Icon } from '@phosphor-icons/react'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { UI } from '../copy/strings.ts'
import { cx } from './cx.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'critical'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'children'> {
  /** primary: the one thing to do on this screen (max one per screen or sheet). */
  variant?: ButtonVariant
  /** Optional 20 px leading icon. Destructive buttons get TrashIcon by default. */
  icon?: Icon
  /** 44 px secondary (DESIGN §8.3 "44 compact"). */
  compact?: boolean
  /** Replaces the label with "Saving…"; no spinner. */
  loading?: boolean
  /** Rendered as aria-disabled so it stays focusable; pair with helper text naming the reason. */
  disabled?: boolean
  /** Full column width. Defaults to true for every variant except tertiary. */
  fullWidth?: boolean
  /** Navigate instead of act (renders a link). */
  to?: string
  children: ReactNode
}

const BASE =
  'btn inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control text-headline ' +
  'transition-[transform,background-color] duration-(--dur-press) ease-standard active:scale-[0.98] ' +
  'motion-reduce:transition-colors motion-reduce:active:scale-100'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'px-5 bg-optic text-on-optic border-token border-optic-edge hover:bg-optic-press active:bg-optic-press',
  secondary: 'px-5 bg-surface text-ink border-token border-line-strong hover:bg-surface-2 active:bg-surface-2',
  tertiary: 'px-1 text-ink hover:bg-surface-2 active:bg-surface-2',
  destructive: 'px-5 bg-surface text-critical border-token border-line-strong hover:bg-critical-soft active:bg-surface-2',
  critical: 'px-5 bg-critical text-on-critical hover:opacity-90 active:opacity-90',
}

const DISABLED = 'bg-surface-2 text-ink-disabled border-transparent cursor-not-allowed active:scale-100'

/**
 * Buttons (DESIGN §8.3). Labels are 1 to 3 words and never wrap; one label per intent across the app.
 */
export function Button({
  variant = 'primary',
  icon,
  compact = false,
  loading = false,
  disabled = false,
  fullWidth,
  to,
  className,
  children,
  onClick,
  type = 'button',
  ...rest
}: ButtonProps) {
  const LeadingIcon = icon ?? (variant === 'destructive' ? TrashIcon : undefined)
  const wide = fullWidth ?? variant !== 'tertiary'
  const inert = disabled || loading
  const classes = cx(
    BASE,
    // Disabled replaces the variant colours rather than competing with them.
    inert ? (variant === 'tertiary' ? 'px-1 text-ink-disabled cursor-not-allowed' : `px-5 ${DISABLED}`) : VARIANT[variant],
    // Heights (DESIGN §8.3, §5.5): 52 px; 44 px compact secondary and tertiary; 56 px critical fill.
    variant === 'critical' ? 'h-14' : variant === 'tertiary' || (compact && variant === 'secondary') ? 'h-11' : 'h-13',
    variant === 'tertiary' && to && 'underline decoration-1 underline-offset-[3px]',
    wide && 'w-full',
    className,
  )
  const content = (
    <>
      {LeadingIcon && !loading ? <LeadingIcon size={20} aria-hidden="true" /> : null}
      <span>{loading ? UI.saving : children}</span>
    </>
  )
  const guard = (e: MouseEvent<HTMLElement>) => {
    if (inert) {
      e.preventDefault()
      return
    }
    onClick?.(e as MouseEvent<HTMLButtonElement>)
  }
  if (to && !inert) {
    return (
      <Link to={to} className={classes} onClick={onClick as never} data-variant={variant}>
        {content}
      </Link>
    )
  }
  return (
    <button {...rest} type={type} aria-disabled={inert || undefined} aria-busy={loading || undefined} onClick={guard} className={classes} data-variant={variant}>
      {content}
    </button>
  )
}
