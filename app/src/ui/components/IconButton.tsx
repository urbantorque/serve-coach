import { UserCircleIcon, type Icon } from '@phosphor-icons/react'
import type { ButtonHTMLAttributes } from 'react'
import { Link } from 'react-router'
import { cx } from './cx.ts'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  icon: Icon
  /** Required accessible name (DESIGN §6: icon-only buttons get an aria-label). */
  label: string
  /** plain: no container; filled: a 44 px --surface-2 circle (toolbars, video controls). */
  variant?: 'plain' | 'filled'
  /** Icon size; defaults to the app's IconContext size (24, or 28 in Court-side). */
  iconSize?: number
  to?: string
}

const BASE =
  'relative inline-grid size-11 shrink-0 place-items-center rounded-full text-ink transition-transform duration-(--dur-press) ' +
  'hover:bg-surface-2 active:scale-[0.98] active:bg-surface-2 motion-reduce:active:scale-100'

/** A 44 x 44 icon-only control (DESIGN §8.3 "Icon"). */
export function IconButton({ icon: G, label, variant = 'plain', iconSize, to, className, type = 'button', ...rest }: IconButtonProps) {
  const classes = cx(BASE, variant === 'filled' && 'bg-surface-2', className)
  const glyph = <G aria-hidden="true" {...(iconSize ? { size: iconSize } : {})} />
  if (to) {
    return (
      <Link to={to} aria-label={label} className={classes}>
        {glyph}
      </Link>
    )
  }
  return (
    <button {...rest} type={type} aria-label={label} className={classes}>
      {glyph}
    </button>
  )
}

/** Profile entry (DESIGN §8.1): UserCircleIcon in the right slot of Today's app bar. */
export function ProfileButton() {
  return <IconButton icon={UserCircleIcon} label="Profile" to="/profile" />
}
