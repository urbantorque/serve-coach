import { useState } from 'react'
import type { Fundamental, Metric } from '../lib/analysis/types'
import TargetShape from './TargetShape'
import { DeltaChip } from './Trend'
import { Cue, Icon, MetricBar, ScoreRing } from './primitives'
import { STATUS_LABEL } from './statusLabels'

interface Props {
  fundamental: Fundamental
  /** Change in this area's score since the previous serve. */
  delta?: number
  /** Jump the video to the keyframe this area is measured on. */
  onSeek?: (phase: Fundamental['phase']) => void
  defaultOpen?: boolean
}

/**
 * One area of the serve, opened out into its measurements.
 *
 * Each measurement reads top to bottom as one thought: what your body did, where
 * that sits against the target, and the instruction. No raw numbers anywhere on
 * the way down — the readout says the same thing in body language, and the bar
 * carries the rest without asking anybody to compare a decimal against a band.
 *
 * No drills here, deliberately. A card used to carry one exercise per named
 * fault plus a general one where there were none, and five open cards on a poor
 * serve put a dozen drills on screen — which is the list nobody acts on. Every
 * drill the report gives now comes off the one ranked plan at the top, so what
 * to do first is decided once, in causal order, rather than by whichever card
 * the player happened to open.
 */
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
          <span className="fcard-headline">
            <Cue text={f.headline} />
          </span>
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
                  <span className={`metric-read metric-read--${m.status}`}>{m.readout}</span>
                </div>
                <MetricBar value={m.value} ideal={m.ideal} range={m.range} status={m.status} />
                {/* The target says what to aim at in the same words as the
                    readout above it, so the two can be read against each other
                    at a glance. Only where the position is actually outside the
                    band: a toss that is steadier than asked for still reads as a
                    different phrase, and "aim for straight" under "dead straight"
                    is the report correcting somebody who has nothing wrong. */}
                {outsideBand(m) && m.readout !== m.target && (
                  <p className="metric-aim">
                    <span className="metric-aim-key">Aim for</span>
                    <span className="metric-aim-value">{m.target}</span>
                  </p>
                )}
                {/* And the same target as a shape, where there is a construction
                    for one. Directly under the phrase it illustrates, because
                    the two are one claim: `TargetShape` draws the player's own
                    number and the middle of the band, and `targetOf` reads the
                    phrase above off that same midpoint. It withholds itself on
                    every test the line above it does and on two more — a soft
                    measurement and a measurement with no plane to draw in — so
                    there is nothing to gate here. */}
                <TargetShape metric={m} />
                <p className="metric-insight">
                  <Cue text={m.insight} />
                </p>
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
                    <span>
                      <Cue text={m.fix} />
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>

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

const outsideBand = (m: Metric) => m.value < m.ideal[0] || m.value > m.ideal[1]
