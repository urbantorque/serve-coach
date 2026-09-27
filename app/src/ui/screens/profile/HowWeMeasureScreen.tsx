import { EyeSlashIcon, InfoIcon } from '@phosphor-icons/react'
import { useMemo } from 'react'
import type { MetricStatus } from '../../../analysis/types.ts'
import { Card, ListGroup, ListRow, Screen, SectionLabel, StatusChip } from '../../components/index.ts'
import { UI } from '../../copy/strings.ts'
import { paths } from '../../shell/paths.ts'
import { CheckSteps, KnownLimits, ValidationResults } from './HowWeMeasureValidation.tsx'
import { CANNOT_MEASURE, GROUP_NOTES, GROUP_TITLES, measureIndex } from './measureIndex.ts'

/** PRODUCT §6.14 item 3: each label in one line. */
const STATUS_MEANING: Record<MetricStatus, string> = {
  measured: 'Worked out directly from your video.',
  estimated: 'Worked out from your video and your height, so it has a margin of error.',
  'player-entered': 'You logged this.',
  experimental: "We're still checking this method, so it may be off.",
  unavailable: 'Not available from this footage, with the reason.',
}
const LEGEND: MetricStatus[] = ['measured', 'estimated', 'player-entered', 'experimental', 'unavailable']

/**
 * How we measure (PRODUCT §6.13 item 5, DESIGN §3.2, §10.14 index): what each label means, how far our
 * checks have gone, every metric with the highest label the engine can give it today, its validation
 * state in plain words and typical error on simulated serves, the validation results, known limits and
 * what a phone cannot measure. Each row opens that metric's info page (full figures and its limits).
 */
export function HowWeMeasureScreen() {
  const groups = useMemo(() => measureIndex(), [])
  return (
    <Screen title={UI.howWeMeasure} back={{ to: paths.profile(), label: 'You' }}>
      <p className="flex items-start gap-2 text-callout text-ink-2">
        <InfoIcon size={20} aria-hidden="true" className="mt-px shrink-0" />
        {UI.validationFooter}
      </p>

      <section className="flex flex-col gap-2" aria-labelledby="hwm-labels">
        <SectionLabel>
          <span id="hwm-labels">Every number carries a label</span>
        </SectionLabel>
        <Card>
          <dl className="flex flex-col gap-3">
            {LEGEND.map((s) => (
              <div key={s} className="flex items-start gap-3">
                <dt className="w-[118px] shrink-0">
                  <StatusChip status={s} />
                </dt>
                <dd className="text-footnote text-ink-2">{STATUS_MEANING[s]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <CheckSteps />

      {groups.map(({ group, rows }) => (
        <section key={group} className="flex flex-col gap-2" aria-labelledby={`hwm-${group}`}>
          <SectionLabel>
            <span id={`hwm-${group}`}>{GROUP_TITLES[group]}</span>
          </SectionLabel>
          <p className="-mt-1 text-footnote text-ink-2">{GROUP_NOTES[group]}</p>
          <ListGroup>
            {rows.map((r) => (
              <ListRow
                key={r.id}
                to={paths.metricInfo(r.id)}
                title={r.name}
                subtitle={r.views}
                detail={r.validationWords}
                trailing={<StatusChip status={r.status} compact />}
                dataAttrs={{ 'data-index-metric': r.id, 'data-status': r.status }}
              />
            ))}
          </ListGroup>
        </section>
      ))}

      <ValidationResults />

      <KnownLimits />

      <section className="flex flex-col gap-2" aria-labelledby="hwm-cannot">
        <SectionLabel>
          <span id="hwm-cannot">What we can't measure</span>
        </SectionLabel>
        <Card className="flex flex-col gap-2">
          {CANNOT_MEASURE.map((line) => (
            <p key={line} className="flex items-start gap-2 text-callout text-ink">
              <EyeSlashIcon size={20} aria-hidden="true" className="mt-px shrink-0 text-ink-3" />
              {line}
            </p>
          ))}
        </Card>
      </section>

      <p className="text-footnote text-ink-3">
        Sample data is the real engine's output on computer-generated video of a synthetic player, so you can see how reports read. It is never mixed with yours.
      </p>
    </Screen>
  )
}
