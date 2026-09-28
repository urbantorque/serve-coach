import { Link } from 'react-router'
import { MetricValue, StatusChip } from '../../../components/index.ts'
import { metricName } from '../../../copy/metricNames.ts'
import { formatMetric } from '../../../format/metricFormat.ts'
import { useChecksForSession } from '../../playback/check/data.ts'
import { radarForSession } from '../../playback/serveView.ts'
import { metricInfoFor } from '../../progress/insights/links.ts'
import type { ServeRow } from '../../progress/insights/serves.ts'

/**
 * "Radar speed (you logged)" on the session report (U2; D4): shown only when a radar reading was
 * entered in Check this serve for a serve of this session. Player-entered, a peak speed with its
 * source ("Pocket Radar, peak") and the serve it came from. The app never measures this.
 */
export function RadarSpeedTile({ sessionId, rows }: { sessionId: string; rows: readonly ServeRow[] }) {
  const checks = useChecksForSession(sessionId)
  const index = new Map(rows.map((r) => [r.id, r.index]))
  const radar = radarForSession(checks, (id) => index.get(id))
  if (!radar) return null
  const f = formatMetric('speed-radar-entered', radar.value)
  return (
    <Link
      to={metricInfoFor('speed-radar-entered', sessionId)}
      aria-label={`${f.aria}, ${radar.source}. ${radar.serveLine}.`}
      className="card flex flex-col items-start gap-1 p-4 transition-transform duration-(--dur-press) hover:border-line-strong active:scale-[0.98] motion-reduce:active:scale-100"
      data-metric-tile="speed-radar-entered"
      data-radar-speed
      data-status="player-entered"
    >
      <span className="text-footnote font-label text-ink-2">{metricName('speed-radar-entered')}</span>
      <MetricValue metricId="speed-radar-entered" value={radar.value} size="metric" chip={false} />
      <span className="text-footnote text-ink-2" data-radar-source>
        {radar.source}
      </span>
      <span className="text-footnote tabular-nums text-ink-3">{radar.serveLine}</span>
      <span className="pt-1" aria-hidden="true">
        <StatusChip status="player-entered" />
      </span>
    </Link>
  )
}
