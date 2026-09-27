import {
  ChartScatterIcon,
  HeartbeatIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TargetIcon,
  TextAlignLeftIcon,
} from '@phosphor-icons/react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { LESS_EFFORT_LINE } from '../../../coaching/safety.ts'
import type { MetricStatus } from '../../../analysis/types.ts'
import { median } from '../../../analysis/stats/index.ts'
import { DEMO_FIXTURES, loadDemoData, showToast } from '../../../data/index.ts'
import type { BodyRegion, Weekday } from '../../../data/records.ts'
import { StripPlot } from '../../charts/index.ts'
import { Button, Card, OutcomeMark, Sheet, StatusChip } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { ChoiceList } from '../profile/parts/ChoiceList.tsx'
import { HandQuestion } from '../profile/parts/HandQuestion.tsx'
import { HeightInput } from '../profile/parts/HeightInput.tsx'
import { ReferralSheet } from '../profile/parts/ReferralSheet.tsx'
import { inOptionOrder } from '../profile/parts/choiceLogic.ts'
import { DayChips } from '../profile/parts/DayChips.tsx'
import { LevelFields } from '../profile/parts/LevelFields.tsx'
import {
  COMFORT_COPY,
  GOAL_OPTIONS,
  PLAY_STYLE_OPTIONS,
  REGION_OPTIONS,
} from '../profile/parts/words.ts'
import { PRIVACY_FACTS, PRIVACY_POLICY_SUMMARY } from '../profile/copy.ts'
import { markOnboarding, saveOnboarding } from './actions.ts'
import { useOnboardingDraft } from './draftStore.ts'
import { Frame, Helper } from './Frame.tsx'
import {
  ADULTS_ONLY,
  continueBlocker,
  nextStep,
  normaliseStep,
  playsComp,
  prevStep,
  stepIndex,
  type OnboardingDraft,
  type StepId,
} from './model.ts'

const SAVE_ERROR = "We couldn't save that. Try again."

/**
 * Onboarding O1 to O9 (PRODUCT §6.1, DESIGN §10.1): one question per screen, Back always (except O1),
 * every optional step skippable, no paywall and no permission prompts. Answers stay in a draft until
 * the privacy step, then the profile is written once. "Skip set-up" on O1 still asks the beta's age
 * question (D11) and then goes to Today; the close button from O3 on keeps the answers so far.
 */
export function OnboardingScreen() {
  const { step: raw } = useParams()
  const step = normaliseStep(raw)
  const navigate = useNavigate()
  const draft = useOnboardingDraft((s) => s.draft)
  const update = useOnboardingDraft((s) => s.update)
  const reset = useOnboardingDraft((s) => s.reset)
  // When set-up ends, only the stored copy of the draft is cleared: clearing the answers in memory
  // would re-render this step without them and bounce the player back to the age question.
  const settle = useOnboardingDraft((s) => s.clearStored)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const go = (to: StepId | typeof ADULTS_ONLY) => {
    setError(null)
    navigate(to === 'welcome' ? paths.onboarding() : paths.onboarding(to))
  }

  /** Leaves set-up for now: keeps what was answered, ends the first-run redirect, goes to Today. */
  const leave = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveOnboarding(useOnboardingDraft.getState().draft, 'skipped')
      settle()
      showToast('Saved. Finish your details in Profile any time.')
      navigate(paths.today(), { replace: true })
    } catch {
      setError(SAVE_ERROR)
    } finally {
      setBusy(false)
    }
  }

  // Questions after O2 need the age answer first (the closed beta is 18 and over, D11).
  if (step !== 'welcome' && step !== 'age' && step !== ADULTS_ONLY && step !== 'ready' && draft.adult !== true) {
    return <Navigate to={paths.onboarding('age')} replace />
  }

  if (step === ADULTS_ONLY) {
    return (
      <Frame onBack={() => go('age')} title="Serve Coach is for adults while we're in beta.">
        <p className="text-title-2 text-ink-2">We'd love to have you when it opens up.</p>
        <p className="text-callout text-ink-3">Nothing you entered has been saved.</p>
      </Frame>
    )
  }

  const back = prevStep(step)
  const onBack = back ? () => go(back) : undefined
  const canLeave = draft.adult === true && stepIndex(step) >= stepIndex('play') && step !== 'ready'
  const onLeave = canLeave ? () => void leave() : undefined
  const blocker = continueBlocker(step, draft)
  const helperId = `helper-${step}`

  const continueTo = async () => {
    if (blocker) return
    if (step === 'privacy') {
      setBusy(true)
      setError(null)
      try {
        await saveOnboarding(draft, 'completed')
        go('ready')
      } catch {
        setError(SAVE_ERROR)
      } finally {
        setBusy(false)
      }
      return
    }
    const next = nextStep(step)
    if (next) go(next)
  }

  const continueActions = (extra?: ReactNode) => (
    <>
      <Button onClick={continueTo} disabled={Boolean(blocker)} loading={busy} aria-describedby={blocker ? helperId : undefined}>
        Continue
      </Button>
      {blocker ? <Helper id={helperId}>{blocker}</Helper> : null}
      {extra}
    </>
  )

  const skip = (patch: Partial<OnboardingDraft>) => (
    <Button
      variant="tertiary"
      fullWidth
      onClick={() => {
        update(patch)
        const next = nextStep(step as StepId)
        if (next) go(next)
      }}
    >
      Skip
    </Button>
  )

  switch (step) {
    case 'welcome':
      return (
        <Welcome
          onStart={() => {
            update({ skipAfterAge: false })
            go('age')
          }}
          onSkip={() => {
            update({ skipAfterAge: true })
            go('age')
          }}
        />
      )

    case 'age':
      return (
        <Frame step="age" onBack={onBack} title="Are you 18 or over?" error={error}>
          <ChoiceList
            label="Are you 18 or over?"
            mode="single"
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]}
            value={draft.adult === null ? [] : [draft.adult ? 'yes' : 'no']}
            onChange={async ([v]) => {
              if (v === 'no') {
                // Nothing is stored for a player under 18 (PRODUCT §6.1 O2).
                reset()
                go(ADULTS_ONLY)
                return
              }
              update({ adult: true })
              if (useOnboardingDraft.getState().draft.skipAfterAge) {
                await leave()
                return
              }
              go('play')
            }}
          />
          <p className="text-footnote text-ink-3">The closed beta is for adults. We only keep your answer if it's yes.</p>
        </Frame>
      )

    case 'play':
      return (
        <Frame step="play" onBack={onBack} onLeave={onLeave} title="How do you play?" error={error} actions={continueActions()}>
          <div className="flex flex-col gap-2">
            <p className="text-footnote text-ink-2">Choose any that apply.</p>
            <ChoiceList
              label="How do you play?"
              mode="multi"
              options={PLAY_STYLE_OPTIONS}
              exclusive={['no-comp']}
              value={draft.playStyle}
              onChange={(next) => update({ playStyle: inOptionOrder(next, PLAY_STYLE_OPTIONS), matchNights: playsComp(next) ? draft.matchNights : [] })}
            />
          </div>
          {playsComp(draft.playStyle) ? (
            <NightsQuestion
              value={draft.matchNights}
              onChange={(matchNights) => update({ matchNights })}
              onSkip={() => {
                update({ matchNights: [] })
                go('goal')
              }}
            />
          ) : null}
        </Frame>
      )

    case 'goal':
      return (
        <Frame step="goal" onBack={onBack} onLeave={onLeave} title="What costs you points on serve?" error={error} actions={continueActions()}>
          <ChoiceList label="What costs you points on serve?" mode="single" options={GOAL_OPTIONS} value={draft.goal ? [draft.goal] : []} onChange={([goal]) => update({ goal })} />
          {draft.goal === 'less-effort' ? (
            <p className="flex items-start gap-2 text-footnote text-ink-2">
              <HeartbeatIcon size={20} aria-hidden="true" className="mt-px shrink-0 text-ink-2" />
              {LESS_EFFORT_LINE}
            </p>
          ) : null}
        </Frame>
      )

    case 'you':
      return (
        <Frame step="you" onBack={onBack} onLeave={onLeave} title="About you" error={error} actions={continueActions()}>
          <HeightInput valueCm={draft.heightCm} onChange={(heightCm) => update({ heightCm })} />
          <HandQuestion value={draft.handedness} onChange={(handedness) => update({ handedness })} />
        </Frame>
      )

    case 'level':
      return (
        <Frame
          step="level"
          onBack={onBack}
          onLeave={onLeave}
          title="Do you have a UTR?"
          error={error}
          actions={continueActions(skip({ utrText: '', noUtr: false, levelDescription: null }))}
        >
          <LevelQuestion draft={draft} update={update} />
        </Frame>
      )

    case 'comfort':
      return (
        <Frame
          step="comfort"
          onBack={onBack}
          onLeave={onLeave}
          title={COMFORT_COPY.question}
          error={error}
          actions={continueActions(skip({ comfortRegions: [], comfortNone: false, comfortSave: null }))}
        >
          <ComfortQuestion draft={draft} update={update} />
        </Frame>
      )

    case 'privacy':
      return (
        <Frame step="privacy" onBack={onBack} onLeave={onLeave} title="Your serve stays on your phone" error={error} actions={continueActions()}>
          <PrivacyFacts />
        </Frame>
      )

    case 'ready':
      return (
        <Ready
          onBack={onBack}
          done={() => {
            settle()
            void markOnboarding('completed').catch(() => undefined)
          }}
        />
      )
  }
}

// ---------- O1 ----------

type SamplePeak = { id: string; value: number; kind: 'in' | 'net' | 'long' | 'wide' | 'untagged'; callout: string }

/**
 * The sample's peak heights, one per serve: the same heights-only strip a real report draws. Front-to-back
 * positions are experimental (toss-forward is V0), so the first screen never shows a toss map; the chip
 * is the plotted heights' own status, never a hard-coded one.
 */
function samplePeaks(): { peaks: SamplePeak[]; status: MetricStatus | null; label: string } {
  const s = DEMO_FIXTURES.sessions.at(-1)
  if (!s) return { peaks: [], status: null, label: '' }
  const outcome = new Map(s.tags.map((t) => [t.serveId, t.outcome]))
  const peaks: SamplePeak[] = []
  const statuses = new Set<MetricStatus>()
  for (const sv of s.serves) {
    const apex = sv.metrics['toss-apex-height']
    const cm = apex?.secondary?.cm
    if (!sv.included || !apex || (apex.status !== 'measured' && apex.status !== 'estimated') || typeof cm !== 'number') continue
    statuses.add(apex.status)
    const o = outcome.get(sv.id)
    peaks.push({
      id: sv.id,
      value: cm / 100,
      kind: o === 'in' ? 'in' : o === 'net' ? 'net' : o === 'long' ? 'long' : o === 'wide' ? 'wide' : 'untagged',
      callout: `${(cm / 100).toFixed(2)} m · Serve ${sv.index}`,
    })
  }
  const status: MetricStatus | null = statuses.has('estimated') ? 'estimated' : statuses.has('measured') ? 'measured' : null
  return { peaks, status, label: `Sample strip: how high ${peaks.length} toss peaks went for a computer-generated player.` }
}

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const sample = useMemo(() => samplePeaks(), [])
  const mid = sample.peaks.length ? median(sample.peaks.map((p) => p.value)) : undefined
  return (
    <Frame
      title="Welcome"
      titleHidden
      actions={
        <>
          <Button onClick={onStart}>Get started</Button>
          <Button variant="tertiary" fullWidth onClick={onSkip}>
            Skip set-up
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-2">
        <p className="text-title-1 text-ink" translate="no">
          Serve Coach
        </p>
        <p className="text-title-2 text-ink">
          Film a few serves.
          <br />
          See what your toss is doing.
          <br />
          Practise one change.
          <br />
          Find out if it worked.
        </p>
      </div>
      {sample.peaks.length >= 5 && sample.status ? (
        <Card as="figure" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-footnote font-label text-ink-2">How high each toss peaked, one dot per serve</span>
            <StatusChip status={sample.status} />
          </div>
          {/* A picture of the idea, not something to use here: the chart is inert and described below. */}
          <div inert aria-hidden="true">
            <StripPlot
              label={sample.label}
              rows={[{ key: 'sample-apex', data: sample.peaks, median: mid, medianLabel: mid !== undefined ? `middle ${mid.toFixed(2)} m` : undefined }]}
              domain={[Math.min(...sample.peaks.map((p) => p.value)) - 0.1, Math.max(...sample.peaks.map((p) => p.value)) + 0.1]}
              unit="m"
            />
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-footnote text-ink-2" aria-hidden="true">
            <li className="inline-flex items-center gap-1.5">
              <OutcomeMark outcome="in" /> In
            </li>
            <li className="inline-flex items-center gap-1.5">
              <OutcomeMark outcome="net" /> Net
            </li>
            <li className="inline-flex items-center gap-1.5">
              <OutcomeMark outcome="long" /> Long or wide
            </li>
          </ul>
          <figcaption className="text-footnote text-ink-3">
            <span className="sr-only">{sample.label} </span>
            Illustration: example numbers for a computer-generated player
          </figcaption>
        </Card>
      ) : null}
      <p className="flex items-center gap-2 text-callout text-ink-2">
        <ShieldCheckIcon size={20} aria-hidden="true" className="shrink-0" />
        Everything stays on this phone.
      </p>
    </Frame>
  )
}

// ---------- O3 nights ----------

function NightsQuestion({ value, onChange, onSkip }: { value: Weekday[]; onChange: (v: Weekday[]) => void; onSkip: () => void }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-headline text-ink">
          Which night do you usually play?
        </h2>
        <Button variant="tertiary" onClick={onSkip} className="-mr-1 shrink-0">
          Skip
        </Button>
      </div>
      <DayChips value={value} onChange={onChange} labelledBy={id} />
    </section>
  )
}

// ---------- O6 level ----------

function LevelQuestion({ draft, update }: { draft: OnboardingDraft; update: (p: Partial<OnboardingDraft>) => void }) {
  return (
    <>
      <LevelFields
        value={{ utrText: draft.utrText, noUtr: draft.noUtr, description: draft.levelDescription }}
        onChange={({ description, ...rest }) => update({ ...rest, ...(description !== undefined ? { levelDescription: description } : {}) })}
      />
      <p className="text-footnote text-ink-3">You can change this any time.</p>
    </>
  )
}

// ---------- O7 comfort ----------

function ComfortQuestion({ draft, update }: { draft: OnboardingDraft; update: (p: Partial<OnboardingDraft>) => void }) {
  const id = useId()
  const [referral, setReferral] = useState(false)
  const options: { value: BodyRegion | 'none'; label: string }[] = [...REGION_OPTIONS, { value: 'none', label: COMFORT_COPY.none }]
  const value: (BodyRegion | 'none')[] = draft.comfortNone ? ['none'] : draft.comfortRegions
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-footnote text-ink-2">Choose any that apply.</p>
        <ChoiceList
          label={COMFORT_COPY.question}
          mode="multi"
          options={options}
          exclusive={['none']}
          value={value}
          onChange={(next) => {
            const none = next.includes('none')
            const regions = inOptionOrder(next.filter((v): v is BodyRegion => v !== 'none'), REGION_OPTIONS)
            update({ comfortNone: none, comfortRegions: regions, comfortSave: regions.length ? draft.comfortSave : null })
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-footnote text-ink-2">{COMFORT_COPY.lineDrills}</p>
      </div>
      {draft.comfortRegions.length ? (
        <section aria-labelledby={`${id}-save`} className="flex flex-col gap-3">
          <h2 id={`${id}-save`} className="text-headline text-ink">
            {COMFORT_COPY.saveQuestion}
          </h2>
          {/* Equal weight (APP 3.3 express consent): same size and style, neither preselected. */}
          <ChoiceList
            labelledBy={`${id}-save`}
            mode="single"
            size="compact"
            options={[
              { value: 'save', label: COMFORT_COPY.save },
              { value: 'dont', label: COMFORT_COPY.dontSave },
            ]}
            value={draft.comfortSave === null ? [] : [draft.comfortSave ? 'save' : 'dont']}
            onChange={([v]) => update({ comfortSave: v === 'save' })}
          />
        </section>
      ) : null}
      <div>
        <Button variant="tertiary" icon={HeartbeatIcon} onClick={() => setReferral(true)}>
          Something hurts right now?
        </Button>
      </div>
      <ReferralSheet open={referral} onClose={() => setReferral(false)} />
    </>
  )
}

// ---------- O8 privacy ----------

function PrivacyFacts() {
  const [policy, setPolicy] = useState(false)
  return (
    <>
      <ul className="flex flex-col gap-4">
        {PRIVACY_FACTS.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
              <ShieldCheckIcon size={24} aria-hidden="true" />
            </span>
            <span className="pt-2 text-body text-ink">{f}</span>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="tertiary" onClick={() => setPolicy(true)} aria-haspopup="dialog" className="underline decoration-1 underline-offset-[3px]">
          Privacy policy
        </Button>
      </div>
      <Sheet open={policy} onClose={() => setPolicy(false)} title="Privacy policy" closeStyle="done">
        <div className="flex flex-col gap-3 pb-2">
          {PRIVACY_POLICY_SUMMARY.map((p) => (
            <p key={p} className="text-callout text-ink">
              {p}
            </p>
          ))}
        </div>
      </Sheet>
    </>
  )
}

// ---------- O9 ----------

const SAMPLE_TOUR: { icon: typeof TextAlignLeftIcon; title: string; body: string }[] = [
  { icon: TextAlignLeftIcon, title: 'One sentence first', body: 'Each report starts with what happened, in plain words.' },
  { icon: ChartScatterIcon, title: 'Every number says how we got it', body: 'Measured, estimate, you logged or not available.' },
  { icon: TargetIcon, title: 'One change, with a cue and a drill', body: 'Practise it, record again, and see if it worked.' },
]

function Ready({ onBack, done }: { onBack?: () => void; done: () => void }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seeSample = async () => {
    setLoading(true)
    setError(null)
    try {
      const sampleId = await loadDemoData()
      done()
      navigate(paths.sessionReport(sampleId))
    } catch {
      setError("We couldn't load the sample. Try again.")
      setLoading(false)
    }
  }
  return (
    <Frame
      step="ready"
      onBack={onBack}
      title="Want to see how it works first?"
      error={error}
      actions={
        <>
          <Button onClick={seeSample} loading={loading}>
            See a sample session
          </Button>
          <Button variant="secondary" to={paths.record()} onClick={done}>
            Set up my first recording
          </Button>
        </>
      }
    >
      <section aria-labelledby="sample-tour" className="flex flex-col gap-4">
        <h2 id="sample-tour" className="flex items-center gap-2 text-footnote font-label text-ink-3">
          <SparkleIcon size={16} aria-hidden="true" />
          In the sample, look for
        </h2>
        <ol className="flex flex-col gap-4">
          {SAMPLE_TOUR.map(({ icon: G, title, body }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
                <G size={24} aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="text-headline text-ink">{title}</span>
                <span className="text-callout text-ink-2">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-footnote text-ink-3">
        The sample uses a computer-generated player, analysed by the real engine. It is labelled as sample data everywhere, and you can
        remove it in Profile.
      </p>
    </Frame>
  )
}

