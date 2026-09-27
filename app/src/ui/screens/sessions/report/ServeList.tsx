import { EyeSlashIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { CameraOrientation, MetricId } from '../../../../analysis/types.ts'
import { Button, MetricValue, OutcomeMark, SegmentedControl, StatusChip, StatusGlyph } from '../../../components/index.ts'
import type { MetricStatus } from '../../../../analysis/types.ts'
import { cx } from '../../../components/cx.ts'
import { ChartFrame, StripPlot, type StripDatum } from '../../../charts/index.ts'
import { OUTCOME_WORDS, reasonShortForm, UI } from '../../../copy/strings.ts'
import { paths } from '../../../shell/paths.ts'
import { apexCm, isFault, perServe, type ServeRow } from '../../progress/insights/serves.ts'
import { median } from '../../../../analysis/stats/index.ts'
import { StatusLegend, ServeFrame } from '../../progress/insights/ui.tsx'

type StripMetric = 'toss' | 'contact' | 'timing'

/** The row's state for its compact chip: the least certain of its key stats (estimate over measured). */
function rowStatus(r: ServeRow, ids: MetricId[]): MetricStatus {
  const st = ids.map((id) => r.metrics[id]?.status).filter((x): x is MetricStatus => Boolean(x) && x !== 'experimental')
  return st.includes('estimated') ? 'estimated' : (st[0] ?? 'estimated')
}

/** Short labels for the two key stats in each serve row. */
const KEY_LABEL: Partial<Record<MetricId, string>> = {
  'toss-forward': 'Toss from toe',
  'rhythm-release-to-contact': 'Toss to hit',
  'contact-height-ratio': 'Contact',
}
type Filter = 'all' | 'in' | 'missed' | 'untagged'

const STRIP: Record<StripMetric, { id: MetricId; label: string; unit: string; scale: (v: number) => number; fmt: (v: number) => string }> = {
  toss: { id: 'toss-apex-height', label: 'Toss height', unit: 'm', scale: (v) => v, fmt: (v) => `${v.toFixed(2)} m` },
  contact: { id: 'contact-height-ratio', label: 'Contact', unit: '×', scale: (v) => v, fmt: (v) => `${v.toFixed(2)} × height` },
  timing: { id: 'rhythm-release-to-contact', label: 'Timing', unit: 's', scale: (v) => v / 1000, fmt: (v) => `${v.toFixed(2)} s` },
}

export interface ServeListProps {
  sessionId: string
  rows: ServeRow[]
  view: 'side' | 'rear'
  orientation: CameraOrientation
  heightM?: number
  stratumLabel: string
}

/**
 * All serves (DESIGN §9.3, PRODUCT §6.5 item 10): a serve strip with a metric switcher, then one row
 * per serve (key frame, outcome mark and word, two key stats with compact chips) linking to Serve
 * detail. Excluded serves stay visible with "Not measured" and the reason.
 */
export function ServeList({ sessionId, rows, view, orientation, heightM, stratumLabel }: ServeListProps) {
  const navigate = useNavigate()
  const [metric, setMetric] = useState<StripMetric>('toss')
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState(false)
  const cfg = STRIP[metric]
  const values =
    metric === 'toss'
      ? rows
          .filter((r) => r.included && !r.isLet)
          .map((r) => ({ row: r, cm: apexCm(r, heightM) }))
          .filter((x): x is { row: ServeRow; cm: number } => x.cm !== null)
          .map((x) => ({ row: x.row, v: x.cm / 100 }))
      : perServe(rows, cfg.id).map((p) => ({ row: p.row, v: cfg.scale(p.value) }))
  const vs = values.map((x) => x.v)
  const pad = vs.length ? Math.max((Math.max(...vs) - Math.min(...vs)) * 0.1, metric === 'contact' ? 0.02 : 0.05) : 0.1
  const domain: [number, number] = vs.length ? [Math.min(...vs) - pad, Math.max(...vs) + pad] : [0, 1]
  const data: StripDatum[] = values.map((x) => ({
    id: x.row.id,
    value: x.v,
    kind: x.row.kind,
    muted: x.row.softFlag,
    callout: `${cfg.fmt(x.v)} · Serve ${x.row.index}, ${OUTCOME_WORDS[x.row.kind].toLowerCase()}`,
  }))
  const med = vs.length ? median(vs) : undefined

  const keep = (r: ServeRow) =>
    filter === 'all' ? true : filter === 'in' ? r.kind === 'in' : filter === 'missed' ? isFault(r.kind) : r.kind === 'untagged'
  const listed = rows.filter(keep)
  const visible = expanded ? listed : listed.slice(0, 8)
  const keyIds: MetricId[] = view === 'side' ? ['toss-forward', 'rhythm-release-to-contact'] : ['contact-height-ratio', 'rhythm-release-to-contact']

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label="Serve strip measurement"
        options={[
          { value: 'toss', label: 'Toss height' },
          { value: 'contact', label: 'Contact' },
          { value: 'timing', label: 'Timing' },
        ]}
        value={metric}
        onChange={setMetric}
      />
      <ChartFrame
        title={`${cfg.label} on each serve`}
        subtitle={stratumLabel}
        status={values.length ? 'estimated' : undefined}
        metricId={cfg.id}
        insufficient={values.length < 2 ? 'Not enough measured serves to draw this.' : undefined}
        table={{
          caption: `${cfg.label} per serve`,
          columns: ['Serve', 'Result', cfg.label],
          rows: values.map((x) => ({ key: x.row.id, cells: [`Serve ${x.row.index}`, OUTCOME_WORDS[x.row.kind], `≈ ${cfg.fmt(x.v)}`] })),
        }}
        footer={<OutcomeLegend />}
      >
        <StripPlot
          label={`${cfg.label} for ${values.length} serves${med !== undefined ? `, middle ${cfg.fmt(med)}` : ''}.`}
          rows={[{ key: metric, data, median: med, medianLabel: med !== undefined ? `middle ${cfg.fmt(med)}` : undefined }]}
          domain={domain}
          unit={cfg.unit === '×' ? undefined : cfg.unit}
          formatTick={(v) => (metric === 'toss' ? v.toFixed(2) : metric === 'contact' ? v.toFixed(2) : v.toFixed(2))}
          onOpen={(id) => navigate(paths.serveDetail(sessionId, id))}
        />
      </ChartFrame>

      <div className="flex flex-col gap-2">
        <SegmentedControl
          label="Show serves"
          options={[
            { value: 'all', label: 'All' },
            { value: 'in', label: 'In' },
            { value: 'missed', label: 'Missed' },
            { value: 'untagged', label: 'Untagged' },
          ]}
          value={filter}
          onChange={(v) => {
            setFilter(v)
            setExpanded(false)
          }}
        />
        <StatusLegend statuses={['estimated']} />
        {listed.length ? (
          <ul aria-label="Serves" className="card overflow-hidden">
            {visible.map((r) => (
              <li key={r.id} className="[&:first-child_[data-divider]]:hidden">
                <Link
                  to={paths.serveDetail(sessionId, r.id)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-surface-2 active:bg-surface-2"
                >
                  <ServeFrame
                    serveId={r.id}
                    event="contact"
                    alt={`Serve ${r.index}`}
                    size="row"
                    orientation={orientation}
                    placeholder={<EyeSlashIcon size={16} aria-hidden="true" />}
                  />
                  <span className="relative flex min-w-0 flex-1 items-center gap-3 self-stretch py-3">
                    <span data-divider className="absolute inset-x-0 top-0 h-px bg-line court:h-0.5" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-headline text-ink">
                        <span className="tabular-nums">Serve {r.index}</span>
                        <span className="flex items-center gap-1 text-footnote text-ink-2">
                          <OutcomeMark outcome={r.kind} size={10} />
                          {r.isLet ? 'Let' : OUTCOME_WORDS[r.kind]}
                        </span>
                        {r.softFlag ? (
                          <span className="flex items-center gap-0.5 text-footnote text-ink-2">
                            <WarningCircleIcon size={12} aria-hidden="true" className="text-attention" />
                            {UI.checkThisServe}
                          </span>
                        ) : null}
                      </span>
                      {r.included ? (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-footnote text-ink-2">
                          {keyIds.map((id) =>
                            r.metrics[id] && r.metrics[id]!.status !== 'experimental' ? (
                              <span key={id} className="inline-flex items-baseline gap-1 whitespace-nowrap">
                                <span className="text-ink-3">{KEY_LABEL[id]}</span>
                                <MetricValue
                                  metricId={id}
                                  value={r.metrics[id]!}
                                  chip={false}
                                  className="[&_.text-body]:text-footnote [&_.text-subhead]:text-footnote"
                                />
                              </span>
                            ) : null,
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-footnote text-ink-3">
                          <StatusGlyph status="unavailable" size={14} />
                          Not measured · {reasonShortForm(r.exclusions[0])}
                        </span>
                      )}
                    </span>
                    {r.included ? (
                      <StatusChip status={rowStatus(r, keyIds)} compact className="shrink-0" />
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-callout text-ink-2">No serves match this filter.</p>
        )}
        {listed.length > 8 ? (
          <Button variant="tertiary" onClick={() => setExpanded((v) => !v)} className={cx('self-start')}>
            {expanded ? 'Show fewer' : `Show all ${listed.length} serves`}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Legend with the actual mark shapes (DESIGN §9.1), words beside every mark. */
export function OutcomeLegend() {
  const items: [Parameters<typeof OutcomeMark>[0]['outcome'], string][] = [
    ['in', 'In'],
    ['net', 'Net'],
    ['long', 'Long or wide'],
    ['untagged', 'Not tagged'],
  ]
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map(([k, w]) => (
        <span key={k} className="inline-flex items-center gap-1">
          <OutcomeMark outcome={k} size={8} />
          {w}
        </span>
      ))}
    </span>
  )
}
