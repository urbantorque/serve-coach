import { InfoIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { listExperiments, listSessions } from '../../../data/index.ts'
import { useProfile, useSetting } from '../../../data/hooks.ts'
import { useToastStore } from '../../../data/stores/toast.ts'
import { markPaywallShown, t2Due } from '../../../entitlement/index.ts'
import { useFocusStore } from '../focus/focusStore.ts'
import { usePlan } from './entitlement.ts'
import { PlusSheet } from './PlusSheet.tsx'

/** How long the Processing screen settles before the T2 sheet may open by itself. */
const SETTLE_MS = 1200

/**
 * T2 (PRODUCT §6.15, §5.2): analysing a third practice day in a calendar month, after the free first
 * loop. In the beta nothing waits, so this is a notice, not a block: the analysis carries on, the
 * video is kept, and the sheet says so. Shown once a month, never on a day another offer was shown,
 * never for sample data or while the player has paused for pain, never for Plus.
 */
export function AllowanceNotice({ sessionId }: { sessionId: string }) {
  const plan = usePlan()
  const profile = useProfile()
  // A referral raised this session pauses coaching even when the answer was not saved (D8).
  const referral = useFocusStore((s) => s.referral)
  const state = useSetting('paywall')
  const location = useLocation()
  const data = useLiveQuery(async () => ({ sessions: await listSessions({ includeDemo: false }), experiments: await listExperiments() }), [])
  const [due, setDue] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  // The sheet opens by itself once, after the screen has settled and no toast (such as the storage
  // confirmation after a first save) is showing, so nothing ever sits on top of its buttons.
  const [autoOpen, setAutoOpen] = useState<'waiting' | 'pending' | 'done'>('waiting')
  const [settled, setSettled] = useState(false)
  const toastShowing = useToastStore((s) => s.queue.length > 0)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [])

  const session = data?.sessions.find((s) => s.id === sessionId)
  // Decide once, during render, when everything has loaded (React's "adjust state while rendering").
  if (due === null && plan !== undefined && profile !== undefined && state !== undefined && data && session) {
    const d = t2Due({ plus: plan.plus, session, sessions: data.sessions, experiments: data.experiments, state: state ?? {}, now: new Date(), painPause: profile?.comfort?.painFlag === 1 || Boolean(referral) })
    setDue(d)
    setAutoOpen(d ? 'pending' : 'done')
  }
  if (autoOpen === 'pending' && settled && !toastShowing) {
    setAutoOpen('done')
    setOpen(true)
  }
  // Recording the showing is the side effect: once a month.
  const month = session?.visitId.slice(0, 7)
  const recorded = Boolean(month && state?.t2Months?.includes(month))
  useEffect(() => {
    if (due && month && !recorded) void markPaywallShown('t2', { month }).catch(() => undefined)
  }, [due, month, recorded])

  if (!due) return null
  return (
    <>
      <p className="flex items-start gap-2 text-footnote text-ink-2" data-allowance-notice>
        <InfoIcon size={20} aria-hidden="true" className="shrink-0" />
        <span>
          This goes past the free plan's 2 analysed practice days this month. During the beta it is analysed as normal.{' '}
          <button type="button" onClick={() => setOpen(true)} className="-my-3 inline-flex h-11 items-center rounded-control px-1 font-label text-ink underline underline-offset-[3px] hover:bg-surface-2">
            About Plus
          </button>
        </span>
      </p>
      <PlusSheet
        open={open}
        onClose={() => {
          setOpen(false)
          setAutoOpen('done')
        }}
        trigger="t2"
        from={`${location.pathname}${location.search}`}
        beta={plan?.beta}
      />
    </>
  )
}
