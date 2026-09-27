import {
  ArrowsClockwiseIcon,
  CaretRightIcon,
  ChatTextIcon,
  FirstAidIcon,
  HeartbeatIcon,
  TargetIcon,
  TimerIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { CameraOrientation, MetricId, MetricValue as MetricValueData } from '../../../analysis/types.ts'
import type { CoachingDecision, Experiment } from '../../../data/domain.ts'
import { Button, EvidenceTierChip, MetricValue, Sheet } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { metricName } from '../../copy/metricNames.ts'
import { PHASE_LABEL } from '../../copy/strings.ts'
import { paths } from '../../shell/paths.ts'
import { stratumWords } from '../progress/insights/history.ts'
import { KeyFrameById } from '../progress/insights/ui.tsx'
import { tiltHint } from '../record/import/hints.ts'
import { FOCUS_COPY } from '../focus/copy.ts'

export interface EvidenceStat {
  metricId: MetricId
  value: MetricValueData
}

export interface FocusCardProps {
  decision: CoachingDecision
  variant: 'full' | 'compact'
  /** Orientation of the clip the evidence frames come from (D1: portrait is the default set-up). */
  orientation: CameraOrientation
  /** 1 or 2 stats for the evidence, measured or estimated only (COACHING §8.2). */
  stats?: EvidenceStat[]
  experiment?: Experiment | null
  /** Practice logs since the focus started (decides the primary: Start drill vs Record re-test). */
  practiceCount?: number
  /** Sample (demo) preview: no drill or re-test actions. */
  sample?: boolean
  /** Only on Today: the one primary button of the screen lives on this card. */
  showPrimary?: boolean
}

/** Only measured or estimated stats are evidence (research 09 §9; COACHING §8.2). */
const usable = (s: EvidenceStat) => s.value.status === 'measured' || s.value.status === 'estimated'

/**
 * Focus card (DESIGN §8.8; PRODUCT §6.8.1): one change, its evidence (two key frames and one or two
 * stats), one cue and one drill. `compact` is the Session report variant: no buttons other than
 * "See the drill". Other decision kinds share the shell (keep going, capture fix, referral).
 */
export function FocusCard({ decision, variant, orientation, stats = [], experiment, practiceCount = 0, sample = false, showPrimary = true }: FocusCardProps) {
  const [why, setWhy] = useState(false)
  if (decision.gate === 'pain-referral') return <PainPauseCard message={decision.referral?.message} />
  if (decision.gate === 'low-confidence' || decision.gate === 'too-few-serves') {
    return <CaptureFixCard sample={sample} showPrimary={showPrimary && variant === 'full'} trace={decision.trace} captureFix={decision.captureFix} />
  }
  // A keep-going decision is stored with focus.faultId 'none' (coaching/record.ts): no cue, no drill (DESIGN §8.8).
  if (!decision.focus || decision.focus.faultId === 'none') return <KeepGoingCard variant={variant} sample={sample} showPrimary={showPrimary} />

  const f = decision.focus
  const evidence = stats.filter(usable).slice(0, 2)
  const allExperimental = stats.length > 0 && evidence.length === 0
  const tier = allExperimental ? 'experimental' : f.evidenceTier
  const retestDue = practiceCount > 0
  const titleId = `focus-${decision.id}`

  if (variant === 'compact') {
    return (
      <section aria-labelledby={titleId} className="card relative flex gap-3 overflow-hidden p-4 pt-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-optic" />
        <KeyFrameById id={decision.evidence?.keyFrameId} alt="Frame from this session" size="compact" orientation={orientation} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-footnote font-label text-ink-3">
              <TargetIcon size={14} aria-hidden="true" />
              Your focus
            </span>
            <EvidenceTierChip tier={tier} />
          </span>
          <h3 id={titleId} className="text-headline text-ink text-balance">
            {f.title}
          </h3>
          {decision.cue ? <p className="line-clamp-2 text-callout text-ink-2">“{decision.cue.text}”</p> : null}
          {sample ? null : (
            <Link
              to={paths.focus()}
              className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded-control px-1 text-footnote font-label text-ink underline underline-offset-[3px] hover:bg-surface-2"
            >
              See the drill
              <CaretRightIcon size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby={titleId} className="card relative flex flex-col gap-4 overflow-hidden p-5 pt-6">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-optic" />
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-footnote font-label text-ink-3">
            <TargetIcon size={14} aria-hidden="true" />
            Your focus · {PHASE_LABEL[f.phase]}
          </span>
          <EvidenceTierChip tier={tier} />
        </span>
        <h2 id={titleId} className="text-title-1 text-ink text-balance">
          {f.title}
        </h2>
      </div>

      <div className={cx('flex gap-3', orientation === 'landscape' ? 'flex-col' : 'flex-row')}>
        <div className="flex shrink-0 gap-2">
          <figure className="flex flex-col gap-1">
            <KeyFrameById id={decision.evidence?.keyFrameId} alt="Frame from this session" size="focus" orientation={orientation} />
            <figcaption className="text-caption text-ink-3">This session</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            <KeyFrameById id={decision.evidence?.compareKeyFrameId} alt="Frame from your best serve" size="focus" orientation={orientation} />
            <figcaption className="text-caption text-ink-3">Your best</figcaption>
          </figure>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          {evidence.length ? (
            evidence.map((s) => (
              <div key={s.metricId} className="flex flex-col gap-0.5">
                <span className="text-footnote font-label text-ink-2">{metricName(s.metricId)}</span>
                <MetricValue metricId={s.metricId} value={s.value} detail />
              </div>
            ))
          ) : decision.evidence?.sentences[0] ? (
            <p className="text-callout text-ink-2">{decision.evidence.sentences[0]}</p>
          ) : null}
        </div>
      </div>

      {decision.cue || decision.drill ? <hr className="border-line" /> : null}
      {decision.cue ? (
        <p className="flex items-start gap-2 text-title-2 font-medium text-ink">
          <ChatTextIcon size={20} aria-hidden="true" className="mt-1 shrink-0 text-ink-2" />
          <span>“{decision.cue.text}”</span>
        </p>
      ) : null}
      {decision.drill ? (
        <p className="flex items-center gap-2 text-headline text-ink">
          <TimerIcon size={20} aria-hidden="true" className="shrink-0 text-ink-2" />
          <span>
            {decision.drill.title} · {decision.drill.minutes} min
          </span>
        </p>
      ) : null}

      {sample ? (
        <p className="text-footnote text-ink-3">This is the sample player's focus. Record your own serves to get yours.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {showPrimary ? (
            retestDue ? (
              <Button to={paths.record()} icon={ArrowsClockwiseIcon} fullWidth>
                Record re-test
              </Button>
            ) : (
              <Button to={paths.drill()} icon={TimerIcon} fullWidth>
                Start drill
              </Button>
            )
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {showPrimary && retestDue ? (
              <Button variant="secondary" compact fullWidth={false} to={paths.drill()}>
                Start drill
              </Button>
            ) : (
              <Button variant="secondary" compact fullWidth={false} to={paths.practiceLog()}>
                Log practice
              </Button>
            )}
            <Button variant="tertiary" onClick={() => setWhy(true)}>
              Why this focus?
            </Button>
          </div>
        </div>
      )}

      {sample ? null : (
        <>
          <hr className="border-line" />
          <div className="flex flex-col gap-1">
            {experiment ? (
              <p className="flex items-start gap-2 text-footnote text-ink-2">
                <ArrowsClockwiseIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>Re-test: 15 serves, {stratumWords(experiment.stratum).toLowerCase()}. Warm up first, and record before the drill.</span>
              </p>
            ) : null}
            <Link
              to={paths.comfort()}
              className="-ml-1 flex min-h-11 items-center gap-2 rounded-control px-1 text-footnote text-ink-2 hover:bg-surface-2"
            >
              <HeartbeatIcon size={16} aria-hidden="true" className="shrink-0" />
              <span>Sore today? Tell us before you serve</span>
              <CaretRightIcon size={14} aria-hidden="true" />
            </Link>
          </div>
        </>
      )}

      <Sheet open={why} onClose={() => setWhy(false)} title="Why this focus?">
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-callout text-ink">{f.whyChosen}</p>
          {decision.evidence?.sentences.map((s) => (
            <p key={s} className="text-callout text-ink-2">
              {s}
            </p>
          ))}
          {decision.alternatives.length ? (
            <div className="flex flex-col gap-1">
              <p className="text-footnote font-label text-ink-3">Also checked</p>
              {decision.alternatives.map((a) => (
                <p key={a.faultId} className="text-footnote text-ink-2">
                  {a.reason}
                </p>
              ))}
            </div>
          ) : null}
          <p className="text-footnote text-ink-3">We chose one change at a time, earlier parts of the serve first.</p>
        </div>
      </Sheet>
    </section>
  )
}

/** Keep going (DESIGN §8.8): nothing clear to change; never invent a flaw (COACHING §7.5). */
export function KeepGoingCard({ variant, sample, showPrimary }: { variant: 'full' | 'compact'; sample: boolean; showPrimary: boolean }) {
  return (
    <section aria-labelledby="keep-going" className="card relative flex flex-col items-start gap-2 overflow-hidden p-5 pt-6">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-optic" />
      <span className="flex items-center gap-1 text-footnote font-label text-ink-3">
        <TargetIcon size={14} aria-hidden="true" />
        Your focus
      </span>
      <h2 id="keep-going" className={variant === 'full' ? 'text-title-1 text-ink' : 'text-headline text-ink'}>
        Nothing clear to change
      </h2>
      {/* The stored keep-going record keeps no checks, so the card claims nothing it did not measure. */}
      <p className="text-callout text-ink-2">{FOCUS_COPY.keepGoingBody}</p>
      {variant === 'full' && !sample ? (
        <div className="flex w-full flex-col gap-3 pt-2">
          {showPrimary ? (
            <Button to={paths.record()} fullWidth>
              Record session
            </Button>
          ) : null}
          <Button variant="secondary" compact fullWidth={false} to={paths.practiceLog()} className="self-start">
            Log practice
          </Button>
        </div>
      ) : null}
    </section>
  )
}

/** Capture fix (gate low-confidence or too-few-serves, DESIGN §8.8). */
export function CaptureFixCard({
  sample,
  showPrimary,
  trace,
  captureFix,
}: {
  sample: boolean
  showPrimary: boolean
  trace: CoachingDecision['trace']
  captureFix?: CoachingDecision['captureFix']
}) {
  // The coaching engine's own reason and next step when stored; older records only have the trace.
  const detail = captureFix?.message ?? trace.find((t) => t.step === 'confidence' && !t.passed)?.detail
  const fix = captureFix ? tiltHint(captureFix.fix) : 'The set-up guide shows where to put the phone so the whole serve fits.'
  return (
    <section aria-labelledby="capture-fix" className="card flex flex-col items-start gap-2 p-5">
      <WarningCircleIcon size={24} aria-hidden="true" className="text-attention" />
      <h2 id="capture-fix" className="text-title-2 text-ink text-balance">
        We couldn't see enough to coach this time
      </h2>
      {detail ? <p className="text-callout text-ink-2">{detail}</p> : null}
      {fix ? <p className="text-callout text-ink-2">{fix}</p> : null}
      {showPrimary && !sample ? (
        <Button to={paths.setupChoice()} fullWidth className="mt-2">
          Set up camera
        </Button>
      ) : (
        <Button variant="tertiary" to={paths.setupChoice()}>
          See set-up tips
        </Button>
      )}
    </section>
  )
}

/** COACHING §10.3 "Stop and book" referral text, verbatim (used when the decision carries none). */
const STOP_AND_BOOK =
  "Pain that's sharp, getting worse, waking you at night or hanging around is worth getting checked by a GP, physiotherapist or sports doctor."

/**
 * Pain pause (DESIGN §8.8 referral variant; PRODUCT §6.16, §7.7): replaces the focus card. No cue,
 * drill or re-test anywhere while it is active. Routes to a qualified professional, never a diagnosis.
 */
export function PainPauseCard({ message }: { message?: string }) {
  return (
    <section aria-labelledby="pain-pause" className="card flex flex-col items-start gap-3 bg-critical-soft p-5">
      <FirstAidIcon size={32} aria-hidden="true" className="text-critical" />
      <h2 id="pain-pause" className="text-title-2 text-ink">
        Coaching is paused. Your stats are safe.
      </h2>
      <p className="text-callout text-ink">
        {message ?? STOP_AND_BOOK}
      </p>
      <Button variant="secondary" fullWidth={false} to={paths.comfort()}>
        It's settled
      </Button>
    </section>
  )
}
