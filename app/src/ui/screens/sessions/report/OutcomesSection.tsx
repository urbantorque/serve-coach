import { LinkIcon, TagIcon } from '@phosphor-icons/react'
import { useNavigate } from 'react-router'
import type { MetricId, MetricValue as MetricValueData, ServeSide } from '../../../../analysis/types.ts'
import type { SessionTallyRecord } from '../../../../data/records.ts'
import { Badge, Button, EmptyState, MetricGrid, MetricValue, StatusChip } from '../../../components/index.ts'
import { ChartFrame, PlacementMap, WilsonBar, type PlacementServe } from '../../../charts/index.ts'
import { metricName } from '../../../copy/metricNames.ts'
import { OUTCOME_WORDS, UI } from '../../../copy/strings.ts'
import { formatMetric } from '../../../format/metricFormat.ts'
import { paths } from '../../../shell/paths.ts'
import type { LinkState } from '../../progress/insights/outcomes.ts'
import { MIN_PER_GROUP } from '../../progress/insights/outcomes.ts'
import { outcomeCounts, type ServeRow } from '../../progress/insights/serves.ts'
import { derived } from '../../progress/insights/values.ts'

type Metrics = Partial<Record<MetricId, MetricValueData>>

/** Outcome tile (DESIGN §8.7): "8 of 12 in", a Wilson bar from n ≥ 10, the likely range, "You logged". */
export function OutcomeTile({ metricId, value, source }: { metricId: MetricId; value: MetricValueData; source: string }) {
  const f = formatMetric(metricId, value)
  const n = value.n ?? 0
  const rate = typeof value.value === 'number' ? value.value : null
  const u = value.uncertainty
  return (
    <div
      role="group"
      aria-label={`${f.aria}, ${source}`}
      data-metric-tile={metricId}
      data-status={value.status}
      className="card flex min-h-33 flex-col items-start gap-1 p-4"
    >
      <span className="line-clamp-2 text-footnote font-label text-ink-2" aria-hidden="true">
        {metricName(metricId)}
      </span>
      <MetricValue metricId={metricId} value={value} size="metric" chip={false} />
      {n >= 10 && rate !== null && u ? (
        <WilsonBar rate={rate} low={u.low} high={u.high} label={`Likely range ${Math.round(u.low * 100)} to ${Math.round(u.high * 100)} percent`} className="my-1" />
      ) : null}
      {f.detail ? (
        <span className="text-footnote text-ink-3" aria-hidden="true">
          {f.detail}
        </span>
      ) : null}
      <span className="text-footnote text-ink-3" aria-hidden="true">
        {source}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-2 pt-2" aria-hidden="true">
        <StatusChip status={value.status} />
        {value.provisional ? <Badge>{UI.earlyRead}</Badge> : null}
      </span>
    </div>
  )
}

export interface OutcomesSectionProps {
  sessionId: string
  side: ServeSide
  serveNumber?: 1 | 2
  metrics: Metrics
  rows: ServeRow[]
  tally: SessionTallyRecord | null
  /**
   * The group a multi-group report is showing. The placement chart then plots only the serves you
   * logged for that court side (and serve number), so a deuce serve never lands in the ad box.
   */
  group?: { courtSide: ServeSide | 'unknown'; serveNumber: 1 | 2 | 'unknown'; defaultSide?: ServeSide; defaultServeNumber?: 1 | 2 }
}

/** Tagged serves in the shown group (by the side and serve number you logged, else the session's). */
export function rowsInGroup(rows: ServeRow[], group: OutcomesSectionProps['group']): ServeRow[] {
  if (!group) return rows
  return rows.filter((r) => {
    const side = r.tag?.side ?? group.defaultSide ?? 'unknown'
    const number = r.tag?.serveNumber ?? group.defaultServeNumber ?? 'unknown'
    return (group.courtSide === 'unknown' || side === group.courtSide) && (group.serveNumber === 'unknown' || number === group.serveNumber)
  })
}

/**
 * Outcomes (D3: player-entered in the side view): the rate tiles with n and Wilson intervals, the
 * service-box schematic when zones were logged, or the "Tag your serves" empty state.
 */
export function OutcomesSection({ sessionId, side, serveNumber, metrics, rows, tally, group }: OutcomesSectionProps) {
  const navigate = useNavigate()
  const counts = outcomeCounts(rows)
  const hasTags = counts.tagged > 0
  if (!hasTags && !tally) {
    return (
      <EmptyState
        icon={TagIcon}
        title="Tag your serves to see this"
        body="In, net, long or wide takes about 2 seconds a serve."
        action={
          <Button variant="secondary" to={paths.tagging(sessionId)}>
            Tag serves
          </Button>
        }
      />
    )
  }
  const rateIds: MetricId[] = serveNumber === 2 ? ['second-serve-in-rate'] : serveNumber === 1 ? ['first-serve-in-rate'] : ['first-serve-in-rate', 'second-serve-in-rate']
  const rates = rateIds.filter((id) => metrics[id] && metrics[id]!.status === 'player-entered')
  const fallback = !rates.length && metrics['serve-in-rate']?.status === 'player-entered' ? (['serve-in-rate'] as MetricId[]) : []
  const source = hasTags ? 'From your tags' : 'From your tally'
  const dfs = metrics['double-faults']

  const placed = rowsInGroup(rows, group).filter((r) => r.tag && (r.kind === 'in' || r.kind === 'net' || r.kind === 'long' || r.kind === 'wide'))
  // One report group can still hold serves you logged from both courts: say so rather than name one.
  const loggedSides = new Set(placed.map((r) => r.tag?.side).filter(Boolean))
  const courtWords = loggedSides.size > 1 ? 'Both courts' : `${(loggedSides.size === 1 ? [...loggedSides][0] : side) === 'ad' ? 'Ad' : 'Deuce'} court`
  const mapSide: ServeSide = loggedSides.size === 1 ? ([...loggedSides][0] as ServeSide) : side
  const placement: PlacementServe[] = placed
    .map((r) => ({
      id: r.id,
      outcome: r.kind as PlacementServe['outcome'],
      zone: r.tag?.targetZone,
      callout: `${OUTCOME_WORDS[r.kind]} · Serve ${r.index}${r.tag?.targetZone ? `, ${r.tag.targetZone === 'T' ? 'T' : r.tag.targetZone}` : ''}`,
    }))
  const zoned = placement.some((p) => p.zone)
  const inCount = placement.filter((p) => p.outcome === 'in').length

  return (
    <div className="flex flex-col gap-3">
      <MetricGrid>
        {[...rates, ...fallback].map((id) => (
          <OutcomeTile key={id} metricId={id} value={metrics[id]!} source={source} />
        ))}
        {dfs && dfs.status === 'player-entered' ? <OutcomeTile metricId="double-faults" value={dfs} source={source} /> : null}
      </MetricGrid>
      {counts.untagged > 0 && hasTags ? (
        <p className="text-footnote text-ink-3">
          {counts.untagged} {counts.untagged === 1 ? 'serve is' : 'serves are'} not tagged.{' '}
          <Button variant="tertiary" to={paths.tagging(sessionId)} className="inline-flex">
            Tag the rest
          </Button>
        </p>
      ) : null}
      {counts.lets ? <p className="text-footnote text-ink-3">{counts.lets === 1 ? '1 let (not counted)' : `${counts.lets} lets (not counted)`}</p> : null}
      {zoned ? (
        <ChartFrame
          title={`${inCount} of ${placement.length} tagged serves went in`}
          subtitle={`${courtWords}, by the zone you logged`}
          status="player-entered"
          metricId="placement-zone"
          footer={<span>Schematic: each mark is a serve you logged, in the zone you logged. It isn't a measured landing spot.</span>}
          table={{
            caption: 'Tagged serves by zone',
            columns: ['Serve', 'Result', 'Zone'],
            rows: placement.map((p) => ({
              key: p.id,
              cells: [p.callout.split(' · ')[1]?.split(',')[0] ?? p.id, OUTCOME_WORDS[p.outcome], p.zone ? (p.zone === 'T' ? 'T' : p.zone === 'body' ? 'Body' : 'Wide') : 'Not logged'],
            })),
          }}
        >
          <PlacementMap
            side={mapSide}
            serves={placement}
            label={`Service box schematic, ${courtWords.toLowerCase()}, ${placement.length} tagged serves: ${(['in', 'net', 'long', 'wide'] as const).map((k) => `${placement.filter((p) => p.outcome === k).length} ${k}`).join(', ')}.`}
            onOpen={(id) => navigate(paths.serveDetail(sessionId, id))}
          />
        </ChartFrame>
      ) : null}
    </div>
  )
}

const LINK_WORDS: Partial<Record<MetricId, { more: string; less: string }>> = {
  'toss-forward': { more: 'the toss further in front', less: 'the toss further back' },
  'toss-apex-height': { more: 'a higher toss', less: 'a lower toss' },
  'toss-drop': { more: 'a longer drop before contact', less: 'a shorter drop before contact' },
  'contact-height-ratio': { more: 'a higher contact point', less: 'a lower contact point' },
  'contact-forward': { more: 'contact further in front', less: 'contact further back' },
  'rhythm-release-to-contact': { more: 'a slower toss-to-hit time', less: 'a quicker toss-to-hit time' },
  'leg-drive': { more: 'more hip rise', less: 'less hip rise' },
}

/**
 * Signature insight (D3; METRICS §4.7; PRODUCT §6.5 item 6): association wording, never cause; shown
 * only when both groups have enough serves and the contrast replicated in a second matched session.
 */
export function InsightCard({ state, sessionId }: { state: LinkState; sessionId: string }) {
  let body: React.ReactNode
  let early = false
  if (state.kind === 'needs-tags') {
    body = (
      <>
        <p className="text-callout text-ink-2">Tag your serves to see what your ins had in common.</p>
        <Button variant="secondary" compact fullWidth={false} to={paths.tagging(sessionId)} className="self-start">
          Tag serves
        </Button>
      </>
    )
  } else if (state.kind === 'too-few') {
    body = (
      <p className="text-callout text-ink-2">
        Comparing your ins and misses needs {MIN_PER_GROUP} of each. This session had {state.nIn} in and {state.nFault} missed, so there's nothing to
        compare yet.
      </p>
    )
  } else if (state.kind === 'none') {
    body = <p className="text-callout text-ink-2">No clear difference between your ins and misses on toss or contact this time. That's common, and useful to know.</p>
  } else if (state.kind === 'held') {
    body = <p className="text-callout text-ink-2">Something may differ between your ins and misses. We'll show it if your next matched session agrees.</p>
  } else {
    const c =
      state.kind === 'engine'
        ? { metricId: state.link.metricId as MetricId, diff: state.link.inGroup.mean - state.link.faultGroup.mean, nIn: state.link.inGroup.n, nFault: state.link.faultGroup.n }
        : { metricId: state.candidate.metricId, diff: state.candidate.diff, nIn: state.candidate.nIn, nFault: state.candidate.nFault }
    early = c.nIn < 10 || c.nFault < 10
    const words = LINK_WORDS[c.metricId]
    const size = derived(c.metricId, 'estimated', Math.abs(c.diff), { n: c.nIn + c.nFault })
    body = (
      <p className="text-callout text-ink">
        {state.kind === 'engine' ? (
          state.link.sentence
        ) : (
          <>
            Your serves that went in tended to have {words ? (c.diff >= 0 ? words.more : words.less) : metricName(c.metricId).toLowerCase()}: about{' '}
            <MetricValue metricId={c.metricId} value={size} chip={false} /> ({c.nIn} in, {c.nFault} missed).
          </>
        )}
      </p>
    )
  }
  return (
    <section aria-labelledby="insight-title" className="card flex flex-col items-start gap-2 p-4">
      <span className="flex w-full items-center justify-between gap-2">
        <h3 id="insight-title" className="flex items-center gap-1.5 text-headline text-ink">
          <LinkIcon size={18} aria-hidden="true" className="text-ink-2" />
          Ins and misses
        </h3>
        {state.kind === 'engine' || state.kind === 'shown' ? <StatusChip status="estimated" /> : null}
      </span>
      {body}
      {early ? <Badge>Early hint</Badge> : null}
      {state.kind === 'engine' || state.kind === 'shown' ? (
        <p className="text-footnote text-ink-3">A pattern, not a cause. Single-serve mechanics don't explain misses on their own.</p>
      ) : null}
    </section>
  )
}
