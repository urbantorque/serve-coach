import { CalendarBlankIcon, FlagPennantIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import type { MetricId, MetricStatus } from '../../../../analysis/types.ts'
import { useProfile } from '../../../../data/hooks.ts'
import { Sparkline, WilsonBar } from '../../../charts/index.ts'
import { Badge, Button, ListGroup, ListRow, MetricValue, SectionLabel, StatusChip } from '../../../components/index.ts'
import { metricName } from '../../../copy/metricNames.ts'
import { shortDate } from '../../../format/dates.ts'
import { paths } from '../../../shell/paths.ts'
import { usePlusGate } from '../../plan/usePlusGate.tsx'
import { COMPETITION_LABEL } from '../../sessions/matchLog/matchForm.ts'
import type { SeriesPoint } from '../insights/history.ts'
import { useMatchLogs } from '../insights/hooks.ts'
import { plainText } from '../insights/values.ts'
import { dfWords, firstWords, matchPoints, RECENT_MATCHES, recentDoubleFaults, recentFirstServes, seasonRows } from './matchSeries.ts'
import { SeasonView } from './SeasonView.tsx'

const withFrom = (to: string) => `${to}?from=${encodeURIComponent(paths.progress())}`

export interface MatchNightsSectionProps {
  /** The practice focus metric's matched series (for the Plus season view), oldest first. */
  practice?: { metricId: MetricId; series: readonly SeriesPoint[] }
}

/**
 * Comp nights on Progress (D11; PRODUCT §6.9 tile 5, §6.11; DESIGN §9.9, §10.10): the player's match
 * log as its own series. Double faults per service game and first serves in (when counted), each
 * "You logged" and "from your match log". Never pooled with practice, never a verdict. Logging is
 * free; the week-by-week season view beside practice is Plus (T3).
 */
export function MatchNightsSection({ practice }: MatchNightsSectionProps) {
  const logs = useMatchLogs()
  const profile = useProfile()
  const gate = usePlusGate('season-view')
  const [seasonOpen, setSeasonOpen] = useState(false)
  if (logs === undefined) return null
  const points = matchPoints(logs)
  const df = recentDoubleFaults(points)
  const first = recentFirstServes(points)
  const dfSeries = points.filter((p) => p.dfPerGame !== null).slice(-8)
  const firstSeries = points.filter((p) => p.first && p.first.n > 0).slice(-8)
  const recent = points.slice(-RECENT_MATCHES).reverse()
  const nights = (n: number) => (n === 1 ? 'comp night' : `${n} comp nights`)

  const practicePoints =
    practice?.series.map((p) => ({ date: p.visitId, value: p.value, label: `${plainText(practice.metricId, p.metric)} · ${shortDate(p.visitId)}` })) ?? []
  const practiceStatus: MetricStatus = practice?.series.at(-1)?.metric.status ?? 'estimated'
  const rows = seasonRows({ practice: practicePoints, matches: points, season: profile?.season })

  return (
    <section className="flex flex-col gap-3" aria-labelledby="comp-nights" data-comp-nights>
      <SectionLabel className="flex items-center gap-1.5">
        <FlagPennantIcon size={16} aria-hidden="true" />
        <span id="comp-nights">Comp nights</span>
      </SectionLabel>

      {!points.length ? (
        <div className="card flex flex-col gap-3 p-4">
          <h3 className="text-title-2 text-ink text-balance">How is your serve going on comp night?</h3>
          <p className="text-callout text-ink-2">
            After a match, log your service games, double faults and, if you counted them, first serves in. It takes about 20 seconds and shows here next to your
            practice, never mixed with it.
          </p>
          <Button variant="secondary" icon={CalendarBlankIcon} to={withFrom(paths.matchLog())}>
            Log a match
          </Button>
        </div>
      ) : (
        <div className="card flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-title-2 text-ink text-balance">How is your serve going on comp night?</h3>
            <p className="flex flex-wrap items-center gap-2 text-footnote text-ink-3">
              <span>From your match log, {nights(points.length)}. Every number here:</span>
              <StatusChip status="player-entered" />
            </p>
          </div>

          <div className="flex flex-col gap-2" data-match-series="double-faults">
            <p className="text-footnote font-label text-ink-2">Double faults</p>
            {df ? (
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-headline text-ink">
                <MetricValue metricId="double-faults" value={df.value} detail={false} className="[&_.text-body]:text-headline" />
                <span className="font-normal text-ink-2">
                  in {df.serviceGames} service {df.serviceGames === 1 ? 'game' : 'games'}, last {nights(df.matches)}
                </span>
              </p>
            ) : (
              <p className="text-callout text-ink-2">Log service games and double faults to see this.</p>
            )}
            {dfSeries.length >= 2 ? (
              <Sparkline
                points={dfSeries.map((p) => ({ key: p.id, value: p.dfPerGame!, label: shortDate(p.date), callout: `${dfWords(p)} · ${shortDate(p.date)}` }))}
                hollow
                domain={[0, Math.max(1, ...dfSeries.map((p) => p.dfPerGame!))]}
                latestLabel={`${dfSeries.at(-1)!.doubleFaults} in ${dfSeries.at(-1)!.serviceGames}`}
                formatTick={(v) => v.toFixed(1)}
                label={`Double faults per service game, ${dfSeries.length} comp nights. Latest ${dfWords(dfSeries.at(-1)!)}.`}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-4" data-match-series="first-serves">
            <p className="text-footnote font-label text-ink-2">First serves in</p>
            {first ? (
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-headline text-ink">
                <MetricValue metricId="first-serve-in-rate" value={first.value} className="[&_.text-body]:text-headline" />
                <span className="font-normal text-ink-2">last {nights(first.matches)} you counted</span>
              </p>
            ) : null}
            {first && first.n >= 10 && first.value.uncertainty ? (
              <WilsonBar
                rate={first.k / first.n}
                low={first.value.uncertainty.low}
                high={first.value.uncertainty.high}
                label={`Likely ${Math.round(first.value.uncertainty.low * 100)} to ${Math.round(first.value.uncertainty.high * 100)} percent`}
                className="my-1"
              />
            ) : null}
            {first ? null : (
              <p className="text-callout text-ink-2">Optional: count first serves on the night to see this.</p>
            )}
            {firstSeries.length >= 2 ? (
              <Sparkline
                points={firstSeries.map((p) => ({ key: p.id, value: p.first!.k / p.first!.n, label: shortDate(p.date), callout: `${firstWords(p)} · ${shortDate(p.date)}` }))}
                hollow
                domain={[0, 1]}
                latestLabel={`${firstSeries.at(-1)!.first!.k} of ${firstSeries.at(-1)!.first!.n}`}
                formatTick={(v) => `${Math.round(v * 100)}%`}
                label={`First serves in, ${firstSeries.length} comp nights. Latest ${firstWords(firstSeries.at(-1)!)}.`}
              />
            ) : null}
          </div>

          <p className="text-footnote text-ink-2">Your own record. Match numbers jump around a lot, so there's no verdict here, and comp nights never mix with practice.</p>

          <ListGroup label="Recent comp nights">
            {recent.map((p) => (
              <ListRow
                key={p.id}
                to={withFrom(paths.matchLog(p.id))}
                title={`${shortDate(p.date)}, ${COMPETITION_LABEL[p.competition].toLowerCase()}`}
                subtitle={dfWords(p)}
                detail={firstWords(p)}
              />
            ))}
          </ListGroup>

          <div className="flex flex-col gap-2">
            <Button variant="secondary" icon={CalendarBlankIcon} to={withFrom(paths.matchLog())}>
              Log a match
            </Button>
            <Button
              variant="secondary"
              aria-expanded={gate.plus ? seasonOpen : undefined}
              onClick={() => gate.request(() => setSeasonOpen((v) => !v))}
            >
              <span className="flex items-center gap-2">
                {seasonOpen && gate.plus ? 'Hide season view' : 'Season view'}
                {gate.plus ? null : <Badge>Plus</Badge>}
              </span>
            </Button>
          </div>
          {seasonOpen && gate.plus && rows ? (
            <SeasonView rows={rows} practiceName={practice ? metricName(practice.metricId) : 'Practice'} practiceStatus={practiceStatus} />
          ) : null}
        </div>
      )}
      {gate.sheet}
    </section>
  )
}
