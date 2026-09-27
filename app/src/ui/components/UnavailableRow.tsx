import type { ReasonCode } from '../../analysis/types.ts'
import { metricName } from '../copy/metricNames.ts'
import { reasonShortForm } from '../copy/strings.ts'
import { ListRow, RowIcon } from './ListRow.tsx'
import { StatusGlyph } from './StatusChip.tsx'

export interface UnavailableRowProps {
  metricId: string
  reasonCode?: ReasonCode
  /** Metric info page ("How to unlock" / "Why"). */
  to?: string
  label?: string
}

/**
 * Ghost row for a metric this session could not measure (DESIGN §8.7): EyeSlash glyph, the metric
 * name, the reason short form, and a link to why. Never a dash, never a number. Every side-view
 * report carries ghost rows for knee bend and shoulder tilt at contact ("Needs a view from behind").
 */
export function UnavailableRow({ metricId, reasonCode, to, label }: UnavailableRowProps) {
  const reason = reasonShortForm(reasonCode, metricId)
  return (
    <ListRow
      dataAttrs={{ 'data-metric': metricId, 'data-status': 'unavailable' }}
      leading={
        <RowIcon>
          <StatusGlyph status="unavailable" size={20} />
        </RowIcon>
      }
      title={label ?? metricName(metricId)}
      subtitle={<span className="text-ink-3">{reason}</span>}
      trailing={to ? <span className="text-footnote text-ink underline underline-offset-[3px]">Why</span> : undefined}
      chevron={false}
      to={to}
    />
  )
}
