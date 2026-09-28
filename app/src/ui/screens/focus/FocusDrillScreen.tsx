import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  ChatTextIcon,
  FirstAidIcon,
  FlagPennantIcon,
  HeartbeatIcon,
  InfoIcon,
  PushPinIcon,
  TargetIcon,
  TimerIcon,
  VideoCameraIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useId, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PAUSE_LINE, REFERRAL_COPY, type CaptureFixDecision, type FocusDecision, type KeepGoingDecision } from '../../../coaching/index.ts'
import { loadDemoData, showToast } from '../../../data/index.ts'
import {
  Badge,
  Button,
  Card,
  cx,
  DelayedSkeleton,
  EmptyState,
  EvidenceTierChip,
  IconButton,
  MetricValue,
  SampleBanner,
  Screen,
  SectionLabel,
  Sheet,
  Skeleton,
  VerdictChip,
} from '../../components/index.ts'
import { metricName } from '../../copy/metricNames.ts'
import { PHASE_LABEL } from '../../copy/strings.ts'
import { shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { ensureExperiment, persistCueSwap } from './actions.ts'
import { BodyCheckSheet, ReferralContent, type BodyCheckStart } from './components/BodyCheckSheet.tsx'
import { EvidencePair } from './components/EvidencePair.tsx'
import { PreMatchCard, WarmUpSteps } from './components/WarmUp.tsx'
import { WhySheet } from './components/WhySheet.tsx'
import { evidenceCountLine, FOCUS_COPY, type SessionServeCounts } from './copy.ts'
import { todayYmd, useFocusStore } from './focusStore.ts'
import { useFocusModel, type FocusModel } from './useFocus.ts'

/**
 * Focus & drill (DESIGN §10.9, §8.8; PRODUCT §6.8.1; COACHING §8): one focus, the player's own
 * evidence, one cue and one drill, then Start drill. Every other decision kind (keep going, capture
 * fix, referral pause, match day, not available) uses the same page shell.
 */
export function FocusDrillScreen() {
  const model = useFocusModel()
  // Today's pause card links here with ?body=settle, so "It's settled" runs the body check (DESIGN §8.8).
  const [params, setParams] = useSearchParams()
  const [body, setBody] = useState<BodyCheckStart | null>(() => (params.get('body') === 'settle' ? 'settle' : null))
  const closeBody = () => {
    setBody(null)
    if (params.has('body')) setParams({}, { replace: true })
  }
  return (
    <>
      <FocusPage model={model} onBody={setBody} />
      <BodyCheckSheet open={body !== null} onClose={closeBody} start={body ?? 'question'} profile={model.profile} previousLevel={model.referral} />
    </>
  )
}

/** The page for the current decision; the body-check sheet lives outside it so a referral never unmounts it. */
function FocusPage({ model, onBody }: { model: FocusModel; onBody: (s: BodyCheckStart) => void }) {
  const setBody = onBody
  const back = { to: paths.today(), label: 'Today' }
  const banner = model.isDemo && model.status === 'ready' ? <SampleBanner /> : undefined

  if (model.status === 'loading') {
    return (
      <Screen title={FOCUS_COPY.screenTitle} back={back}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-4">
            <Skeleton variant="text" className="w-2/3" />
            <Skeleton variant="tile" className="h-72" />
            <Skeleton variant="text" />
            <Skeleton variant="text" className="w-4/5" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }

  const d = model.decision

  if (model.status === 'empty' || !d) {
    return (
      <Screen title={FOCUS_COPY.screenTitle} back={back}>
        <EmptyFocus />
      </Screen>
    )
  }

  if (d.kind === 'referral') {
    return (
      <Screen title={FOCUS_COPY.screenTitle} back={back} banner={banner}>
        <PausedCard level={d.level} onSettled={() => setBody('settle')} />
      </Screen>
    )
  }

  if (d.kind === 'not-available') {
    return (
      <Screen title={FOCUS_COPY.screenTitle} back={back}>
        <EmptyState icon={InfoIcon} title={FOCUS_COPY.notAvailableTitle} body={d.message} action={<Button variant="secondary" to={paths.sessions()}>Go to Sessions</Button>} />
      </Screen>
    )
  }

  if (d.kind === 'capture-fix') {
    return (
      <Screen title={FOCUS_COPY.screenTitle} back={back} banner={banner} bottomAction={<Button to={paths.record()}>{FOCUS_COPY.setupCamera}</Button>}>
        <CaptureFix d={d} />
      </Screen>
    )
  }

  if (d.kind === 'match-day') {
    return (
      <Screen title={FOCUS_COPY.screenTitle} back={back} banner={banner}>
        <PreMatchCard cue={d.cue} routine={d.routine} />
        <section className="flex flex-col gap-3" aria-labelledby="warmup">
          <SectionLabel>
            <span id="warmup">{d.routine.title}</span>
          </SectionLabel>
          <WarmUpSteps routine={d.routine} />
        </section>
        <PlayingTonight />
        <SafetyFooter onHurts={() => setBody('question')} lines={d.safetyNotes} />
      </Screen>
    )
  }

  if (d.kind === 'keep-going') {
    return (
      <Screen title={FOCUS_COPY.screenTitle} back={back} banner={banner} bottomAction={<Button to={paths.record()}>{FOCUS_COPY.recordNext}</Button>}>
        <KeepGoing d={d} model={model} />
        <PlayingTonight />
        <SafetyFooter onHurts={() => setBody('question')} lines={d.safetyNotes} />
      </Screen>
    )
  }

  return <FocusView d={d} model={model} banner={banner} onHurts={() => setBody('question')} />
}

// ---------------------------------------------------------------------------------------------

function EmptyFocus() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  return (
    <EmptyState
      icon={VideoCameraIcon}
      title={FOCUS_COPY.emptyTitle}
      body={FOCUS_COPY.emptyBody}
      action={
        <>
          <Button to={paths.record()}>{FOCUS_COPY.setupCamera}</Button>
          <Button
            variant="tertiary"
            loading={loading}
            onClick={async () => {
              setLoading(true)
              try {
                await loadDemoData()
                navigate(paths.focus(), { replace: true })
              } catch {
                showToast("We couldn't load the sample. Try again.")
              } finally {
                setLoading(false)
              }
            }}
          >
            {FOCUS_COPY.seeSample}
          </Button>
        </>
      }
    />
  )
}

/** Pain-pause card (DESIGN §8.8 referral variant): no cue, drill or re-test anywhere while it shows. */
function PausedCard({ level, onSettled }: { level: 'emergency' | 'today' | 'stop-and-book'; onSettled: () => void }) {
  const remindFrom = useFocusStore((s) => s.remindFrom)
  return (
    <Card padding="focus" className="flex flex-col gap-4" label={FOCUS_COPY.pausedTitle}>
      <div className="flex items-center gap-3">
        <FirstAidIcon size={28} aria-hidden="true" className="shrink-0 text-critical" />
        <h2 className="text-title-2 text-ink">{PAUSE_LINE}</h2>
      </div>
      <p className="text-headline text-ink">{REFERRAL_COPY[level].title}</p>
      <ReferralContent level={level} icon={false} />
      {remindFrom ? <p className="text-footnote text-ink-2">{`Check in again from ${shortDate(remindFrom)}.`}</p> : null}
      <Button variant="secondary" onClick={onSettled}>
        {FOCUS_COPY.settled}
      </Button>
    </Card>
  )
}

function CaptureFix({ d }: { d: CaptureFixDecision }) {
  return (
    <Card padding="focus" className="flex flex-col gap-3">
      <WarningCircleIcon size={28} aria-hidden="true" className="text-attention" />
      <h2 className="text-title-2 text-ink">{FOCUS_COPY.captureTitle}</h2>
      <p className="text-callout text-ink">{d.message}</p>
      {d.fix ? <p className="text-callout text-ink-2">Next time: {d.fix}</p> : null}
    </Card>
  )
}

/** The session's serve counts as the report reads them (its headline and capture line). */
function serveCountsOf(model: FocusModel): SessionServeCounts | null {
  const c = model.record?.analysis?.counts
  return c ? { measured: c.included, detected: c.analysed } : null
}

function KeepGoing({ d, model }: { d: KeepGoingDecision; model: FocusModel }) {
  const serveCounts = serveCountsOf(model)
  const [why, setWhy] = useState(false)
  const inRange = d.checks.filter((c) => c.status === 'in-range').length
  return (
    <>
      <Card padding="focus" className="relative flex flex-col gap-3 overflow-hidden" label={d.title}>
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-optic" />
        <div className="flex items-center justify-between gap-2">
          <SectionLabel as="p">{FOCUS_COPY.screenTitle}</SectionLabel>
          <EvidenceTierChip tier={d.effectiveTier} />
        </div>
        <h2 className="text-title-1 text-ink">{d.title}</h2>
        <p className="text-callout text-ink">{FOCUS_COPY.keepGoingBody}</p>
        {d.comfortLine ? <p className="text-callout text-ink-2">{d.comfortLine}</p> : null}
        {inRange ? <p className="text-footnote text-ink-3">{`${inRange} ${inRange === 1 ? 'check was' : 'checks were'} in range this session.`}</p> : null}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="secondary" compact fullWidth={false} to={paths.practiceLog()}>
            {FOCUS_COPY.logPractice}
          </Button>
          <Button variant="tertiary" onClick={() => setWhy(true)}>
            {FOCUS_COPY.whatWeChecked}
          </Button>
        </div>
      </Card>
      {d.experiment ? <ExperimentNote copy={d.experiment.copy} /> : null}
      {model.isDemo ? <p className="text-footnote text-ink-3">{FOCUS_COPY.sampleNote}</p> : null}
      <WhySheet open={why} onClose={() => setWhy(false)} decision={d} counts={serveCounts} />
    </>
  )
}

function ExperimentNote({ copy }: { copy: string }) {
  return (
    <p className="flex items-start gap-2 rounded-card bg-surface-2 px-4 py-3 text-callout text-ink">
      <ArrowsClockwiseIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2" />
      <span>{copy}</span>
    </p>
  )
}

function PlayingTonight() {
  const on = useFocusStore((s) => s.playingTonight === todayYmd())
  const set = useFocusStore((s) => s.setPlayingTonight)
  return (
    <Button
      variant="tertiary"
      onClick={() => {
        set(!on)
        window.scrollTo({ top: 0 })
      }}
      className="self-start"
      icon={FlagPennantIcon}
    >
      {on ? FOCUS_COPY.notTonight : FOCUS_COPY.playingTonight}
    </Button>
  )
}

function SafetyFooter({ onHurts, lines }: { onHurts?: () => void; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      {onHurts ? (
      <button
        type="button"
        onClick={onHurts}
        className="-ml-1 inline-flex min-h-11 items-center gap-2 self-start rounded-control px-1 text-footnote text-ink-2 hover:bg-surface-2"
      >
        <HeartbeatIcon size={18} aria-hidden="true" />
        {FOCUS_COPY.stopIfHurts}
        <CaretRightIcon size={14} aria-hidden="true" />
      </button>
      ) : null}
      {lines.map((l) => (
        <p key={l} className="text-footnote text-ink-3">
          {l}
        </p>
      ))}
    </div>
  )
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-control px-1 text-headline text-ink hover:bg-surface-2"
      >
        {label}
        <CaretDownIcon size={16} aria-hidden="true" className={cx('transition-transform duration-(--dur-fast) motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      <div id={id} hidden={!open} className="pb-2 text-callout text-ink-2">
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

function verdictClause(copy: string, verdict: string): string {
  if (verdict === 'not-comparable') return copy.replace(/^Not comparable yet:?\s*/, '').replace(/^./, (c) => c.toUpperCase())
  const i = copy.indexOf('. ')
  return i >= 0 ? copy.slice(i + 2) : ''
}

function FocusView({ d, model, banner, onHurts }: { d: FocusDecision; model: FocusModel; banner?: ReactNode; onHurts: () => void }) {
  const navigate = useNavigate()
  const serveCounts = serveCountsOf(model)
  const [why, setWhy] = useState(false)
  const [howWeKnow, setHowWeKnow] = useState(false)
  const [starting, setStarting] = useState(false)
  const override = useFocusStore((s) => s.cueOverride[d.itemId])
  const setOverride = useFocusStore((s) => s.setCueOverride)
  const swapped = override !== undefined && override !== d.cue.register && override === d.cue.other.register
  const cueText = swapped ? d.cue.other.text : d.cue.text
  const otherRegister = swapped ? d.cue.register : d.cue.other.register
  const practices = d.retestDue?.practices ?? 0
  const retestReady = d.retestDue && d.retestDue.state !== 'practise-first'
  const compareSession = model.sessions.find((s) => s.id === d.evidence.compareSessionId)
  const portrait = model.orientation === 'portrait'

  const startDrill = async () => {
    setStarting(true)
    try {
      await ensureExperiment(model)
    } finally {
      setStarting(false)
    }
    navigate(paths.drill())
  }

  const swapCue = () => {
    setOverride(d.itemId, otherRegister)
    void persistCueSwap(model, d.itemId, otherRegister)
  }

  const primary = retestReady ? (
    <>
      <Button to={paths.record()}>{FOCUS_COPY.recordRetest}</Button>
      <Button variant="secondary" onClick={startDrill} loading={starting}>
        {FOCUS_COPY.startDrill}
      </Button>
    </>
  ) : (
    <Button onClick={startDrill} loading={starting} icon={TimerIcon}>
      {FOCUS_COPY.startDrill}
    </Button>
  )

  return (
    <Screen
      title={FOCUS_COPY.screenTitle}
      back={{ to: paths.today(), label: 'Today' }}
      banner={banner}
      trailing={<IconButton icon={InfoIcon} label={FOCUS_COPY.whyThisFocus} onClick={() => setWhy(true)} />}
      bottomAction={primary}
    >
      <header className="flex flex-col gap-3">
        {d.pinnedByCoach ? (
          <p className="flex items-center gap-1.5 text-footnote font-label text-ink-2">
            <PushPinIcon size={16} aria-hidden="true" />
            {FOCUS_COPY.pinned}
          </p>
        ) : null}
        <h2 className="text-title-1 text-ink">{d.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceTierChip tier={d.effectiveTier} onOpen={() => setHowWeKnow(true)} />
          {d.phase ? <Badge>{PHASE_LABEL[d.phase]}</Badge> : null}
          {d.wording === 'possible' ? <Badge>May apply</Badge> : null}
        </div>
        {model.isDemo ? <p className="text-footnote text-ink-3">{FOCUS_COPY.sampleNote}</p> : null}
      </header>

      {d.verdict ? (
        <section className="flex flex-col gap-2" aria-labelledby="verdict">
          <SectionLabel>
            <span id="verdict">{FOCUS_COPY.verdictLabel}</span>
          </SectionLabel>
          <VerdictChip verdict={d.verdict.verdict} size="large" />
          {verdictClause(d.verdict.copy, d.verdict.verdict) ? <p className="text-callout text-ink">{verdictClause(d.verdict.copy, d.verdict.verdict)}</p> : null}
          <p className="text-footnote text-ink-3">
            {metricName(d.verdict.metricId)}, {model.record ? shortDate(model.record.visitId) : 'this session'} against your baseline, same set-up.
          </p>
        </section>
      ) : null}
      {d.experiment && d.experiment.status !== 'continue' ? <ExperimentNote copy={d.experiment.copy} /> : null}
      {d.sameSession ? (
        <section className="flex flex-col gap-2" aria-label={FOCUS_COPY.straightAfter}>
          <SectionLabel>{FOCUS_COPY.straightAfter}</SectionLabel>
          <div className="flex flex-wrap items-center gap-3">
            <MetricValue metricId={d.sameSession.metricId} value={d.sameSession.before} />
            <span className="text-ink-3" aria-hidden="true">then</span>
            <MetricValue metricId={d.sameSession.metricId} value={d.sameSession.after} />
          </div>
          <p className="text-footnote text-ink-2">{d.sameSession.copy}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="evidence">
        <SectionLabel>
          <span id="evidence">{FOCUS_COPY.evidence}</span>
        </SectionLabel>
        {d.measurable ? (
          <EvidencePair evidence={d.evidence} session={model.session} compareSession={compareSession} heightM={model.heightM} portrait={portrait} />
        ) : null}
        {d.evidence.stats.length ? (
          <ul className="flex flex-col">
            {d.evidence.stats.map((s) => (
              <li key={s.metricId} className="flex flex-col gap-1 py-3 [&+li]:border-t [&+li]:border-line">
                <span className="text-footnote font-label text-ink-2">{metricName(s.metricId)}</span>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <MetricValue metricId={s.metricId} value={s.value} detail />
                  {s.value.n !== undefined && s.value.status !== 'player-entered' ? (
                    <span className="text-footnote tabular-nums text-ink-3">
                      {evidenceCountLine(s.value, serveCounts)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {d.evidence.viewNote ? <p className="text-footnote text-ink-2">{d.evidence.viewNote}</p> : null}
        {d.evidence.outcomeSentence ? <p className="text-callout text-ink">{d.evidence.outcomeSentence}</p> : null}
        <Button variant="tertiary" onClick={() => setWhy(true)} className="self-start">
          {FOCUS_COPY.whyThisFocus}
        </Button>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="why-matters">
        <SectionLabel>
          <span id="why-matters">{FOCUS_COPY.whyItMatters}</span>
        </SectionLabel>
        <p className="text-callout text-ink">{d.whyItMatters}</p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="cue">
        <SectionLabel>
          <span id="cue">{FOCUS_COPY.yourCue}</span>
        </SectionLabel>
        <p className="flex items-start gap-2 text-cue text-ink" data-cue>
          <ChatTextIcon size={24} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
          <span>“{cueText}”</span>
        </p>
        {d.logHints.suggestOtherCue ? <p className="text-footnote text-ink-2">{FOCUS_COPY.suggestedOtherCue}</p> : null}
        <Button variant="tertiary" onClick={swapCue} className="self-start">
          <span className="inline-flex items-center gap-1">
            {FOCUS_COPY.tryOtherCue}
            <CaretRightIcon size={16} aria-hidden="true" />
          </span>
        </Button>
      </section>

      <DrillSection d={d} onHurts={onHurts} />

      <section className="flex flex-col gap-2" aria-labelledby="retest">
        <SectionLabel>
          <span id="retest">{FOCUS_COPY.retest}</span>
        </SectionLabel>
        <p className="flex items-start gap-2 text-callout text-ink">
          <ArrowsClockwiseIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2" />
          <span>{d.retestDue?.text ?? d.retest.text}</span>
        </p>
        {d.retestDue?.dueBy && d.retestDue.state !== 'practise-first' ? (
          <p className="text-footnote text-ink-3">
            {d.retestDue.state === 'overdue' ? 'Best done soon; it has been over a week since you started practising.' : `Ideally by ${shortDate(d.retestDue.dueBy)}.`}
          </p>
        ) : null}
        {practices > 0 ? <p className="text-footnote tabular-nums text-ink-3">{`${practices} ${practices === 1 ? 'practice' : 'practices'} logged since the last check.`}</p> : null}
      </section>

      <section className="flex flex-col gap-1" aria-label="Serve load">
        {d.load.notes.map((n, i) => (
          <p key={`${n.id}-${i}`} className="text-footnote text-ink-2">
            {n.text}
          </p>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" compact fullWidth={false} to={paths.practiceLog()}>
          {FOCUS_COPY.logPractice}
        </Button>
        <PlayingTonight />
      </div>
      <SafetyFooter lines={d.safetyNotes} />

      <WhySheet open={why} onClose={() => setWhy(false)} decision={d} counts={serveCounts} />
      <Sheet open={howWeKnow} onClose={() => setHowWeKnow(false)} title={FOCUS_COPY.howWeKnow}>
        <div className="flex flex-col gap-3 pb-4">
          <EvidenceTierChip tier={d.effectiveTier} className="self-start" />
          <p className="text-callout text-ink">{FOCUS_COPY.tierExplain[d.effectiveTier]}</p>
          <p className="text-footnote text-ink-3">{FOCUS_COPY.cuesAreCoaching}</p>
        </div>
      </Sheet>
    </Screen>
  )
}

function DrillSection({ d, onHurts }: { d: FocusDecision; onHurts: () => void }) {
  const drill = d.drill
  return (
    <section className="flex flex-col gap-3" aria-labelledby="drill">
      <SectionLabel>
        <span id="drill">{FOCUS_COPY.yourDrill}</span>
      </SectionLabel>
      <p className="flex items-center gap-2 text-headline text-ink">
        <TimerIcon size={20} aria-hidden="true" className="text-ink-2" />
        {drill.name} · {drill.minutes} min
      </p>
      <p className="text-callout text-ink-2">{drill.setup}</p>
      <ol className="flex flex-col gap-3">
        {drill.steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-body text-ink">
            <span className="w-5 shrink-0 text-right tabular-nums text-ink-3" aria-hidden="true">
              {i + 1}.
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <p className="flex items-start gap-2 rounded-control bg-surface-2 px-3 py-3 text-headline text-ink">
        <TargetIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          {FOCUS_COPY.goal}: {drill.successCriterion}
        </span>
      </p>
      {drill.note ? <p className="text-footnote text-ink-2">{drill.note}</p> : null}
      {drill.optionalAid ? <p className="text-footnote text-ink-2">{drill.optionalAid}</p> : null}
      {drill.comfortNotes.map((n) => (
        <p key={n} className="text-footnote text-ink-2">
          {n}
        </p>
      ))}
      {d.logHints.suggestRegression ? <p className="text-footnote text-ink-2">{FOCUS_COPY.suggestedRegression}</p> : null}
      <div className="flex flex-col">
        <Disclosure label={drill.variant === 'regression' ? `${FOCUS_COPY.easier} (for now)` : FOCUS_COPY.easier}>{drill.regression}</Disclosure>
        <Disclosure label={FOCUS_COPY.harder}>
          {drill.progression ? (
            <>
              {drill.progression.text}
              {drill.progression.label === 'coaches-differ' ? <span className="mt-1 block text-footnote text-ink-3">{FOCUS_COPY.coachesDiffer}</span> : null}
            </>
          ) : (
            FOCUS_COPY.harderLocked[drill.progressionLocked ?? 'needs-two-logs']
          )}
        </Disclosure>
      </div>
      <button
        type="button"
        onClick={onHurts}
        className="-ml-1 inline-flex min-h-11 items-center gap-2 self-start rounded-control px-1 text-footnote text-ink-2 hover:bg-surface-2"
      >
        <HeartbeatIcon size={18} aria-hidden="true" />
        {FOCUS_COPY.stopIfHurts}
        <CaretRightIcon size={14} aria-hidden="true" />
      </button>
    </section>
  )
}

