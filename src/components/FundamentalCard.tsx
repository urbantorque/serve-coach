import { useState } from 'react'
import type { Fundamental, Metric } from '../lib/analysis/types'
import { DeltaChip } from './Trend'
import { Icon, MetricBar, ScoreRing } from './primitives'
import { STATUS_LABEL } from './statusLabels'

interface Props {
  fundamental: Fundamental
  /** Change in this area's score since the previous serve. */
  delta?: number
  /** Jump the video to the keyframe this area is measured on. */
  onSeek?: (phase: Fundamental['phase']) => void
  defaultOpen?: boolean
}

export default function FundamentalCard({
  fundamental: f,
  delta,
  onSeek,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={`fcard fcard--${f.status}${open ? ' is-open' : ''}`}>
      <button
        className="fcard-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ScoreRing score={f.score} status={f.status} size={54} animate={false} />
        <span className="fcard-title">
          <span className="fcard-name">
            {f.label}
            <em className={`tag tag--${f.status}`}>{STATUS_LABEL[f.status]}</em>
            <DeltaChip delta={delta} compact />
          </span>
          <span className="fcard-headline">{f.headline}</span>
        </span>
        <span className="fcard-chevron">
          <Icon name="chevron" size={18} />
        </span>
      </button>

      {open && (
        <div className="fcard-body">
          <p className="fcard-blurb">{f.blurb}</p>

          <ul className="metrics">
            {f.metrics.map((m) => (
              <li key={m.id} className={`metric${m.softness ? ' metric--soft' : ''}`}>
                <div className="metric-top">
                  <span className="metric-label">
                    {m.label}
                    {m.softness && <em className="metric-approx">approximate</em>}
                  </span>
                  <span className={`metric-value tnum metric-value--${m.status}`}>{m.display}</span>
                </div>
                <MetricBar value={m.value} ideal={m.ideal} range={m.range} status={m.status} />
                <div className="metric-scale">
                  <span className="tnum">{fmt(m.range[0], m)}</span>
                  <span className="metric-target tnum">
                    target {fmt(m.ideal[0], m)}–{fmt(m.ideal[1], m)}
                  </span>
                  <span className="tnum">{fmt(m.range[1], m)}</span>
                </div>
                <p className="metric-insight">{m.insight}</p>
                {/* Why the number is soft goes *above* any instruction to change
                    something, so the player reads the caveat before they read
                    the advice rather than after acting on it. */}
                {m.softness && (
                  <p className="metric-soft-note">
                    <Icon name="info" size={15} />
                    <span>{m.softness}</span>
                  </p>
                )}
                {m.fix && (
                  <p className="metric-fix">
                    <Icon name="target" size={15} />
                    <span>{m.fix}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="drill">
            <span className="drill-kicker">Drill</span>
            <h4>{f.drill.name}</h4>
            <p>{f.drill.how}</p>
            <span className="drill-reps">{f.drill.reps}</span>
          </div>

          {onSeek && (
            <button className="btn btn--ghost btn--full" onClick={() => onSeek(f.phase)}>
              <Icon name="film" size={17} />
              Watch this moment
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Axis labels use the metric's own precision. Rounding them independently makes
 * a value that sits just outside its band appear to sit inside it — a release
 * height of 1.10 against a target shown as "1.1–1.4" reads as fine when it is
 * in fact the fault being reported.
 */
function fmt(v: number, m: Metric): string {
  const n = v.toFixed(m.decimals)
  return m.unit === '°' || m.unit === '%' ? `${n}${m.unit}` : n
}
