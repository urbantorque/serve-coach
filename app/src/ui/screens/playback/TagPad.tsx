/**
 * Tagging pad (DESIGN §8.14): In top-left, Net top-right, Long bottom-left, Wide bottom-right, each
 * 169 × 88 with the §2.6 outcome mark and the word, in fixed positions so muscle memory works. The
 * tapped button shows its pressed state for 160 ms. The current tag (when revisiting) is marked with a
 * check and a heavier edge, not colour alone.
 */
import { ArrowsHorizontalIcon, ArrowUpIcon, CheckIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { OutcomeMark } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { OUTCOME_WORDS } from '../../copy/strings.ts'
import type { TagOutcome } from './tagging.ts'

const PAD: { outcome: Exclude<TagOutcome, 'let'>; key: string }[] = [
  { outcome: 'in', key: 'I' },
  { outcome: 'net', key: 'N' },
  { outcome: 'long', key: 'L' },
  { outcome: 'wide', key: 'W' },
]

export function TagPad({
  current,
  onTag,
  className,
}: {
  /** The serve's stored outcome, if any. */
  current?: string
  onTag: (outcome: Exclude<TagOutcome, 'let'>) => void
  className?: string
}) {
  const [flash, setFlash] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    // Two by two while "Long" and "Wide" fit beside their marks; one column with large text, so a word
    // is never clipped (rem follows the text size; finding 74).
    <div role="group" aria-label="Outcome" className={cx('grid grid-cols-[repeat(auto-fit,minmax(min(100%,7.5rem),1fr))] gap-3', className)}>
      {PAD.map(({ outcome, key }) => {
        const selected = current === outcome
        return (
          <button
            key={outcome}
            type="button"
            aria-label={OUTCOME_WORDS[outcome]}
            aria-pressed={selected}
            aria-keyshortcuts={key}
            onClick={() => {
              setFlash(outcome)
              window.clearTimeout(timer.current)
              timer.current = window.setTimeout(() => setFlash(null), 160)
              onTag(outcome)
            }}
            className={cx(
              // min-h: at 200% text a word wraps and the button grows rather than clipping it (finding 74).
              'relative flex min-h-22 items-center gap-3 overflow-hidden rounded-control px-4 py-2 text-left text-title-2 text-ink',
              'transition-[transform,background-color] duration-(--dur-press) active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-colors',
              selected ? 'border-2 border-ink bg-surface-2' : 'border-token border-line-strong bg-surface hover:bg-surface-2',
              flash === outcome && 'scale-[0.98] bg-surface-2 motion-reduce:scale-100',
              'court:border-2 court:border-ink court:font-strong',
            )}
          >
            <span aria-hidden="true" className={cx('absolute inset-y-0 left-0 w-1.5 transition-opacity duration-(--dur-fast)', outcome === 'in' ? 'bg-good' : 'bg-bad', flash === outcome ? 'opacity-100' : 'opacity-0')} />
            <OutcomeMark outcome={outcome} size={16} />
            <span className="min-w-0 flex-1">{OUTCOME_WORDS[outcome]}</span>
            {outcome === 'long' ? <ArrowUpIcon size={16} aria-hidden="true" className="text-ink-2" /> : null}
            {outcome === 'wide' ? <ArrowsHorizontalIcon size={16} aria-hidden="true" className="text-ink-2" /> : null}
            {selected ? <CheckIcon size={16} aria-hidden="true" /> : null}
          </button>
        )
      })}
    </div>
  )
}
