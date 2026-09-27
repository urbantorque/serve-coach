import type { CameraOrientation, MetricId, MetricValue as MetricValueData } from '../../../../analysis/types.ts'
import type { Goal } from '../../../../data/records.ts'
import { Badge, MetricGrid, MetricTile, MetricValue, StatusChip } from '../../../components/index.ts'
import { metricName } from '../../../copy/metricNames.ts'
import { BAND_WORDS, STATUS_LABEL, UI } from '../../../copy/strings.ts'
import { formatMetric } from '../../../format/metricFormat.ts'
import { metricInfoFor } from '../../progress/insights/links.ts'
import { formatRange } from '../../progress/insights/values.ts'
import { ServeFrame } from '../../progress/insights/ui.tsx'
import { Link } from 'react-router'

type Metrics = Partial<Record<MetricId, MetricValueData>>

/** Supporting tiles after the toss hero, in goal order (PRODUCT §6.5 "Stats order by goal"). */
const ORDER: Record<Goal, MetricId[]> = {
  'first-serves-in': ['contact-height-ratio', 'rhythm-spread', 'rhythm-release-to-contact', 'landing-distance'],
  'second-serve-reliability': ['rhythm-spread', 'contact-height-ratio', 'rhythm-release-to-contact', 'landing-distance'],
  'more-pace': ['contact-height-ratio', 'landing-distance', 'rhythm-release-to-contact', 'rhythm-spread'],
  'less-effort': ['rhythm-spread', 'rhythm-release-to-contact', 'contact-height-ratio', 'landing-distance'],
}
const REAR_TILES: MetricId[] = ['contact-height-ratio', 'rhythm-spread', 'rhythm-release-to-contact']

const shown = (v: MetricValueData | undefined) => Boolean(v) && v?.status !== 'unavailable' && v?.status !== 'experimental'

export interface SupportTilesProps {
  view: 'side' | 'rear'
  metrics: Metrics
  goal: Goal
  usual: Partial<Record<MetricId, [number, number] | null>>
  orientation: CameraOrientation
  /** Representative serve for the band and leg-drive key frames. */
  representativeServeId?: string
  sessionId: string
}

/**
 * Compact supporting stats (DESIGN §10.6): 2-column tiles for contact height, toss-to-hit time,
 * rhythm spread and landing; then the leg-drive tile and the shoulder-tilt band tile (side view).
 */
export function SupportTiles({ view, metrics, goal, usual, orientation, representativeServeId, sessionId }: SupportTilesProps) {
  const ids = (view === 'rear' ? REAR_TILES : ORDER[goal]).filter((id) => shown(metrics[id]))
  return (
    <div className="flex flex-col gap-3">
      <MetricGrid>
        {ids.map((id) => {
          const u = usual[id]
          return <MetricTile key={id} metricId={id} value={metrics[id]!} usual={u ? formatRange(id, u) : undefined} to={metricInfoFor(id, sessionId)} />
        })}
      </MetricGrid>
      {view === 'side' && shown(metrics['leg-drive']) ? (
        <LegDriveTile metrics={metrics} orientation={orientation} serveId={representativeServeId} sessionId={sessionId} />
      ) : null}
      {view === 'side' && shown(metrics['shoulder-tilt-trophy']) ? (
        <BandTile metricId="shoulder-tilt-trophy" value={metrics['shoulder-tilt-trophy']!} orientation={orientation} serveId={representativeServeId} sessionId={sessionId} />
      ) : null}
    </div>
  )
}

function referenceLine(v: MetricValueData): string {
  return v.secondary?.reference === 'session' ? "Compared with today's other serves" : 'Compared with your usual'
}

/** Leg-drive tile (DESIGN §8.7): hip rise as % of height with player-relative band words, drive time, and the loading-depth description. */
export function LegDriveTile({ metrics, orientation, serveId, sessionId }: { metrics: Metrics; orientation: CameraOrientation; serveId?: string; sessionId: string }) {
  const lift = metrics['leg-drive']!
  const drive = metrics['drive-time']
  const load = metrics['loading-depth']
  const f = formatMetric('leg-drive', lift)
  const band = lift.band && lift.band !== 'unclear' ? lift : undefined
  return (
    <Link
      to={metricInfoFor('leg-drive', sessionId)}
      aria-label={`${f.aria}${band ? `, ${BAND_WORDS[band.band as 'low' | 'typical' | 'high'].toLowerCase()}, ${referenceLine(lift).toLowerCase()}` : ''}`}
      className="card flex flex-col gap-3 p-4 transition-transform duration-(--dur-press) hover:border-line-strong active:scale-[0.98] motion-reduce:active:scale-100"
      data-metric-tile="leg-drive"
      data-status={lift.status}
    >
      <span className="text-footnote font-label text-ink-2">{metricName('leg-drive')}</span>
      <span className="flex gap-3">
        {serveId ? <ServeFrame serveId={serveId} event="contact" alt="Contact frame" size="compact" orientation={orientation} /> : null}
        <span className="flex min-w-0 flex-col gap-1" aria-hidden="true">
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-subhead text-ink-2">Hips rose</span>
            <MetricValue metricId="leg-drive" value={lift} size="metric" chip={false} />
          </span>
          {band ? (
            <span className="flex flex-col">
              <span className="text-headline text-ink">{BAND_WORDS[band.band as 'low' | 'typical' | 'high']}</span>
              <span className="text-footnote text-ink-3">{referenceLine(lift)}</span>
            </span>
          ) : null}
          {drive && shown(drive) ? (
            <span className="flex flex-wrap items-center gap-x-1.5 text-subhead text-ink-2">
              Drive time <MetricValue metricId="drive-time" value={drive} compactChip />
            </span>
          ) : null}
          {f.nLine ? <span className="text-footnote tabular-nums text-ink-3">{f.nLine}</span> : null}
          <span className="flex flex-wrap items-center gap-2 pt-1">
            <StatusChip status={lift.status} />
            {lift.provisional ? <Badge>{UI.earlyRead}</Badge> : null}
          </span>
        </span>
      </span>
      {load && shown(load) ? (
        <span className="flex flex-wrap items-center gap-x-1 border-t border-line pt-3 text-footnote text-ink-2">
          Before that, your hips dropped <MetricValue metricId="loading-depth" value={load} compactChip />
        </span>
      ) : null}
    </Link>
  )
}

/** Band tile (DESIGN §8.7): player-relative words, never degrees; key frame of the top of the swing. */
export function BandTile({
  metricId,
  value,
  orientation,
  serveId,
  sessionId,
}: {
  metricId: 'shoulder-tilt-trophy' | 'knee-bend-band' | 'shoulder-over-shoulder-contact'
  value: MetricValueData
  orientation: CameraOrientation
  serveId?: string
  sessionId: string
}) {
  const f = formatMetric(metricId, value)
  const label = metricId === 'shoulder-tilt-trophy' ? 'Shoulder tilt at the top of your swing' : metricName(metricId)
  return (
    <Link
      to={metricInfoFor(metricId, sessionId)}
      aria-label={`${label}, ${f.text}, ${referenceLine(value).toLowerCase()}${f.nLine ? `, ${f.nLine}` : ''}, ${STATUS_LABEL[value.status]}`}
      className="card flex gap-3 p-4 transition-transform duration-(--dur-press) hover:border-line-strong active:scale-[0.98] motion-reduce:active:scale-100"
      data-metric-tile={metricId}
      data-status={value.status}
    >
      {serveId ? <ServeFrame serveId={serveId} event="trophy" alt="Frame at the top of the swing" size="compact" orientation={orientation} /> : null}
      <span className="flex min-w-0 flex-col items-start gap-1" aria-hidden="true">
        <span className="text-footnote font-label text-ink-2">{label}</span>
        <MetricValue metricId={metricId} value={value} size="metric" chip={false} />
        <span className="text-footnote text-ink-3">{referenceLine(value)}</span>
        {f.nLine ? <span className="text-footnote tabular-nums text-ink-3">{f.nLine}</span> : null}
        <span className="flex flex-wrap items-center gap-2 pt-1">
          <StatusChip status={value.status} />
          {value.provisional ? <Badge>{UI.earlyRead}</Badge> : null}
        </span>
      </span>
    </Link>
  )
}
