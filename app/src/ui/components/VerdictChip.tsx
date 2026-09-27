import {
  CheckCircleIcon,
  CircleDashedIcon,
  CircleHalfIcon,
  EqualsIcon,
  HourglassMediumIcon,
  MinusCircleIcon,
  type Icon,
} from '@phosphor-icons/react'
import type { VerdictWord } from '../../data/domain.ts'
import { VERDICT_WORDS, verdictDisplayId, type VerdictDisplayId } from '../copy/strings.ts'
import { cx } from './cx.ts'

interface VerdictStyle {
  icon: Icon
  mirrored?: boolean
  glyph: string
  fill: string
}

/** DESIGN §3.5. Words first; worse verdicts are never styled as errors. */
const STYLE: Record<VerdictDisplayId, VerdictStyle> = {
  'clearly-better': { icon: CheckCircleIcon, glyph: 'text-good', fill: 'bg-good-soft' },
  'likely-better': { icon: CircleHalfIcon, glyph: 'text-good', fill: 'bg-good-soft' },
  'about-the-same': { icon: EqualsIcon, glyph: 'text-ink-2', fill: 'bg-surface-2' },
  'too-early': { icon: HourglassMediumIcon, glyph: 'text-ink-2', fill: 'bg-surface-2' },
  'likely-worse': { icon: CircleHalfIcon, mirrored: true, glyph: 'text-bad', fill: 'bg-bad-soft' },
  'clearly-worse': { icon: MinusCircleIcon, glyph: 'text-bad', fill: 'bg-bad-soft' },
  'not-comparable': { icon: CircleDashedIcon, glyph: 'text-ink-2', fill: 'border-token border-dashed border-line-strong' },
  'trend-too-early': { icon: HourglassMediumIcon, glyph: 'text-ink-2', fill: 'bg-surface-2' },
}

export interface VerdictChipProps {
  verdict: VerdictWord | VerdictDisplayId
  /** compact: 28 px chip with a caption label (tiles, lists); large: 36 px with a headline label (Compare). */
  size?: 'compact' | 'large'
  className?: string
}

export function VerdictChip({ verdict, size = 'compact', className }: VerdictChipProps) {
  const id = verdictDisplayId(verdict)
  const s = STYLE[id]
  const G = s.icon
  return (
    <span
      data-verdict={id}
      className={cx(
        'chip inline-flex shrink-0 items-center self-start rounded-full whitespace-nowrap text-ink',
        s.fill,
        size === 'large' ? 'h-9 gap-2 px-3 text-headline' : 'h-7 gap-1.5 px-2.5 text-caption',
        className,
      )}
    >
      <G size={size === 'large' ? 20 : 16} aria-hidden="true" className={cx(s.glyph, s.mirrored && '-scale-x-100')} />
      <span>{VERDICT_WORDS[id]}</span>
    </span>
  )
}
