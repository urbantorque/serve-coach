import { METRIC_IDS } from '../../../analysis/types.ts'
import { ListGroup, ListRow, Screen } from '../../components/index.ts'
import { METRIC_NAMES } from '../../copy/metricNames.ts'
import { UI } from '../../copy/strings.ts'
import { paths } from '../../shell/paths.ts'

/**
 * How we measure (DESIGN §10.14 index): every metric, each opening its Metric info page.
 * STUB: the index is real; per-metric pages are stubs.
 */
export function HowWeMeasureScreen() {
  return (
    <Screen title={UI.howWeMeasure} back={{ to: paths.profile(), label: 'You' }}>
      <p className="text-callout text-ink-2">{UI.validationFooter}</p>
      <ListGroup label="Metrics">
        {METRIC_IDS.map((id) => (
          <ListRow key={id} to={paths.metricInfo(id)} title={METRIC_NAMES[id]} />
        ))}
      </ListGroup>
    </Screen>
  )
}
