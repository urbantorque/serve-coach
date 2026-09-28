import { CheckIcon, FlaskIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { recordWtpAnswer, WTP_ANSWERS, type PaywallTrigger, type PlusFeature, type WtpAnswer } from '../../../entitlement/index.ts'
import { Button, Sheet } from '../../components/index.ts'
import { ChoiceChips } from '../../components/record/ChoiceChips.tsx'
import { usePlan } from './entitlement.ts'
import { planLink } from './planLinks.ts'
import { PLUS_ADDS } from './planModel.ts'
import { plusPreviewCopy, plusSheetCopy, PREVIEW_COPY } from './plusCopy.ts'

export interface PlusSheetProps {
  open: boolean
  onClose: () => void
  trigger: PaywallTrigger
  /** T3: the Plus feature that was tapped. */
  feature?: PlusFeature
  /** Where "See Plus" should come back to after the Plan screen (an in-app path). */
  from?: string
  /** The beta applies (the caller has read the plan); read here when not given. */
  beta?: boolean
}

/**
 * The Plus moment as a sheet (PRODUCT §5.3, §6.15; DESIGN §10.13). During the beta (everything
 * unlocked) it is a calm, non-blocking preview: "Beta: this is unlocked for you", what Plus will
 * include, the proposed price, a one-tap "Would you pay…?" recorded as a local beta event, and
 * Continue. With the Plan screen's after-beta test on, it is the offer: what Plus adds, an honest
 * prototype line, and "Not now" as visible as "See Plus". Never countdowns or scarcity.
 */
export function PlusSheet(props: PlusSheetProps) {
  const plan = usePlan()
  // The beta is the default while the plan loads: never block by accident.
  const beta = props.beta ?? plan?.beta ?? true
  return beta ? <PlusPreviewSheet {...props} /> : <PlusOfferSheet {...props} />
}

function AlwaysFree() {
  return (
    <p className="flex items-start gap-2 text-footnote text-ink-2">
      <ShieldCheckIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>Always free: the body check and pain advice, every label, export and deletion.</span>
    </p>
  )
}

function AddsList({ label }: { label: string }) {
  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {PLUS_ADDS.map((line) => (
        <li key={line} className="flex items-start gap-3 text-callout text-ink">
          <CheckIcon size={20} aria-hidden="true" className="mt-px shrink-0 text-ink-2" />
          {line}
        </li>
      ))}
    </ul>
  )
}

/** Beta: the feature is already open; this only tells and asks once. */
function PlusPreviewSheet({ open, onClose, trigger, feature }: PlusSheetProps) {
  const copy = plusPreviewCopy(trigger, feature)
  const [answer, setAnswer] = useState<WtpAnswer | null>(null)
  // A fresh question each time the sheet opens.
  useEffect(() => {
    if (open) setAnswer(null)
  }, [open])
  const choose = (a: WtpAnswer | null) => {
    if (!a || answer) return
    setAnswer(a)
    void recordWtpAnswer(trigger, a).catch(() => undefined)
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={copy.title}
      footer={<Button onClick={onClose}>{PREVIEW_COPY.continue}</Button>}
    >
      <div className="flex flex-col gap-4 pb-1" data-plus-sheet={trigger} data-plus-preview>
        <p className="flex items-start gap-2 rounded-card bg-surface-2 p-3 text-callout text-ink" data-beta-line>
          <FlaskIcon size={20} aria-hidden="true" className="mt-px shrink-0 text-ink-2" />
          <span>{PREVIEW_COPY.beta}</span>
        </p>
        <p className="text-callout text-ink-2 text-pretty">{copy.body}</p>
        <div className="flex flex-col gap-2">
          <p className="text-footnote font-label text-ink-2">{PREVIEW_COPY.includes}</p>
          <AddsList label={PREVIEW_COPY.includes} />
        </div>
        <p className="text-callout text-ink tabular-nums" data-preview-price>
          {PREVIEW_COPY.price}
        </p>
        <div className="flex flex-col gap-1" data-wtp>
          <ChoiceChips label={PREVIEW_COPY.question} options={[...WTP_ANSWERS]} value={answer} onChange={choose} stacked disabled={answer !== null} />
          {answer ? (
            <p role="status" className="text-footnote text-ink-2">
              {PREVIEW_COPY.thanks}
            </p>
          ) : null}
        </div>
        <AlwaysFree />
      </div>
    </Sheet>
  )
}

/** After the beta (the Plan screen's test): the offer, with "Not now" as visible as "See Plus". */
function PlusOfferSheet({ open, onClose, trigger, feature, from }: PlusSheetProps) {
  const copy = plusSheetCopy(trigger, feature)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={copy.title}
      footer={
        <div className="flex flex-col gap-2">
          <Button to={planLink({ via: trigger, feature, from })}>See Plus</Button>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-1" data-plus-sheet={trigger}>
        <p className="text-callout text-ink-2 text-pretty">{copy.body}</p>
        {trigger !== 't3' ? <AddsList label="What Plus adds" /> : null}
        <p className="flex items-start gap-2 rounded-card bg-surface-2 p-3 text-footnote text-ink-2">
          <FlaskIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{copy.prototype}</span>
        </p>
        <AlwaysFree />
      </div>
    </Sheet>
  )
}
