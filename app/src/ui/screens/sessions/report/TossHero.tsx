import { InfoIcon } from '@phosphor-icons/react'
import { useNavigate } from 'react-router'
import type { MetricId, MetricValue as MetricValueData } from '../../../../analysis/types.ts'
import type { SessionRecord } from '../../../../data/records.ts'
import { MetricValue, StatusChip } from '../../../components/index.ts'
import { ChartFrame, covarianceEllipse, StripPlot, TossScatter, type Ellipse } from '../../../charts/index.ts'
import { OUTCOME_WORDS, UI } from '../../../copy/strings.ts'
import { formatMetric } from '../../../format/metricFormat.ts'
import { paths } from '../../../shell/paths.ts'
import { againstUsual } from '../../progress/insights/history.ts'
import { apexCm, relativeNumber, tossData, type ServeRow } from '../../progress/insights/serves.ts'
import { median } from '../../../../analysis/stats/index.ts'
import { formatRange } from '../../progress/insights/values.ts'

export interface TossHeroProps {
  session: SessionRecord
  metrics: Partial<Record<MetricId, MetricValueData>>
  rows: ServeRow[]
  heightM?: number
  /** Serve rows of up to 6 previous matched sessions (for the usual area; ≥ 2 sessions needed). */
  previous: ServeRow[][]
  /** Usual range of toss-height-spread from previous matched sessions. */
  usualSpread: [number, number] | null
  stratumLabel: string
  /** Experimental toggle: experimental readouts (the rear left-right spread) show only when on. */
  experimentalOn: boolean
}

/** "≈ 12 cm higher" / "≈ 8 cm lower" / "about the same" for a peak against the middle toss. */
function relWords(d: number): string {
  const cm = Math.round(Math.abs(d))
  if (cm === 0) return 'at the middle'
  return `≈ ${cm} cm ${d > 0 ? 'higher' : 'lower'}`
}

/** Symmetric domain around the middle toss, at least ±20 cm, in 10 cm steps. */
function relDomain(ds: number[]): [number, number] {
  const m = Math.max(20, Math.ceil((Math.max(...ds.map((d) => Math.abs(d))) + 3) / 10) * 10)
  return [-m, m]
}

function Readout({ id, v, usual }: { id: MetricId; v: MetricValueData | undefined; usual?: [number, number] | null }) {
  if (!v) return null
  const f = formatMetric(id, v)
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
      <span className="text-footnote font-label text-ink-2">{id === 'toss-forward-spread' ? 'Front-to-back spread' : id === 'toss-lateral-spread' ? 'Left-right spread' : 'Height spread'}</span>
      <MetricValue metricId={id} value={v} size="metric" chip={false} />
      {v.status !== 'unavailable' && usual ? <span className="text-footnote text-ink-3">usual {formatRange(id, usual)}</span> : null}
      {v.status !== 'unavailable' && f.nLine ? <span className="text-footnote tabular-nums text-ink-3">{f.nLine}</span> : null}
      <span aria-hidden="true">
        <StatusChip status={v.status} />
      </span>
    </div>
  )
}

/**
 * Hero: toss consistency (DESIGN §8.7 hero tile, §9.4; D5: always the first stats card). Two
 * readouts (height and front-to-back spread) with state, n and usual range, above the toss map.
 */
export function TossHero({ session, metrics, rows, heightM, previous, usualSpread, stratumLabel, experimentalOn }: TossHeroProps) {
  const navigate = useNavigate()
  const rear = session.view === 'rear'
  const spread = metrics['toss-height-spread']
  const secondRaw = rear ? metrics['toss-lateral-spread'] : metrics['toss-forward-spread']
  // Experimental values stay out of the story unless the toggle is on (D2; README honesty rule 6).
  const second = secondRaw?.status === 'experimental' && !experimentalOn ? undefined : secondRaw
  const secondId: MetricId = rear ? 'toss-lateral-spread' : 'toss-forward-spread'
  const toss = tossData(rows, heightM)

  // Usual area: previous matched sessions' apexes, only with ≥ 2 such sessions (DESIGN §9.4).
  let usual: Ellipse | null = null
  const prevPoints = previous.map((r) => tossData(r, heightM).points).filter((pts) => pts.length >= 5)
  if (prevPoints.length >= 2) {
    usual = covarianceEllipse(prevPoints.flat().map((p) => ({ x: p.xCm, y: p.yCm })), 1.5)
  }
  // Peaks above the picture carry their wider interval (DESIGN §9.4), from the serve's own estimate.
  const apexInterval = (id: string) => {
    const u = rows.find((r) => r.id === id)?.metrics['toss-apex-height']?.uncertainty
    return u && heightM ? { lowCm: u.low * heightM * 100, highCm: u.high * heightM * 100 } : undefined
  }
  const centroid = toss.points.length
    ? { xCm: toss.points.reduce((a, p) => a + p.xCm, 0) / toss.points.length, yCm: toss.points.reduce((a, p) => a + p.yCm, 0) / toss.points.length }
    : null

  // A strip of peak heights: always from behind (no forward position), and from the side when the map can't be drawn.
  const heights = rows
    .filter((r) => r.included && !r.isLet)
    .map((r) => ({ r, cm: apexCm(r, heightM) }))
    .filter((x): x is { r: ServeRow; cm: number } => x.cm !== null)
  const hMed = heights.length ? median(heights.map((h) => h.cm)) : undefined
  // Side view: the map needs front-to-back positions. While those are experimental (hidden with the
  // toggle off) or missing, the peak heights still tell the consistency story as a strip.
  const heightsOnly = rear || (toss.points.length < 5 && heights.length >= 5)
  // Unknown phone tilt (an imported clip): absolute peak heights are experimental, but how far each
  // peak sat from the middle one is not (METRICS §1.1 item 3), so the strip shows that instead.
  const relative = (() => {
    if (heights.length >= 5) return null
    const xs = rows
      .filter((r) => r.included && !r.isLet)
      .map((r) => {
        const v = r.metrics['toss-apex-height']
        const ok = v && v.status === 'experimental' && (v.statusIfLevel === 'measured' || v.statusIfLevel === 'estimated') && v.plausibility !== 'hard-reject'
        if (!ok || typeof v.value !== 'number') return null
        const cm = typeof v.secondary?.cm === 'number' ? v.secondary.cm : heightM ? v.value * heightM * 100 : null
        return cm === null ? null : { r, cm }
      })
      .filter((x): x is { r: ServeRow; cm: number } => x !== null)
    if (xs.length < 5) return null
    const mid = median(xs.map((x) => x.cm))
    return xs.map((x) => ({ r: x.r, d: x.cm - mid }))
  })()

  const spreadNum = typeof spread?.value === 'number' && spread.status !== 'unavailable' && spread.status !== 'experimental' ? spread.value : null
  const where = spreadNum !== null && !spread?.provisional ? againstUsual(spreadNum, usualSpread) : null
  const title =
    where === 'below'
      ? 'Your toss height was steadier than usual'
      : where === 'above'
        ? 'Your toss height varied more than usual'
        : where === 'inside'
          ? 'Your toss height was about as steady as usual'
          : relative
            ? 'How far each toss peak sat from your middle one'
            : heightsOnly
              ? 'How high your toss peaked on each serve'
              : 'Where your toss peaked on each serve'

  const tossCallout = (p: (typeof toss.points)[number]) =>
    `${(p.yCm / 100).toFixed(2)} m high, ${Math.round(Math.abs(p.xCm))} cm ${p.xCm < 0 ? 'behind' : 'in front'} · Serve ${p.index}, ${OUTCOME_WORDS[p.kind].toLowerCase()}`
  const summary = toss.points.length
    ? `Toss map, ${toss.points.length} serves. Peak heights from ${(Math.min(...toss.points.map((p) => p.yCm)) / 100).toFixed(2)} to ${(Math.max(...toss.points.map((p) => p.yCm)) / 100).toFixed(2)} metres; forward positions from ${Math.round(Math.min(...toss.points.map((p) => p.xCm)))} to ${Math.round(Math.max(...toss.points.map((p) => p.xCm)))} centimetres from your front toe.${usual ? ' Your usual area is shaded.' : ''}`
    : 'No toss peaks to show.'


  const notes: string[] = []
  if (toss.extrapolated) notes.push(`${toss.extrapolated} ${toss.extrapolated === 1 ? 'peak was' : 'peaks were'} above the picture and ${toss.extrapolated === 1 ? 'is' : 'are'} estimated.`)
  const excluded = rows.filter((r) => !r.included).length
  if (relative) notes.push(UI.tossRelativeOnly)
  else if (!rear && heightsOnly) notes.push(UI.tossHeightsOnly)
  if (toss.missing && !heightsOnly && !relative && toss.points.length >= 5) notes.push(`${toss.missing} ${toss.missing === 1 ? 'toss' : 'tosses'} could not be placed on the map.`)
  if (excluded) notes.push(`${excluded} ${excluded === 1 ? 'serve' : 'serves'} not measured.`)

  const status = spread?.status === 'unavailable' ? undefined : spread?.status
  // Tosses with a usable peak in any form (absolute, or relative under an unknown tilt).
  const peaks = Math.max(toss.points.length, heights.length, rows.filter((r) => r.included && !r.isLet && relativeNumber(r.metrics['toss-apex-height']) !== null).length)
  const insufficient = relative
    ? undefined
    : heightsOnly
      ? heights.length < 5
        ? `Needs 5 measured tosses. You have ${heights.length}.`
        : undefined
      : toss.points.length < 5
        ? peaks >= toss.points.length && peaks > 0
          ? `Needs 5 measured tosses to draw this. You have ${peaks}.`
          : `Needs 5 measured tosses to draw the map. You have ${toss.points.length}.`
        : undefined

  return (
    <ChartFrame
      title={title}
      subtitle={stratumLabel}
      status={status}
      metricId="toss-height-spread"
      earlyRead={spread?.provisional}
      direction="lower-steadier"
      headingLevel="h3"
      insufficient={insufficient}
      table={{
        caption: 'Toss peak per serve',
        columns: relative ? ['Serve', 'Result', 'From the middle toss'] : heightsOnly ? ['Serve', 'Result', 'Peak height'] : ['Serve', 'Result', 'Peak height', 'In front of toe'],
        rows: relative
          ? relative.map((x) => ({ key: x.r.id, cells: [`Serve ${x.r.index}`, OUTCOME_WORDS[x.r.kind], relWords(x.d)] }))
          : heightsOnly
          ? heights.map((h) => ({ key: h.r.id, cells: [`Serve ${h.r.index}`, OUTCOME_WORDS[h.r.kind], `≈ ${(h.cm / 100).toFixed(2)} m`] }))
          : toss.points.map((p) => ({
              key: p.id,
              cells: [
                `Serve ${p.index}`,
                OUTCOME_WORDS[p.kind],
                `≈ ${(p.yCm / 100).toFixed(2)} m${p.extrapolated ? ' (peak estimated)' : ''}`,
                `≈ ${Math.round(Math.abs(p.xCm))} cm${p.xCm < 0 ? ' behind' : ''}`,
              ],
            })),
      }}
      footer={
        <>
          {notes.length ? <span>{notes.join(' ')}</span> : null}
          {!rear ? (
            <span className="flex items-start gap-1.5">
              <InfoIcon size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{UI.sideTossBias}</span>
            </span>
          ) : null}
        </>
      }
    >
      <div className="flex gap-4">
        <Readout id="toss-height-spread" v={spread} usual={usualSpread} />
        <Readout id={secondId} v={second} />
      </div>
      {relative ? (
        <StripPlot
          label={`How far each toss peak sat above or below the middle one, ${relative.length} serves.`}
          rows={[
            {
              key: 'apex-relative',
              data: relative.map((x) => ({ id: x.r.id, value: x.d, kind: x.r.kind, muted: x.r.softFlag, callout: `${relWords(x.d)} · Serve ${x.r.index}` })),
              median: 0,
              medianLabel: 'middle toss',
            },
          ]}
          domain={relDomain(relative.map((x) => x.d))}
          unit="cm"
          formatTick={(v) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)}
          onOpen={(id) => navigate(paths.serveDetail(session.id, id))}
        />
      ) : heightsOnly ? (
        <StripPlot
          label={`Peak height of each serve, ${heights.length} serves.`}
          rows={[
            {
              key: 'apex',
              data: heights.map((h) => ({ id: h.r.id, value: h.cm / 100, kind: h.r.kind, muted: h.r.softFlag, callout: `${(h.cm / 100).toFixed(2)} m · Serve ${h.r.index}` })),
              median: hMed !== undefined ? hMed / 100 : undefined,
              medianLabel: hMed !== undefined ? `middle ${(hMed / 100).toFixed(2)} m` : undefined,
            },
          ]}
          domain={heights.length ? [Math.min(...heights.map((h) => h.cm)) / 100 - 0.1, Math.max(...heights.map((h) => h.cm)) / 100 + 0.1] : [3, 3.6]}
          unit="m"
          onOpen={(id) => navigate(paths.serveDetail(session.id, id))}
        />
      ) : (
        <TossScatter
          label={summary}
          points={toss.points.map((p) => ({
            id: p.id,
            xCm: p.xCm,
            yCm: p.yCm,
            kind: p.kind,
            muted: p.softFlag,
            extrapolated: p.extrapolated ? apexInterval(p.id) : undefined,
            callout: tossCallout(p),
          }))}
          usual={usual}
          centroid={centroid}
          onOpen={(id) => navigate(paths.serveDetail(session.id, id))}
        />
      )}
    </ChartFrame>
  )
}
