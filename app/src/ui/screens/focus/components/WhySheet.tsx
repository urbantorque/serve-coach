import { InfoIcon } from '@phosphor-icons/react'
import type { FocusDecision, ItemCheck, KeepGoingDecision, RankReason } from '../../../../coaching/index.ts'
import { MetricValue, SectionLabel, Sheet, StatusChip } from '../../../components/index.ts'
import { FOCUS_COPY } from '../copy.ts'

function MetricLine({ metric }: { metric: NonNullable<RankReason['metric']> }) {
  const n = metric.value.n
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <MetricValue metricId={metric.metricId} value={metric.value} detail />
      {n !== undefined && metric.value.status !== 'player-entered' ? (
        <span className="text-footnote tabular-nums text-ink-3">
          {metric.value.nEligible !== undefined ? `${n} of ${metric.value.nEligible} serves` : `${n} serves`}
        </span>
      ) : null}
    </span>
  )
}

function ReasonRow({ r }: { r: RankReason }) {
  return (
    <li className="flex flex-col gap-1.5 py-3 [&+li]:border-t [&+li]:border-line">
      <p className="text-callout text-ink">{r.text}</p>
      {r.metric ? <MetricLine metric={r.metric} /> : null}
      {r.playerEntered && !r.metric ? <StatusChip status="player-entered" className="self-start" /> : null}
    </li>
  )
}

function CheckRow({ c }: { c: ItemCheck }) {
  return (
    <li className="flex flex-col gap-1 py-3 [&+li]:border-t [&+li]:border-line">
      <p className="text-headline text-ink">{c.title}</p>
      <p className="text-footnote text-ink-2">{c.text}</p>
      {c.metric && c.metric.value.status !== 'experimental' ? <MetricLine metric={c.metric} /> : null}
    </li>
  )
}

/** "Why this focus?" (COACHING §7.6): the reasons, then what else was noticed and why it was not chosen. */
export function WhySheet({ open, onClose, decision }: { open: boolean; onClose: () => void; decision: FocusDecision | KeepGoingDecision }) {
  const focus = decision.kind === 'focus' ? decision : undefined
  const checked = decision.kind === 'keep-going' ? decision.checks.filter((c) => c.status !== 'not-applicable') : []
  return (
    <Sheet open={open} onClose={onClose} title={focus ? FOCUS_COPY.whyThisFocus : FOCUS_COPY.whatWeChecked} detent="large">
      <div className="flex flex-col gap-6 pb-4">
        {focus ? (
          <section aria-label="Reasons">
            <ul>{focus.reasons.map((r, i) => <ReasonRow key={i} r={r} />)}</ul>
          </section>
        ) : null}
        {decision.notes.length ? (
          <div className="flex flex-col gap-2">
            {decision.notes.map((n) => (
              <p key={n} className="flex items-start gap-2 text-footnote text-ink-2">
                <InfoIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{n}</span>
              </p>
            ))}
          </div>
        ) : null}
        {focus && focus.alsoConsidered.length ? (
          <section className="flex flex-col gap-1" aria-labelledby="also-noticed">
            <SectionLabel>
              <span id="also-noticed">{FOCUS_COPY.alsoNoticed}</span>
            </SectionLabel>
            <ul>{focus.alsoConsidered.map((c) => <CheckRow key={c.itemId} c={c} />)}</ul>
          </section>
        ) : null}
        {checked.length ? (
          <section className="flex flex-col gap-1" aria-label={FOCUS_COPY.whatWeChecked}>
            <ul>{checked.map((c) => <CheckRow key={c.itemId} c={c} />)}</ul>
          </section>
        ) : null}
        <p className="text-footnote text-ink-3">{FOCUS_COPY.cuesAreCoaching}</p>
      </div>
    </Sheet>
  )
}
