import { ChartLineUpIcon, CheckIcon, FlaskIcon } from '@phosphor-icons/react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { MetricId } from '../../../analysis/types.ts'
import type { StratumKey } from '../../../data/domain.ts'
import { sessionMetric } from '../../format/sessionValues.ts'
import { useProfile } from '../../../data/hooks.ts'
import type { ExperimentRecord } from '../../../data/records.ts'
import {
  Button,
  DelayedSkeleton,
  EmptyState,
  ListGroup,
  ListRow,
  MetricValue,
  Screen,
  SectionLabel,
  Skeleton,
  StatusChip,
  VerdictChip,
} from '../../components/index.ts'
import { cx } from '../../components/cx.ts'
import { Sparkline, WilsonBar } from '../../charts/index.ts'
import { metricName } from '../../copy/metricNames.ts'
import { shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import {
  baselineProgress,
  baselineWords,
  hasStratum,
  matched,
  seriesFor,
  stratumId,
  stratumOf,
  strataOf,
  stratumWords,
  minServesFor,
  trendValue,
  usualRange,
  type SessionBundle,
} from './insights/history.ts'
import { useExperiments, useSessionBundles } from './insights/hooks.ts'
import { pooledRate, rateCounts } from './insights/outcomes.ts'
import { derived } from './insights/values.ts'
import { QuestionTile } from './QuestionTile.tsx'
import { MatchNightsSection } from './matchLog/MatchNightsSection.tsx'

function StratumChips({ options, value, onChange }: { options: { id: string; label: string; count: number }[]; value: string; onChange: (id: string) => void }) {
  if (options.length < 2) return null
  return (
    <div role="radiogroup" aria-label="Set-up shown" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cx(
              'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-subhead whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1',
              on ? 'bg-ink text-ink-inverse' : 'border-token border-line-strong text-ink-2 hover:text-ink',
            )}
          >
            {on ? <CheckIcon size={16} aria-hidden="true" /> : null}
            {o.label}
            <span className="tabular-nums opacity-80">· {o.count}</span>
          </button>
        )
      })}
    </div>
  )
}

function RateTile({ bundles, metricId, question, stratumLabel, stratum }: { bundles: SessionBundle[]; metricId: MetricId; question: string; stratumLabel: string; stratum?: StratumKey }) {
  // Never pool across entry modes (tags vs tally, METRICS §4.4).
  const withCounts = bundles
    .map((b) => ({ b, v: sessionMetric(b.stats, metricId, stratum) }))
    .map((x) => ({ ...x, c: rateCounts(x.v) }))
    .filter((x) => x.c)
  const mode = withCounts.at(-1)?.v?.provenance ?? 'tally'
  const same = withCounts.filter((x) => (x.v?.provenance ?? 'tally') === mode)
  const pooled = pooledRate(same.map((x) => ({ sessionId: x.b.session.id, visitId: x.b.session.visitId, k: x.c!.k, n: x.c!.n })))
  const titleId = `q-${metricId}`
  const value = pooled
    ? derived(metricId, 'player-entered', pooled.rate, {
        n: pooled.n,
        secondary: { k: pooled.k },
        uncertainty: { kind: 'ci95', low: pooled.ci95[0], high: pooled.ci95[1] },
        provenance: mode === 'from-your-tags' ? 'from-your-tags' : undefined,
      })
    : null
  const points = same.slice(-8).map((x) => ({
    key: x.b.session.id,
    value: x.c!.k / x.c!.n,
    label: shortDate(x.b.session.visitId),
    callout: `${x.c!.k} of ${x.c!.n} in · ${shortDate(x.b.session.visitId)}`,
  }))
  return (
    <section aria-labelledby={titleId} className="card flex flex-col gap-3 p-4" data-question={metricId}>
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-title-2 text-ink text-balance">
          {question}
        </h2>
        <p className="text-footnote text-ink-3">{stratumLabel}</p>
      </div>
      {pooled && value ? (
        <>
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-headline text-ink">
              <MetricValue metricId={metricId} value={value} chip={false} className="[&_.text-body]:text-headline" />
              <span className="font-normal text-ink-2">over {pooled.sessions === 1 ? '1 session' : `${pooled.sessions} sessions`}</span>
            </p>
            {pooled.n >= 10 ? (
              <WilsonBar
                rate={pooled.rate}
                low={pooled.ci95[0]}
                high={pooled.ci95[1]}
                label={`Likely ${Math.round(pooled.ci95[0] * 100)} to ${Math.round(pooled.ci95[1] * 100)} percent`}
                className="my-1"
              />
            ) : null}
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip status="player-entered" />
              <span className="text-footnote text-ink-3">{mode === 'from-your-tags' ? 'From your tags' : 'From your tally'}</span>
            </span>
          </div>
          {points.length >= 2 ? (
            <Sparkline
              points={points}
              domain={[0, 1]}
              hollow
              latestLabel={`${points.at(-1)!.callout.split(' ·')[0]}`}
              formatTick={(v) => `${Math.round(v * 100)}%`}
              label={`${question} ${points.length} sessions. Latest ${points.at(-1)!.callout}.`}
            />
          ) : null}
          <p className="text-footnote text-ink-2">
            {Number.isFinite(pooled.moreServes) && pooled.moreServes <= 150
              ? `About ${pooled.moreServes} more serves would show a 10-point change.`
              : 'A 10-point change would take more than 150 serves to confirm. Toss spread will show change sooner.'}
          </p>
        </>
      ) : (
        <p className="text-callout text-ink-2">Tag your serves or enter a tally after a session to see this.</p>
      )}
    </section>
  )
}

function ExperimentRows({ experiments }: { experiments: ExperimentRecord[] }) {
  if (!experiments.length) {
    return <p className="text-callout text-ink-2">Your experiments appear here once you practise a focus and record a re-test.</p>
  }
  return (
    <ListGroup label="Experiments">
      {experiments.map((e) => {
        const end = e.result?.computedAt ?? e.createdAt
        return (
          <ListRow
            key={e.id}
            to={paths.compare(e.id)}
            leading={
              <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2">
                <FlaskIcon size={20} aria-hidden="true" />
              </span>
            }
            title={metricName(e.primaryMetricId)}
            subtitle={`${shortDate(new Date(e.createdAt))} to ${shortDate(new Date(end))}${e.status === 'active' && !e.result ? ' · in progress' : ''}`}
            detail={
              e.result ? (
                <span className="mt-1 flex">
                  <VerdictChip verdict={e.baselineDeleted ? 'not-comparable' : e.result.verdict} />
                </span>
              ) : (
                'No re-test yet'
              )
            }
          />
        )
      })}
    </ListGroup>
  )
}

/**
 * Progress tab root (DESIGN §10.10, PRODUCT §6.9): question tiles over matched sessions only, with
 * the grey usual band, n and the set-up filter; the experiments list with verdicts; process
 * metrics lead (D7). Sample data never appears here.
 */
export function ProgressScreen() {
  const all = useSessionBundles({ includeDemo: false })
  const experiments = useExperiments()
  const profile = useProfile()
  // The set-up filter lives in the URL (?setup=) so it survives reloads and can be linked.
  const [search, setSearch] = useSearchParams()
  const picked = search.get('setup')
  const setPicked = (id: string) =>
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('setup', id)
        return next
      },
      { replace: true },
    )
  const ready = useMemo(() => (all ?? []).filter((b) => b.session.status === 'ready' && b.session.isDemo === 0), [all])
  const strata = useMemo(() => strataOf(ready), [ready])
  const latestId = ready[0] ? stratumId(stratumOf(ready[0])) : null
  const current = picked && strata.some((x) => x.id === picked) ? picked : latestId
  const currentKey = strata.find((x) => x.id === current)?.key
  // Sessions with this stratum (METRICS §1.6), newest first; trends also need the same set-up as the
  // newest one (METRICS §4.4: distance class, orientation, serving spot), except timing metrics.
  const inStratum = currentKey ? ready.filter((b) => hasStratum(b, currentKey)) : []
  const latest = inStratum[0]
  const rear = latest?.session.view === 'rear'
  const label = currentKey ? stratumWords(currentKey) : ''
  const sameSetup = (metricId?: MetricId) => (latest && currentKey ? inStratum.filter((b) => matched(b, latest, metricId, currentKey)) : [])
  const baseline = latest && currentKey ? baselineProgress(inStratum, latest, { key: currentKey }) : null
  const ownExperiments = (experiments ?? []).filter((e) => !e.isDemo)

  if (all === undefined || experiments === undefined || profile === undefined) {
    return (
      <Screen title="Progress" variant="root">
        <DelayedSkeleton>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-60 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }

  if (!ready.length) {
    return (
      <Screen title="Progress" variant="root">
        <EmptyState
          icon={ChartLineUpIcon}
          title="Nothing to show yet"
          body="Your progress will show here after two sessions from the same side. Sample sessions never appear here."
          action={
            <Button variant="secondary" to={paths.record()}>
              Record
            </Button>
          }
        />
        {/* Comp nights are their own series and can be logged before any practice session (D11). */}
        <MatchNightsSection />
      </Screen>
    )
  }

  const tile = (metricId: MetricId) => {
    const pool = sameSetup(metricId)
    const series = seriesFor(metricId, pool, currentKey)
    // The newest session measured this but on too few serves for a trend point (METRICS §4.6): say
    // that, not "not measured", since its report shows the value.
    const newest = pool[0]
    const raw = newest && currentKey ? sessionMetric(newest.stats, metricId, currentKey) : undefined
    const belowMin = !series.length && raw && trendValue(raw, metricId) !== null && (raw.n ?? 0) < minServesFor(metricId) ? { n: raw.n ?? 0 } : undefined
    return { series, usual: usualRange(series), belowMin }
  }
  const tossH = tile('toss-height-spread')
  const tossF = tile('toss-forward-spread')
  const rhythm = tile('rhythm-spread')
  const contact = tile('contact-height-ratio')
  const legs = tile('leg-drive')
  const drive = tile('drive-time')
  const secondGoal = profile?.goal === 'second-serve-reliability'
  const opts = strata.map((s) => ({ id: s.id, label: stratumWords(s.key), count: s.count }))

  return (
    <Screen title="Progress" variant="root">
      <StratumChips options={opts} value={current ?? ''} onChange={setPicked} />
      {baseline && baseline.have < baseline.need ? (
        <div className="-mt-2 flex flex-col gap-1">
          <p className="text-callout text-ink">{baselineWords(baseline).title}</p>
          <p className="text-footnote text-ink-2">{baselineWords(baseline).body}</p>
        </div>
      ) : null}

      <QuestionTile
        question="Is my toss becoming more consistent?"
        metricId="toss-height-spread"
        label="Height spread"
        series={tossH.series}
        usual={tossH.usual}
        belowMin={tossH.belowMin}
        stratumLabel={label}
        extra={
          !rear && tossF.series.at(-1) ? (
            <span className="flex flex-wrap items-baseline gap-x-1.5 text-footnote text-ink-2">
              Front-to-back spread <MetricValue metricId="toss-forward-spread" value={tossF.series.at(-1)!.metric} compactChip className="[&_.text-body]:text-footnote" />
            </span>
          ) : undefined
        }
      />

      <RateTile
        bundles={inStratum.slice().reverse()}
        stratum={currentKey}
        metricId={secondGoal ? 'second-serve-in-rate' : 'first-serve-in-rate'}
        question={secondGoal ? 'Is my second serve safe?' : 'Am I getting more first serves in?'}
        stratumLabel={label}
      />

      <section className="flex flex-col gap-3" aria-labelledby="did-it-work">
        <SectionLabel>
          <span id="did-it-work">Did this change work?</span>
        </SectionLabel>
        <ExperimentRows experiments={ownExperiments} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="contact-rhythm">
        <SectionLabel>
          <span id="contact-rhythm">Contact, rhythm and legs</span>
        </SectionLabel>
        <QuestionTile headingLevel="h3" question="Is my rhythm steady?" metricId="rhythm-spread" label="Rhythm spread" series={rhythm.series} usual={rhythm.usual} belowMin={rhythm.belowMin} stratumLabel={label} />
        <QuestionTile
          headingLevel="h3"
          question="Am I contacting the ball higher?"
          metricId="contact-height-ratio"
          label="Contact height"
          series={contact.series}
          usual={contact.usual}
          belowMin={contact.belowMin}
          stratumLabel={label}
        />
        {!rear ? (
          <QuestionTile
            headingLevel="h3"
            question="Am I using my legs?"
            metricId="leg-drive"
            label="Hips rose"
            series={legs.series}
            usual={legs.usual}
            belowMin={legs.belowMin}
            stratumLabel={label}
            extra={
              drive.series.at(-1) ? (
                <span className="flex flex-wrap items-baseline gap-x-1.5 text-footnote text-ink-2">
                  Drive time <MetricValue metricId="drive-time" value={drive.series.at(-1)!.metric} compactChip className="[&_.text-body]:text-footnote" />
                </span>
              ) : undefined
            }
          />
        ) : null}
      </section>
      <p className="text-footnote text-ink-3">
        Only sessions from the same set-up are compared: {sameSetup().length === 1 ? '1 session' : `${sameSetup().length} sessions`}, {label.toLowerCase()}.
      </p>
      {/* Comp nights (D11): their own series, never pooled with practice; the season view is Plus. */}
      <MatchNightsSection practice={{ metricId: 'toss-height-spread', series: tossH.series }} />
    </Screen>
  )
}
