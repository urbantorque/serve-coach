import { CaretRightIcon, CheckCircleIcon, FlaskIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react'
import { CAPTURE_EXPERIMENTAL, CAPTURE_WORDS } from '../copy/strings.ts'
import { cx } from './cx.ts'

export interface CaptureQualityLineProps {
  overall: 'good' | 'usable' | 'poor'
  /** Serves measured and detected: "14 of 16 serves measured". */
  measured: number
  detected: number
  /** The single "Next time" fix (Fair) or nothing; Limited shows "What happened". */
  tip?: string
  /** Opens the capture detail sheet. */
  onOpen?: () => void
}

/**
 * Capture quality line (DESIGN §3.6): directly under every session headline. Glyph + word, never
 * colour alone; the internal 0-100 score is never shown. Always shown, and always labelled
 * "Automatic check, experimental" with the flask glyph until its checks pass on real footage
 * (DECISIONS D2 addendum, 2026-09-28).
 */
export function CaptureQualityLine({ overall, measured, detected, tip, onOpen }: CaptureQualityLineProps) {
  const G = overall === 'good' ? CheckCircleIcon : overall === 'usable' ? WarningCircleIcon : WarningIcon
  const second = overall === 'poor' ? 'What happened' : tip ? `Next time: ${tip}` : undefined
  const content = (
    <>
      <span className="flex items-center gap-1.5">
        <G size={16} aria-hidden="true" className={cx('shrink-0', overall === 'good' ? 'text-ink' : 'text-attention')} />
        <span>
          <span className="font-strong text-ink">Capture: {CAPTURE_WORDS[overall]}</span>
          <span className="tabular-nums text-ink-2"> · {measured} of {detected} {detected === 1 ? 'serve' : 'serves'} measured</span>
        </span>
      </span>
      <span className="flex items-center gap-1 pl-[22px] text-ink-3" data-status="experimental" data-capture-label>
        <FlaskIcon size={14} aria-hidden="true" className="shrink-0" />
        {CAPTURE_EXPERIMENTAL}
      </span>
      {second ? (
        <span className="flex items-center gap-0.5 pl-[22px] text-ink-2">
          {second}
          {onOpen ? <CaretRightIcon size={14} aria-hidden="true" /> : null}
        </span>
      ) : null}
    </>
  )
  const classes = 'flex flex-col items-start gap-0.5 text-footnote text-left'
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cx(classes, 'min-h-11 w-full rounded-control active:bg-surface-2')}>
      {content}
    </button>
  ) : (
    <p className={classes}>{content}</p>
  )
}
