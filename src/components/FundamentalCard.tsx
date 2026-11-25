import { useState } from 'react'
import { isMeasured } from '../lib/analysis/coaching'
import type { Fundamental, Metric } from '../lib/analysis/types'
import type { AreaChange } from '../lib/progress'
import { breakdownLines, type AreaBreakdown } from '../lib/analysis/breakdown'
import TargetShape from './TargetShape'
import { DeltaChip } from './DeltaChip'
import { Cue, Icon, MetricBar, ScoreRing } from './primitives'
import { STATUS_LABEL } from './statusLabels'

interface Props {
  fundamental: Fundamental
  /** Change in this area's score since the previous serve, and whether the two were graded alike. */
  change?: AreaChange
  /** Jump the video to the keyframe this area is measured on. */
  onSeek?: (phase: Fundamental['phase']) => void
  /** Why this area scored what it did (L3.10). */
  breakdown?: AreaBreakdown
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
  change,
  onSeek,
  breakdown,
}: Props) {
  /*
   * Closed, always, and not a prop.
   *
   * `defaultOpen` was removed from the report a while back for the reason
   * written beside the call site: the array order is hard-coded in `measure()`,
   * so opening the first card always opened the toss — the largest of the five
   * — under a ranked plan that had just told the player their problem was
   * somewhere else. The prop outlived that decision by several rounds and the
   * reachability gate found it, which is the first thing that gate found.
   *
   * Deleted rather than left optional. A door back to a rejected behaviour is
   * one `defaultOpen={i === 0}` away from being walked through again by
   * somebody who never reads the comment saying not to.
   */
  const [open, setOpen] = useState(false)
  /*
   * An area this clip graded nothing in (L1.1). No ring, because a ring is a
   * score and there is none; no status colour, because every status is a
   * verdict on the player; no delta, because there is nothing to move from.
   * The headline says why the card is here at all.
   */
  const measured = isMeasured(f)

  return (
    <section className={`fcard fcard--${measured ? f.status : 'unmeasured'}${open ? ' is-open' : ''}`}>
      <button
        className="fcard-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {measured ? (
          <ScoreRing score={f.score} status={f.status} size={54} animate={false} />
        ) : (
          <span className="fcard-ring-empty" aria-hidden="true">
            –
          </span>
        )}
        <span className="fcard-title">
          <span className="fcard-name">
            {f.label}
            {measured ? (
              <>
                <em className={`tag tag--${f.status}`}>{STATUS_LABEL[f.status]}</em>
                <DeltaChip delta={change?.delta} scope={f.id} alike={change?.alike} compact />
              </>
            ) : (
              <em className="tag tag--none">Not measured</em>
            )}
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

          {/* Why this score (L3.10): folded, because it is for the player who
              asks, and every number in it comes from the score's own sums. */}
          {breakdown && (
            <details className="fcard-why">
              <summary>Why this score</summary>
              {breakdownLines(breakdown).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </details>
          )}

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

          {/* Measured with no band to hold them to (D2.1). Plainer than a
              graded row on purpose — no bar, no colour, no order — because a
              reading dressed in a verdict's colour would be a verdict. */}
          {f.readings?.length ? (
            <div className="unscored">
              <p className="unscored-title">Measured, not scored</p>
              <ul className="unscored-list">
                {f.readings.map((r) => (
                  <li key={r.id} className={`unscored-row${r.softness ? ' unscored-row--soft' : ''}`}>
                    <span className="metric-label">
                      {r.label}
                      {r.softness && <em className="metric-approx">approximate</em>}
                    </span>
                    <span className="unscored-read">{r.readout}</span>
                  </li>
                ))}
              </ul>
              <p className="unscored-note">There is no published target for these yet, so I don’t score them.</p>
            </div>
          ) : null}

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
