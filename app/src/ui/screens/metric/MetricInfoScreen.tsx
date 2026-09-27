import { useParams } from 'react-router'
import { METRIC_IDS, REAR_ONLY_METRIC_IDS } from '../../../analysis/types.ts'
import { metricName } from '../../copy/metricNames.ts'
import { StubScreen } from '../StubScreen.tsx'

/**
 * Metric info, "How we measure" per metric (DESIGN §10.14, PRODUCT §6.14). Opened from any chip or
 * tile. STUB: title and the view limit; content comes from metrics.json and METRICS §6.
 */
export function MetricInfoScreen() {
  const { metricId = '' } = useParams()
  const known = (METRIC_IDS as readonly string[]).includes(metricId)
  const rearOnly = (REAR_ONLY_METRIC_IDS as readonly string[]).includes(metricId)
  return (
    <StubScreen
      title={known ? metricName(metricId) : 'Metric'}
      purpose={
        rearOnly
          ? 'Needs a view from behind. The side view cannot see this, so a side-view session always shows it as not available.'
          : 'What it is, your trend, how we measure it, what it needs, how sure we are, and its known limits. Bands and legs are compared only with your own serves.'
      }
      specs={['DESIGN §10.14', 'PRODUCT §6.14', 'METRICS §3 and §6', 'metrics.json']}
    />
  )
}
