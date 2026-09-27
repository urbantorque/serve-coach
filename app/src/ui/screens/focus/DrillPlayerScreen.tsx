import { ArrowCounterClockwiseIcon, CaretDownIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, TimerIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { DrillChoice } from '../../../coaching/index.ts'
import { Button, cx, DelayedSkeleton, EmptyState, IconButton, SampleBanner, Screen, Sheet, Skeleton } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { BodyCheckSheet } from './components/BodyCheckSheet.tsx'
import { DRILL_COPY, FOCUS_COPY } from './copy.ts'
import { useFocusModel, type FocusModel } from './useFocus.ts'

/** Router state handed to the practice log (COACHING §12.2 prefill). */
export interface DrillResult {
  from: 'drill'
  minutes: number
  successes?: number
  of?: number
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Keeps the screen awake while the timer runs, where the browser supports it. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    let cancelled = false
    navigator.wakeLock
      .request('screen')
      .then((l) => {
        if (cancelled) void l.release()
        else lock = l
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      void lock?.release().catch(() => undefined)
    }
  }, [active])
}

/**
 * Drill player (DESIGN §10.9; PRODUCT §6.8.2): full screen, one step at a time, a count-down timer, a
 * big counter for the success criterion, the cue as a reminder, and a pain stop that always shows.
 * The body-check sheet sits outside the page so a referral (which pauses coaching and replaces the
 * page) never unmounts it before its card, including Call 000, has shown.
 */
export function DrillPlayerScreen() {
  const model = useFocusModel()
  const navigate = useNavigate()
  const [hurts, setHurts] = useState(false)
  const [stopSignal, setStopSignal] = useState(0)
  return (
    <>
      <DrillPage model={model} onHurts={() => setHurts(true)} stopSignal={stopSignal} />
      <BodyCheckSheet
        open={hurts}
        onClose={() => setHurts(false)}
        start="question"
        profile={model.profile}
        onDone={(a) => {
          setStopSignal((n) => n + 1)
          if (a === 'referral') navigate(paths.focus())
        }}
      />
    </>
  )
}

function DrillPage({ model, onHurts, stopSignal }: { model: FocusModel; onHurts: () => void; stopSignal: number }) {
  const navigate = useNavigate()
  const close = <IconButton icon={XIcon} label={DRILL_COPY.closeLabel} to={paths.focus()} />
  if (model.status === 'loading') {
    return (
      <Screen title="Drill" leading={close}>
        <DelayedSkeleton>
          <Skeleton variant="block" className="h-24" />
          <Skeleton variant="text" className="mt-4" />
        </DelayedSkeleton>
      </Screen>
    )
  }
  const d = model.decision
  if (!d || (d.kind !== 'focus' && d.kind !== 'keep-going')) {
    const paused = d?.kind === 'referral'
    return (
      <Screen title="Drill" leading={close}>
        <EmptyState
          icon={TimerIcon}
          title={paused ? FOCUS_COPY.pausedTitle : 'No drill right now'}
          body={paused ? 'No drills while coaching is paused. Your stats are safe.' : 'Record a session first, and we will pick one drill for you.'}
          action={
            <Button variant="secondary" onClick={() => navigate(paths.focus())}>
              Back to focus
            </Button>
          }
        />
      </Screen>
    )
  }
  return <Player drill={d.drill} cue={d.cue.text} isDemo={model.isDemo} onHurts={onHurts} stopSignal={stopSignal} />
}

function Player({ drill, cue, isDemo, onHurts, stopSignal }: { drill: DrillChoice; cue: string; isDemo: boolean; onHurts: () => void; stopSignal: number }) {
  const navigate = useNavigate()
  const total = drill.minutes * 60_000
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [count, setCount] = useState(0)
  const [leaving, setLeaving] = useState(false)
  // Any body-check answer pauses the timer (adjusting state during render).
  const [seenStop, setSeenStop] = useState(stopSignal)
  if (stopSignal !== seenStop) {
    setSeenStop(stopSignal)
    setRunning(false)
  }
  const startRef = useRef<number | null>(null)
  const baseRef = useRef(0)
  useWakeLock(running)

  useEffect(() => {
    if (!running) return
    startRef.current = performance.now()
    baseRef.current = elapsed
    const id = window.setInterval(() => {
      if (startRef.current !== null) setElapsed(baseRef.current + performance.now() - startRef.current)
    }, 250)
    return () => window.clearInterval(id)
    // elapsed is read once when the timer starts; the interval owns it afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const remaining = total - elapsed
  const last = step === drill.steps.length - 1
  const counter = drill.counter
  const minutesDone = Math.max(1, Math.round(elapsed / 60_000))

  const finish = () => {
    const state: DrillResult = { from: 'drill', minutes: elapsed > 0 ? minutesDone : drill.minutes, ...(counter ? { successes: count, of: counter.of } : {}) }
    navigate(paths.practiceLog(), { state })
  }
  const onClose = () => {
    if (elapsed > 60_000) setLeaving(true)
    else navigate(paths.focus())
  }

  return (
    <Screen
      title="Drill"
      leading={<IconButton icon={XIcon} label={DRILL_COPY.closeLabel} onClick={onClose} />}
      banner={isDemo ? <SampleBanner /> : undefined}
      className="gap-6"
      bottomAction={
        <>
          {last ? (
            <Button onClick={finish}>{DRILL_COPY.finish}</Button>
          ) : (
            <Button variant="secondary" onClick={() => setStep(step + 1)}>
              {DRILL_COPY.nextStep}
            </Button>
          )}
          <Button variant="tertiary" onClick={onHurts} className="self-center">
            {DRILL_COPY.somethingHurts}
          </Button>
        </>
      }
    >
      <h2 className="-mb-2 text-center text-headline text-ink">{drill.name} · {drill.minutes} min</h2>
      <section className="flex flex-col items-center gap-3" aria-label="Timer">
        <p className={cx('text-timer font-wide tabular-nums', remaining <= 0 ? 'text-ink-3' : 'text-ink')} role="timer" aria-live="off">
          {fmt(remaining)}
        </p>
        <div className="flex items-center gap-3">
          <Button variant="secondary" compact fullWidth={false} icon={running ? PauseIcon : PlayIcon} onClick={() => setRunning(!running)}>
            {running ? DRILL_COPY.pause : elapsed > 0 ? DRILL_COPY.resume : DRILL_COPY.start}
          </Button>
          {elapsed > 0 && !running ? <IconButton icon={ArrowCounterClockwiseIcon} label="Reset timer" onClick={() => setElapsed(0)} /> : null}
        </div>
        <p className="min-h-5 text-footnote text-ink-3" aria-live="polite">
          {remaining <= 0 ? DRILL_COPY.timeUp : !running && elapsed > 0 ? DRILL_COPY.paused(step + 1, fmt(remaining)) : ''}
        </p>
      </section>

      <section className="flex flex-col gap-2" aria-live="polite" aria-label="Current step">
        <p className="text-footnote tabular-nums text-ink-3">{DRILL_COPY.step(step + 1, drill.steps.length)}</p>
        {step === 0 ? (
          <details className="group text-callout text-ink-2">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-headline text-ink [&::-webkit-details-marker]:hidden">
              {DRILL_COPY.setup}
              <CaretDownIcon size={16} aria-hidden="true" className="transition-transform duration-(--dur-fast) group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <p className="pb-2">{drill.setup}</p>
            <p className="pb-2 text-footnote">{`Goal: ${drill.successCriterion}`}</p>
          </details>
        ) : null}
        <p className="text-title-2 text-ink">{drill.steps[step]}</p>
        {step > 0 ? (
          <Button variant="tertiary" onClick={() => setStep(step - 1)} className="self-start">
            {DRILL_COPY.previousStep}
          </Button>
        ) : null}
      </section>

      {counter ? (
        <section className="flex flex-col items-center gap-3" aria-label={counter.label}>
          <p className="text-footnote font-label text-ink-2">{counter.label}</p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setCount(Math.max(0, count - 1))}
              aria-label={`One fewer: ${counter.label}`}
              className="grid size-16 place-items-center rounded-full border-token border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2"
            >
              <MinusIcon size={28} aria-hidden="true" />
            </button>
            <p className="min-w-28 text-center tabular-nums" aria-live="polite" aria-label={DRILL_COPY.counterAria(counter.label, count, counter.of)}>
              <span className="text-metric-hero font-wide text-ink">{count}</span>
              <span className="text-subhead text-ink-2"> of {counter.of}</span>
            </p>
            <button
              type="button"
              onClick={() => setCount(count + 1)}
              aria-label={`One more: ${counter.label}`}
              className="grid size-22 place-items-center rounded-full bg-ink text-ink-inverse transition-transform duration-(--dur-press) hover:opacity-90 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <PlusIcon size={36} aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      <p className="text-center text-callout text-ink-2" data-cue>
        “{cue}”
      </p>

      <Sheet open={leaving} onClose={() => setLeaving(false)} title={DRILL_COPY.leaveTitle}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-callout text-ink">{DRILL_COPY.leaveBody(minutesDone)}</p>
          <Button onClick={finish}>{DRILL_COPY.leaveSave}</Button>
          <Button variant="secondary" onClick={() => navigate(paths.focus())}>
            {DRILL_COPY.leaveDiscard}
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}
