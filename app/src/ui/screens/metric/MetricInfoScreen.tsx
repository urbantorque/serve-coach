import { CheckCircleIcon, CircleDashedIcon, InfoIcon, XCircleIcon } from '@phosphor-icons/react'
import { useParams, useSearchParams } from 'react-router'
import { statusCeiling } from '../../../analysis/metrics/catalogue.ts'
import type { MetricId, MetricStatus, MetricValue as MetricValueData } from '../../../analysis/types.ts'
import { METRIC_IDS, REAR_ONLY_METRIC_IDS, SIDE_ONLY_METRIC_IDS } from '../../../analysis/types.ts'
import { useProfile } from '../../../data/hooks.ts'
import { useSettingsStore } from '../../../data/stores/settings.ts'
import {
  Badge,
  Button,
  DelayedSkeleton,
  EmptyState,
  MetricValue,
  SampleBanner,
  Screen,
  SectionLabel,
  Skeleton,
  StatusChip,
  StatusGlyph,
} from '../../components/index.ts'
import { ChartFrame, Sparkline } from '../../charts/index.ts'
import { metricName } from '../../copy/metricNames.ts'
import { CAPTURE_SIMULATED_ONLY, hasReasonShortForm, reasonShortForm, UI } from '../../copy/strings.ts'
import { formatMetric } from '../../format/metricFormat.ts'
import { shortDate } from '../../format/dates.ts'
import { paths } from '../../shell/paths.ts'
import { matched, seriesFor, stratumOf, stratumWords, trendState, usualRange, type SessionBundle } from '../progress/insights/history.ts'
import { useSessionBundles } from '../progress/insights/hooks.ts'
import { formatRange, plainText, shortText } from '../progress/insights/values.ts'
import { VerdictLine } from '../progress/insights/ui.tsx'
import catalogue from './data/catalogue.json'
import { HowSure } from './HowSure.tsx'
import { LIMITS, METRIC_COPY, NO_OUTSIDE, PREREQ_WORDS, STATUS_MEANING } from './metricCopy.ts'
import { VALIDATION_LIMIT, validationStateOf } from './validationWords.ts'
import { tiltHint } from '../record/import/hints.ts'

type CatalogueEntry = (typeof catalogue.metrics)[number]
type Check = { key: string; label: string; state: 'pass' | 'fail' | 'unknown' }

function parseBand(s: string): { lo?: number; hi?: number } {
  const t = s.replace(/\s/g, '')
  if (t.startsWith('<')) return { hi: Number(t.slice(1)) }
  if (t.startsWith('>')) return { lo: Number(t.slice(1)) }
  const [a, b] = t.split('-').map(Number)
  return { lo: a, hi: b }
}

/** "Tight: under 8 cm. Typical: 8 to 20 cm. Scattered: over 20 cm." (DESIGN §3.3 rule 13, words, never good or bad). */
function clubBands(entry: CatalogueEntry, value: number | null): { lines: string[]; yours?: string } | null {
  const pb = entry.provisionalBands
  if (!pb || typeof pb.low !== 'string' || typeof pb.typical !== 'string' || typeof pb.high !== 'string') return null
  const unit = pb.unit === 'cm' ? ' cm' : pb.unit === 'ms' ? ' ms' : pb.unit === 's' ? ' s' : ''
  const labels = (pb.labels as Record<string, string> | null) ?? { low: 'low', typical: 'typical', high: 'high' }
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
  const lo = parseBand(pb.low)
  const mid = parseBand(pb.typical)
  const hi = parseBand(pb.high)
  if (lo.hi === undefined || mid.lo === undefined || mid.hi === undefined || hi.lo === undefined) return null
  const lines = [`${cap(labels.low)}: under ${lo.hi}${unit}`, `${cap(labels.typical)}: ${mid.lo} to ${mid.hi}${unit}`, `${cap(labels.high)}: over ${hi.lo}${unit}`]
  let yours: string | undefined
  if (value !== null) yours = value < mid.lo ? labels.low : value > mid.hi ? labels.high : labels.typical
  return { lines, yours }
}

function checksFor(entry: CatalogueEntry, bundle: SessionBundle | null, v: MetricValueData | undefined, heightM: number | undefined, experimentalOn: boolean): Check[] {
  const s = bundle?.session
  const fps = s?.analysis?.capture.meta.captureFps
  const available = v && v.status !== 'unavailable'
  const out: Check[] = []
  for (const key of entry.prerequisites) {
    const label = PREREQ_WORDS[key]
    if (!label) continue
    let state: Check['state'] = 'unknown'
    if (!s) state = 'unknown'
    else if (key === 'view:side') state = s.view === 'side' ? 'pass' : 'fail'
    else if (key === 'view:rear') state = s.view === 'rear' ? 'pass' : 'fail'
    else if (key.startsWith('fps>=')) state = fps === undefined ? 'unknown' : fps >= Number(key.slice(5)) ? 'pass' : 'fail'
    else if (key === 'playerHeight') state = heightM ? 'pass' : 'fail'
    else if (key === 'pitch') state = s.tiltStatus === 'unknown' ? 'fail' : s.tiltStatus ? 'pass' : 'unknown'
    else if (key.startsWith('timebase')) state = s.analysis?.capture.meta.timeBaseStatus === 'proven' ? 'pass' : key === 'timebase' && available ? 'pass' : 'unknown'
    else if (key.startsWith('n>=')) state = v?.n === undefined ? 'unknown' : v.n >= Number(key.slice(3)) ? 'pass' : 'fail'
    else if (key === 'entry:targetZone') state = s.defaultTarget ? 'pass' : 'fail'
    else if (key === 'toggle:experimental') state = experimentalOn ? 'pass' : 'fail'
    else state = available ? 'pass' : 'unknown'
    out.push({ key, label, state })
  }
  return out
}

/** Replaces every {token} in a catalogue hint: {k} matched sessions so far, {n} serves needed. */
export function fillTokens(hint: string, k: number): string {
  return hint.replace(/\{k\}/g, String(k)).replace(/\{n\}/g, '8').replace(/\{[a-z]+\}/gi, '')
}

/**
 * The unlock hint for a reason. `stored` is the hint the engine already filled for this value; a
 * baseline hint is rebuilt from the matched sessions this page can see (`k`), because the engine has
 * no history and always says "1 of 2".
 */
export function unlockHint(code: string | undefined, metricId: string, opts: { stored?: string; k?: number } = {}): string | null {
  if (metricId === 'speed-experimental')
    return 'Record at 120 fps or more from the side, with your height entered and one target tagged (T, Body or Wide). Turn on experimental metrics.'
  if (metricId === 'knee-bend-band') return 'From the side, your knees point at the camera at the top of the swing. Add a phone behind you to see this.'
  const reasons = catalogue.reasonCodes as Record<string, { meaning: string | null; unlockHint: string | null; unlockHintRearOnly: string | null }>
  if (code === 'NEEDS_REAR_VIEW') return reasons.VIEW_NOT_SUPPORTED?.unlockHintRearOnly ?? null
  if (code === 'NEEDS_SIDE_VIEW') return reasons.VIEW_NOT_SUPPORTED?.unlockHint ?? null
  const k = opts.k ?? 1
  if (code !== 'BASELINE_BUILDING' && opts.stored) return tiltHint(fillTokens(opts.stored, k)) || null
  const key = code === 'TILT_UNKNOWN' ? 'PITCH_UNKNOWN' : code === 'EXCLUDED_BY_QUALITY' ? 'IMPLAUSIBLE_VALUE' : code
  const hint = key ? reasons[key]?.unlockHint : null
  return hint ? tiltHint(fillTokens(hint, k)) : null
}

/** With no session to check against, the list is what a session needs, so no state word per row. */
function CheckRow({ c, plain = false }: { c: Check; plain?: boolean }) {
  const G = c.state === 'pass' ? CheckCircleIcon : c.state === 'fail' ? XCircleIcon : CircleDashedIcon
  const word = c.state === 'pass' ? 'Yes' : c.state === 'fail' ? 'No' : 'Not checked'
  return (
    <li className="flex min-h-11 items-center gap-2 border-t border-line py-2 first:border-t-0">
      <G size={20} aria-hidden="true" className={c.state === 'fail' ? 'shrink-0 text-attention' : c.state === 'pass' ? 'shrink-0 text-ink' : 'shrink-0 text-ink-3'} />
      <span className="flex-1 text-callout text-ink">{c.label}</span>
      {plain ? null : <span className="text-footnote text-ink-2">{word}</span>}
    </li>
  )
}

/** The best label this measurement can carry today, in daylight (engine catalogue, METRICS §1.3). */
function bestStatusWords(id: MetricId, best: MetricStatus): string {
  if (id === 'spin') return "Phone video can't see spin, so this never has a value."
  if (id === 'capture-quality') return 'Every session you record or import gets this check: Good, Fair or Limited.'
  if (best === 'player-entered') return 'Tag your serves in a session and this fills in from your tags.'
  const behind = (REAR_ONLY_METRIC_IDS as readonly string[]).includes(id)
  if (best === 'experimental')
    return behind
      ? 'Record a session from behind you, with experimental metrics turned on, to see a rough value.'
      : 'Record a session with experimental metrics turned on to see a rough value.'
  return 'Record or import a serve session to see yours.'
}

/** Header when no session has this measurement yet: not "couldn't see this", because nothing was filmed. */
function NoReadingHeader({ id }: { id: MetricId }) {
  const best = statusCeiling(id, 'day').status
  // Capture quality is always shown, labelled experimental (DECISIONS D2 addendum, 2026-09-28).
  const chip = best !== 'unavailable'
  return (
    <div className="flex flex-col gap-2" data-metric={id} data-status="none">
      <p className="text-title-2 text-ink">{id === 'spin' ? 'Not measurable by phone' : 'No reading yet'}</p>
      <p className="text-callout text-ink-2">{bestStatusWords(id, best)}</p>
      {chip ? (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-footnote text-ink-2">{best === 'estimated' || best === 'measured' ? 'In daylight it shows as' : 'It shows as'}</span>
            <StatusChip status={best} />
          </div>
          <p className="text-footnote text-ink-3">{id === 'capture-quality' ? CAPTURE_SIMULATED_ONLY : STATUS_MEANING[best]}</p>
        </>
      ) : null}
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <SectionLabel>
        <span id={id}>{title}</span>
      </SectionLabel>
      {children}
    </section>
  )
}

/**
 * Metric info, "How we measure" for one metric (DESIGN §10.14, PRODUCT §6.14): this value with its
 * state and n, what it is, your trend over matched sessions, how we measure it, what it needs, how
 * sure we are (validation state in words, typical error and pass mark from simulated serves, with the
 * test details in a disclosure), known limits (including the synthetic-only limit), and
 * provisional club-player context that is never a target. Unavailable metrics lead with the reason.
 */
export function MetricInfoScreen() {
  const { metricId = '' } = useParams()
  const [search] = useSearchParams()
  const bundles = useSessionBundles({ includeDemo: true })
  const profile = useProfile()
  const experimentalOn = useSettingsStore((s) => s.experimentalMetrics)
  const known = (METRIC_IDS as readonly string[]).includes(metricId)
  const id = metricId as MetricId
  const entry = catalogue.metrics.find((m) => m.id === metricId)
  const title = known ? metricName(metricId) : 'Metric'

  if (!known || !entry) {
    return (
      <Screen title="Metric" back={{ label: 'Back' }}>
        <EmptyState icon={InfoIcon} title="We don't know this measurement" body="It may have been renamed. How we measure lists every measurement." action={<Button variant="secondary" to={paths.howWeMeasure()}>How we measure</Button>} />
      </Screen>
    )
  }
  if (bundles === undefined || profile === undefined) {
    return (
      <Screen title={title} back={{ label: 'Back' }}>
        <DelayedSkeleton>
          <div className="flex flex-col gap-3">
            <Skeleton variant="text" className="w-1/3" />
            <Skeleton className="h-44 w-full" />
          </div>
        </DelayedSkeleton>
      </Screen>
    )
  }

  // The session this page describes: ?session=, else the newest of the player's own sessions with this metric, else a sample one.
  const ready = bundles.filter((b) => b.session.status === 'ready')
  const want = search.get('session')
  const bundle =
    ready.find((b) => b.session.id === want) ??
    ready.find((b) => b.session.isDemo === 0 && b.stats?.metrics[id]) ??
    ready.find((b) => b.stats?.metrics[id]) ??
    null
  const stored = bundle?.stats?.metrics[id]
  // Capture quality is a data-quality gate: never hidden, and always labelled experimental until its
  // checks pass on real footage, whatever an older analysis stored (DECISIONS D2 addendum).
  const isCapture = id === 'capture-quality'
  const v: MetricValueData | undefined = isCapture && stored && stored.status !== 'unavailable' ? { ...stored, status: 'experimental' } : stored
  const hiddenExperimental = v?.status === 'experimental' && !experimentalOn && !isCapture
  const shown = v && !hiddenExperimental ? v : undefined
  const isDemo = bundle?.session.isDemo === 1
  const heightM = bundle?.session.analysis?.capture.scale.heightM ?? profile?.heightM
  const copy = METRIC_COPY[id]
  const f = shown ? formatMetric(id, shown) : null
  const rearOnly = (REAR_ONLY_METRIC_IDS as readonly string[]).includes(id)
  const sideOnly = (SIDE_ONLY_METRIC_IDS as readonly string[]).includes(id)
  const unavailable = !shown || shown.status === 'unavailable'
  const reasonCode = shown?.reasonCode ?? (bundle && rearOnly && bundle.session.view !== 'rear' ? 'NEEDS_REAR_VIEW' : bundle && sideOnly && bundle.session.view === 'rear' ? 'NEEDS_SIDE_VIEW' : hiddenExperimental ? 'EXPERIMENTAL_HIDDEN' : undefined)
  // Trend over matched sessions of the same kind (own, or sample for a sample session).
  const pool = bundle ? ready.filter((b) => b.session.isDemo === bundle.session.isDemo && matched(b, bundle, id)) : []
  const series = entry.statusDefault === 'experimental' || id === 'spin' ? [] : seriesFor(id, pool)
  // Matched sessions so far for a baseline ("1 of 2"): this session counts even below the trend minimum.
  const baselineK = Math.max(1, Math.min(series.length, 2))
  const hint = unavailable ? unlockHint(reasonCode, id, { stored: shown?.unlockHint, k: baselineK }) : null
  // The line under a value that WAS measured: only a reason with its own words (never "Couldn't see
  // this clearly"), and no baseline line once two matched sessions exist.
  const infoCode = shown && shown.status !== 'unavailable' ? shown.reasonCode : undefined
  const infoHint = infoCode ? unlockHint(infoCode, id, { stored: shown?.unlockHint, k: baselineK }) : null
  const infoLine =
    infoCode && hasReasonShortForm(infoCode, id) && !(infoCode === 'BASELINE_BUILDING' && series.length >= 2)
      ? (infoCode === 'BASELINE_BUILDING' && infoHint ? [infoHint] : [reasonShortForm(infoCode, id), infoHint]).filter(Boolean).join('. ').replace(/\.?$/, '.')
      : null
  const usual = usualRange(series)
  const trend = trendState(id, series)
  const bands = shown && typeof shown.value === 'number' && !NO_OUTSIDE.has(id) ? clubBands(entry, shown.value) : !NO_OUTSIDE.has(id) ? clubBands(entry, null) : null
  const limits = LIMITS.filter((l) => l.ids.includes(id)).map((l) => l.text)
  if (entry.requiredCopy && !limits.some((t) => t.includes('sideways'))) limits.unshift(entry.requiredCopy)
  // Every camera measurement carries the synthetic-only limit (METRICS §6 item 8).
  if (validationStateOf(id) !== 'not-applicable') limits.push(VALIDATION_LIMIT)
  const checks = checksFor(entry, bundle, v, heightM, experimentalOn)

  return (
    <Screen title={title} back={{ label: 'Back' }} banner={isDemo ? <SampleBanner /> : undefined}>
      <header className="flex flex-col gap-2">
        {!bundle ? (
          <NoReadingHeader id={id} />
        ) : unavailable ? (
          <div className="flex flex-col gap-2" data-metric={id} data-status="unavailable">
            <p className="flex items-center gap-2 text-title-2 text-ink">
              <StatusGlyph status="unavailable" size={24} className="text-ink-3" />
              {reasonShortForm(reasonCode as never, id)}
            </p>
            {hint ? <p className="text-callout text-ink-2">{hint}</p> : null}
            {rearOnly ? (
              <Button variant="secondary" fullWidth={false} to={paths.setupChoice()} className="self-start">
                See set-up tips
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <span className="flex flex-wrap items-center gap-3">
              <MetricValue metricId={id} value={shown!} size="hero" chip={false} />
              <StatusChip status={shown!.status} />
              {shown!.provisional ? <Badge>{UI.earlyRead}</Badge> : null}
            </span>
            {f?.detail ? <p className="text-footnote text-ink-3">{f.detail}</p> : null}
            {bundle ? (
              <p className="text-footnote tabular-nums text-ink-2">
                {shortDate(bundle.session.visitId)}
                {f?.nLine ? `, ${f.nLine}` : ''}
                {bundle ? ` · ${stratumWords(stratumOf(bundle))}` : ''}
              </p>
            ) : null}
            {infoLine ? (
              <p className="flex items-start gap-1.5 text-footnote text-ink-2" data-reason-line>
                <InfoIcon size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{infoLine}</span>
              </p>
            ) : null}
          </>
        )}
        {bundle ? (
          <p className="text-footnote text-ink-3">
            {hiddenExperimental
              ? `This session has a value. ${STATUS_MEANING.experimental}`
              : unavailable && statusCeiling(id, 'day').status === 'player-entered'
                ? 'Nothing logged for this session yet.'
                : unavailable && id === 'spin'
                  ? 'Never measured, whatever the footage.'
                  : !unavailable && isCapture
                    ? CAPTURE_SIMULATED_ONLY
                    : STATUS_MEANING[unavailable ? 'unavailable' : shown!.status]}
          </p>
        ) : null}
      </header>

      <Section id="what" title="What it is">
        <p className="text-callout text-ink">{entry.question}</p>
        {copy ? <p className="text-callout text-ink-2">{copy.what}</p> : null}
      </Section>

      {series.length ? (
        <Section id="trend" title="Your trend">
          <ChartFrame
            title={`${plainText(id, series.at(-1)!.metric)}${usual ? `, usual ${formatRange(id, usual)}` : ''}`}
            subtitle={bundle ? stratumWords(stratumOf(bundle)) : undefined}
            status={series.at(-1)!.metric.status}
            metricId={id}
            direction={entry.higherIsBetter === false ? 'lower-steadier' : undefined}
            insufficient={series.length < 2 ? 'Building your baseline (1 of 2 sessions). Record another from the same side to see a trend.' : undefined}
            table={{
              caption: `${title} per session`,
              columns: ['Session', 'Value', 'Likely range', 'Serves'],
              rows: series.map((p) => ({
                key: p.sessionId,
                cells: [shortDate(p.visitId), plainText(id, p.metric), formatMetric(id, p.metric).detail?.replace(/^likely /, '') ?? 'Not given', String(p.n)],
              })),
            }}
          >
            <Sparkline
              variant="detail"
              points={series.slice(-8).map((p) => ({
                key: p.sessionId,
                value: p.value,
                low: p.low,
                high: p.high,
                low80: p.low !== undefined && p.high !== undefined ? p.value - (p.value - p.low) * 0.654 : undefined,
                high80: p.low !== undefined && p.high !== undefined ? p.value + (p.high - p.value) * 0.654 : undefined,
                provisional: p.provisional,
                label: shortDate(p.visitId),
                callout: `${plainText(id, p.metric)} · ${shortDate(p.visitId)}, ${p.n} serves`,
              }))}
              band={usual}
              latestLabel={shortText(id, series.at(-1)!.metric)}
              label={`${title} over ${series.length} matched sessions, latest ${plainText(id, series.at(-1)!.metric)}.`}
            />
          </ChartFrame>
          {trend.kind === 'trend' ? <VerdictLine verdict={trend.result.verdict === 'too-early' ? 'trend-too-early' : trend.result.verdict} context={`Last ${trend.sessions} matched sessions`} /> : null}
        </Section>
      ) : null}

      {copy ? (
        <Section id="how" title="How we measure it">
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-callout text-ink-2 marker:text-ink-3">
            {copy.how.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      {checks.length ? (
        <Section id="needs" title="What it needs">
          <ul className="card px-4">
            {checks.map((c) => (
              <CheckRow key={c.key} c={c} plain={!bundle} />
            ))}
          </ul>
          <p className="text-footnote text-ink-3">{bundle ? `For the session on ${shortDate(bundle.session.visitId)}.` : 'What a session needs for this measurement.'}</p>
        </Section>
      ) : null}

      <Section id="sure" title="How sure we are">
        <HowSure id={id} heightM={heightM} />
      </Section>

      {limits.length ? (
        <Section id="limits" title="Known limits">
          <ul className="flex flex-col gap-2">
            {limits.map((t) => (
              <li key={t} className="flex items-start gap-2 text-callout text-ink-2">
                <InfoIcon size={16} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {NO_OUTSIDE.has(id) ? (
        <Section id="reference" title="Compared with your own serves">
          <p className="text-callout text-ink-2">
            {id === 'loading-depth' ? "This is a description. Deeper isn't the goal. " : ''}
            We compare this only with your own usual serves. Published trunk angles and professional leg values measure different things, so we don't show them.
          </p>
        </Section>
      ) : (
        <>
          {bands ? (
            <Section id="club" title="Typical for club players (provisional)">
              <p className="text-callout text-ink-2">{bands.lines.join('. ')}.</p>
              {bands.yours ? <p className="text-callout text-ink">Yours: {bands.yours}.</p> : null}
              <p className="text-footnote text-ink-3">Early bands from published and coaching sources, not yet from players like you. Words, not grades.</p>
            </Section>
          ) : null}
          {copy?.context ? (
            <Section id="context" title="For context">
              <p className="text-callout text-ink-2">{copy.context}</p>
            </Section>
          ) : null}
        </>
      )}

      <Button variant="tertiary" to={paths.howWeMeasure()} className="self-start">
        More in How we measure
      </Button>
    </Screen>
  )
}
