/**
 * "App vs you" for one checked serve: timing in frames and milliseconds, heights in centimetres and %
 * of height, positions in centimetres, each against the METRICS §5.6 target, in plain words. The app's
 * values keep their own data states; the marked values read "You logged". One serve is never presented
 * as proof of accuracy.
 */
import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { MetricValue as MetricValueData } from '../../../../analysis/types.ts'
import { radarInRange, type Agreement, type AgreementRow, type RowKind } from '../../../../validation/annotation/agreement.ts'
import { MetricValue, SectionLabel, StatusChip } from '../../../components/index.ts'

const GROUPS: { kind: RowKind; title: string }[] = [
  { kind: 'timing', title: 'Timing' },
  { kind: 'height', title: 'Heights' },
  { kind: 'position', title: 'Positions' },
  { kind: 'scale', title: 'Scale' },
  { kind: 'speed', title: 'Radar' },
]

function TargetLine({ row }: { row: AgreementRow }) {
  if (row.within === null || !row.target) return null
  return row.within ? (
    <span className="inline-flex items-center gap-1 text-footnote text-ink-2">
      <CheckCircleIcon size={16} aria-hidden="true" className="text-ink" />
      Within the {row.target.text}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-footnote text-ink-2">
      <WarningCircleIcon size={16} aria-hidden="true" className="text-attention" />
      Outside the {row.target.text}
    </span>
  )
}

function Row({ row, frame, onSeek, speed }: { row: AgreementRow; frame: number | null; onSeek: (f: number) => void; speed?: MetricValueData | null }) {
  const body = (
    <>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-body font-label text-ink">{row.label}</span>
        <TargetLine row={row} />
      </span>
      <span className="text-callout text-ink-2">
        {row.sentence}
        {row.unsure ? ' You marked this frame as not sure.' : ''}
      </span>
      {row.kind === 'timing' && row.youFrame !== undefined ? (
        <span className="text-footnote tabular-nums text-ink-3">
          {row.appFrame !== undefined ? `App frame ${row.appFrame} · ` : ''}Your frame {row.youFrame}
        </span>
      ) : null}
      {row.app || row.you ? (
        <span className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
          {row.app ? (
            <>
              <span className="text-footnote text-ink-3">App</span>
              <MetricValue metricId={row.app.id} value={row.app} />
            </>
          ) : null}
          {row.you ? (
            <>
              <span className="text-footnote text-ink-3">You</span>
              <MetricValue metricId={row.you.id} value={row.you} />
            </>
          ) : null}
          {speed ? (
            <>
              <span className="text-footnote text-ink-3">App</span>
              <MetricValue metricId="speed-experimental" value={speed} detail />
            </>
          ) : null}
        </span>
      ) : null}
    </>
  )
  return (
    <li>
      {frame !== null ? (
        // The content is the accessible name (values, states and target included); the action is added.
        <button type="button" onClick={() => onSeek(frame)} className="flex w-full flex-col gap-1.5 rounded-control py-3 text-left hover:bg-surface-2 active:bg-surface-2">
          {body}
          <span className="sr-only">{`Show frame ${frame}.`}</span>
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 py-3">{body}</div>
      )}
    </li>
  )
}

export interface AgreementPanelProps {
  agreement: Agreement
  /** The frame each row is best seen on (the person's own mark), or null. */
  frameFor: (row: AgreementRow) => number | null
  onSeek: (frame: number) => void
  /** App speed range: shown only with the experimental toggle on (D4). */
  speed: MetricValueData | null
  heightDefault: boolean
  heightM: number
  othersCount: number
  blind: boolean
}

export function AgreementPanel({ agreement, frameFor, onSeek, speed, heightDefault, heightM, othersCount, blind }: AgreementPanelProps) {
  const { rows, checked, withinTarget } = agreement
  const radarRow = rows.find((r) => r.kind === 'speed')
  const inRange = radarRow?.you && speed ? radarInRange(radarRow.you.value as number, speed) : null
  return (
    <div className="gutter flex flex-col gap-4">
      <section aria-labelledby="app-vs-you" className="flex flex-col gap-2">
        <h2 id="app-vs-you" className="text-title-2 text-ink">
          App vs you
        </h2>
        <p className="text-body text-ink">
          {checked
            ? `On this serve the app was within target on ${withinTarget} of ${checked} ${checked === 1 ? 'check' : 'checks'}.`
            : 'Nothing to compare yet. Mark a frame or a point to see how the app agrees.'}
        </p>
        <p className="text-footnote text-ink-2">One serve can't show how accurate the app is. Exported checks from many serves and players are pooled to measure that.</p>
        <p className="flex flex-wrap items-center gap-2 text-footnote text-ink-2">
          Your marks show as <StatusChip status="player-entered" />
        </p>
        <p className="text-footnote text-ink-2">On the video, a crosshair is your mark and a dot is the app's point.</p>
        {heightDefault ? <p className="text-footnote text-ink-2">{`Height not entered, so centimetres assume ${heightM.toFixed(2)} m. Percentages of height are unaffected.`}</p> : null}
        {!blind ? <p className="text-footnote text-ink-2">These marks changed after the app's values were shown, so they are kept out of the blind set.</p> : null}
        {othersCount ? <p className="text-footnote text-ink-2">{`${othersCount === 1 ? 'One other person has' : `${othersCount} other people have`} also checked this serve. Their marks stay hidden.`}</p> : null}
      </section>
      {GROUPS.map((g) => {
        const rs = rows.filter((r) => r.kind === g.kind)
        if (!rs.length) return null
        return (
          <section key={g.kind} aria-label={g.title} className="flex flex-col">
            <SectionLabel as="h3">{g.title}</SectionLabel>
            <ul className="flex flex-col divide-y divide-line">
              {rs.map((r) => (
                <Row key={r.id} row={r} frame={frameFor(r)} onSeek={onSeek} speed={r.kind === 'speed' ? speed : null} />
              ))}
            </ul>
            {g.kind === 'speed' && inRange !== null ? (
              <p className="pt-1 text-footnote text-ink-2">{inRange ? 'Your reading is inside the app\'s experimental range.' : 'Your reading is outside the app\'s experimental range.'}</p>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
