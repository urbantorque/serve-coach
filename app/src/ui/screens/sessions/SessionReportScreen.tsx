import { FlaskIcon, InfoIcon } from '@phosphor-icons/react'
import { useParams } from 'react-router'
import type { MetricId } from '../../../analysis/types.ts'
import { useSession, useSessionStats } from '../../../data/hooks.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import {
  CaptureQualityLine,
  DelayedSkeleton,
  EmptyState,
  ListGroup,
  MetricGrid,
  MetricTile,
  SampleBanner,
  Screen,
  SectionLabel,
  Skeleton,
  UnavailableRow,
} from '../../components/index.ts'
import { UI } from '../../copy/strings.ts'
import { shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'

/** Hero order (DESIGN §10.6, D5). Side and rear reports are never pooled (D1). */
const HEROES: Record<'side' | 'rear', MetricId[]> = {
  side: [
    'toss-height-spread', 'toss-forward-spread', 'contact-height-ratio', 'rhythm-release-to-contact',
    'rhythm-spread', 'landing-distance', 'leg-drive', 'shoulder-tilt-trophy',
  ],
  rear: ['toss-height-spread', 'contact-height-ratio', 'rhythm-release-to-contact', 'rhythm-spread'],
}
const OUTCOMES: MetricId[] = ['first-serve-in-rate', 'second-serve-in-rate', 'double-faults']
/** Ghost rows every report carries when unavailable (DESIGN §8.7 "Unavailable ghost row"). */
const GHOSTS: Record<'side' | 'rear', MetricId[]> = {
  side: ['knee-bend-band', 'shoulder-over-shoulder-contact', 'speed-experimental', 'spin'],
  rear: ['leg-drive', 'shoulder-tilt-trophy', 'speed-average-rear', 'spin'],
}
const EXPERIMENTAL: Record<'side' | 'rear', MetricId[]> = {
  side: ['deep-bend-flag', 'speed-experimental', 'trophy-pause', 'repeatability'],
  rear: ['toss-lateral-spread', 'knee-bend-band', 'shoulder-over-shoulder-contact', 'speed-average-rear', 'trophy-pause', 'repeatability'],
}

/**
 * Session report (DESIGN §10.6, PRODUCT §6.5). STUB: renders the fixed order with real data-layer
 * reads (headline, capture line, hero tiles, outcomes, ghost rows, experimental group, validation
 * footer) so the honesty rules are wired end to end. The focus card, toss map, leg-drive and band
 * tiles, serve strip and storage line are for the Session report builder.
 */
export function SessionReportScreen() {
  const { sessionId } = useParams()
  const session = useSession(sessionId)
  const stats = useSessionStats(sessionId)
  const experimental = useSettingsStore((s) => s.experimentalMetrics)

  if (session === undefined || stats === undefined) {
    return (
      <Screen title="Session" back={{ to: paths.sessions(), label: 'Sessions' }}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-3">
            <Skeleton variant="text" className="w-2/3" />
            <Skeleton variant="tile" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }
  if (session === null) {
    return (
      <Screen title="Session" back={{ to: paths.sessions(), label: 'Sessions' }}>
        <EmptyState icon={InfoIcon} title="Session not found" body="It may have been deleted. Your other sessions are in the Sessions tab." />
      </Screen>
    )
  }

  const view = session.view === 'rear' ? 'rear' : 'side'
  const m = stats?.metrics ?? {}
  const a = session.analysis
  const tile = (id: MetricId) => {
    const v = m[id]
    if (!v || v.status === 'unavailable') return null
    if (v.status === 'experimental' && !EXPERIMENTAL[view].includes(id)) return null
    return <MetricTile key={id} metricId={id} value={v} to={paths.metricInfo(id)} />
  }
  const ghosts = GHOSTS[view].filter((id) => m[id]?.status === 'unavailable')
  const experimentalTiles = EXPERIMENTAL[view].filter((id) => m[id] && m[id]?.status === 'experimental')
  const heroIds = HEROES[view].filter((id) => m[id]?.status !== 'experimental')

  return (
    <Screen
      title={shortDate(session.visitId)}
      back={{ to: paths.sessions(), label: 'Sessions' }}
      banner={session.isDemo ? <SampleBanner /> : undefined}
    >
      <header className="flex flex-col gap-3">
        <p className="text-footnote text-ink-3">
          {view === 'rear' ? 'View from behind' : 'Side view'}, {session.defaultSide ?? 'deuce'},{' '}
          {session.defaultServeNumber === 2 ? 'second' : 'first'} serves, {a?.capture.meta.captureFps ?? 60} fps
        </p>
        {stats?.headline ? <p className="text-title-2 text-ink">{stats.headline}</p> : null}
        {a ? (
          <CaptureQualityLine
            overall={a.capture.quality.overall}
            measured={a.counts.included}
            detected={a.counts.analysed}
            tip={a.capture.quality.checks.find((c) => c.fix)?.fix}
          />
        ) : null}
      </header>

      <section className="flex flex-col gap-3" aria-label="Your serve today">
        <SectionLabel>Your serve today</SectionLabel>
        <MetricGrid>{heroIds.map(tile)}</MetricGrid>
      </section>

      <section className="flex flex-col gap-3" aria-label="Outcomes">
        <SectionLabel>Outcomes</SectionLabel>
        <MetricGrid>{OUTCOMES.map(tile)}</MetricGrid>
      </section>

      {ghosts.length ? (
        <section className="flex flex-col gap-3" aria-label={UI.notAvailableHeader}>
          <SectionLabel>{UI.notAvailableHeader}</SectionLabel>
          <ListGroup>
            {ghosts.map((id) => (
              <UnavailableRow key={id} metricId={id} reasonCode={m[id]?.reasonCode} to={paths.metricInfo(id)} />
            ))}
          </ListGroup>
        </section>
      ) : null}

      {experimental && experimentalTiles.length ? (
        <section className="flex flex-col gap-3" aria-label={UI.experimentalHeader}>
          <div className="flex flex-col gap-1">
            <SectionLabel className="flex items-center gap-1.5">
              <FlaskIcon size={16} aria-hidden="true" />
              {UI.experimentalHeader}
            </SectionLabel>
            <p className="text-footnote text-ink-3">{UI.experimentalLine}</p>
          </div>
          <MetricGrid>{experimentalTiles.map(tile)}</MetricGrid>
        </section>
      ) : null}

      <p className="flex items-start gap-2 text-footnote text-ink-2">
        <InfoIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>{UI.validationFooter}</span>
      </p>
    </Screen>
  )
}
