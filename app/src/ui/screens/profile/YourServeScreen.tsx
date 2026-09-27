import { HeartbeatIcon, InfoIcon, WarningCircleIcon, XCircleIcon } from '@phosphor-icons/react'
import { useId, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router'
import { LESS_EFFORT_LINE } from '../../../coaching/safety.ts'
import { saveProfile, showToast } from '../../../data/index.ts'
import { useProfile } from '../../../data/hooks.ts'
import { Button, DelayedSkeleton, Screen, SectionLabel, Sheet, Skeleton } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { paths } from '../../shell/paths.ts'
import { ChoiceList } from './parts/ChoiceList.tsx'
import { inOptionOrder } from './parts/choiceLogic.ts'
import { DayChips } from './parts/DayChips.tsx'
import { HandQuestion } from './parts/HandQuestion.tsx'
import { HeightInput } from './parts/HeightInput.tsx'
import { LevelFields } from './parts/LevelFields.tsx'
import { GOAL_OPTIONS, PLAY_STYLE_OPTIONS } from './parts/words.ts'
import { formFromProfile, heightChanged, patchFromForm, sameForm, saveBlocker, SEASON_WEEKS_MAX, seasonCheck, type ServeForm } from './yourServeModel.ts'

const back = { to: paths.profile(), label: 'You' }

/**
 * Your serve (PRODUCT §6.13 item 1, DESIGN §10.12): height, hand, level (UTR or band), goal, how you
 * play, match nights and season, with the same options as onboarding. Height turns video into
 * centimetres and never leaves this phone; changing it recomputes centimetres from stored ratios.
 */
export function YourServeScreen() {
  const profile = useProfile()
  if (profile === undefined) {
    return (
      <Screen title="Your serve" back={back}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-4">
            <Skeleton variant="tile" />
            <Skeleton variant="tile" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }
  return <YourServeForm profile={profile} />
}

function YourServeForm({ profile }: { profile: ReturnType<typeof useProfile> }) {
  const navigate = useNavigate()
  const id = useId()
  const [initial] = useState(() => formFromProfile(profile))
  const [form, setForm] = useState<ServeForm>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<ServeForm>) => {
    setError(null)
    setForm((f) => ({ ...f, ...patch }))
  }

  const blocker = saveBlocker(form)
  const dirty = !sameForm(form, initial)
  const comp = form.playStyle.some((p) => p !== 'no-comp')
  const season = seasonCheck(form)

  // Unsaved edits: leaving asks first (router guard); a finished save is allowed through.
  const saved = useRef(false)
  const leaveGuard = useBlocker(({ currentLocation, nextLocation }) => dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname)

  const save = async () => {
    if (blocker || !dirty) return
    setBusy(true)
    try {
      await saveProfile(patchFromForm(form))
      saved.current = true
      showToast('Your serve saved.')
      navigate(paths.profile())
    } catch {
      setError("We couldn't save that. Try again.")
      setBusy(false)
    }
  }

  return (
    <Screen
      title="Your serve"
      back={back}
      bottomAction={
        <>
          <Button onClick={save} disabled={Boolean(blocker) || !dirty} loading={busy} aria-describedby={`${id}-save-help`}>
            Save
          </Button>
          <p id={`${id}-save-help`} className="-mt-1 text-center text-footnote text-ink-3" aria-live="polite">
            {blocker ?? (dirty ? 'Saved on this phone only.' : 'No changes yet.')}
          </p>
        </>
      }
    >
      <Sheet
        open={leaveGuard.state === 'blocked'}
        onClose={() => leaveGuard.reset?.()}
        title="Discard your changes?"
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => leaveGuard.reset?.()}>
              Keep editing
            </Button>
            <Button variant="destructive" icon={XCircleIcon} onClick={() => leaveGuard.proceed?.()}>
              Discard
            </Button>
          </div>
        }
      >
        <p className="pb-2 text-body text-ink-2">Your edits to your serve have not been saved.</p>
      </Sheet>
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-footnote text-critical">
          <WarningCircleIcon size={16} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby={`${id}-body`}>
        <SectionLabel>
          <span id={`${id}-body`}>Height and hand</span>
        </SectionLabel>
        <HeightInput valueCm={form.heightCm} onChange={(heightCm) => set({ heightCm })} reasonOpen />
        {heightChanged(profile, form) ? (
          <p className="flex items-start gap-2 text-footnote text-ink-2">
            <InfoIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            Centimetres will use your new height. Sessions from before and after the change are never compared in centimetres.
          </p>
        ) : null}
        <HandQuestion value={form.handedness} onChange={(handedness) => set({ handedness })} />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby={`${id}-level`}>
        <SectionLabel>
          <span id={`${id}-level`}>Level</span>
        </SectionLabel>
        <LevelFields value={{ utrText: form.utrText, noUtr: form.noUtr, description: form.description }} onChange={(p) => set(p)} />
        <p className="text-footnote text-ink-3">
          Level sets how cues are worded: pictures for UTR 1 to 3, targets for UTR 4 to 7. Stored on this phone only.
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-goal`}>
        <SectionLabel>
          <span id={`${id}-goal`}>What costs you points on serve?</span>
        </SectionLabel>
        <ChoiceList labelledBy={`${id}-goal`} mode="single" size="compact" options={GOAL_OPTIONS} value={form.goal ? [form.goal] : []} onChange={([goal]) => set({ goal })} />
        {form.goal === 'less-effort' ? (
          <p className="flex items-start gap-2 text-footnote text-ink-2">
            <HeartbeatIcon size={20} aria-hidden="true" className="mt-px shrink-0" />
            {LESS_EFFORT_LINE}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-play`}>
        <SectionLabel>
          <span id={`${id}-play`}>How you play</span>
        </SectionLabel>
        <ChoiceList
          labelledBy={`${id}-play`}
          mode="multi"
          size="compact"
          options={PLAY_STYLE_OPTIONS}
          exclusive={['no-comp']}
          value={form.playStyle}
          onChange={(next) => set({ playStyle: inOptionOrder(next, PLAY_STYLE_OPTIONS) })}
        />
        {comp ? (
          <div className="flex flex-col gap-2 pt-1">
            <p id={`${id}-nights`} className="text-footnote font-label text-ink-2">
              Match nights (optional)
            </p>
            <DayChips value={form.matchNights} onChange={(matchNights) => set({ matchNights })} labelledBy={`${id}-nights`} />
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${id}-season`}>
        <SectionLabel>
          <span id={`${id}-season`}>Season (optional)</span>
        </SectionLabel>
        <p className="-mt-1 text-footnote text-ink-2">Add your season to see progress in season weeks.</p>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={`${id}-start`} className="text-footnote font-label text-ink-2">
              Starts
            </label>
            <input
              id={`${id}-start`}
              name="season-start"
              type="date"
              autoComplete="off"
              value={form.seasonStart}
              onChange={(e) => set({ seasonStart: e.target.value })}
              className={cx('h-13 w-full min-w-0 rounded-control border-token bg-surface px-3 text-body text-ink', season.error ? 'border-critical' : 'border-line-strong')}
            />
          </div>
          <div className="flex w-28 flex-col gap-2">
            <label htmlFor={`${id}-weeks`} className="text-footnote font-label text-ink-2">
              Weeks
            </label>
            <input
              id={`${id}-weeks`}
              name="season-weeks"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              placeholder="14…"
              value={form.seasonWeeks}
              onChange={(e) => set({ seasonWeeks: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              aria-describedby={`${id}-weeks-help`}
              className={cx(
                'h-13 w-full rounded-control border-token bg-surface px-3 text-body tabular-nums text-ink placeholder:text-ink-3',
                season.error ? 'border-critical' : 'border-line-strong',
              )}
            />
          </div>
        </div>
        <p id={`${id}-weeks-help`} className={cx('text-footnote', season.error ? 'text-critical' : 'text-ink-3')}>
          {season.error ?? `Up to ${SEASON_WEEKS_MAX} weeks.`}
        </p>
        {form.seasonStart || form.seasonWeeks ? (
          <div>
            <Button variant="tertiary" onClick={() => set({ seasonStart: '', seasonWeeks: '' })}>
              Clear season
            </Button>
          </div>
        ) : null}
      </section>
    </Screen>
  )
}
