import { CaretLeftIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { BottomActionBar, IconButton } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { STEPS, type StepId } from './model.ts'

/**
 * Progress dots (DESIGN §10.1): nine 6 px dots 8 px apart; done --ink-3 fill, current --ink fill,
 * upcoming a 1 px --line-strong ring. No "Step 3 of 9" text on screen; the accessible name says it.
 */
export function ProgressDots({ step }: { step: StepId }) {
  const current = STEPS.indexOf(step)
  return (
    <div role="img" aria-label={`Question ${current + 1} of ${STEPS.length}`} className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <span
          key={s}
          aria-hidden="true"
          className={cx(
            'size-1.5 rounded-full',
            i < current && 'bg-ink-3',
            i === current && 'bg-ink',
            i > current && 'border border-line-strong court:border-2',
          )}
        />
      ))}
    </div>
  )
}

export interface FrameProps {
  /** Dots show for O2 to O9. */
  step?: StepId
  /** Back to the previous question (always, except O1). */
  onBack?: () => void
  /** "Leave set-up": keeps the answers so far and goes to Today. */
  onLeave?: () => void
  /** The h1. One question per screen (title-1). */
  title: ReactNode
  /** Visually hidden title (O1 shows the wordmark instead). */
  titleHidden?: boolean
  /** Inline "We couldn't save that" error under the question. */
  error?: string | null
  children?: ReactNode
  /** Bottom action bar content (primary Continue, tertiary Skip). */
  actions?: ReactNode
}

/**
 * Question screen template (DESIGN §10.1): Back + progress dots in the bar, the question in title-1,
 * answers below, and the bottom action bar. The tab bar is hidden on onboarding (routes.ts).
 */
export function Frame({ step, onBack, onLeave, title, titleHidden, error, children, actions }: FrameProps) {
  const bar = Boolean(step || onBack || onLeave)
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {bar ? (
        <header className="sticky top-0 z-(--z-sticky) glass pad-safe-top">
          <div className="gutter relative mx-auto flex h-13 max-w-(--content-max) items-center justify-between">
            <div className="flex min-w-11 items-center">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="-ml-2 inline-flex h-11 min-w-11 items-center gap-0.5 rounded-control pr-2 text-subhead text-ink hover:bg-surface-2 active:bg-surface-2"
                >
                  <CaretLeftIcon aria-hidden="true" />
                  <span>Back</span>
                </button>
              ) : null}
            </div>
            {step ? (
              <div className="absolute left-1/2 -translate-x-1/2">
                <ProgressDots step={step} />
              </div>
            ) : null}
            <div className="flex min-w-11 items-center justify-end">
              {onLeave ? <IconButton icon={XIcon} label="Leave set-up for now" onClick={onLeave} className="-mr-2" /> : null}
            </div>
          </div>
        </header>
      ) : (
        <div className="pad-safe-top" aria-hidden="true" />
      )}
      <div className={cx('gutter mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-6 pb-8', bar ? 'pt-4' : 'pt-10')}>
        <h1 className={titleHidden ? 'sr-only' : 'text-title-1 text-ink'}>{title}</h1>
        {error ? (
          <p role="alert" className="-mt-3 flex items-center gap-1.5 text-footnote text-critical">
            <WarningCircleIcon size={16} aria-hidden="true" className="shrink-0" />
            {error}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? <BottomActionBar>{actions}</BottomActionBar> : null}
    </div>
  )
}

/** Helper line under a disabled Continue (DESIGN §8.3: disabled buttons name the reason). */
export function Helper({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="-mt-1 text-center text-footnote text-ink-3">
      {children}
    </p>
  )
}
