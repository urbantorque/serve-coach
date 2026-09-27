import { ArrowsClockwiseIcon, CheckCircleIcon, MinusIcon, NotePencilIcon, PlusIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router'
import { practiceLogRules, type FocusDecision, type KeepGoingDecision } from '../../../coaching/index.ts'
import { Button, DelayedSkeleton, EmptyState, SampleBanner, Screen, SectionLabel, Sheet, Skeleton } from '../../components/index.ts'
import { longDate, shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { savePracticeLog } from './actions.ts'
import { toPracticeSummary } from './adapter.ts'
import { BodyCheckSheet, type BodyCheckStart } from './components/BodyCheckSheet.tsx'
import { ChoiceChips } from './components/ChoiceChips.tsx'
import { FOCUS_COPY, LOG_COPY } from './copy.ts'
import type { DrillResult } from './DrillPlayerScreen.tsx'
import { todayYmd, useFocusStore } from './focusStore.ts'
import { useFocusModel, type FocusModel } from './useFocus.ts'

type Met = 'yes' | 'partly' | 'no'
type Feel = 'natural' | 'ok' | 'awkward'
type Helpful = 'yes' | 'not-sure' | 'no'
type BodyAnswer = 'fine' | 'sore' | 'pain'
type Setting = 'court' | 'wall' | 'other'

const A = LOG_COPY.answers

/**
 * Practice log (COACHING §12.2; PRODUCT §6.8.3; DESIGN §8.15): about ten seconds, every field
 * prefilled from the drill. A body answer other than "fine" runs the body check first. After saving,
 * the player picks a day for the re-test (§12.3).
 */
export function PracticeLogScreen() {
  const model = useFocusModel()
  const back = { to: paths.focus(), label: 'Focus' }
  if (model.status === 'loading') {
    return (
      <Screen title={LOG_COPY.title} back={back}>
        <DelayedSkeleton>
          <Skeleton variant="row" />
          <Skeleton variant="row" className="mt-3" />
        </DelayedSkeleton>
      </Screen>
    )
  }
  const d = model.decision
  if (!d || (d.kind !== 'focus' && d.kind !== 'keep-going' && d.kind !== 'referral')) {
    return (
      <Screen title={LOG_COPY.title} back={back}>
        <EmptyState icon={NotePencilIcon} title="Nothing to log yet" body="Record a session first; your focus and drill will appear here." action={<Button variant="secondary" to={paths.record()}>Go to Record</Button>} />
      </Screen>
    )
  }
  return <LogForm model={model} d={d.kind === 'referral' ? undefined : d} />
}

function Stepper({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-footnote font-label text-ink-2">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer: ${label}`} onClick={() => onChange(Math.max(min, value - step))} className="grid size-11 place-items-center rounded-full border-token border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2">
          <MinusIcon size={20} aria-hidden="true" />
        </button>
        <input
          id={id}
          name={label}
          autoComplete="off"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
          }}
          className="h-11 w-20 rounded-control border-token border-line-strong bg-surface text-center text-headline tabular-nums text-ink"
        />
        <button type="button" aria-label={`More: ${label}`} onClick={() => onChange(Math.min(max, value + step))} className="grid size-11 place-items-center rounded-full border-token border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2">
          <PlusIcon size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function metFrom(result: DrillResult | undefined, target?: number): Met | undefined {
  if (!result || result.successes === undefined || !target || result.successes === 0) return undefined
  if (result.successes >= target) return 'yes'
  return result.successes >= target - 3 ? 'partly' : 'no'
}

const nextDays = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i + 1)
    return todayYmd(d)
  })

function LogForm({ model, d }: { model: FocusModel; d?: FocusDecision | KeepGoingDecision }) {
  const navigate = useNavigate()
  const location = useLocation()
  const result = (location.state as DrillResult | null) ?? undefined
  const drill = d?.drill
  const [minutes, setMinutes] = useState<number>(result?.minutes ?? drill?.minutes ?? 10)
  const [serves, setServes] = useState<number>(drill?.approxServes ?? 30)
  const [met, setMet] = useState<Met | undefined>(metFrom(result, drill?.counter?.target))
  const [feel, setFeel] = useState<Feel>()
  const [helpful, setHelpful] = useState<Helpful>()
  const [body, setBody] = useState<BodyAnswer>('fine')
  const [setting, setSetting] = useState<Setting>('court')
  const [note, setNote] = useState('')
  const [check, setCheck] = useState<BodyCheckStart | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState<{ unlocked: boolean; regression: boolean; otherCue: boolean } | null>(null)
  const noteId = useId()
  const plan = useFocusStore((s) => s.planRetest)
  const days = nextDays(7)
  const due = d?.kind === 'focus' ? d.retestDue?.dueBy : undefined
  const [day, setDay] = useState<string>(due && due > todayYmd() && days.includes(due) ? due : days[1])
  const referralActive = model.decision?.kind === 'referral'
  // Guard unsaved input (DESIGN §8.15 "Discard this log?").
  const dirty = !saved && (note.trim().length > 0 || feel !== undefined || helpful !== undefined || (met !== undefined && !result))
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname)
  const minuteChoices = [...new Set([5, 10, 15, drill?.minutes ?? 10])].sort((a, b) => a - b)

  const onBody = (b: BodyAnswer) => {
    setBody(b)
    if (b === 'sore') setCheck('where')
    if (b === 'pain') setCheck('redflags')
  }

  const save = async () => {
    setSaving(true)
    setError(false)
    try {
      await savePracticeLog(model, {
        date: todayYmd(),
        ...(d ? { itemId: d.itemId, drillId: d.drill.id, drillVariant: d.drill.variant === 'progression-alt' ? 'progression' : d.drill.variant } : {}),
        minutes,
        reps: serves,
        ...(met ? { successCriterionMet: met } : {}),
        ...(feel ? { feel } : {}),
        ...(helpful ? { cueHelpful: helpful } : {}),
        ...(d ? { cueRegisterUsed: d.cue.register } : {}),
        setting,
        body,
        ...(note.trim() ? { note: note.trim().slice(0, 140) } : {}),
      })
      const logs = [...model.logs.map(toPracticeSummary), { date: todayYmd(), itemId: d?.itemId, successCriterionMet: met, feel, body }]
      const rules = practiceLogRules(logs, d?.itemId)
      // Never "the harder version is open" after a sore or painful practice, or with a referral (§10.3).
      const calm = body === 'fine' && !referralActive && !useFocusStore.getState().referral
      setSaved({ unlocked: calm && rules.unlockProgression && !d?.drill.progression, regression: rules.suggestRegression, otherCue: rules.suggestOtherCue })
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const finish = () => {
    const expId = model.experimentRecord?.id
    if (expId && !referralActive) plan(expId, day)
    navigate(paths.focus())
  }

  const banner = model.isDemo ? <SampleBanner /> : undefined

  if (saved) {
    return (
      <Screen title={LOG_COPY.title} back={{ to: paths.focus(), label: 'Focus' }} banner={banner} bottomAction={<Button onClick={finish}>{LOG_COPY.done}</Button>}>
        <p className="flex items-center gap-2 text-title-2 text-ink">
          <CheckCircleIcon size={24} aria-hidden="true" className="text-good" />
          {LOG_COPY.saved}
        </p>
        {saved.unlocked ? <p className="text-callout text-ink">Two practices met the goal, so the harder version is open on your focus.</p> : null}
        {saved.regression ? <p className="text-callout text-ink">{FOCUS_COPY.suggestedRegression}</p> : null}
        {saved.otherCue ? <p className="text-callout text-ink">{FOCUS_COPY.suggestedOtherCue}</p> : null}
        {!referralActive && d?.kind === 'focus' ? (
          <section className="flex flex-col gap-3" aria-labelledby="plan">
            <SectionLabel>
              <span id="plan">{LOG_COPY.nextTitle}</span>
            </SectionLabel>
            <p className="flex items-start gap-2 text-callout text-ink">
              <ArrowsClockwiseIcon size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-2" />
              <span>{d.retestDue?.text ?? d.retest.text}</span>
            </p>
            <ChoiceChips label={LOG_COPY.pickDay} options={days.map((x) => ({ value: x, label: shortDate(x) }))} value={day} onChange={setDay} hint="Within a week works best, before practising the drill that day." />
          </section>
        ) : null}
      </Screen>
    )
  }

  return (
    <Screen
      title={LOG_COPY.title}
      back={{ to: paths.focus(), label: 'Focus' }}
      banner={banner}
      className="gap-6"
      bottomAction={
        <Button onClick={save} loading={saving}>
          {LOG_COPY.save}
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        {d ? <p className="text-headline text-ink">{d.drill.name}</p> : null}
        <p className="text-footnote text-ink-3">{longDate()}</p>
      </div>
      <ChoiceChips
        label={LOG_COPY.minutes}
        options={minuteChoices.map((m) => ({ value: String(m), label: `${m} min` }))}
        value={minuteChoices.includes(minutes) ? String(minutes) : undefined}
        onChange={(v) => setMinutes(Number(v))}
      />
      {!minuteChoices.includes(minutes) ? <Stepper label="Other minutes" value={minutes} onChange={setMinutes} min={1} max={90} /> : null}
      <Stepper label={LOG_COPY.serves} value={serves} onChange={setServes} min={0} max={200} step={5} />
      <ChoiceChips label={LOG_COPY.goalMet} options={[{ value: 'yes', label: A.yes }, { value: 'partly', label: A.partly }, { value: 'no', label: A.no }]} value={met} onChange={setMet} hint={d ? `${FOCUS_COPY.goal}: ${d.drill.successCriterion}` : undefined} />
      <ChoiceChips label={LOG_COPY.feel} options={[{ value: 'natural', label: A.natural }, { value: 'ok', label: A.ok }, { value: 'awkward', label: A.awkward }]} value={feel} onChange={setFeel} />
      <ChoiceChips label={LOG_COPY.cueHelpful} options={[{ value: 'yes', label: A.yes }, { value: 'not-sure', label: A.notSure }, { value: 'no', label: A.no }]} value={helpful} onChange={setHelpful} />
      <ChoiceChips label={LOG_COPY.body} options={[{ value: 'fine', label: A.fine }, { value: 'sore', label: A.sore }, { value: 'pain', label: A.pain }]} value={body} onChange={onBody} />
      <ChoiceChips label={LOG_COPY.setting} options={[{ value: 'court', label: A.court }, { value: 'wall', label: A.wall }, { value: 'other', label: A.other }]} value={setting} onChange={setSetting} />
      <div className="flex flex-col gap-2">
        <label htmlFor={noteId} className="text-footnote font-label text-ink-2">
          {LOG_COPY.note}
        </label>
        <textarea
          id={noteId}
          name="note"
          autoComplete="off"
          value={note}
          maxLength={140}
          rows={3}
          onChange={(e) => setNote(e.target.value.slice(0, 140))}
          className="rounded-control border-token border-line-strong bg-surface p-3 text-body text-ink"
          aria-describedby={`${noteId}-help`}
        />
        <p id={`${noteId}-help`} className="text-footnote tabular-nums text-ink-3" aria-live="polite">
          {LOG_COPY.noteHelp(140 - note.length)}
        </p>
      </div>
      {error ? (
        <p className="flex items-center gap-2 text-callout text-critical" role="alert">
          <WarningCircleIcon size={20} aria-hidden="true" />
          {LOG_COPY.saveError}
        </p>
      ) : null}
      <BodyCheckSheet open={check !== null} onClose={() => setCheck(null)} start={check ?? 'where'} profile={model.profile} />
      <Sheet open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title={LOG_COPY.discardTitle}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-callout text-ink">{LOG_COPY.discardBody}</p>
          <Button variant="secondary" onClick={() => blocker.reset?.()}>
            {LOG_COPY.keepEditing}
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            {LOG_COPY.discard}
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}
