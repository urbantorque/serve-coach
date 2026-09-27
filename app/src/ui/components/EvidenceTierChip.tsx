import { BooksIcon, ChalkboardTeacherIcon, FlaskIcon, type Icon } from '@phosphor-icons/react'
import { TIER_LABEL, type EvidenceTierId } from '../copy/strings.ts'
import { cx } from './cx.ts'

const TIER_ICON: Record<EvidenceTierId, Icon> = {
  'research-backed': BooksIcon,
  'coach-recommended': ChalkboardTeacherIcon,
  experimental: FlaskIcon,
}

export interface EvidenceTierChipProps {
  tier: EvidenceTierId
  /** Opens "How we know" (population studied, COACHING §13). */
  onOpen?: () => void
  className?: string
}

/** Evidence tier on coaching claims (DESIGN §3.4). Experimental shares the dashed data-state container. */
export function EvidenceTierChip({ tier, onOpen, className }: EvidenceTierChipProps) {
  const G = TIER_ICON[tier]
  const classes = cx(
    'chip relative inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-caption whitespace-nowrap text-ink-2',
    tier === 'experimental' ? 'border-token border-dashed border-line-strong' : 'bg-surface-2',
    className,
  )
  const content = (
    <>
      <G size={14} aria-hidden="true" />
      <span>{TIER_LABEL[tier]}</span>
    </>
  )
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      data-tier={tier}
      className={cx(classes, 'cursor-pointer after:absolute after:-inset-x-1 after:-inset-y-2.5')}
    >
      {content}
      <span className="sr-only">, how we know</span>
    </button>
  ) : (
    <span data-tier={tier} className={classes}>
      {content}
    </span>
  )
}
