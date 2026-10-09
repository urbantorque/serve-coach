import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/primitives'
import type { AnalyzeProgress, Step } from '../lib/analysis/analyze'
import { MIN_COMPARABLE_SERVES } from '../lib/analysis/consistency'
import { clipLabel } from '../lib/clipLabel'
import { PLACEMENT } from '../lib/placement'

const STEPS: { id: Step; label: string }[] = [
  { id: 'engine', label: 'Loading the coach' },
  { id: 'reading', label: 'Reading your video' },
  { id: 'scanning', label: 'Finding the serve' },
  { id: 'tracking', label: 'Tracking your body' },
  { id: 'measuring', label: 'Measuring the fundamentals' },
]

/**
 * Rotating notes, so a slow first run on a phone still feels like progress.
 *
 * They were indexed by step, so on a long "Tracking your body" the same line
 * sat on screen for most of the wait and the rotation the comment promised
 * never happened. They now turn on a timer (`ASIDE_MS`), and the step no
 * longer decides which one shows.
 */
const ASIDES = [
  'Everything runs on your device. Nothing is uploaded.',
  'The racket hand’s highest point marks contact.',
  'The lowest point of your bend is what gets measured.',
  'Your hips and shoulders are tracked as they turn.',
  `Filming side-on, ${PLACEMENT.distance} away, gives the sharpest read.`,
  'Every height counts against your own body, not in metres.',
]

const ASIDE_MS = 6000

/** An index that moves on every `ms`, for as long as the screen is up. */
function useTicker(count: number, ms: number): number {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % count), ms)
    return () => clearInterval(t)
  }, [count, ms])
  return i
}

/**
 * A basket sweep filling in, one serve at a time.
 *
 * The five step labels are the wrong shape for a sweep: they run start to
 * finish once per serve, so a player comparing six serves watches them cycle
 * six times and learns nothing from any lap. What they want to know is how many
 * serves are done and what those came out at — which the sweep already knows
 * serve by serve, and used to keep to itself until the last one landed.
 */
export interface SweepProgress {
  /** Serves this sweep set out to measure. */
  total: number
  /**
   * The clip number of the first serve in the sweep window, one-based.
   *
   * Comes from `sweepWindow`, not from counting rows: the sweep covers the last
   * few serves of a long basket, so the first row is routinely serve five.
   */
  firstNumber: number
  /** One entry per serve that has settled, in the order they were measured. */
  done: { number: number; score?: number }[]
  /**
   * The player has pressed stop and the sweep has not unwound yet.
   *
   * `stopSweep` only aborts a signal. That signal is read at the seek checks
   * inside the extraction pass, so the gap between the press and the screen
   * changing is the remainder of one serve — during which the rows kept filling
   * and the button kept offering to do the thing it had already been asked to
   * do. A control with no acknowledgement reads as a control that did not work,
   * and this is the only control on the most expensive screen in the app.
   */
  stopping?: boolean
}

interface Props {
  progress: AnalyzeProgress
  fileName: string
  sweep?: SweepProgress
  onCancel: () => void
}

export default function Analyzing({ progress, fileName, sweep, onCancel }: Props) {
  const aside = useTicker(ASIDES.length, ASIDE_MS)
  // 'done' is past the end of the list, so every step reads as complete —
  // findIndex would return −1 and light step one under a full bar.
  const activeIndex =
    progress.step === 'done' ? STEPS.length : Math.max(0, STEPS.findIndex((s) => s.id === progress.step))
  const withinStep =
    progress.step === 'done'
      ? 1
      : (activeIndex + Math.max(0, Math.min(1, progress.ratio))) / STEPS.length

  /*
   * A sweep's bar counts serves, not steps. Each serve carries its own share of
   * the bar and the one in flight fills its share as its steps run, so the bar
   * moves at roughly the rate the work is actually finishing rather than
   * snapping back to zero once per serve.
   *
   * `step === 'done'` earns the in-flight serve NOTHING here, which is the whole
   * repair. Every serve ends with `{ step: 'done', ratio: 1 }` — `analyzeServe`
   * emits it and `analyzeAllServes` forwards it verbatim — and a moment later
   * that same serve lands in `done` through `onServe`. Crediting both counted it
   * twice: on a six-serve sweep the bar hit 2/6 the instant serve one settled
   * and then fell to (1 + 0.2)/6 when serve two reached its 'engine' step. It
   * read 33 → 20 → 50 → 37 once per serve, and `aria-valuenow` said the same
   * thing out loud to anyone who could not see it. A serve's completion is
   * signalled by `done.length`; its own terminal step is the same fact arriving
   * twice.
   */
  const inFlight = progress.step === 'done' ? 0 : withinStep
  const raw = sweep
    ? Math.min(1, (sweep.done.length + (sweep.done.length < sweep.total ? inFlight : 0)) / sweep.total)
    : withinStep

  /*
   * And a floor under it, because those two facts arrive from two callbacks.
   *
   * `setProgress` and `setSweep` are separate updates. A render that catches the
   * terminal 'done' before the serve has landed in `done` would show the serve
   * that just finished as worth nothing — a drop of a whole serve's width, the
   * same defect in the other direction. Held at its high mark instead: the bar
   * can stall for a frame, it can never reverse. The ref needs no reset because
   * this screen is unmounted between sweeps — `compareServes` leaves for the
   * report or the error screen before the next one starts.
   */
  const highest = useRef(0)
  const overall = Math.max(raw, highest.current)
  highest.current = overall

  const measured = sweep?.done.filter((d) => d.score !== undefined).length ?? 0

  return (
    <div className="screen analyzing">
      <div className="analyzing-inner">
        {/* The ball, back where it was. It is the only thing on this screen
            that says "still working" without words, which is what the seconds
            between one step label and the next need — and it says it without
            being a second copy of the word the live region below is already
            reading out. */}
        <div className="pulse">
          <span className="pulse-ball" />
        </div>

        <h1>{sweep ? 'Comparing your serves' : 'Reading your serve'}</h1>
        <p className="analyzing-file">{clipLabel(fileName)}</p>
        {/* Which serves, when the sweep reads fewer than the clip holds (L2.2).
            The window is the clip's last serves, so its count is the last
            number in it. */}
        {sweep && sweep.firstNumber > 1 && (
          <p className="analyzing-file">
            Found {sweep.firstNumber + sweep.total - 1} serves · comparing {sweep.firstNumber}–
            {sweep.firstNumber + sweep.total - 1}
          </p>
        )}

        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overall * 100)}
          aria-label={sweep ? 'Comparison progress' : 'Analysis progress'}
        >
          {/* Scaled, not resized. Animating `width` costs a layout pass a frame
              on a device that is currently running pose estimation. */}
          <div className="progress-fill" style={{ transform: `scaleX(${overall})` }} />
        </div>
        {/* Analysis takes several seconds; without this a screen-reader user
            gets silence and no idea whether anything is happening. */}
        <p className="analyzing-detail" role="status" aria-live="polite">
          {progress.detail ?? 'Working'}
        </p>

        <ul className="steps">
          {sweep
            ? Array.from({ length: sweep.total }, (_, i) => {
                const settled = sweep.done[i]
                const number = settled?.number ?? sweep.firstNumber + i
                const unreadable = settled !== undefined && settled.score === undefined
                return (
                  <li
                    key={i}
                    className={`step${settled && !unreadable ? ' is-done' : ''}${
                      unreadable ? ' is-skipped' : ''
                    }${i === sweep.done.length ? ' is-active' : ''}`}
                  >
                    {/* The mark's colour for an unreadable serve is
                        `.step.is-skipped` in analysing.css — a row with nothing
                        in it rather than a failure state. */}
                    <span className="step-mark">
                      {settled ? (
                        <Icon name={unreadable ? 'close' : 'check'} size={13} />
                      ) : (
                        <span className="step-dot" />
                      )}
                    </span>
                    {/* One flex child, so the score sits against its label
                        rather than a row gap away from it. */}
                    <span>
                      Serve {number}
                      {settled &&
                        (settled.score === undefined ? (
                          ' · too unclear to read'
                        ) : (
                          <>
                            {' · '}
                            <span className="tnum">{settled.score}</span>
                          </>
                        ))}
                    </span>
                  </li>
                )
              })
            : STEPS.map((s, i) => (
                <li
                  key={s.id}
                  className={`step${i < activeIndex ? ' is-done' : ''}${i === activeIndex ? ' is-active' : ''}`}
                >
                  <span className="step-mark">
                    {i < activeIndex ? <Icon name="check" size={13} /> : <span className="step-dot" />}
                  </span>
                  {s.label}
                </li>
              ))}
        </ul>

        <p className="analyzing-aside" key={sweep ? 'sweep' : aside}>
          {sweep
            ? 'Each serve is read on its own, then the spread across them is compared.'
            : ASIDES[aside]}
        </p>

        {/* What stopping actually does, said before they press it. Two serves
            is the point at which there is a spread to compare — below it,
            stopping leaves the report exactly as they left it, so the button
            does not promise a comparison that cannot be built. */}
        {/* Not disabled once pressed, deliberately. Disabling it would drop
            keyboard focus out of the only control on the screen, and pressing
            it again is harmless — aborting an already-aborted signal does
            nothing. The label is the acknowledgement. */}
        <button className="btn btn--ghost" onClick={onCancel}>
          {sweep?.stopping
            ? 'Stopping'
            : measured >= MIN_COMPARABLE_SERVES
              ? `Stop and compare these ${measured}`
              : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
