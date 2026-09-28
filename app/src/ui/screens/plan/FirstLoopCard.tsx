import { ArrowsClockwiseIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { useLocation } from 'react-router'
import { listExperiments } from '../../../data/index.ts'
import { useProfile, useSetting } from '../../../data/hooks.ts'
import type { ExperimentRecord } from '../../../data/records.ts'
import { markPaywallShown, t1Due } from '../../../entitlement/index.ts'
import { Button } from '../../components/index.ts'
import { useFocusStore } from '../focus/focusStore.ts'
import { usePlan } from './entitlement.ts'
import { PlusSheet } from './PlusSheet.tsx'

/**
 * T1 (PRODUCT §6.15, §7.4 step 7; DESIGN §10.11): after the player's first "Did it work?" verdict
 * and its next-step button, an inline card, once, plus the sheet on tap. The verdict itself is never
 * behind it. Dismissing changes nothing: the next focus stays. Never for sample data, never while
 * the player has paused for pain, never for Plus.
 */
export function FirstLoopCard({ experiment }: { experiment: ExperimentRecord }) {
  const plan = usePlan()
  const profile = useProfile()
  // A referral raised this session pauses coaching even when the answer was not saved (D8).
  const referral = useFocusStore((s) => s.referral)
  const state = useSetting('paywall')
  const experiments = useLiveQuery(() => listExperiments(), [])
  const location = useLocation()
  const titleId = useId()
  // Decided once per visit, so the card never jumps in or out while the player reads.
  const [shown, setShown] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)
  const loaded = plan !== undefined && profile !== undefined && state !== undefined && experiments !== undefined

  // Decide once, during render, when everything has loaded (React's "adjust state while rendering").
  if (loaded && shown === null) {
    setShown(t1Due({ plus: plan.plus, experiment, experiments, state: state ?? {}, now: new Date(), painPause: profile?.comfort?.painFlag === 1 || Boolean(referral) }))
  }
  // Recording the showing is the side effect: once, the first time the card appears.
  const alreadyRecorded = Boolean(state?.t1ShownAt)
  useEffect(() => {
    if (shown && !alreadyRecorded) void markPaywallShown('t1', { experimentId: experiment.id }).catch(() => undefined)
  }, [shown, alreadyRecorded, experiment.id])

  if (!shown || dismissed || plan?.plus) return null
  return (
    <section aria-labelledby={titleId} className="card flex flex-col gap-3 p-4" data-first-loop-card>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <ArrowsClockwiseIcon size={20} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-headline text-ink">
            That was your first experiment
          </h2>
          <p className="text-callout text-ink-2">Plus keeps this going every week through the season. Your verdict and next focus stay free.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" compact fullWidth={false} onClick={() => setOpen(true)}>
          What Plus adds
        </Button>
        <Button variant="tertiary" onClick={() => setDismissed(true)}>
          Not now
        </Button>
      </div>
      <PlusSheet open={open} onClose={() => setOpen(false)} trigger="t1" from={`${location.pathname}${location.search}`} />
    </section>
  )
}
