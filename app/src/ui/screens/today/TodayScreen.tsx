import { ArrowsClockwiseIcon, CaretRightIcon, FlagPennantIcon, VideoCameraIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { REFERRAL_COPY } from '../../../coaching/safety.ts'
import { loadDemoData } from '../../../data/demo.ts'
import { showToast } from '../../../data/index.ts'
import { useLatestDecision, useProfile } from '../../../data/hooks.ts'
import type { PracticeLogRecord } from '../../../data/records.ts'
import { listPracticeByExperiment } from '../../../data/repos/coaching.ts'
import { getDb } from '../../../data/db.ts'
import { useFocusStore } from '../focus/focusStore.ts'
import {
  Button,
  Card,
  CaptureQualityLine,
  DelayedSkeleton,
  EmptyState,
  ProfileButton,
  SampleBanner,
  Screen,
  SectionLabel,
  Skeleton,
} from '../../components/index.ts'
import { longDate, shortDate } from '../../format/dates.ts'
import { decisionEvidence, headlineFor } from '../../format/sessionValues.ts'
import { paths } from '../../shell/paths.ts'
import { baselineWords, stratumWords, type SessionBundle } from '../progress/insights/history.ts'
import { useExperiments, useSessionBundles } from '../progress/insights/hooks.ts'
import { VerdictLine } from '../progress/insights/ui.tsx'
import { FocusCard, KeepGoingCard, PainPauseCard } from './FocusCard.tsx'
import { currentExperiment, sessionLine, todayModel, type ExperimentStep, type TodayModel } from './todayModel.ts'

function LastSessionCard({ bundle, welcomeBack }: { bundle: SessionBundle; welcomeBack: boolean }) {
  const s = bundle.session
  const a = s.analysis
  // The same sentence (and spread number) as the report's headline (ui/format/sessionValues.ts).
  const headline = headlineFor(s, bundle.stats)
  return (
    <section className="flex flex-col gap-3" aria-labelledby="last-session">
      <SectionLabel>
        <span id="last-session">Last session</span>
      </SectionLabel>
      <Card className="flex flex-col items-start gap-2">
        {welcomeBack ? <p className="text-callout text-ink">Welcome back. Your focus is where you left it.</p> : null}
        <p className="text-headline text-ink">
          {shortDate(s.visitId)} <span className="text-footnote font-normal text-ink-2">· {sessionLine(s)}</span>
        </p>
        {/* Never clamped: an early read's label and interval sit at the end of the sentence (METRICS §4.1). */}
        {headline ? <p className="text-callout text-ink-2 text-pretty">{headline}</p> : null}
        {a ? <CaptureQualityLine overall={a.capture.quality.overall} measured={a.counts.included} detected={a.counts.analysed} /> : null}
        <Link
          to={paths.sessionReport(s.id)}
          className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded-control px-1 text-headline text-ink underline underline-offset-[3px] hover:bg-surface-2"
        >
          Open report
          <CaretRightIcon size={16} aria-hidden="true" />
        </Link>
      </Card>
    </section>
  )
}

function stepText(step: ExperimentStep, stratum: string, planned?: string): string {
  if (step.kind === 'practise') return 'Practise the drill once or twice, then re-test.'
  if (step.kind === 'retest-due')
    return `${step.practices === 1 ? '1 practice' : `${step.practices} practices`} logged. Re-test ready: 15 serves, ${stratum.toLowerCase()}.${planned ? ` You planned it for ${shortDate(planned)}.` : ''}`
  return `Your re-test is in. ${step.practices === 1 ? '1 practice' : `${step.practices} practices`} logged.`
}

function ExperimentStrip({ model, title }: { model: TodayModel; title?: string }) {
  const whose = model.mode === 'sample' ? "the sample player's" : 'your'
  const exp = model.experiment
  const step = model.step
  // The day picked after logging a practice (kept on this phone, focus/focusStore.ts).
  const planned = useFocusStore((s) => (exp ? s.plannedRetest[exp.id] : undefined))
  if (!exp || !step) return null
  const stratum = stratumWords(exp.stratum)
  const name = title ? title.toLowerCase() : 'experiment'
  return (
    <section aria-labelledby="experiment-strip" className="card flex flex-col items-start gap-2 p-4">
      <h2 id="experiment-strip" className="flex items-center gap-2 text-headline text-ink">
        <ArrowsClockwiseIcon size={20} aria-hidden="true" className="shrink-0 text-ink-2" />
        {exp.status === 'completed' ? `${whose.charAt(0).toUpperCase()}${whose.slice(1)} ${name} is finished` : `Day ${step.day} of ${whose} ${name}`}
      </h2>
      <p className="text-callout text-ink-2">{stepText(step, stratum, model.mode === 'sample' ? undefined : planned)}</p>
      {step.kind === 'result' ? (
        <>
          <VerdictLine verdict={step.verdict} />
          <Button variant="tertiary" to={paths.compare(exp.id)}>
            See result
          </Button>
        </>
      ) : null}
    </section>
  )
}

function TodaySkeleton() {
  return (
    <DelayedSkeleton>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </DelayedSkeleton>
  )
}

/**
 * Today (DESIGN §10.2, PRODUCT §6.2): "What should I do now?" The focus card with the current
 * coaching decision and its one primary action, the experiment's next step (practise, re-test due,
 * result), the last session's headline, and the empty, sample and pain-pause states.
 */
export function TodayScreen() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const bundles = useSessionBundles({ includeDemo: true })
  const experiments = useExperiments()
  const profile = useProfile()
  // A referral raised this session ("It hurts" or a red flag on Record, live framing or /focus) pauses
  // coaching here too, even when the answer was not saved (COACHING §7.5, §7.9, §10.3; D8).
  const referral = useFocusStore((s) => s.referral)
  const [now] = useState(() => new Date())
  // Practice logs of the experiment Today shows (the active one, or one that just finished).
  const newest = bundles?.filter((b) => b.session.status === 'ready').sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
  const ownNewest = newest?.find((b) => b.session.isDemo === 0)
  const shown = experiments && newest ? currentExperiment(experiments, (ownNewest ?? newest[0])?.session.id, !ownNewest) : null
  const activeIds = shown ? [shown.id] : []
  const logs = useLiveQuery(async () => (await Promise.all(activeIds.map(listPracticeByExperiment))).flat() as PracticeLogRecord[], [activeIds.join(',')])

  const model =
    bundles && experiments && profile !== undefined && logs
      ? todayModel({ bundles, experiments, practiceLogs: logs, profile, now, ...(referral ? { referral } : {}) })
      : null
  // The newest session's stored decision (kept in step by integration/coachingSync.ts after analysis,
  // tagging and practice); the experiment's starting decision until the newest session has one.
  const latestDecision = useLatestDecision(model?.last?.session.id ?? '__none__')
  const baselineDecision = useLatestDecision(model?.experiment?.baselineSessionIds.at(-1) ?? '__none__')
  const decision = latestDecision === undefined ? undefined : latestDecision ?? (baselineDecision === undefined ? undefined : baselineDecision)
  // The experiment is named after the focus that started it (its own decision), not today's decision.
  const experimentDecisionId = model?.experiment?.decisionId
  const experimentDecision = useLiveQuery(async () => (experimentDecisionId ? ((await getDb().coaching.get(experimentDecisionId)) ?? null) : null), [experimentDecisionId])
  const experimentTitle = experimentDecision?.focus && experimentDecision.focus.faultId !== 'none' ? experimentDecision.focus.title : undefined

  const seeSample = async () => {
    setLoading(true)
    try {
      navigate(paths.sessionReport(await loadDemoData()))
    } catch {
      showToast("We couldn't load the sample. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const sample = model?.mode === 'sample'
  const header = <p className="-mt-3 text-footnote text-ink-3">{longDate(now)}</p>

  if (!model || decision === undefined) {
    return (
      <Screen title="Today" variant="root" trailing={<ProfileButton />}>
        {header}
        <TodaySkeleton />
      </Screen>
    )
  }

  if (model.mode === 'empty') {
    return (
      <Screen title="Today" variant="root" trailing={<ProfileButton />}>
        {header}
        <EmptyState
          icon={VideoCameraIcon}
          title="Record your first serves"
          body="15 serves from one side, about 10 minutes. We'll find one thing to work on."
          action={
            <>
              <Button to={paths.record()}>Set up camera</Button>
              <Button variant="tertiary" onClick={seeSample} loading={loading}>
                See a sample session
              </Button>
            </>
          }
        />
      </Screen>
    )
  }

  const decisionBundle = model.sessions.find((b) => b.session.id === decision?.sessionId)
  // The focus's numbers: its session's stored values in the focus's stratum, as on the report.
  const evidence = decisionEvidence(decision, decisionBundle?.stats)
  const orientation = decisionBundle?.session.orientation ?? model.last?.session.orientation ?? 'portrait'
  const activeExperiment = model.experiment?.status === 'active' ? model.experiment : null
  const practiceCount = activeExperiment ? (model.step?.practices ?? 0) : 0
  const baseline = model.baseline ? baselineWords(model.baseline) : null

  return (
    <Screen title="Today" variant="root" trailing={<ProfileButton />} banner={sample ? <SampleBanner /> : undefined}>
      {header}

      {sample ? (
        <Card className="flex flex-col items-start gap-3">
          <h2 className="text-title-2 text-ink">Record your first serves</h2>
          <p className="text-callout text-ink-2">Below is a sample player's Today. Record 15 serves from one side and we'll find one thing for you to work on.</p>
          <Button to={paths.record()} fullWidth>
            Set up camera
          </Button>
        </Card>
      ) : null}

      {model.painPause ? (
        // "Stop and book" keeps the card's own §10.3 text; a red flag leads with its instruction.
        <PainPauseCard message={model.referral && model.referral !== 'stop-and-book' ? REFERRAL_COPY[model.referral].title : undefined} />
      ) : (
        <>
          {model.matchDay && decision?.cue && !sample ? (
            <section aria-labelledby="match-day" className="card flex flex-col gap-1 p-4">
              <h2 id="match-day" className="flex items-center gap-2 text-footnote font-label text-ink-3">
                <FlagPennantIcon size={16} aria-hidden="true" />
                Comp night tonight
              </h2>
              <p className="text-title-2 font-medium text-ink">“{decision.cue.text}”</p>
              <p className="text-footnote text-ink-2">No new changes today. Warm up with your cue.</p>
            </section>
          ) : null}
          {decision ? (
            <FocusCard
              decision={decision}
              variant="full"
              orientation={orientation}
              stats={evidence}
              experiment={activeExperiment}
              practiceCount={practiceCount}
              sample={sample}
              showPrimary={!sample}
            />
          ) : (
            <KeepGoingCard variant="full" sample={sample} showPrimary={!sample} />
          )}
          <ExperimentStrip model={model} title={experimentTitle ? `${experimentTitle} experiment` : undefined} />
        </>
      )}

      {baseline && !model.painPause ? (
        <section aria-labelledby="baseline" className="card flex flex-col items-start gap-2 p-4">
          <h2 id="baseline" className="text-headline text-ink">
            {baseline.title}
          </h2>
          <p className="text-callout text-ink-2">{baseline.body}</p>
          <Button variant="secondary" compact fullWidth={false} to={paths.record()}>
            Record
          </Button>
        </section>
      ) : null}

      {model.last ? <LastSessionCard bundle={model.last} welcomeBack={model.welcomeBack} /> : null}
    </Screen>
  )
}
