import { CaretRightIcon, HourglassMediumIcon, InfoIcon, ScalesIcon } from '@phosphor-icons/react'
import { Link, useParams } from 'react-router'
import { formatNumber } from '../../../analysis/metrics/precision.ts'
import { wilson, Z80 } from '../../../analysis/stats/index.ts'
import type { MetricId, MetricStatus, MetricValue as MetricValueData } from '../../../analysis/types.ts'
import { useProfile } from '../../../data/hooks.ts'
import type { ExperimentRecord } from '../../../data/records.ts'
import {
  Button,
  DelayedSkeleton,
  EmptyState,
  MetricValue,
  SampleBanner,
  Screen,
  SectionLabel,
  Skeleton,
  StatusChip,
  VerdictChip,
} from '../../components/index.ts'
import { ChartFrame, IntervalBars, StripPlot, type IntervalRow } from '../../charts/index.ts'
import { metricName } from '../../copy/metricNames.ts'
import { OUTCOME_WORDS, verdictDisplayId } from '../../copy/strings.ts'
import { formatMetric } from '../../format/metricFormat.ts'
import { paths } from '../../shell/paths.ts'
import { barSpec, compareExperiment, comparisonSessionIds, comparisonStatus, deviations, sameZone, type CompareModel, type SessionData } from './insights/compare.ts'
import { stratumWords } from './insights/history.ts'
import { useExperiment, useExperiments, usePracticeLogs, useSessionData } from './insights/hooks.ts'
import { configFor } from './insights/metricConfig.ts'
import { rateCounts } from './insights/outcomes.ts'
import { plainText } from './insights/values.ts'
import { moreServesText } from './insights/words.ts'
import { FirstLoopCard } from '../plan/FirstLoopCard.tsx'
import { useFocusStore } from '../focus/focusStore.ts'
import { VerdictBeta } from '../profile/beta/VerdictBeta.tsx'

/** Primary by verdict (DESIGN §10.11; COACHING §12.5). One label per intent across the app. */
function primaryFor(model: CompareModel): { label: string; to: string } {
  switch (model.verdict) {
    case 'clearly-better':
    case 'clear-improvement':
      return { label: 'Choose next focus', to: paths.focus() }
    case 'likely-better':
    case 'too-early':
    case 'too-early-to-tell':
      return { label: 'Record re-test', to: paths.record() }
    case 'no-clear-change':
      return { label: 'Try the other cue', to: paths.focus() }
    case 'likely-worse':
    case 'clearly-worse':
    case 'clear-decline':
      return { label: 'Try the easier drill', to: paths.focus() }
    default:
      return { label: 'Record matched session', to: paths.record() }
  }
}

/** A value's range in the value's own display precision ("20 to 45 cm"), so a table row reads like its value. */
function rangeText(id: MetricId, v: MetricValueData, low: number, high: number): string {
  const unit = formatMetric(id, v).unit
  return `${formatNumber(id, low, v)} to ${formatNumber(id, high, v)}${unit ? ` ${unit}` : ''}`
}

function Chart({ model, baseline, retests, heightM, status }: { model: CompareModel; baseline: SessionData[]; retests: SessionData[]; heightM?: number; status: MetricStatus }) {
  const id = model.metricId
  const cfg = configFor(id)
  const isRateMetric = cfg?.kind === 'rate'
  const rateBars = (side: CompareModel['before']) => {
    const k = Math.round(side.value * side.n)
    const w95 = wilson(k, side.n)
    const w80 = wilson(k, side.n, Z80)
    return { estimate: side.value, ci95: [w95.low, w95.high] as [number, number], ci80: [w80.low, w80.high] as [number, number] }
  }
  const b = isRateMetric ? rateBars(model.before) : barSpec(id, model.before)
  const a = isRateMetric ? rateBars(model.after) : barSpec(id, model.after)
  const zone = sameZone(id, model.before.value)
  const isRate = cfg?.kind === 'rate'
  // Every number here is the side's own value (the session's stored value for a one-session side).
  const text = (which: 'before' | 'after') => plainText(id, which === 'before' ? model.beforeValue : model.afterValue)
  const units = (data: SessionData[]) => data.flatMap((d) => d.rows.filter((r) => r.kind !== 'untagged' && !r.isLet)).map((r) => r.kind).sort((x, y) => (x === 'in' ? -1 : y === 'in' ? 1 : 0))
  const rows: IntervalRow[] = [
    {
      key: 'before',
      label: 'Before',
      sublabel: `${model.before.n} serves`,
      tone: 'neutral',
      estimate: b.estimate,
      ci95: b.ci95,
      ci80: b.ci80,
      units: isRate ? units(baseline) : undefined,
      callout: `${text('before')} · before`,
    },
    {
      key: 'after',
      label: 'After',
      sublabel: `${model.after.n} serves`,
      tone: 'good',
      estimate: a.estimate,
      ci95: a.ci95,
      ci80: a.ci80,
      units: isRate ? units(retests) : undefined,
      callout: `${text('after')} · after`,
    },
  ]
  const lo = Math.min(b.ci95[0], a.ci95[0], zone?.[0] ?? Infinity)
  const hi = Math.max(b.ci95[1], a.ci95[1], zone?.[1] ?? -Infinity)
  const pad = (hi - lo) * 0.12 || 1
  const domain: [number, number] = isRate ? [0, 1] : [Math.max(0, lo - pad), hi + pad]
  const unit = cfg?.kind === 'spread' ? (id === 'rhythm-spread' ? 'ms' : 'cm') : undefined
  const evidence = cfg?.kind === 'spread'
  const devB = evidence ? deviations(id, baseline, heightM) : []
  const devA = evidence ? deviations(id, retests, heightM) : []
  const devMax = Math.max(1, ...devB.map((d) => Math.abs(d.value)), ...devA.map((d) => Math.abs(d.value)))
  const devUnit = id === 'rhythm-spread' ? 'ms' : 'cm'

  return (
    <>
      <ChartFrame
        title={`${metricName(id)}, before and after`}
        subtitle="Bars show the likely range: solid is 80%, the outlined tint is 95%."
        status={status}
        metricId={id}
        headingLevel="h2"
        direction={cfg?.direction === 'lower' ? 'lower-steadier' : undefined}
        table={{
          caption: 'Before and after',
          columns: ['', 'Value', 'Likely range (95%)', '80% range', 'Serves'],
          rows: rows.map((r, i) => {
            const side = i === 0 ? model.before : model.after
            const value = i === 0 ? model.beforeValue : model.afterValue
            return {
              key: r.key,
              cells: [
                r.label,
                text(i === 0 ? 'before' : 'after'),
                isRate ? `${Math.round(r.ci95[0] * 100)} to ${Math.round(r.ci95[1] * 100)}%` : rangeText(id, value, r.ci95[0], r.ci95[1]),
                isRate ? `${Math.round(r.ci80[0] * 100)} to ${Math.round(r.ci80[1] * 100)}%` : rangeText(id, value, r.ci80[0], r.ci80[1]),
                String(side.n),
              ],
            }
          }),
        }}
      >
        <IntervalBars
          rows={rows}
          domain={domain}
          sameZone={zone}
          unit={isRate ? undefined : unit}
          formatTick={isRate ? (v) => `${Math.round(v * 100)}%` : id === 'contact-height-ratio' ? (v) => v.toFixed(2) : undefined}
          directionLabel={cfg?.direction === 'lower' ? '← Steadier' : undefined}
          label={`Before ${text('before')}, after ${text('after')}. ${zone ? 'The shaded zone is about the same as before.' : ''}`}
        />
      </ChartFrame>
      {evidence && devB.length && devA.length ? (
        <ChartFrame
          title="Each serve's distance from its session's middle"
          subtitle="A tighter cloud means a steadier serve."
          status={status}
          metricId={id}
          table={{
            caption: "Each serve's distance from its session's middle",
            columns: ['', 'Serve', 'Result', 'Distance'],
            rows: [...devB.map((d) => ({ d, side: 'Before' })), ...devA.map((d) => ({ d, side: 'After' }))].map(({ d, side }) => ({
              key: `${side}-${d.id}`,
              cells: [side, `Serve ${d.index}`, OUTCOME_WORDS[d.kind], `≈ ${Math.round(Math.abs(d.value))} ${devUnit}${d.value < 0 ? ' below' : d.value > 0 ? ' above' : ''}`],
            })),
          }}
        >
          <StripPlot
            label={`Before: ${devB.length} serves; after: ${devA.length} serves, each drawn at its distance from its session's middle.`}
            rowHeight={48}
            size={7}
            rows={[
              { key: 'b', label: 'Before', data: devB.map((d) => ({ id: `b-${d.id}`, value: d.value, kind: d.kind, callout: `${Math.round(d.value)} ${devUnit} · Serve ${d.index}` })) },
              { key: 'a', label: 'After', data: devA.map((d) => ({ id: `a-${d.id}`, value: d.value, kind: d.kind, callout: `${Math.round(d.value)} ${devUnit} · Serve ${d.index}` })) },
            ]}
            domain={[-devMax * 1.1, devMax * 1.1]}
            unit={devUnit}
          />
        </ChartFrame>
      ) : null}
    </>
  )
}

function GuardLine({ baseline, retests, metricId }: { baseline: SessionData[]; retests: SessionData[]; metricId: MetricId }) {
  const guardId: MetricId = configFor(metricId)?.kind === 'rate' ? 'toss-height-spread' : 'first-serve-in-rate'
  const pick = (data: SessionData[]) => data.map((d) => d.stats?.metrics[guardId]).find((v) => v && v.status !== 'unavailable')
  const b = pick(baseline)
  const a = pick(retests)
  if (!b || !a) return null
  if (guardId === 'first-serve-in-rate') {
    const cb = rateCounts(b)
    const ca = rateCounts(a)
    if (!cb || !ca) return null
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-callout text-ink-2" data-guard={guardId}>
      <span>{metricName(guardId)}:</span>
      <MetricValue metricId={guardId} value={b} chip={false} className="[&_.text-body]:text-callout" />
      <span>then</span>
      <MetricValue metricId={guardId} value={a} chip={false} className="[&_.text-body]:text-callout" />
      <StatusChip status={a.status} className="self-center" />
    </p>
  )
}

function Loading() {
  return (
    <Screen title="Did it work?" back={{ to: paths.progress(), label: 'Progress' }}>
      <DelayedSkeleton>
        <div className="flex flex-col gap-3">
          <Skeleton variant="text" className="w-1/3" />
          <Skeleton variant="text" className="w-5/6" />
          <Skeleton className="h-44 w-full" />
        </div>
      </DelayedSkeleton>
    </Screen>
  )
}

/**
 * Compare, "Did it work?" (DESIGN §10.11, §8.13, §9.7; PRODUCT §6.10): the verdict in words first,
 * the effect in plain units with n, matched before/after interval bars with the "About the same"
 * zone, "About N more serves to confirm", the guard metric and the caveats. One next step.
 */
export function CompareScreen() {
  const { experimentId } = useParams()
  const list = useExperiments()
  const byId = useExperiment(experimentId)
  const profile = useProfile()
  // A referral raised this session pauses coaching even when the answer was not saved (D8).
  const referral = useFocusStore((s) => s.referral)
  // Without an id: the most recent of the player's own experiments with a re-test (never a sample).
  const fallback: ExperimentRecord | null | undefined = experimentId
    ? undefined
    : list === undefined
      ? undefined
      : (list.find((e) => !e.isDemo && e.retestSessionIds.length) ?? list.find((e) => !e.isDemo) ?? null)
  const exp = experimentId ? byId : fallback
  // Every session a side of the stored result used, so each side shows its sessions' own values.
  const baseline = useSessionData(exp ? comparisonSessionIds(exp, 'baseline') : undefined)
  const retests = useSessionData(exp ? comparisonSessionIds(exp, 'retest') : undefined)
  const logs = usePracticeLogs(exp?.id)
  const back = { to: paths.progress(), label: 'Progress' }

  if (exp === undefined || profile === undefined || (exp && (baseline === undefined || retests === undefined || logs === undefined))) return <Loading />
  if (!exp) {
    return (
      <Screen title="Did it work?" back={back}>
        <EmptyState icon={ScalesIcon} title="Nothing to compare yet" body="Compare needs another session from the same side, view and serve." />
      </Screen>
    )
  }

  const heightM = baseline?.[0]?.session.analysis?.capture.scale.heightM ?? profile?.heightM
  const model = compareExperiment(exp, baseline!, retests!, heightM)
  const status = comparisonStatus(model.metricId, baseline!, exp.stratum)
  const id = model.metricId
  const isDemo = exp.isDemo === 1
  const painPause = profile?.comfort.painFlag === 1 || Boolean(referral)
  const primary = painPause ? null : primaryFor(model)
  const more = moreServesText(model.moreServes, model.verdict)
  const minutes = (logs ?? []).reduce((a, l) => a + l.minutes, 0)
  const rateK = (v: MetricValueData, n: number) => (configFor(id)?.kind === 'rate' && typeof v.value === 'number' && typeof v.secondary?.k !== 'number' ? { ...v, n, secondary: { ...v.secondary, k: Math.round(v.value * n) } } : v)
  // The canonical values: a one-session side shows that session's own stored value (report, Today, Progress).
  const before = rateK(model.beforeValue, model.before.n)
  const after = rateK(model.afterValue, model.after.n)
  const beforeText = formatMetric(id, before)
  const same = beforeText.text === formatMetric(id, after).text

  return (
    <Screen
      title="Did it work?"
      back={back}
      banner={isDemo ? <SampleBanner /> : undefined}
      bottomAction={
        primary && !isDemo ? (
          <Button to={primary.to} fullWidth>
            {primary.label}
          </Button>
        ) : isDemo ? (
          <Button to={paths.setupChoice()} fullWidth>
            Set up camera
          </Button>
        ) : undefined
      }
    >
      <header className="flex flex-col gap-4">
        <VerdictChip verdict={model.verdict} size="large" />
        {model.verdict === 'not-comparable' ? (
          <p className="text-title-1 text-ink text-balance">Not comparable yet: {model.reason}.</p>
        ) : (
          <p className="text-title-1 text-ink text-pretty">
            Your {metricName(id).toLowerCase()} {same ? 'stayed at ' : 'went from '}
            <MetricValue metricId={id} value={before} chip={false} className="[&_.text-body]:text-title-1" />
            {same ? null : (
              <>
                {' '}
                to <MetricValue metricId={id} value={after} chip={false} className="[&_.text-body]:text-title-1" />
              </>
            )}
            .
          </p>
        )}
        {model.verdict !== 'not-comparable' ? (
          <p className="flex flex-wrap items-center gap-2 text-callout text-ink-2">
            <span>
              {model.before.n} and {model.after.n} serves, same {stratumWords(exp.stratum).toLowerCase()}.
            </span>
            <StatusChip status={status} />
          </p>
        ) : null}
        {more ? (
          <p className="flex items-start gap-1.5 text-footnote text-ink-2">
            <HourglassMediumIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{more}</span>
          </p>
        ) : null}
        {model.withinSession ? <p className="text-footnote text-ink-2">Compared within one session. Check again next time.</p> : null}
      </header>

      {model.verdict !== 'not-comparable' ? (
        <section className="flex flex-col gap-3" aria-label="Before and after">
          <Chart
            model={model}
            baseline={baseline!.filter((d) => exp.baselineSessionIds.includes(d.session.id))}
            retests={retests!.filter((d) => exp.retestSessionIds.includes(d.session.id))}
            heightM={heightM}
            status={status}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="context">
        <SectionLabel>
          <span id="context">Also worth knowing</span>
        </SectionLabel>
        <GuardLine baseline={baseline!} retests={retests!} metricId={id} />
        {logs && logs.length ? (
          <p className="text-callout text-ink-2">
            You practised {logs.length === 1 ? 'once' : logs.length === 2 ? 'twice' : `${logs.length} times`} ({minutes} minutes).
          </p>
        ) : (
          <p className="text-callout text-ink-2">No practice logged for this experiment.</p>
        )}
        {model.notes.map((n) => (
          <p key={n} className="flex items-start gap-2 text-footnote text-ink-2">
            <InfoIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{n}</span>
          </p>
        ))}
        {!model.fromEngine && model.verdict !== 'not-comparable' ? (
          <p className="text-footnote text-ink-3">Worked out on this phone from each session's summary.</p>
        ) : null}
        <Link
          to={paths.metricInfo(id)}
          className="-ml-1 inline-flex min-h-11 items-center gap-0.5 self-start rounded-control px-1 text-footnote font-label text-ink underline underline-offset-[3px] hover:bg-surface-2"
        >
          How this verdict works
          <CaretRightIcon size={14} aria-hidden="true" />
        </Link>
      </section>
      {/* T1 (PRODUCT §6.15): after the first verdict and its next step, once; never for samples. */}
      {!isDemo && !painPause && model.verdict !== 'not-comparable' ? <FirstLoopCard experiment={exp} /> : null}
      {/* Beta usage count and the one-time usefulness question (platform addition; PRODUCT §7.4 step 8). */}
      <VerdictBeta experiment={exp} verdict={verdictDisplayId(model.verdict)} sameSession={Boolean(model.withinSession)} paused={painPause} />
    </Screen>
  )
}
