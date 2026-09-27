import { ArrowDownIcon, CaretRightIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { MetricId, MetricValue as MetricValueData } from '../../../analysis/types.ts'
import { Badge, MetricValue, StatusChip } from '../../components/index.ts'
import { Sparkline, type SparkPoint } from '../../charts/index.ts'
import { UI } from '../../copy/strings.ts'
import { shortDate } from '../../format/dates.ts'
import { metricInfoFor } from './insights/links.ts'
import { againstUsual, trendState, type SeriesPoint } from './insights/history.ts'
import { configFor } from './insights/metricConfig.ts'
import { formatRange, plainText, shortText } from './insights/values.ts'
import { VerdictLine } from './insights/ui.tsx'

export interface QuestionTileProps {
  question: string
  metricId: MetricId
  /** Readout label before the value ("Height spread"). */
  label: string
  series: SeriesPoint[]
  usual: [number, number] | null
  stratumLabel: string
  /** Extra line under the answer (e.g. front-to-back spread, drive time). */
  extra?: ReactNode
  hollow?: boolean
  /** h2 at the top level of Progress; h3 inside a labelled section. */
  headingLevel?: 'h2' | 'h3'
}

const USUAL_WORD = { below: 'below your usual', inside: 'inside your usual range', above: 'above your usual' } as const

function directionOf(metricId: MetricId) {
  const d = configFor(metricId)?.direction
  return d === 'lower' ? { icon: ArrowDownIcon, text: 'Lower is steadier' } : null
}

/**
 * Progress question tile (DESIGN §10.10, §9.2): the question as its title, a one-sentence answer
 * with the latest value and its state, a sparkline of matched sessions with the grey "usual" band,
 * n, the set-up label, and the trend verdict in words (or the baseline / comparison state).
 */
export function QuestionTile({ question, metricId, label, series, usual, stratumLabel, extra, hollow, headingLevel: H = 'h2' }: QuestionTileProps) {
  const latest = series.at(-1)
  const state = trendState(metricId, series)
  const titleId = `q-${metricId}`
  const points: SparkPoint[] = series.slice(-8).map((p) => ({
    key: p.sessionId,
    value: p.value,
    provisional: p.provisional,
    label: shortDate(p.visitId),
    callout: `${plainText(metricId, p.metric)} · ${shortDate(p.visitId)}, ${p.n} serves`,
  }))
  const where = latest && !latest.provisional ? againstUsual(latest.value, usual) : null
  const dir = directionOf(metricId)
  const cfg = configFor(metricId)
  const neutralWords = cfg?.neutralWords

  let status: ReactNode = null
  if (state.kind === 'baseline') {
    status = <p className="text-footnote text-ink-2">Building your baseline ({state.have} of 2 sessions). Record another from the same side to see a trend.</p>
  } else if (state.kind === 'comparison') {
    const up = state.after.value > state.before.value
    const same = plainText(metricId, state.after.metric) === plainText(metricId, state.before.metric)
    status = (
      <p className="text-footnote text-ink-2">
        {same ? 'About the same as last time' : up ? 'Up from ' : 'Down from '}
        {same ? null : (
          <>
            <MetricValue metricId={metricId} value={state.before.metric} chip={false} className="[&_.text-body]:text-footnote" /> to{' '}
            <MetricValue metricId={metricId} value={state.after.metric} chip={false} className="[&_.text-body]:text-footnote" />
          </>
        )}
        . One more session will show a trend.
      </p>
    )
  } else if (state.kind === 'trend') {
    const v = state.result.verdict
    const words = neutralWords
      ? v === 'likely-better' || v === 'clearly-better'
        ? `Trend: ${neutralWords[2]}`
        : v === 'likely-worse' || v === 'clearly-worse'
          ? `Trend: ${neutralWords[0]}`
          : undefined
      : undefined
    status = words ? (
      <p className="text-footnote text-ink-2">
        {words}. Last {state.sessions} matched sessions.
      </p>
    ) : (
      <VerdictLine verdict={v === 'too-early' ? 'trend-too-early' : v} context={`Last ${state.sessions} matched sessions`} />
    )
  }

  return (
    <section aria-labelledby={titleId} className="card flex flex-col gap-3 p-4" data-question={metricId}>
      <div className="flex flex-col gap-1">
        <H id={titleId} className="text-title-2 text-ink text-balance">
          {question}
        </H>
        <p className="text-footnote text-ink-3">{stratumLabel}</p>
      </div>
      {latest ? (
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-headline text-ink">
            <span>{label}</span>
            <MetricValue metricId={metricId} value={latest.metric} chip={false} className="[&_.text-body]:text-headline" />
            {where ? <span className="font-normal text-ink-2">{USUAL_WORD[where]}</span> : null}
          </p>
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={latest.metric.status as MetricValueData['status']} />
            {latest.provisional ? <Badge>{UI.earlyRead}</Badge> : null}
            <span className="text-footnote tabular-nums text-ink-3">
              {latest.n} serves, {shortDate(latest.visitId)}
            </span>
          </span>
          {usual ? <span className="text-footnote text-ink-3">usual {formatRange(metricId, usual)}</span> : null}
          {extra}
        </div>
      ) : null}
      {points.length >= 2 ? (
        <Sparkline
          points={points}
          band={usual}
          hollow={hollow}
          latestLabel={latest ? shortText(metricId, latest.metric) : ''}
          label={`${question} ${points.length} matched sessions from ${points[0].label} to ${points.at(-1)!.label}. Latest ${latest ? plainText(metricId, latest.metric) : ''}.${usual ? ` Usual range ${formatRange(metricId, usual)}.` : ''}`}
        />
      ) : null}
      {dir && points.length >= 2 ? (
        <span className="flex items-center gap-1 text-footnote text-ink-3">
          <dir.icon size={12} aria-hidden="true" />
          {dir.text}
        </span>
      ) : null}
      {status ?? (latest ? null : <p className="text-footnote text-ink-2">Not measured in these sessions yet. The measurement page says what it needs.</p>)}
      <Link
        to={metricInfoFor(metricId, latest?.sessionId)}
        className="-ml-1 inline-flex min-h-11 items-center gap-0.5 self-start rounded-control px-1 text-footnote font-label text-ink underline underline-offset-[3px] hover:bg-surface-2"
      >
        See the trend and how we measure it
        <CaretRightIcon size={14} aria-hidden="true" />
      </Link>
    </section>
  )
}
