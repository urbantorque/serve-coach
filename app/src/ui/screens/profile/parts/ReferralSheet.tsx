import { CheckSquareOffsetIcon, FirstAidIcon, PhoneIcon, SquareIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { RED_FLAG_ANSWERS, RED_FLAG_TITLE, RED_FLAGS, REFERRAL_COPY, referralLevel } from '../../../../coaching/safety.ts'
import type { ReferralLevel } from '../../../../coaching/types.ts'
import { Button, Sheet } from '../../../components/index.ts'

export interface ReferralSheetProps {
  open: boolean
  onClose: () => void
}

/**
 * "Something hurts right now?" path from onboarding and Profile → Comfort (COACHING §10.2 to §10.3,
 * PRODUCT §6.16). The red-flag questions, then the matching referral card, verbatim from
 * coaching/safety.ts. The app signposts only: it never assesses, names a condition or estimates
 * severity, and these answers are not stored. The referral card must be acknowledged.
 */
export function ReferralSheet({ open, onClose }: ReferralSheetProps) {
  const [ticked, setTicked] = useState<string[]>([])
  const [level, setLevel] = useState<ReferralLevel | null>(null)
  const ack = useRef<HTMLDivElement>(null)

  // Start from the questions each time the sheet opens (state adjusted during render).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setTicked([])
      setLevel(null)
    }
  }

  // Content swaps in place (DESIGN §8.15): move focus to the card's first action.
  useEffect(() => {
    if (level) ack.current?.querySelector<HTMLElement>('a,button')?.focus()
  }, [level])

  const card = level ? REFERRAL_COPY[level] : null
  const emergency = level === 'emergency'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={card ? card.title : RED_FLAG_TITLE}
      dismissible={!card}
      closeStyle={card ? 'none' : 'icon'}
      footer={
        card ? (
          <div ref={ack} className="flex flex-col gap-3">
            {emergency ? (
              <a
                href="tel:000"
                className="btn inline-flex h-14 w-full items-center justify-center gap-2 rounded-control bg-critical text-headline text-on-critical hover:opacity-90 active:opacity-90"
              >
                <PhoneIcon size={20} aria-hidden="true" />
                Call 000
              </a>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              OK
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              disabled={ticked.length === 0}
              aria-describedby={ticked.length === 0 ? 'referral-tick-hint' : undefined}
              onClick={() => setLevel(referralLevel(ticked))}
            >
              {RED_FLAG_ANSWERS.some}
            </Button>
            <Button variant="secondary" onClick={() => setLevel(referralLevel([]))}>
              {RED_FLAG_ANSWERS.none}
            </Button>
          </div>
        )
      }
    >
      {card ? (
        <div className={emergency ? 'flex flex-col gap-4 rounded-card bg-critical-soft p-4' : 'flex flex-col gap-4'}>
          <FirstAidIcon size={32} aria-hidden="true" className="text-critical" />
          {card.body.map((line) => (
            <p key={line} className="text-body text-ink">
              {line}
            </p>
          ))}
          {card.helpline ? (
            <p className="text-callout text-ink-2">
              {card.helpline.label}{' '}
              <a href={`tel:${card.helpline.tel}`} className="font-label text-ink underline underline-offset-[3px]">
                Call healthdirect
              </a>
            </p>
          ) : null}
          <p className="text-footnote text-ink-3">These answers are not saved. The body check before each recording asks again.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <ul className="flex flex-col" aria-label="Warning signs">
            {RED_FLAGS.map((q) => {
              const on = ticked.includes(q.id)
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setTicked((t) => (on ? t.filter((x) => x !== q.id) : [...t, q.id]))}
                    className="flex min-h-14 w-full items-start gap-3 rounded-control px-1 py-3 text-left hover:bg-surface-2"
                  >
                    {on ? (
                      <CheckSquareOffsetIcon size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-ink" />
                    ) : (
                      <SquareIcon size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
                    )}
                    <span className="text-callout text-ink">{q.text}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p id="referral-tick-hint" className="text-footnote text-ink-3">
            Tick any that apply, or choose “None of these”.
          </p>
        </div>
      )}
    </Sheet>
  )
}
