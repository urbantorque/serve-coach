/**
 * Serve attributes for tagging (DESIGN §8.14, §8.4): segmented 1st | 2nd and Deuce | Ad, and optional
 * choice-chip rows for the target (T, Body, Wide) and the intended type (Flat, Slice, Kick). Every
 * value is player-entered. Chips: 36 px visual, 44 px hit, selected = ink fill plus a check glyph.
 */
import { CheckIcon } from '@phosphor-icons/react'
import type { ServeNumber, ServeSide, ServeType, TargetZone } from '../../../analysis/types.ts'
import { SegmentedControl } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import type { TagAttrs } from './tagging.ts'

const TARGETS: { value: TargetZone; label: string }[] = [
  { value: 'T', label: 'T' },
  { value: 'body', label: 'Body' },
  { value: 'wide', label: 'Wide' },
]
const TYPES: { value: ServeType; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'slice', label: 'Slice' },
  { value: 'kick', label: 'Kick' },
]

export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T | undefined
  /** Tapping the selected chip clears it (optional attribute). */
  onChange: (value: T | undefined) => void
}) {
  return (
    <div className="flex h-11 items-center gap-3">
      <span className="w-16 shrink-0 text-footnote font-label text-ink-2" aria-hidden="true">
        {label}
      </span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const selected = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? undefined : o.value)}
              className={cx(
                'relative inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-subhead after:absolute after:inset-x-0 after:-inset-y-1',
                selected ? 'bg-ink text-ink-inverse font-label' : 'border-token border-line-strong text-ink hover:bg-surface-2',
              )}
            >
              {selected ? <CheckIcon size={16} aria-hidden="true" /> : null}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TagAttributes({
  attrs,
  onChange,
  showTarget = true,
  showType = true,
  className,
}: {
  attrs: TagAttrs
  onChange: (next: TagAttrs) => void
  showTarget?: boolean
  showType?: boolean
  className?: string
}) {
  const set = <K extends keyof TagAttrs>(k: K, v: TagAttrs[K]) => {
    const next = { ...attrs }
    if (v === undefined) delete next[k]
    else next[k] = v
    onChange(next)
  }
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-2 gap-3">
        <SegmentedControl<'1' | '2'>
          label="Serve number"
          options={[
            { value: '1', label: '1st' },
            { value: '2', label: '2nd' },
          ]}
          value={String(attrs.serveNumber) as '1' | '2'}
          onChange={(v) => set('serveNumber', Number(v) as ServeNumber)}
        />
        <SegmentedControl<ServeSide>
          label="Court side"
          options={[
            { value: 'deuce', label: 'Deuce' },
            { value: 'ad', label: 'Ad' },
          ]}
          value={attrs.side}
          onChange={(v) => set('side', v)}
        />
      </div>
      {showTarget ? <ChoiceChips label="Aimed at" options={TARGETS} value={attrs.targetZone} onChange={(v) => set('targetZone', v)} /> : null}
      {showType ? <ChoiceChips label="Type" options={TYPES} value={attrs.intendedType} onChange={(v) => set('intendedType', v)} /> : null}
    </div>
  )
}
