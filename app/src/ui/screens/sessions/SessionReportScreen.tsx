import { CaretDownIcon, FlaskIcon, InfoIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { validationLevel } from '../../../analysis/metrics/catalogue.ts'
import type { MetricId, MetricValue as MetricValueData, ReasonCode } from '../../../analysis/types.ts'
import { REAR_ONLY_METRIC_IDS, SIDE_ONLY_METRIC_IDS } from '../../../analysis/types.ts'
import { useLatestDecision, useProfile } from '../../../data/hooks.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import {
  Button,
  DelayedSkeleton,
  EmptyState,
  ListGroup,
  ListRow,
  MetricGrid,
  MetricTile,
  SampleBanner,
  Screen,
  SectionLabel,
  SegmentedControl,
  Skeleton,
  UnavailableRow,
} from '../../components/index.ts'
import { UI } from '../../copy/strings.ts'
import { shortDate } from '../../format/dates.ts'
import { decisionEvidence, headlineFor } from '../../format/sessionValues.ts'
import { paths } from '../../shell/paths.ts'
import { matched, seriesFor, stratumOf, stratumWords, usualRange, type SessionBundle } from '../progress/insights/history.ts'
import { comparisonSessionIds } from '../progress/insights/compare.ts'
import { useExperiment, useReportData, useSessionBundles, useSessionData } from '../progress/insights/hooks.ts'
import { outcomeLinkState } from '../progress/insights/outcomes.ts'
import { InlineError } from '../progress/insights/ui.tsx'
import { metricInfoFor } from '../progress/insights/links.ts'
import { FocusCard } from '../today/FocusCard.tsx'
import { InsightCard, OutcomesSection } from './report/OutcomesSection.tsx'
import { CaptureLine, ExperimentResultCard, StorageLine } from './report/ReportParts.tsx'
import { ServeList } from './report/ServeList.tsx'
import { SupportTiles } from './report/SupportTiles.tsx'
import { TossHero } from './report/TossHero.tsx'

type Metrics = Partial<Record<MetricId, MetricValueData>>

/** Ghost rows every report carries when unavailable (DESIGN §8.7, §10.6; D1 view limits). */
const GHOSTS: Record<'side' | 'rear', MetricId[]> = {
  side: ['knee-bend-band', 'shoulder-over-shoulder-contact', 'speed-experimental', 'spin'],
  rear: ['leg-drive', 'shoulder-tilt-trophy', 'speed-average-rear', 'spin'],
}
/** Hero and supporting metrics whose own unavailability is also listed with its reason. */
const CORE: Record<'side' | 'rear', MetricId[]> = {
  side: ['toss-height-spread', 'toss-forward-spread', 'contact-height-ratio', 'rhythm-release-to-contact', 'rhythm-spread', 'landing-distance', 'leg-drive', 'shoulder-tilt-trophy'],
  rear: ['toss-height-spread', 'contact-height-ratio', 'rhythm-release-to-contact', 'rhythm-spread'],
}
const MORE: Record<'side' | 'rear', MetricId[]> = {
  side: ['toss-apex-height', 'toss-forward', 'toss-drop', 'contact-forward', 'contact-height-spread', 'retoss-count'],
  rear: ['toss-apex-height', 'toss-drop', 'contact-height-spread'],
}
const EXPERIMENTAL: Record<'side' | 'rear', MetricId[]> = {
  // landing-distance, shoulder-tilt-trophy, toss-forward and contact-forward are experimental by
  // validation (V0): with enough serves they carry the experimental label, so they show here.
  side: ['deep-bend-flag', 'speed-experimental', 'trophy-pause', 'repeatability', 'landing-distance', 'shoulder-tilt-trophy', 'toss-forward', 'contact-forward'],
  rear: ['toss-lateral-spread', 'toss-lateral', 'knee-bend-band', 'shoulder-over-shoulder-contact', 'speed-average-rear', 'trophy-pause', 'repeatability'],
}
/**
 * Metrics the engine sets for the whole session only, never per group (analysis/metrics/session.ts):
 * a multi-group report reads them from the session, not from the shown group.
 */
const SESSION_WIDE: MetricId[] = ['spin', 'speed-experimental', 'speed-average-rear']

/**
 * The reason a ghost row gives (DESIGN §3.1, D4). Spin is never measurable by phone, whatever the
 * footage. Side-view launch speed below 120 fps needs 120 fps first, whatever else went missing.
 * Only metrics that need the other view say so.
 */
export function ghostReason(id: MetricId, v: MetricValueData | undefined, view: 'side' | 'rear', fps: number | undefined): ReasonCode | undefined {
  if (id === 'spin') return 'NOT_MEASURABLE'
  if (id === 'speed-experimental' && view === 'side' && fps !== undefined && fps < 120) return 'FPS_TOO_LOW'
  if (v?.reasonCode) return v.reasonCode
  if (view === 'side' && (REAR_ONLY_METRIC_IDS as readonly string[]).includes(id)) return 'NEEDS_REAR_VIEW'
  if (view === 'rear' && (SIDE_ONLY_METRIC_IDS as readonly string[]).includes(id)) return 'NEEDS_SIDE_VIEW'
  return undefined
}

function ReportSkeleton() {
  return (
    <Screen title="Session" back={{ to: paths.sessions(), label: 'Sessions' }}>
      <DelayedSkeleton>
        <div className="flex flex-col gap-3">
          <Skeleton variant="text" className="w-1/2" />
          <Skeleton variant="text" className="w-5/6" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </DelayedSkeleton>
    </Screen>
  )
}

/**
 * Session report (DESIGN §10.6, PRODUCT §6.5): headline, capture line, the one coaching decision, the
 * toss-consistency hero, supporting stats, outcomes (you logged) and the ins-and-misses insight, every
 * serve, what this view can't see, and the experimental group behind the toggle.
 */
export function SessionReportScreen() {
  const { sessionId } = useParams()
  const data = useReportData(sessionId)
  const profile = useProfile()
  const decision = useLatestDecision(sessionId)
  const experimental = useSettingsStore((s) => s.experimentalMetrics)
  const isDemo = data?.session.isDemo === 1
  const bundles = useSessionBundles({ includeDemo: isDemo })
  const exp = useExperiment(data?.session.experimentId)
  const baselineIds = exp ? comparisonSessionIds(exp, 'baseline') : undefined
  const retestIds = exp ? comparisonSessionIds(exp, 'retest') : undefined
  const expBaseline = useSessionData(baselineIds)
  const expRetests = useSessionData(retestIds)
  // A re-test session carries no decision of its own: show the experiment's focus (from its baseline session).
  const expDecision = useLatestDecision(!decision && exp ? exp.baselineSessionIds.at(-1) : '__none__')
  const [stratumIdx, setStratumIdx] = useState('0')
  const [moreOpen, setMoreOpen] = useState(false)

  const self: SessionBundle | null = data ? { session: data.session, stats: data.stats } : null
  const earlier = self && bundles ? bundles.filter((b) => b.session.id !== self.session.id && b.session.startedAt < self.session.startedAt && b.session.isDemo === self.session.isDemo) : []
  // Usual ranges and the toss map's usual area compare the shown stratum with the same stratum and
  // set-up in earlier sessions (METRICS §4.4).
  const shownKey = data?.stats?.strata && data.stats.strata.length > 1 ? (data.stats.strata[Number(stratumIdx)] ?? data.stats.strata[0]).key : self ? stratumOf(self) : undefined
  const prevMatched = self && shownKey ? earlier.filter((b) => matched(b, self, undefined, shownKey)).slice(0, 6) : []
  const prevData = useSessionData(prevMatched.map((b) => b.session.id))

  if (data === undefined || profile === undefined || decision === undefined) return <ReportSkeleton />
  if (data === null) {
    return (
      <Screen title="Session" back={{ to: paths.sessions(), label: 'Sessions' }}>
        <EmptyState icon={InfoIcon} title="Session not found" body="It may have been deleted. Your other sessions are in the Sessions tab." />
      </Screen>
    )
  }

  const { session, stats, rows, tally } = data
  const view = session.view === 'rear' ? 'rear' : 'side'
  const a = session.analysis
  const strata = stats?.strata ?? []
  const stratum = strata.length > 1 ? strata[Number(stratumIdx)] ?? strata[0] : undefined
  const m: Metrics = stratum?.metrics ?? stats?.metrics ?? {}
  // The shown group's metrics plus the session-wide ones (spin and speed are never set per group).
  const mv: Metrics = { ...m }
  for (const id of SESSION_WIDE) if (stats?.metrics[id]) mv[id] = stats.metrics[id]
  const heightM = a?.capture.scale.heightM ?? profile?.heightM
  const orientation = session.orientation ?? a?.capture.rectification.orientation ?? 'portrait'
  const key = stratum?.key ?? stratumOf({ session, stats })
  const stratumLabel = stratumWords(key)
  const goal = profile?.goal ?? 'first-serves-in'
  const back = { to: paths.sessions(), label: 'Sessions' }

  if (session.status !== 'ready' || !a) {
    return (
      <Screen title={shortDate(session.visitId)} back={back} banner={isDemo ? <SampleBanner /> : undefined}>
        {session.status === 'failed' ? (
          <InlineError action={<Button variant="secondary" to={paths.importVideo()}>Choose another video</Button>}>
            {session.error?.message ?? "This session couldn't be analysed. Your other sessions are fine."}
          </InlineError>
        ) : (
          <InlineError action={<Button variant="secondary" to={paths.processing(session.id)}>See progress</Button>}>
            This session is still being analysed. The report appears when it's done.
          </InlineError>
        )}
      </Screen>
    )
  }

  // Usual ranges from previous matched sessions (≥ 2, DESIGN §9.2).
  const usualOf = (id: MetricId) => (self ? usualRange(seriesFor(id, [...prevMatched].reverse().concat(self), key)) : null)
  const usual: Partial<Record<MetricId, [number, number] | null>> = {}
  for (const id of ['contact-height-ratio', 'rhythm-release-to-contact', 'rhythm-spread', 'landing-distance', 'toss-height-spread'] as MetricId[]) usual[id] = usualOf(id)

  const shownDecision = decision ?? expDecision ?? null
  // The focus's numbers are its own session's stored values in the focus's stratum, the same ones
  // Today shows (ui/format/sessionValues.ts), whichever stratum this report is showing.
  const decisionStats = shownDecision?.sessionId === session.id ? stats : (expBaseline?.find((d) => d.session.id === shownDecision?.sessionId) ?? expBaseline?.[0])?.stats
  const evidence = decisionEvidence(shownDecision, decisionStats)
  const headline = headlineFor(session, stats)

  // A metric that is experimental by validation (V0) never shows as an ordinary value, so with the
  // toggle off its "Needs more serves" would promise something more serves can't deliver.
  const experimentalByValidation = (id: MetricId) => validationLevel(id, 'day') === 'V0'
  const ghosts = [
    ...CORE[view].filter((id) => mv[id]?.status === 'unavailable' && (experimental || !experimentalByValidation(id))),
    ...GHOSTS[view].filter((id) => !mv[id] || mv[id]?.status === 'unavailable'),
  ]
  const fps = a.capture.meta.captureFps
  const experimentalIds = EXPERIMENTAL[view].filter((id) => mv[id]?.status === 'experimental')
  const moreIds = MORE[view].filter((id) => m[id] && m[id]!.status !== 'unavailable' && m[id]!.status !== 'experimental')
  const earlierRows = (prevData ?? []).map((d) => ({ sessionId: d.session.id, rows: d.rows }))
  const link = outcomeLinkState({ engineLink: stats?.outcomeLink, rows, earlier: earlierRows })
  const tagged = rows.some((r) => r.kind !== 'untagged')
  const counts = a.counts

  // Primary action (PRODUCT §6.5 precedence).
  let primary: { label: string; to: string } | null = null
  if (isDemo) primary = { label: 'Set up camera', to: paths.setupChoice() }
  else if (!tagged && !tally) primary = { label: 'Tag serves', to: paths.tagging(session.id) }
  else if (shownDecision?.gate === 'pain-referral') primary = null
  else if (shownDecision?.gate === 'low-confidence' || shownDecision?.gate === 'too-few-serves') primary = { label: 'See set-up tips', to: paths.setupChoice() }
  else if (shownDecision?.focus) primary = { label: 'Start drill', to: paths.focus() }
  else primary = { label: 'Record session', to: paths.record() }

  const meta = [
    view === 'rear' ? 'View from behind' : 'Side view',
    key.courtSide !== 'unknown' ? key.courtSide : null,
    key.serveNumber === 2 ? 'second serves' : key.serveNumber === 1 ? 'first serves' : null,
    `${Math.round(a.capture.meta.captureFps)} fps`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Screen
      title={shortDate(session.visitId)}
      back={back}
      banner={isDemo ? <SampleBanner /> : undefined}
      bottomAction={
        primary ? (
          <Button to={primary.to} fullWidth>
            {primary.label}
          </Button>
        ) : undefined
      }
    >
      <header className="-mt-1 flex flex-col gap-3">
        <p className="text-footnote text-ink-3">{meta}</p>
        {strata.length > 1 ? (
          <SegmentedControl
            label="Serves shown"
            value={stratumIdx}
            onChange={setStratumIdx}
            options={strata.slice(0, 4).map((s, i) => ({ value: String(i), label: stratumWords(s.key).replace(/^(Side view|View from behind), /, '') }))}
          />
        ) : null}
        {headline ? <p className="text-title-2 text-ink text-pretty">{headline}</p> : null}
        <CaptureLine quality={a.capture.quality} measured={counts.included} detected={counts.analysed} />
      </header>

      {shownDecision || exp ? (
        <section className="-mt-4 flex flex-col gap-3" aria-labelledby="your-focus">
          {/* The cards below carry h3 titles; this keeps the heading order h1, h2, h3. */}
          <h2 id="your-focus" className="sr-only">
            Your focus
          </h2>
          {shownDecision ? (
            <FocusCard
              decision={shownDecision}
              variant="compact"
              orientation={orientation}
              stats={evidence}
              sample={isDemo}
              showPrimary={false}
            />
          ) : null}
          {exp && session.isRetest === 1 && expBaseline && expRetests ? (
            <ExperimentResultCard experiment={exp} baseline={expBaseline} retests={expRetests} heightM={heightM} />
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="serve-today">
        <SectionLabel>
          <span id="serve-today">Your serve today</span>
        </SectionLabel>
        <TossHero
          session={session}
          metrics={m}
          rows={rows}
          heightM={heightM}
          previous={(prevData ?? []).map((d) => d.rows)}
          usualSpread={usual['toss-height-spread'] ?? null}
          stratumLabel={stratumLabel}
          experimentalOn={experimental}
        />
        <SupportTiles
          view={view}
          metrics={m}
          goal={goal}
          usual={usual}
          orientation={orientation}
          representativeServeId={stats?.representativeServeId}
          sessionId={session.id}
        />
        {moreIds.length ? (
          <div className="flex flex-col gap-3">
            <Button variant="tertiary" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} aria-controls="more-measurements" className="self-start">
              <span className="flex items-center gap-1">
                More measurements
                <CaretDownIcon size={16} aria-hidden="true" className={moreOpen ? 'rotate-180 transition-transform duration-(--dur-fast) motion-reduce:transition-none' : 'transition-transform duration-(--dur-fast) motion-reduce:transition-none'} />
              </span>
            </Button>
            {moreOpen ? (
              <div id="more-measurements">
                <MetricGrid>
                  {moreIds.map((id) => (
                    <MetricTile key={id} metricId={id} value={m[id]!} to={metricInfoFor(id, session.id)} />
                  ))}
                </MetricGrid>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="outcomes">
        <SectionLabel>
          <span id="outcomes">Outcomes</span>
        </SectionLabel>
        <OutcomesSection
          sessionId={session.id}
          side={key.courtSide === 'ad' ? 'ad' : 'deuce'}
          serveNumber={key.serveNumber === 'unknown' ? undefined : key.serveNumber}
          metrics={m}
          rows={rows}
          tally={tally}
          group={strata.length > 1 ? { courtSide: key.courtSide, serveNumber: key.serveNumber, defaultSide: session.defaultSide, defaultServeNumber: session.defaultServeNumber } : undefined}
        />
        {tagged ? <InsightCard state={link} sessionId={session.id} /> : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="all-serves">
        <SectionLabel>
          <span id="all-serves">All serves</span>
        </SectionLabel>
        <ServeList sessionId={session.id} rows={rows} view={view} orientation={orientation} heightM={heightM} stratumLabel={stratumLabel} />
      </section>

      {ghosts.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="not-available">
          <SectionLabel>
            <span id="not-available">{UI.notAvailableHeader}</span>
          </SectionLabel>
          <ListGroup>
            {ghosts.map((id) => (
              <UnavailableRow key={id} metricId={id} reasonCode={ghostReason(id, mv[id], view, fps)} to={metricInfoFor(id, session.id)} />
            ))}
          </ListGroup>
        </section>
      ) : null}

      {experimental && experimentalIds.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="experimental">
          <div className="flex flex-col gap-1">
            <SectionLabel className="flex items-center gap-1.5">
              <FlaskIcon size={16} aria-hidden="true" />
              <span id="experimental">{UI.experimentalHeader}</span>
            </SectionLabel>
            <p className="text-footnote text-ink-3">{UI.experimentalLine}</p>
          </div>
          <MetricGrid>
            {experimentalIds.map((id) => (
              <MetricTile key={id} metricId={id} value={mv[id]!} to={metricInfoFor(id, session.id)} />
            ))}
          </MetricGrid>
        </section>
      ) : null}

      <footer className="flex flex-col gap-3">
        <ListGroup>
          <ListRow title="How we measured" to={paths.howWeMeasure()} />
        </ListGroup>
        <p className="flex items-start gap-2 text-footnote text-ink-2">
          <InfoIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{UI.validationFooter}</span>
        </p>
        <StorageLine sessionId={session.id} />
        <p className="text-caption text-ink-3">Engine {a.engine.engineVersion}</p>
      </footer>
    </Screen>
  )
}
