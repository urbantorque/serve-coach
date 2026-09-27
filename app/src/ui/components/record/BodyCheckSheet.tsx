import { CheckSquareOffsetIcon, FirstAidIcon, SquareIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { BODY_CHECK, RED_FLAG_ANSWERS, RED_FLAG_TITLE, RED_FLAGS, REFERRAL_COPY, referralLevel, sorenessLine } from '../../../coaching/safety.ts'
import type { BodyCheck, BodyRegion, ReferralLevel } from '../../../coaching/types.ts'
import { Button } from '../Button.tsx'
import { cx } from '../cx.ts'
import { Sheet } from '../Sheet.tsx'
import { ChoiceChips } from './ChoiceChips.tsx'

export interface BodyCheckSheetProps {
  open: boolean
  /** Closed without an answer (the recording does not start). */
  onCancel: () => void
  /** "All good", or "A bit sore" with no warning signs: recording may go ahead. */
  onClear: (check: Extract<BodyCheck, { answer: 'fine' } | { answer: 'sore' }>) => void
  /** A referral was shown and acknowledged: no recording today. */
  onStop: (level: ReferralLevel) => void
}

type Step = 'ask' | 'where' | 'sore-ok' | 'red-flags' | 'referral'

/**
 * Quick body check (COACHING §10.1 to §10.3, DESIGN §8.15): before every recording, never skipped.
 * Three full-width answers; follow-ups replace the content in place. "It hurts" leads to the
 * red-flag questions and a referral card that has to be acknowledged. The app never assesses or
 * names a condition; copy comes verbatim from coaching/safety.ts.
 */
export function BodyCheckSheet({ open, onCancel, onClear, onStop }: BodyCheckSheetProps) {
  const [step, setStep] = useState<Step>('ask')
  const [regions, setRegions] = useState<BodyRegion[]>([])
  const [sharp, setSharp] = useState<'yes' | 'no' | null>(null)
  const [ticked, setTicked] = useState<string[]>([])
  const [level, setLevel] = useState<ReferralLevel>('stop-and-book')

  const reset = () => {
    setStep('ask')
    setRegions([])
    setSharp(null)
    setTicked([])
  }
  const cancel = () => {
    reset()
    onCancel()
  }
  const refer = (l: ReferralLevel) => {
    setLevel(l)
    setStep('referral')
  }

  const referral = REFERRAL_COPY[level]
  const title = step === 'red-flags' ? RED_FLAG_TITLE : step === 'referral' ? referral.title : BODY_CHECK.title

  return (
    <Sheet open={open} onClose={cancel} title={title} dismissible={step !== 'referral'} closeStyle={step === 'referral' ? 'none' : 'icon'}>
      {step === 'ask' ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink">{BODY_CHECK.question}</p>
          <Button variant="secondary" data-autofocus onClick={() => onClear({ answer: 'fine' })}>
            {BODY_CHECK.answers.fine}
          </Button>
          <Button variant="secondary" onClick={() => setStep('where')}>
            {BODY_CHECK.answers.sore}
          </Button>
          <Button variant="secondary" onClick={() => setStep('red-flags')}>
            {BODY_CHECK.answers.pain}
          </Button>
        </div>
      ) : null}

      {step === 'where' ? (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-headline text-ink">{BODY_CHECK.whereQuestion}</legend>
            <div className="flex flex-wrap gap-2">
              {BODY_CHECK.regions.map((r) => {
                const on = regions.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRegions((rs) => (on ? rs.filter((x) => x !== r.id) : [...rs, r.id]))}
                    className={cx(
                      'relative inline-flex h-9 items-center gap-1 rounded-full px-3 text-subhead after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
                      on ? 'border-token border-ink bg-ink text-ink-inverse' : 'border-token border-line-strong bg-surface text-ink hover:bg-surface-2',
                    )}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <ChoiceChips
            stacked
            label={BODY_CHECK.sharpQuestion}
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]}
            value={sharp}
            onChange={(v) => setSharp(v)}
          />
          <Button
            variant="secondary"
            disabled={regions.length === 0 || sharp === null}
            onClick={() => (sharp === 'yes' ? setStep('red-flags') : setStep('sore-ok'))}
          >
            Next
          </Button>
          {regions.length === 0 || sharp === null ? <p className="text-footnote text-ink-3">Pick where, and answer the question, to go on.</p> : null}
        </div>
      ) : null}

      {step === 'sore-ok' ? (
        <div className="flex flex-col gap-4">
          <p className="text-body text-ink">{sorenessLine(regions)}</p>
          <Button data-autofocus onClick={() => onClear({ answer: 'sore', regions })}>
            Continue
          </Button>
        </div>
      ) : null}

      {step === 'red-flags' ? (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col">
            {RED_FLAGS.map((q) => {
              const on = ticked.includes(q.id)
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setTicked((t) => (on ? t.filter((x) => x !== q.id) : [...t, q.id]))}
                    className="flex min-h-14 w-full items-start gap-3 rounded-control py-3 text-left hover:bg-surface-2"
                  >
                    {on ? (
                      <CheckSquareOffsetIcon size={24} aria-hidden="true" className="shrink-0 text-ink" />
                    ) : (
                      <SquareIcon size={24} aria-hidden="true" className="shrink-0 text-ink-3" />
                    )}
                    <span className="text-callout text-ink">{q.text}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <Button variant="secondary" disabled={ticked.length === 0} onClick={() => refer(referralLevel(ticked))}>
            {RED_FLAG_ANSWERS.some}
          </Button>
          <Button variant="secondary" onClick={() => refer('stop-and-book')}>
            {RED_FLAG_ANSWERS.none}
          </Button>
        </div>
      ) : null}

      {step === 'referral' ? (
        <div className={cx('flex flex-col gap-4 rounded-card p-4', level === 'emergency' ? 'bg-critical-soft' : 'card')}>
          <FirstAidIcon size={32} aria-hidden="true" className="text-critical" />
          {referral.body.map((line) => (
            <p key={line} className="text-body text-ink">
              {line}
            </p>
          ))}
          {referral.helpline ? (
            <a href={`tel:${referral.helpline.tel}`} className="text-callout text-ink underline underline-offset-[3px]">
              {referral.helpline.label}
            </a>
          ) : null}
          {level === 'emergency' ? (
            <a
              href="tel:000"
              className="inline-flex h-14 w-full items-center justify-center rounded-control bg-critical text-headline text-on-critical"
            >
              Call 000
            </a>
          ) : null}
          <Button
            variant="secondary"
            data-autofocus
            onClick={() => {
              reset()
              onStop(level)
            }}
          >
            OK
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}
