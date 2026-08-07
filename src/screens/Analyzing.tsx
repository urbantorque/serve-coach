import { Icon } from '../components/primitives'
import type { AnalyzeProgress, Step } from '../lib/analysis/analyze'

const STEPS: { id: Step; label: string }[] = [
  { id: 'engine', label: 'Loading the coach' },
  { id: 'reading', label: 'Reading your video' },
  { id: 'scanning', label: 'Finding the serve' },
  { id: 'tracking', label: 'Tracking your body' },
  { id: 'measuring', label: 'Measuring the fundamentals' },
]

/** Rotating notes, so a slow first run on a phone still feels like progress. */
const ASIDES = [
  'Everything runs on your device — nothing is uploaded.',
  'The racket hand’s highest point marks contact.',
  'Knee bend is measured at your deepest load.',
  'Hip and shoulder rotation are read in three dimensions.',
]

interface Props {
  progress: AnalyzeProgress
  fileName: string
  onCancel: () => void
}

export default function Analyzing({ progress, fileName, onCancel }: Props) {
  const activeIndex = Math.max(0, STEPS.findIndex((s) => s.id === progress.step))
  const overall =
    progress.step === 'done'
      ? 1
      : (activeIndex + Math.max(0, Math.min(1, progress.ratio))) / STEPS.length

  return (
    <div className="screen analyzing">
      <div className="analyzing-inner">
        <div className="pulse">
          <span className="pulse-ball" />
        </div>

        <h1>Reading your serve</h1>
        <p className="analyzing-file">{fileName}</p>

        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overall * 100)}
          aria-label="Analysis progress"
        >
          <div className="progress-fill" style={{ width: `${Math.round(overall * 100)}%` }} />
        </div>
        {/* Analysis takes several seconds; without this a screen-reader user
            gets silence and no idea whether anything is happening. */}
        <p className="analyzing-detail" role="status" aria-live="polite">
          {progress.detail ?? 'Working'}
        </p>

        <ul className="steps">
          {STEPS.map((s, i) => (
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

        <p className="analyzing-aside">{ASIDES[activeIndex % ASIDES.length]}</p>

        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
