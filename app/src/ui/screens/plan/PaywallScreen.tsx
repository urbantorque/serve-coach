import { CheckIcon, FlaskIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { analysedDaysInMonth, showToast } from '../../../data/index.ts'
import { Button, Card, DelayedSkeleton, ListGroup, ListRow, Screen, SectionLabel, Sheet, Skeleton } from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { exportDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { PRIVACY_POLICY_SUMMARY } from '../profile/copy.ts'
import { switchOffTestPlus, switchOnTestPlus, usePlan } from './entitlement.ts'
import {
  ALWAYS_FREE,
  allowanceLine,
  monthKey,
  PLANS,
  planLabel,
  PLUS_ADDS,
  renewalTerms,
  type PlanId,
} from './planModel.ts'

/**
 * Plan (PRODUCT §5.2, §6.15; DESIGN §10.13). Calm and plain: what Plus adds, three plans shown
 * equally, trial and renewal terms in plain words, what is always free, and "Not now" as visible as
 * the plan button. No countdowns, no strike-through prices, nothing preselected.
 *
 * PWA prototype: nothing is sold. A plan button records the choice as a local test flag (Plus on for
 * this phone), says no payment was taken, and tells the player Plus is not on sale yet.
 */
export function PaywallScreen() {
  const navigate = useNavigate()
  const plan = usePlan()
  const [now] = useState(() => new Date())
  const [choice, setChoice] = useState<PlanId | null>(null)
  const [thanks, setThanks] = useState(false)
  const [sheet, setSheet] = useState<'terms' | 'privacy' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const daysUsed = useLiveQuery(() => analysedDaysInMonth(monthKey(now)).catch(() => 0), [now])
  const helperId = useId()

  const back = { to: paths.profile(), label: 'You' }
  const selected = PLANS.find((p) => p.id === choice)

  const choose = async () => {
    if (!choice) return
    setBusy(true)
    setError(null)
    try {
      await switchOnTestPlus(choice, new Date())
      setThanks(true)
    } catch {
      setError("We couldn't save that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!plan) {
    return (
      <Screen title="Plan" back={back}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-3">
            <Skeleton variant="text" className="h-8 w-2/3" />
            <Skeleton variant="tile" />
            <Skeleton variant="tile" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }

  return (
    <Screen
      title="Plan"
      back={back}
      banner={<PrototypeBanner />}
      bottomAction={
        plan.plus ? undefined : (
          <>
            <Button onClick={choose} disabled={!choice} loading={busy} aria-describedby={!choice ? helperId : undefined}>
              {selected?.action ?? 'Choose a plan'}
            </Button>
            {!choice ? (
              <p id={helperId} className="-mt-1 text-center text-footnote text-ink-3">
                Pick a plan above.
              </p>
            ) : null}
            <Button variant="secondary" to={paths.profile()}>
              Not now
            </Button>
          </>
        )
      }
    >
      {plan.plus ? (
        <Card className="flex flex-col gap-3" label="Your plan">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
              <FlaskIcon size={24} aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <h2 className="text-headline text-ink">{planLabel(plan.entitlement)}</h2>
              <p className="text-callout text-ink-2">Switched on for testing on this phone. No payment was taken.</p>
              {plan.entitlement.trialEndsAt ? (
                <p className="text-footnote text-ink-3">Test trial ends {exportDate(new Date(plan.entitlement.trialEndsAt))}.</p>
              ) : null}
              {plan.entitlement.endsAt ? (
                <p className="text-footnote text-ink-3">Test season pass ends {exportDate(new Date(plan.entitlement.endsAt))}.</p>
              ) : null}
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={async () => {
              await switchOffTestPlus()
              showToast('Test Plus is off.')
            }}
          >
            Switch off test Plus
          </Button>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="plan-pitch">
        <h2 id="plan-pitch" className="text-title-1 text-ink">
          {plan.plus ? 'What Plus includes' : 'Keep your experiments going'}
        </h2>
        {plan.plus ? null : (
          <p className="text-callout text-ink-2">
            Plus gives you unlimited analysed sessions, full history and trends, and side-by-side with your best serve.
          </p>
        )}
      </section>

      {plan.plus ? null : (
        <section className="flex flex-col gap-2" aria-labelledby="plan-choose">
          <SectionLabel>
            <span id="plan-choose">Plans</span>
          </SectionLabel>
          <PlanCards value={choice} onChange={setChoice} now={now} />
          {selected ? <p className="text-footnote text-ink-2">{renewalTerms(selected.id, now)}</p> : null}
          {error ? (
            <p role="alert" className="text-footnote text-critical">
              {error}
            </p>
          ) : null}
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="plan-adds">
        <SectionLabel>
          <span id="plan-adds">What Plus adds</span>
        </SectionLabel>
        <ul className="card flex flex-col gap-3 p-4">
          {PLUS_ADDS.map((line) => (
            <li key={line} className="flex items-start gap-3 text-callout text-ink">
              <CheckIcon size={20} aria-hidden="true" className="mt-px shrink-0 text-ink-2" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="plan-free">
        <SectionLabel>
          <span id="plan-free">Always free</span>
        </SectionLabel>
        <div className="card flex flex-col gap-3 p-4">
          <ul className="flex flex-col gap-2">
            {ALWAYS_FREE.map((line) => (
              <li key={line} className="flex items-start gap-3 text-callout text-ink">
                <ShieldCheckIcon size={20} aria-hidden="true" className="mt-px shrink-0 text-ink-2" />
                {line}
              </li>
            ))}
          </ul>
          <p className="border-t border-line pt-3 text-footnote text-ink-2 tabular-nums">
            {daysUsed === undefined ? 'Counting analysed days…' : allowanceLine(daysUsed)}. During the beta everything is unlocked, so this is for
            information only.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="plan-manage">
        <SectionLabel>
          <span id="plan-manage">Subscription</span>
        </SectionLabel>
        <ListGroup>
          <ListRow
            title="Manage subscription"
            subtitle="iPhone app only"
            trailing="Not in prototype"
            chevron={false}
            onPress={() => showToast('Not available in the prototype. There is no subscription to manage.')}
          />
          <ListRow
            title="Restore purchases"
            trailing="Not in prototype"
            chevron={false}
            onPress={() => showToast('Nothing to restore. The prototype has no purchases.')}
          />
        </ListGroup>
        <p className="flex flex-wrap items-center gap-x-1 text-footnote text-ink-2">
          <button type="button" onClick={() => setSheet('terms')} className="h-11 rounded-control px-1 underline underline-offset-[3px] hover:bg-surface-2">
            Terms of use
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => setSheet('privacy')} className="h-11 rounded-control px-1 underline underline-offset-[3px] hover:bg-surface-2">
            Privacy policy
          </button>
        </p>
      </section>

      <Sheet
        open={thanks}
        onClose={() => {
          setThanks(false)
          navigate(paths.profile())
        }}
        title="Plus isn't on sale yet"
        closeStyle="done"
      >
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-body text-ink">Everything is unlocked during the beta. Thanks for telling us; beta players will get a founder price.</p>
          <p className="text-callout text-ink-2">
            For testing, Plus is now switched on for this phone. No payment was taken, and you can switch it off on this screen.
          </p>
        </div>
      </Sheet>

      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'terms' ? 'Terms of use' : 'Privacy policy'} closeStyle="done">
        <div className="flex flex-col gap-3 pb-2">
          {sheet === 'terms' ? (
            <>
              <p className="text-callout text-ink">
                This is a closed beta prototype. Nothing is sold, and no payment details are ever asked for or stored.
              </p>
              <p className="text-callout text-ink">Full terms of use, including subscription and renewal terms, will be published before the public release.</p>
            </>
          ) : (
            PRIVACY_POLICY_SUMMARY.map((p) => (
              <p key={p} className="text-callout text-ink">
                {p}
              </p>
            ))
          )}
        </div>
      </Sheet>
    </Screen>
  )
}

/** Full-width note under the app bar (same anatomy as the sample-data banner, DESIGN §8.21). */
function PrototypeBanner() {
  return (
    <div role="note" className="gutter flex min-h-9 items-center gap-2 bg-surface-2 py-2 text-footnote text-ink-2">
      <FlaskIcon size={16} aria-hidden="true" className="shrink-0" />
      <span className="flex-1">Prototype: no payment is taken. Plan buttons switch a test flag on this phone.</span>
    </div>
  )
}

/** Plan radio cards (DESIGN §10.13): 64 px, shown equally, none preselected, arrow keys move the choice. */
function PlanCards({ value, onChange, now }: { value: PlanId | null; onChange: (p: PlanId) => void; now: Date }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = PLANS.findIndex((p) => p.id === value)
  const focusIndex = index >= 0 ? index : 0
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (focusIndex + delta + PLANS.length) % PLANS.length
    onChange(PLANS[next].id)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Plans" onKeyDown={onKeyDown} className="flex flex-col gap-2">
      {PLANS.map((p, i) => {
        const selected = p.id === value
        return (
          <button
            key={p.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === focusIndex ? 0 : -1}
            onClick={() => onChange(p.id)}
            className={cx(
              'flex min-h-16 w-full items-center gap-3 rounded-card bg-surface px-4 py-3 text-left transition-colors duration-(--dur-fast) motion-reduce:transition-none',
              selected ? 'border-token border-ink shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-token border-line-strong hover:bg-surface-2',
            )}
          >
            <span
              aria-hidden="true"
              className={cx('grid size-6 shrink-0 place-items-center rounded-full', selected ? 'bg-ink text-ink-inverse' : 'border-2 border-line-strong')}
            >
              {selected ? <CheckIcon size={14} /> : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="text-headline text-ink">{p.title}</span>
                {p.test ? (
                  <span className="inline-flex h-6 items-center rounded-full border-token border-line-strong px-2 text-caption text-ink-2">Test</span>
                ) : null}
              </span>
              <span className="text-footnote text-ink-2">{p.detail(now)}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="text-headline font-wide tabular-nums text-ink">{p.price}</span>
              <span className="text-footnote text-ink-2">{p.per}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
