import { CheckIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import { cx } from './cx.ts'

export type StageState = 'done' | 'active' | 'waiting' | 'paused' | 'failed'

export interface Stage {
  id: string
  /** "Finding serves", "Tracking the toss", "Timing each phase", "Choosing your focus" (ARCHITECTURE §5.8). */
  label: string
  state: StageState
  /** 0..1 progress of this stage when active (determinate ring). */
  fraction?: number
  /** Live detail, tabular: "9 found", "serve 7 of 12", or elapsed time when a stage cannot report. */
  detail?: string
}

export interface ProgressStagesProps {
  stages: Stage[]
  /** 0..1 overall progress, monotonic. */
  overall: number
  /** Shown only after 5 s of measured throughput: "About 1 minute left". */
  eta?: string
  className?: string
}

/** 20 px determinate ring (a data drawing, not an icon). */
function Ring({ fraction }: { fraction: number }) {
  const r = 8
  const c = 2 * Math.PI * r
  const f = Math.min(1, Math.max(0, fraction))
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3" />
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--ink)" strokeWidth="3" strokeDasharray={`${c * f} ${c}`} strokeLinecap="round" />
    </svg>
  )
}

/**
 * Staged processing indicator (DESIGN §8.18): four stage rows (done CheckIcon, active determinate
 * ring, waiting outline circle) and an overall 6 px bar with a percentage. No indeterminate spinners.
 * Stage changes are announced politely; the percentage is not announced continuously.
 */
export function ProgressStages({ stages, overall, eta, className }: ProgressStagesProps) {
  const reduce = useReducedMotion()
  const pct = Math.round(Math.min(1, Math.max(0, overall)) * 100)
  const active = stages.find((s) => s.state === 'active' || s.state === 'paused' || s.state === 'failed')
  return (
    <div className={cx('flex flex-col gap-4', className)}>
      <ol className="flex flex-col">
        {stages.map((s) => (
          <li key={s.id} className="flex min-h-14 items-center gap-3" aria-current={s.state === 'active' ? 'step' : undefined}>
            {s.state === 'done' ? (
              <CheckIcon size={20} aria-hidden="true" className="shrink-0 text-ink" />
            ) : s.state === 'active' ? (
              <Ring fraction={s.fraction ?? 0} />
            ) : s.state === 'failed' ? (
              <WarningCircleIcon size={20} aria-hidden="true" className="shrink-0 text-attention" />
            ) : (
              <span aria-hidden="true" className="size-5 shrink-0 rounded-full border-2 border-line-strong" />
            )}
            <span className={cx('flex-1 text-headline', s.state === 'waiting' ? 'text-ink-3' : 'text-ink')}>
              {s.label}
              <span className="sr-only">
                {s.state === 'done' ? ', done' : s.state === 'active' ? ', in progress' : s.state === 'paused' ? ', paused' : s.state === 'failed' ? ', stopped' : ', waiting'}
              </span>
            </span>
            {s.detail ? <span className="text-footnote tabular-nums text-ink-2">{s.detail}</span> : null}
          </li>
        ))}
      </ol>
      <div>
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Analysis progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className={cx('h-full w-full origin-left rounded-full bg-ink dark:bg-optic court:bg-ink', !reduce && 'transition-transform duration-[250ms] ease-standard')}
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
          <span className="w-10 text-right text-footnote tabular-nums text-ink-2" aria-hidden="true">
            {pct}%
          </span>
        </div>
        {eta ? <p className="mt-2 text-footnote text-ink-2">{eta}</p> : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {active ? active.label : ''}
      </p>
    </div>
  )
}
