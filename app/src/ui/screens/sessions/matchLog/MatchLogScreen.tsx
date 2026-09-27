import { FlagPennantIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { deleteMatchLog, listMatchLogs, saveMatchLog, showToast } from '../../../../data/index.ts'
import { useActiveExperiment, useProfile } from '../../../../data/hooks.ts'
import type { MatchLogRecord } from '../../../../data/records.ts'
import { Button, Card, DelayedSkeleton, EmptyState, MetricValue, Screen, SectionLabel, Sheet, Skeleton, StatusChip } from '../../../components/index.ts'
import { ChoiceChips, Stepper } from '../../../components/record/index.ts'
import { shortDate } from '../../../format/dates.ts'
import { paths } from '../../../shell/paths.ts'
import { safeFrom } from '../../plan/planLinks.ts'
import { PAIN_RULE } from '../../record/flow/copy.ts'
import { COMPETITIONS, CUE_ANSWERS, defaultDraft, fromRecord, LIMITS, NOTE_MAX, toRecord, validate, ymd, type MatchDraft } from './matchForm.ts'

/**
 * Match log (PRODUCT §6.11; DESIGN §8.15 "Match log"; METRICS §3.18, §3.19; D11): about 20 seconds
 * after a comp night. Service games and double faults, first serves in out of hit (optional, counts
 * only), whether the cue got used, and a short note that stays on the phone. Everything is "You
 * logged"; comp nights show on Progress as their own series, never pooled with practice and never
 * used for a verdict. Entry is always free. An existing entry opens pre-filled with Delete entry.
 */
export function MatchLogScreen() {
  const { matchId } = useParams()
  const [search] = useSearchParams()
  const from = safeFrom(search.get('from')) ?? paths.progress()
  const back = { to: from, label: from.startsWith(paths.progress()) ? 'Progress' : 'Back' }
  const profile = useProfile()
  const logs = useLiveQuery(() => listMatchLogs(), [])
  const active = useActiveExperiment()
  const title = matchId ? 'Edit match' : 'Log a match'

  if (profile === undefined || logs === undefined || active === undefined) {
    return (
      <Screen title={title} back={back}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-3">
            <Skeleton variant="tile" />
            <Skeleton variant="tile" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }
  const existing = matchId ? (logs.find((l) => l.id === matchId) ?? null) : null
  if (matchId && !existing) {
    return (
      <Screen title={title} back={back}>
        <EmptyState icon={FlagPennantIcon} title="Match not found" body="It may have been deleted. Your other comp nights are on Progress." action={<Button variant="secondary" to={paths.progress()}>Go to Progress</Button>} />
      </Screen>
    )
  }
  const own = logs.filter((l) => l.isDemo !== 1)
  return (
    <MatchForm
      key={existing?.id ?? 'new'}
      title={title}
      back={back}
      existing={existing}
      initial={existing ? fromRecord(existing) : defaultDraft({ now: new Date(), matchNights: profile?.matchNights, last: own.at(-1) ?? null })}
      experimentId={active && !active.isDemo ? active.id : undefined}
    />
  )
}

interface FormProps {
  title: string
  back: { to: string; label: string }
  existing: MatchLogRecord | null
  initial: MatchDraft
  experimentId?: string
}

function MatchForm({ title, back, existing, initial, experimentId }: FormProps) {
  const navigate = useNavigate()
  const [d, setD] = useState<MatchDraft>(initial)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const ids = { date: useId(), notes: useId(), help: useId(), errors: useId() }
  const now = new Date()
  const errors = validate(d, now)
  const shownErrors = tried ? errors : { ...(errors.firstServes ? { firstServes: errors.firstServes } : {}), ...(errors.doubleFaults && d.firstServesAttempted !== null ? { doubleFaults: errors.doubleFaults } : {}) }
  const ok = Object.keys(errors).length === 0
  const counting = d.firstServesAttempted !== null
  const set = (patch: Partial<MatchDraft>) => setD((prev) => ({ ...prev, ...patch }))
  const cueExperiment = existing?.experimentId ?? experimentId
  // Guard unsaved input (DESIGN §8.15, as the practice log does); saving or deleting leaves freely.
  const [leaving, setLeaving] = useState(false)
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving && currentLocation.pathname !== nextLocation.pathname)

  const save = async () => {
    setTried(true)
    if (!ok) {
      // Take the player to the first problem (errors sit inline next to their fields).
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-field-error]')?.focus())
      return
    }
    setSaving(true)
    setSaveError(false)
    try {
      const fields = toRecord(d, { experimentId: cueExperiment })
      // An older entry's rough first-serve share is kept unless counts replace it.
      const rough = !fields.firstServesAttempted && existing?.firstServeRough ? { firstServeRough: existing.firstServeRough } : {}
      await saveMatchLog({ ...fields, ...rough, ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}), ...(existing?.isDemo ? { isDemo: existing.isDemo } : {}) })
      showToast(existing ? 'Match updated.' : 'Match logged.')
      setLeaving(true)
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    const snapshot = existing
    await deleteMatchLog(existing.id)
    showToast('Match deleted.', { label: 'Undo', onPress: () => void saveMatchLog(snapshot) })
    setLeaving(true)
  }

  // Navigate once the guard is lifted (after the render that sets `leaving`).
  useEffect(() => {
    if (leaving) navigate(back.to, { replace: true })
  }, [leaving, navigate, back.to])

  const firstValue =
    counting && d.firstServesAttempted && d.firstServesAttempted > 0 && (d.firstServesIn ?? 0) <= d.firstServesAttempted
      ? {
          id: 'first-serve-in-rate',
          value: (d.firstServesIn ?? 0) / d.firstServesAttempted,
          unit: 'k-of-n',
          status: 'player-entered' as const,
          confidence: 1,
          basis: 'first serves you counted on this comp night',
          provenance: 'match-log' as const,
          n: d.firstServesAttempted,
          secondary: { k: d.firstServesIn ?? 0 },
        }
      : null

  return (
    <Screen
      title={title}
      back={back}
      bottomAction={
        <>
          <Button onClick={() => void save()} loading={saving} aria-describedby={tried && !ok ? ids.errors : undefined}>
            Save
          </Button>
          {tried && !ok ? (
            <p id={ids.errors} className="text-center text-footnote text-critical" role="alert">
              Check the highlighted answers.
            </p>
          ) : null}
          {saveError ? (
            <p className="text-center text-footnote text-critical" role="alert">
              We couldn't save that. Try again.
            </p>
          ) : null}
        </>
      }
    >
      <p className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-callout text-ink-2">
        <span>Your own record of the night. It shows next to your practice on Progress, never mixed with it.</span>
        <StatusChip status="player-entered" />
      </p>

      <section className="flex flex-col gap-3" aria-labelledby="match-when">
        <SectionLabel>
          <span id="match-when">The match</span>
        </SectionLabel>
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.date} className="text-footnote font-label text-ink-2">
              Date
            </label>
            <input
              id={ids.date}
              type="date"
              name="match-date"
              autoComplete="off"
              max={ymd(now)}
              value={d.date}
              aria-invalid={shownErrors.date ? true : undefined}
              aria-describedby={shownErrors.date ? `${ids.date}-error` : `${ids.date}-help`}
              onChange={(e) => set({ date: e.target.value })}
              className="h-13 w-full rounded-control border-token border-line-strong bg-surface px-4 text-body text-ink tabular-nums"
            />
            {shownErrors.date ? (
              <FieldError id={`${ids.date}-error`}>{shownErrors.date}</FieldError>
            ) : (
              <p id={`${ids.date}-help`} className="text-footnote text-ink-3">
                {/^\d{4}-\d{2}-\d{2}$/.test(d.date) ? `Comp night, ${shortDate(d.date)}` : 'The night you played.'}
              </p>
            )}
          </div>
          <ChoiceChips label="Competition" stacked options={COMPETITIONS} value={d.competition} onChange={(v) => v && set({ competition: v })} />
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="match-serving">
        <SectionLabel>
          <span id="match-serving">Your serving</span>
        </SectionLabel>
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Stepper label="Service games" value={d.serviceGames} min={LIMITS.serviceGames.min} max={LIMITS.serviceGames.max} onChange={(v) => set({ serviceGames: v })} />
            {shownErrors.serviceGames ? <FieldError>{shownErrors.serviceGames}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-1">
            <Stepper label="Double faults" value={d.doubleFaults} min={0} max={LIMITS.doubleFaults.max} onChange={(v) => set({ doubleFaults: v })} />
            {shownErrors.doubleFaults ? <FieldError>{shownErrors.doubleFaults}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <ChoiceChips
              label="Did you count first serves?"
              stacked
              options={[
                { value: 'no', label: 'No' },
                { value: 'yes', label: 'Yes' },
              ]}
              value={counting ? 'yes' : 'no'}
              onChange={(v) => set(v === 'yes' ? { firstServesAttempted: d.firstServesAttempted ?? 20, firstServesIn: d.firstServesIn ?? 10 } : { firstServesAttempted: null, firstServesIn: null })}
            />
            {counting ? (
              <>
                <Stepper label="First serves in" value={d.firstServesIn ?? 0} min={0} max={LIMITS.firstServes.max} onChange={(v) => set({ firstServesIn: v })} />
                <Stepper label="First serves hit" value={d.firstServesAttempted ?? 1} min={1} max={LIMITS.firstServes.max} onChange={(v) => set({ firstServesAttempted: v })} />
                {shownErrors.firstServes ? (
                  <FieldError>{shownErrors.firstServes}</FieldError>
                ) : firstValue ? (
                  <p className="flex flex-wrap items-baseline gap-x-2 text-footnote text-ink-2">
                    <MetricValue metricId="first-serve-in-rate" value={firstValue} className="[&_.text-body]:text-callout" />
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-footnote text-ink-3">Optional. A teammate counting from the bench makes this easy.</p>
            )}
          </div>
        </Card>
      </section>

      {cueExperiment ? (
        <section className="flex flex-col gap-3" aria-labelledby="match-cue">
          <SectionLabel>
            <span id="match-cue">Your cue</span>
          </SectionLabel>
          <Card>
            <ChoiceChips label="Did you use your practice cue?" stacked optional options={CUE_ANSWERS} value={d.cueUsed} onChange={(v) => set({ cueUsed: v })} />
          </Card>
        </section>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.notes} className="text-footnote font-label text-ink-2">
          Note (optional)
        </label>
        <textarea
          id={ids.notes}
          name="match-notes"
          rows={3}
          maxLength={NOTE_MAX}
          autoComplete="off"
          value={d.notes}
          aria-describedby={ids.help}
          onChange={(e) => set({ notes: e.target.value })}
          className="w-full resize-none rounded-control border-token border-line-strong bg-surface px-4 py-3 text-body text-ink"
        />
        <p id={ids.help} className="flex justify-between gap-3 text-footnote text-ink-3">
          <span>Stays on this phone. Not included in exports.</span>
          <span className="tabular-nums" aria-live="polite">
            {d.notes.length} of {NOTE_MAX}
          </span>
        </p>
        {d.notes.length > 0 && /\b(pain|hurt|hurts|sore|injur)/i.test(d.notes) ? (
          <p className="text-footnote text-ink-2">{PAIN_RULE}</p>
        ) : null}
      </div>

      {existing ? (
        <Button variant="destructive" onClick={() => void remove()}>
          Delete entry
        </Button>
      ) : null}

      <Sheet open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="Discard this match?">
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-callout text-ink-2">What you entered for this comp night isn't saved yet.</p>
          <Button variant="secondary" onClick={() => blocker.reset?.()}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            Discard
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}

/** An inline error next to its field; the first one takes focus when a save is refused. */
function FieldError({ id, children }: { id?: string; children: string }) {
  return (
    <p id={id} tabIndex={-1} data-field-error className="flex items-start gap-1.5 rounded-control text-footnote text-critical" role="alert">
      <WarningCircleIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      {children}
    </p>
  )
}
