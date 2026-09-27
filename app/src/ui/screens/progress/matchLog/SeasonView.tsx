import type { MetricStatus } from '../../../../analysis/types.ts'
import { ChartFrame, extent, linear, padDomain, PlotSurface, useChartWidth, ValuePoint, type PlotTarget } from '../../../charts/index.ts'
import { StatusChip } from '../../../components/index.ts'
import { shortDate } from '../../../format/dates.ts'
import type { SeasonRowPoint, SeasonRows } from './matchSeries.ts'

const ROW_H = 64

/** The newest point's words (its label already names value and date), week shown for context. */
const latestOf = (points: SeasonRowPoint[]) => {
  const p = points.reduce((a, b) => (b.week >= a.week ? b : a))
  return `${p.label}, week ${p.week}`
}
const M = { top: 10, right: 12, bottom: 10, left: 12 }

function Row({ points, weeks, hollow, label, width }: { points: SeasonRowPoint[]; weeks: number; hollow: boolean; label: string; width: number }) {
  const x = linear([1, Math.max(2, weeks)], [M.left, width - M.right])
  const dom = padDomain(extent(points.map((p) => p.value)) ?? [0, 1], 0.2)
  const y = linear(dom, [ROW_H - M.bottom, M.top])
  const targets: PlotTarget[] = points.map((p, i) => ({ id: `${p.week}-${i}`, x: x(p.week), y: y(p.value), callout: `${p.label} · week ${p.week}` }))
  return (
    <PlotSurface width={width} height={ROW_H} label={label} targets={targets}>
      <line x1={M.left} x2={width - M.right} y1={ROW_H - M.bottom / 2} y2={ROW_H - M.bottom / 2} stroke="var(--line)" strokeWidth={1} />
      {points.map((p, i) => (
        <ValuePoint key={`${p.week}-${i}`} x={x(p.week)} y={y(p.value)} r={3.5} hollow={hollow} tone="ink" />
      ))}
    </PlotSurface>
  )
}

/**
 * Season view (Plus; PRODUCT §6.9 tile 5; DESIGN §9.9): two small multiples on one shared x-axis of
 * season weeks. Top: the practice focus metric per session (solid points, its own state). Bottom:
 * double faults per service game per comp night (hollow points, You logged). Separate plots and
 * y-axes, never one combined series, never a verdict.
 */
export function SeasonView({ rows, practiceName, practiceStatus }: { rows: SeasonRows; practiceName: string; practiceStatus: MetricStatus }) {
  const { ref, width } = useChartWidth()
  const ticks = [...new Set([1, Math.max(1, Math.round(rows.weeks / 2)), rows.weeks])]
  const x = linear([1, Math.max(2, rows.weeks)], [M.left, width - M.right])
  const byWeek = new Map<number, { practice: string[]; match: string[] }>()
  for (const p of rows.practice) byWeek.set(p.week, { practice: [...(byWeek.get(p.week)?.practice ?? []), p.label], match: byWeek.get(p.week)?.match ?? [] })
  for (const m of rows.matches) byWeek.set(m.week, { practice: byWeek.get(m.week)?.practice ?? [], match: [...(byWeek.get(m.week)?.match ?? []), m.label] })
  const weeks = [...byWeek.keys()].sort((a, b) => a - b)
  return (
    <ChartFrame
      variant="plain"
      title="Practice and comp nights, week by week"
      subtitle={rows.seasonal ? `Season weeks 1 to ${rows.weeks}, from ${shortDate(rows.firstDate)}` : `Weeks since ${shortDate(rows.firstDate)}`}
      footer={
        <>
          <span>Comp nights are your own log. We show them next to practice, not combined.</span>
          <span>No verdict is worked out across the two.</span>
        </>
      }
      table={{
        caption: 'Practice and comp nights by week',
        columns: ['Week', `Practice: ${practiceName.toLowerCase()}`, 'Comp nights'],
        rows: weeks.map((w) => ({ key: String(w), cells: [String(w), byWeek.get(w)!.practice.join('; ') || 'None', byWeek.get(w)!.match.join('; ') || 'None'] })),
      }}
    >
      <div ref={ref} className="flex w-full flex-col gap-2" data-season-view>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-footnote font-label text-ink-2">Practice: {practiceName.toLowerCase()}</span>
          <StatusChip status={practiceStatus} />
        </div>
        {rows.practice.length ? (
          <>
            <span className="text-footnote tabular-nums text-ink-3">Latest: {latestOf(rows.practice)}</span>
            <Row points={rows.practice} weeks={rows.weeks} hollow={false} width={width} label={`Practice, ${practiceName}: ${rows.practice.length} sessions across ${rows.weeks} weeks.`} />
          </>
        ) : (
          <p className="text-footnote text-ink-3">No matched practice sessions in these weeks.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-1">
          <span className="text-footnote font-label text-ink-2">Comp nights: double faults per service game</span>
          <StatusChip status="player-entered" />
        </div>
        {rows.matches.length ? (
          <>
            <span className="text-footnote tabular-nums text-ink-3">Latest: {latestOf(rows.matches)}</span>
            <Row points={rows.matches} weeks={rows.weeks} hollow width={width} label={`Comp nights: ${rows.matches.length} logged across ${rows.weeks} weeks.`} />
          </>
        ) : (
          <p className="text-footnote text-ink-3">No comp nights with service games logged in these weeks.</p>
        )}
        <svg width={width} height={18} aria-hidden="true" className="overflow-visible">
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={13} textAnchor={t === ticks[0] ? 'start' : t === rows.weeks ? 'end' : 'middle'} className="fill-ink-3 text-caption tabular-nums">
              {`Week ${t}`}
            </text>
          ))}
        </svg>
      </div>
    </ChartFrame>
  )
}
