/**
 * The marking half of "Check this serve": a row of marks (Height, Release, Peak, Contact, Landing,
 * Radar) and the card for the current one, with what to find, which point the next tap places, and
 * the frame actions. Nothing from the app is shown here (blinding).
 */
import { CheckCircleIcon, CircleDashedIcon, CircleIcon, QuestionIcon, type Icon } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import type { AnnotatedPoint } from '../../../../data/domain.ts'
import {
  MARK_STEPS,
  progress,
  radarKmh,
  RADAR_DEVICE_LABEL,
  stepDone,
  stepFrame,
  stepStarted,
  type MarkDraft,
  type MarkStep,
  type StepId,
} from '../../../../validation/annotation/marks.ts'
import type { RadarDevice } from '../../../../validation/annotation/types.ts'
import { Button, SegmentedControl } from '../../../components/index.ts'
import { cx } from '../../../components/cx.ts'

export interface MarkPanelProps {
  draft: MarkDraft
  step: MarkStep
  onStep: (id: StepId) => void
  /** The point the next tap places. */
  target: AnnotatedPoint | null
  onTarget: (id: AnnotatedPoint) => void
  /** Current frame, or null while playing. */
  frame: number | null
  onMarkFrame: () => void
  onSure: (sure: boolean) => void
  onClear: () => void
  onRadar: (radar: MarkDraft['radar']) => void
  onGoToFrame: (frame: number) => void
}

function StepChips({ draft, current, onStep }: { draft: MarkDraft; current: StepId; onStep: (id: StepId) => void }) {
  return (
    <nav aria-label="Marks">
      <ol className="flex h-11 items-center gap-2 overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MARK_STEPS.map((s) => {
          const done = stepDone(s, draft)
          const started = stepStarted(s, draft)
          const selected = s.id === current
          const G: Icon = done ? CheckCircleIcon : started ? CircleDashedIcon : CircleIcon
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                aria-current={selected ? 'step' : undefined}
                onClick={() => onStep(s.id)}
                className={cx(
                  'relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-subhead after:absolute after:inset-x-0 after:-inset-y-1',
                  'transition-colors duration-(--dur-fast) motion-reduce:transition-none',
                  selected ? 'bg-ink font-label text-ink-inverse' : 'border-token border-line-strong text-ink hover:bg-surface-2',
                )}
              >
                <G size={16} aria-hidden="true" />
                {s.title}
                <span className="sr-only">{done ? ', marked' : started ? ', partly marked' : s.optional ? ', optional' : ', not marked'}</span>
              </button>
            </li>
          )
        })}
        <li aria-hidden="true" className="w-3 shrink-0" />
      </ol>
    </nav>
  )
}

function PointChooser({ step, draft, target, onTarget, onGoToFrame }: { step: MarkStep; draft: MarkDraft; target: AnnotatedPoint | null; onTarget: (id: AnnotatedPoint) => void; onGoToFrame: (f: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span id={`${step.id}-points`} className="text-footnote font-label text-ink-2">
        The next tap on the video marks
      </span>
      <div role="radiogroup" aria-labelledby={`${step.id}-points`} className="flex flex-wrap gap-2">
        {step.points.map((p) => {
          const placed = draft.points[p.id]
          const selected = p.id === target
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onTarget(p.id)
                if (placed) onGoToFrame(placed.frameIndex)
              }}
              className={cx(
                'relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-subhead after:absolute after:inset-x-0 after:-inset-y-1',
                selected ? 'bg-ink font-label text-ink-inverse' : 'border-token border-line-strong text-ink hover:bg-surface-2',
              )}
            >
              {placed ? <CheckCircleIcon size={16} aria-hidden="true" /> : <CircleIcon size={16} aria-hidden="true" />}
              {p.label}
              {p.optional ? <span className="text-ink-3">(optional)</span> : null}
              <span className="sr-only">{placed ? `, marked on frame ${placed.frameIndex}` : ', not marked'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RadarForm({ draft, onRadar }: { draft: MarkDraft; onRadar: (r: MarkDraft['radar']) => void }) {
  const id = useId()
  const [text, setText] = useState(draft.radar ? String(draft.radar.value) : '')
  const [unit, setUnit] = useState<'km/h' | 'mph'>(draft.radar?.unit ?? 'km/h')
  const [device, setDevice] = useState<RadarDevice>(draft.radar?.device ?? 'pocket-radar')
  const [error, setError] = useState<string | null>(null)

  const apply = (t: string, u: 'km/h' | 'mph', d: RadarDevice) => {
    if (!t.trim()) {
      setError(null)
      onRadar(undefined)
      return
    }
    const value = Number(t.replace(',', '.'))
    const r = radarKmh(value, u)
    if ('error' in r) {
      setError(r.error)
      onRadar(undefined)
    } else {
      setError(null)
      onRadar({ value, unit: u, device: d })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-speed`} className="text-footnote font-label text-ink-2">
          Peak speed
        </label>
        <input
          id={`${id}-speed`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setText(e.target.value)
            apply(e.target.value, unit, device)
          }}
          className="h-13 w-full rounded-control border-token border-line-strong bg-surface px-4 text-body text-ink tabular-nums"
        />
        {error ? (
          <p id={`${id}-error`} className="text-footnote text-critical">
            {error}
          </p>
        ) : null}
        <p id={`${id}-help`} className="text-footnote text-ink-3">
          The number the radar showed for this serve. It is saved as you logged it, next to the serve.
        </p>
      </div>
      <SegmentedControl
        label="Unit"
        options={[
          { value: 'km/h', label: 'km/h' },
          { value: 'mph', label: 'mph' },
        ]}
        value={unit}
        onChange={(u) => {
          setUnit(u)
          apply(text, u, device)
        }}
      />
      <SegmentedControl
        label="Radar"
        options={(Object.keys(RADAR_DEVICE_LABEL) as RadarDevice[]).map((d) => ({ value: d, label: RADAR_DEVICE_LABEL[d] }))}
        value={device}
        onChange={(d) => {
          setDevice(d)
          apply(text, unit, d)
        }}
      />
    </div>
  )
}

export function MarkPanel({ draft, step, onStep, target, onTarget, frame, onMarkFrame, onSure, onClear, onRadar, onGoToFrame }: MarkPanelProps) {
  const { done, total } = progress(draft)
  const event = step.event ? draft.events[step.event] : undefined
  const marked = stepFrame(step, draft)
  const index = MARK_STEPS.findIndex((s) => s.id === step.id)
  const next = MARK_STEPS[index + 1]
  const headingId = useId()

  return (
    <div className="flex flex-col gap-3">
      <StepChips draft={draft} current={step.id} onStep={onStep} />
      <section aria-labelledby={headingId} className="gutter flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-headline text-ink">
            {step.title}
            {step.optional ? <span className="text-ink-3"> (optional)</span> : null}
          </h2>
          <span className="shrink-0 text-footnote tabular-nums text-ink-2">
            {done} of {total} marked
          </span>
        </div>
        <p className="text-callout text-ink-2">{step.instruction}</p>

        {step.points.length ? <PointChooser step={step} draft={draft} target={target} onTarget={onTarget} onGoToFrame={onGoToFrame} /> : null}

        {step.id === 'radar' ? <RadarForm key="radar" draft={draft} onRadar={onRadar} /> : null}

        {step.event ? (
          <div className="flex flex-col gap-2">
            <p className="text-footnote text-ink-2" aria-live="polite">
              {event ? (
                <>
                  Marked on frame <span className="tabular-nums">{event.frameIndex}</span>
                  {frame !== null && frame !== event.frameIndex ? (
                    <>
                      {' · '}
                      <button type="button" onClick={() => onGoToFrame(event.frameIndex)} className="-my-3 h-11 font-label text-ink underline underline-offset-[3px]">
                        Go to it
                      </button>
                    </>
                  ) : null}
                </>
              ) : frame === null ? (
                'Pause to mark a frame.'
              ) : (
                'Not marked yet.'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" compact fullWidth={false} disabled={frame === null} onClick={onMarkFrame}>
                {frame === null ? 'Mark frame' : `Mark frame ${frame}`}
              </Button>
              {event ? (
                <button
                  type="button"
                  aria-pressed={!event.sure}
                  onClick={() => onSure(!event.sure)}
                  className={cx(
                    'relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-subhead after:absolute after:inset-x-0 after:-inset-y-1',
                    !event.sure ? 'bg-ink font-label text-ink-inverse' : 'border-token border-line-strong text-ink hover:bg-surface-2',
                  )}
                >
                  <QuestionIcon size={16} aria-hidden="true" />
                  Not sure
                </button>
              ) : null}
            </div>
          </div>
        ) : step.points.length && marked !== null && frame !== null && frame !== marked ? (
          <p className="text-footnote text-ink-2">
            Marked on frame <span className="tabular-nums">{marked}</span>
            {' · '}
            <button type="button" onClick={() => onGoToFrame(marked)} className="-my-3 h-11 font-label text-ink underline underline-offset-[3px]">
              Go to it
            </button>
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {stepStarted(step, draft) ? (
            <Button variant="tertiary" onClick={onClear}>
              Clear
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button variant="tertiary" onClick={() => onStep(next.id)}>
              {`Next: ${next.title}`}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
