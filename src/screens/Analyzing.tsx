import { Suspense, lazy, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import '../styles/analysing.css'
import '../styles/player.css'
import { Icon } from '../components/primitives'
import LiveBody from '../components/LiveBody'
import type { AnalyzeProgress, Step } from '../lib/analysis/analyze'
import { MIN_COMPARABLE_SERVES } from '../lib/analysis/consistency'
import { estimateLine, timingsOf } from '../lib/analysis/timings'
import type { Frame, PhaseId } from '../lib/analysis/types'
import type { Session } from '../lib/storage/db'

// Its own chunk: it carries the captured serve.
const TeachStage = lazy(() => import('../components/TeachStage'))

const STEPS: Step[] = ['engine', 'reading', 'scanning', 'tracking', 'measuring']

/**
 * What the coach is looking for, one thing at a time, so a wait on a slow phone
 * teaches the player how to read their own serve. Before the tracker starts each
 * stands on a real serve stopped at that moment, with the part it reads lit.
 */
const TEACH: { moment: PhaseId; title: string; text: string; parts: (racket: 'left' | 'right', toss: 'left' | 'right') => string[] }[] = [
  {
    moment: 'trophy',
    title: 'The trophy',
    text: 'I check how far your knees bend and whether your tossing arm stays up.',
    parts: (_, toss) => ['-thigh', '-shin', `${toss}-upper`, `${toss}-fore`, `${toss}-hand`],
  },
  {
    moment: 'drop',
    title: 'The racket drop',
    text: 'I see how low the racket falls behind you. That’s where the speed starts.',
    parts: (racket) => [`${racket}-upper`, `${racket}-fore`, `${racket}-hand`],
  },
  {
    moment: 'contact',
    title: 'The ball',
    text: 'I measure how high you reach and how straight your arm is when you meet it.',
    parts: (racket) => [`${racket}-upper`, `${racket}-fore`, `${racket}-hand`],
  },
  {
    moment: 'drop',
    title: 'The legs',
    text: 'I time your legs against your arm. The push from the ground should come first.',
    parts: () => ['-thigh', '-shin'],
  },
  {
    moment: 'finish',
    title: 'Camera shake',
    text: 'No camera is perfectly steady, so I only count a change that is bigger than the shake.',
    parts: () => [],
  },
]

const ASIDE_MS = 7000

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
  /** Which hand the model serve swings with. Right when the player has not said. */
  racket?: 'left' | 'right'
  /** Said once when the screen could not be kept on (L6.4). */
  screenLine?: string
  /** This phone's past analyses, for how long this one will take (L6.9). */
  history?: readonly Session[]
  /** The engine is not cached, so this pass downloads it too. */
  cold?: boolean
  /** The bodies the tracker has read so far, in this pass. */
  live?: MutableRefObject<Frame[]>
}

const quiet = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function Analyzing({ progress, sweep, onCancel, racket = 'right', screenLine, history, cold, live }: Props) {
  // From this phone's own past passes, or nothing until there are enough (L6.9).
  const estimate = useMemo(
    () => estimateLine(timingsOf(history ?? []), { cold, serves: sweep?.total }),
    [history, cold, sweep?.total],
  )
  const aside = useTicker(TEACH.length, ASIDE_MS)
  const [seen, setSeen] = useState(false)
  // 'done' is past the end of the list, so every step reads as complete —
  // findIndex would return −1 and light step one under a full bar.
  const activeIndex =
    progress.step === 'done' ? STEPS.length : Math.max(0, STEPS.indexOf(progress.step))
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

  const teach = TEACH[aside]
  const toss = racket === 'left' ? 'right' : 'left'
  const watching = live && !quiet()
  const swingRead = progress.step === 'measuring' || progress.step === 'done'

  return (
    <div className="screen wait">
      <div className="wait-stage">
        {!seen && (
          <Suspense fallback={null}>
            <TeachStage racket={racket} moment={teach.moment} work={teach.parts(racket, toss)} label={`A real serve, at ${teach.title.toLowerCase()}.`} />
          </Suspense>
        )}
        {watching && <LiveBody feed={live} racket={racket} done={swingRead} onSeen={() => setSeen(true)} />}
        <div className="hero-veil" aria-hidden="true" />
        {seen && <p className="wait-tag">{swingRead ? 'Your whole swing' : 'This is you, as I track you'}</p>}
      </div>

      <div className="wait-foot">
        <h1 className="t-headline">{sweep ? 'Comparing your serves' : 'Checking your serve'}</h1>
        {/* Analysis takes several seconds; without this a screen-reader user
            gets silence and no idea whether anything is happening. */}
        <p className="wait-status" role="status" aria-live="polite">
          {progress.detail ?? 'Working'}
        </p>
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
        {estimate && <p className="wait-note">{estimate}</p>}
        {/* Which serves, when the sweep reads fewer than the clip holds (L2.2).
            The window is the clip's last serves, so its count is the last
            number in it. */}
        {sweep && sweep.firstNumber > 1 && (
          <p className="wait-note">
            Found {sweep.firstNumber + sweep.total - 1} serves · comparing serves {sweep.firstNumber} to{' '}
            {sweep.firstNumber + sweep.total - 1}
          </p>
        )}

        {sweep ? (
          <ol className="sweep-cells">
            {Array.from({ length: sweep.total }, (_, i) => {
              const settled = sweep.done[i]
              const number = settled?.number ?? sweep.firstNumber + i
              const unreadable = settled !== undefined && settled.score === undefined
              return (
                <li key={i} className={`sweep-cell${settled && !unreadable ? ' is-done' : ''}${unreadable ? ' is-skipped' : ''}${i === sweep.done.length ? ' is-active' : ''}`}>
                  <span className="sweep-score tnum">{settled ? (unreadable ? <Icon name="close" size={14} /> : settled.score) : ''}</span>
                  <span>Serve {number}</span>
                  {unreadable && <span className="sr-only">too unclear to score</span>}
                </li>
              )
            })}
          </ol>
        ) : (
          <section className="teach" key={aside} aria-label="What I look for">
            <span className="next-label">{teach.title}</span>
            <p>{teach.text}</p>
          </section>
        )}

        {/* The one thing on this screen the player has to do something about (L6.4). */}
        {screenLine && <p className="wait-keep">{screenLine}</p>}

        {/* Not disabled once pressed, deliberately. Disabling it would drop
            keyboard focus out of the only control on the screen, and pressing
            it again is harmless — aborting an already-aborted signal does
            nothing. The label is the acknowledgement. */}
        <button className="btn btn--quiet btn--full" onClick={onCancel}>
          {sweep?.stopping ? 'Stopping' : measured >= MIN_COMPARABLE_SERVES ? `Stop and compare these ${measured}` : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
