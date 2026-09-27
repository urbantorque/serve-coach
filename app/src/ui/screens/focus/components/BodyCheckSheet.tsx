import { CheckSquareIcon, FirstAidIcon, PhoneIcon, SquareIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import {
  BODY_CHECK,
  DRILL_PAIN_RULE,
  RED_FLAG_ANSWERS,
  RED_FLAG_TITLE,
  RED_FLAGS,
  REFERRAL_COPY,
  referralLevel,
  sorenessLine,
  type BodyRegion,
  type ReferralLevel,
} from '../../../../coaching/index.ts'
import { saveProfile, showToast } from '../../../../data/index.ts'
import type { ProfileRecord } from '../../../../data/records.ts'
import { Button, cx, Sheet } from '../../../components/index.ts'
import { shortDate } from '../../../format/dates.ts'
import { todayYmd, useFocusStore } from '../focusStore.ts'

type Step = 'consent' | 'question' | 'where' | 'sharp' | 'sore-ok' | 'redflags' | 'referral' | 'checked' | 'still-paused' | 'settled'

export type BodyCheckStart = 'question' | 'where' | 'redflags' | 'settle'

export interface BodyCheckSheetProps {
  open: boolean
  onClose: () => void
  /** Where the flow starts: the full check, "sore" (where?), "it hurts" (red flags) or resuming. */
  start?: BodyCheckStart
  profile: ProfileRecord | null
  /** Called once the player answered "All good" or "A bit sore" and acknowledged. */
  onDone?: (answer: 'fine' | 'sore' | 'referral') => void
  /** Level of the referral being resumed (asks "Have you been checked?" after today or emergency). */
  previousLevel?: ReferralLevel
}

const CONSENT_KEY = 'consentDeclined'

/**
 * The body check, red-flag questions and referral card (COACHING §10; DESIGN §8.15). The app screens
 * and signposts: it never assesses, names a condition or suggests treatment. Answers stay on this
 * phone; the referral switch persists (profile painFlag) only when the player agreed to save answers.
 */
export function BodyCheckSheet({ open, onClose, start = 'question', profile, onDone, previousLevel }: BodyCheckSheetProps) {
  const consentAsked = !!profile?.comfort.consentAt || useFocusStore.getState()[CONSENT_KEY]
  const first: Step = start === 'where' ? 'where' : start === 'redflags' ? 'redflags' : !consentAsked && profile ? 'consent' : 'question'
  const [step, setStep] = useState<Step>(first)
  const [regions, setRegions] = useState<BodyRegion[]>([])
  const [ticked, setTicked] = useState<string[]>([])
  const [level, setLevel] = useState<ReferralLevel>('stop-and-book')
  // Restart at the requested step each time the sheet opens (adjusting state during render).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setStep(first)
      setRegions([])
      setTicked([])
    }
  }
  const store = useFocusStore()

  const persistFlag = async (flag: 0 | 1, area?: BodyRegion) => {
    if (!profile?.comfort.consentAt) return
    try {
      await saveProfile({ comfort: { ...profile.comfort, painFlag: flag, ...(area ? { area } : {}), updatedAt: new Date().toISOString() } })
    } catch {
      // The in-memory referral still applies for this session.
    }
  }

  const reset = () => {
    setStep(first)
    setRegions([])
    setTicked([])
  }
  const close = () => {
    onClose()
    reset()
  }

  const answerFine = () => {
    if (start === 'settle') {
      if (previousLevel === 'today' || previousLevel === 'emergency') setStep('checked')
      else resolve()
      return
    }
    store.setBodyCheck({ answer: 'fine' })
    onDone?.('fine')
    close()
  }

  const resolve = () => {
    store.setReferral(undefined)
    store.setBodyCheck({ answer: 'fine' })
    void persistFlag(0)
    setStep('settled')
  }

  const refer = (lv: ReferralLevel) => {
    setLevel(lv)
    store.setReferral(lv)
    store.setBodyCheck(lv === 'stop-and-book' ? { answer: 'pain' } : { answer: 'red-flag', level: lv })
    void persistFlag(1, regions[0])
    setStep('referral')
  }

  const acknowledgeSore = () => {
    store.setBodyCheck({ answer: 'sore', regions })
    onDone?.('sore')
    close()
  }

  const title: Record<Step, string> = {
    consent: BODY_CHECK.title,
    question: BODY_CHECK.title,
    where: BODY_CHECK.whereQuestion,
    sharp: BODY_CHECK.title,
    'sore-ok': BODY_CHECK.title,
    redflags: RED_FLAG_TITLE,
    referral: REFERRAL_COPY[level].title,
    checked: BODY_CHECK.title,
    'still-paused': BODY_CHECK.title,
    settled: BODY_CHECK.title,
  }

  // A referral card cannot be swiped away until acknowledged (DESIGN §8.15).
  const locked = step === 'referral'

  return (
    <Sheet open={open} onClose={close} title={title[step]} dismissible={!locked} closeStyle={locked ? 'none' : 'icon'}>
      <div className="flex flex-col gap-4 pb-2" data-step={step}>
        {step === 'consent' ? (
          <>
            <p className="text-callout text-ink">{BODY_CHECK.consentQuestion}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={async () => {
                  if (profile) await saveProfile({ comfort: { ...profile.comfort, consentAt: new Date().toISOString() } }).catch(() => undefined)
                  setStep('question')
                }}
              >
                {BODY_CHECK.consentYes}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  store.declineConsent()
                  setStep('question')
                }}
              >
                {BODY_CHECK.consentNo}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'question' ? (
          <>
            <p className="text-callout text-ink">{BODY_CHECK.question}</p>
            <div className="flex flex-col gap-3">
              <Button variant="secondary" onClick={answerFine} data-autofocus>
                {BODY_CHECK.answers.fine}
              </Button>
              <Button variant="secondary" onClick={() => setStep('where')}>
                {BODY_CHECK.answers.sore}
              </Button>
              <Button variant="secondary" onClick={() => setStep('redflags')}>
                {BODY_CHECK.answers.pain}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'where' ? (
          <>
            <div role="group" aria-label={BODY_CHECK.whereQuestion} className="flex flex-col gap-2">
              {BODY_CHECK.regions.map((r) => {
                const on = regions.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRegions(on ? regions.filter((x) => x !== r.id) : [...regions, r.id])}
                    className={cx(
                      'flex min-h-13 items-center gap-3 rounded-control px-4 text-left text-headline',
                      on ? 'bg-ink text-ink-inverse' : 'border-token border-line-strong bg-surface text-ink active:bg-surface-2',
                    )}
                  >
                    {on ? <CheckSquareIcon size={22} aria-hidden="true" /> : <SquareIcon size={22} aria-hidden="true" />}
                    {r.label}
                  </button>
                )
              })}
            </div>
            <Button disabled={regions.length === 0} onClick={() => setStep('sharp')}>
              Next
            </Button>
            {regions.length === 0 ? <p className="text-footnote text-ink-3">Choose where it's sore.</p> : null}
          </>
        ) : null}

        {step === 'sharp' ? (
          <>
            <p className="text-callout text-ink">{BODY_CHECK.sharpQuestion}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setStep('redflags')}>
                Yes
              </Button>
              <Button variant="secondary" onClick={() => setStep('sore-ok')}>
                No
              </Button>
            </div>
          </>
        ) : null}

        {step === 'sore-ok' ? (
          <>
            <p className="text-callout text-ink">{sorenessLine(regions)}</p>
            <p className="text-footnote text-ink-2">{DRILL_PAIN_RULE}</p>
            <Button onClick={acknowledgeSore}>OK</Button>
          </>
        ) : null}

        {step === 'redflags' ? (
          <>
            <ul className="flex flex-col gap-2">
              {RED_FLAGS.map((q) => {
                const on = ticked.includes(q.id)
                return (
                  <li key={q.id}>
                    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-control border-token border-line bg-surface px-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--color-focus)">
                      <input
                        type="checkbox"
                        name="red-flag"
                        value={q.id}
                        className="sr-only"
                        checked={on}
                        onChange={() => setTicked(on ? ticked.filter((x) => x !== q.id) : [...ticked, q.id])}
                      />
                      {on ? (
                        <CheckSquareIcon size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-ink" />
                      ) : (
                        <SquareIcon size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
                      )}
                      <span className="text-callout text-ink">{q.text}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-col gap-3">
              <Button variant="secondary" disabled={ticked.length === 0} onClick={() => refer(referralLevel(ticked))}>
                {RED_FLAG_ANSWERS.some}
              </Button>
              <Button variant="secondary" onClick={() => refer('stop-and-book')}>
                {RED_FLAG_ANSWERS.none}
              </Button>
              {ticked.length === 0 ? <p className="text-footnote text-ink-3">Tick the ones that apply, or choose None of these.</p> : null}
            </div>
          </>
        ) : null}

        {step === 'referral' ? (
          <ReferralContent
            level={level}
            onOk={() => {
              onDone?.('referral')
              close()
            }}
            onRemind={() => {
              const d = new Date()
              d.setDate(d.getDate() + 3)
              const ymd = todayYmd(d)
              store.setRemindFrom(ymd)
              showToast(`Noted. Check in again from ${shortDate(ymd)}.`)
              onDone?.('referral')
              close()
            }}
          />
        ) : null}

        {step === 'checked' ? (
          <>
            <p className="text-callout text-ink">{BODY_CHECK.checkedQuestion}</p>
            <p className="text-footnote text-ink-3">You tell us; the app can't check this.</p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={resolve}>
                Yes
              </Button>
              <Button variant="secondary" onClick={() => setStep('still-paused')}>
                Not yet
              </Button>
            </div>
          </>
        ) : null}

        {step === 'still-paused' ? (
          <>
            <p className="text-callout text-ink">Coaching stays paused until you have been checked. Your stats are safe.</p>
            <Button variant="secondary" onClick={close}>
              OK
            </Button>
          </>
        ) : null}

        {step === 'settled' ? (
          <>
            <p className="text-callout text-ink">{BODY_CHECK.checkedThanks}</p>
            <Button
              onClick={() => {
                onDone?.('fine')
                close()
              }}
            >
              Done
            </Button>
          </>
        ) : null}
      </div>
    </Sheet>
  )
}

/** Referral card content (COACHING §10.3, verbatim). Emergency: critical fill and "Call 000". */
export function ReferralContent({ level, onOk, onRemind, icon = true }: { level: ReferralLevel; onOk?: () => void; onRemind?: () => void; icon?: boolean }) {
  const c = REFERRAL_COPY[level]
  const emergency = level === 'emergency'
  return (
    <div className={cx('flex flex-col gap-4 rounded-card p-4', emergency ? 'bg-critical-soft' : 'bg-surface')} data-referral={level}>
      {icon ? <FirstAidIcon size={32} aria-hidden="true" className="text-critical" /> : null}
      {c.body.map((b) => (
        <p key={b} className="text-callout text-ink">
          {b}
        </p>
      ))}
      {c.helpline ? (
        <a href={`tel:${c.helpline.tel}`} className="inline-flex min-h-11 items-center gap-2 text-callout text-ink underline decoration-1 underline-offset-[3px]">
          <PhoneIcon size={20} aria-hidden="true" />
          {c.helpline.label}
        </a>
      ) : null}
      {emergency ? (
        <a
          href="tel:000"
          className="btn inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-critical text-headline text-on-critical"
        >
          <PhoneIcon size={20} aria-hidden="true" />
          Call 000
        </a>
      ) : null}
      {c.actions.includes('ok') && onOk ? (
        <Button variant="secondary" onClick={onOk}>
          OK
        </Button>
      ) : null}
      {emergency && onOk ? (
        <Button variant="tertiary" onClick={onOk} className="self-center">
          Close
        </Button>
      ) : null}
      {c.actions.includes('remind-3-days') && onRemind ? (
        <Button variant="tertiary" onClick={onRemind} className="self-center">
          Remind me in 3 days
        </Button>
      ) : null}
    </div>
  )
}
