import { CheckIcon, FlaskIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import type { PaywallTrigger, PlusFeature } from '../../../entitlement/index.ts'
import { Button, Sheet } from '../../components/index.ts'
import { planLink } from './planLinks.ts'
import { PLUS_ADDS } from './planModel.ts'
import { plusSheetCopy } from './plusCopy.ts'

export interface PlusSheetProps {
  open: boolean
  onClose: () => void
  trigger: PaywallTrigger
  /** T3: the Plus feature that was tapped. */
  feature?: PlusFeature
  /** Where "See Plus" should come back to after the Plan screen (an in-app path). */
  from?: string
}

/**
 * The Plus offer as a sheet (PRODUCT §6.15; DESIGN §10.13): calm and plain, a headline tied to the
 * moment, what Plus adds, an honest prototype line, what is always free, and "Not now" as visible as
 * "See Plus". No prices, countdowns or scarcity here; the Plan screen shows the plans equally.
 */
export function PlusSheet({ open, onClose, trigger, feature, from }: PlusSheetProps) {
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
        {trigger !== 't3' ? (
          <ul className="flex flex-col gap-2" aria-label="What Plus adds">
            {PLUS_ADDS.map((line) => (
              <li key={line} className="flex items-start gap-3 text-callout text-ink">
                <CheckIcon size={20} aria-hidden="true" className="mt-px shrink-0 text-ink-2" />
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="flex items-start gap-2 rounded-card bg-surface-2 p-3 text-footnote text-ink-2">
          <FlaskIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{copy.prototype}</span>
        </p>
        <p className="flex items-start gap-2 text-footnote text-ink-2">
          <ShieldCheckIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>Always free: the body check and pain advice, every label, export and deletion.</span>
        </p>
      </div>
    </Sheet>
  )
}
