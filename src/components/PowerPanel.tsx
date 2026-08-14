import { useState } from 'react'
import {
  HEIGHT_CM_RANGE,
  MIN_SPEED_EVIDENCE,
  isPlausibleHeight,
  speedInKmh,
} from '../lib/analysis/power'
import type { Analysis } from '../lib/analysis/types'
import type { Session } from '../lib/storage/db'
import { Icon } from './primitives'

/**
 * How hard the serve was actually hit.
 *
 * The rest of the report is shapes judged against bands. This is the only part
 * of it that looks at what those shapes produced, and until now the app measured
 * one of these two numbers on every clip and showed it to nobody — see the note
 * at the head of `findOutbound`, which records that deferral and names what a
 * card would need before it could exist. This is that card.
 *
 * NOTHING HERE IS SCORED, and the absence is deliberate rather than
 * unfinished. There is no band, no badge, no ring and no drill: a band would be
 * this app asserting how fast a club player's hand ought to move, and there is
 * nothing in the repo that could stand behind such a number. What a speed is
 * good for is watching it move across a player's own sessions, and that
 * comparison needs no external cohort at all.
 *
 * THE UNIT IS STANDING HEIGHTS PER SECOND until the player says how tall they
 * are, which is the rule `OutboundFlightReading.speed` sets out and the reason
 * it gives: converting to km/h is one multiplication by a standing height, and
 * that height is an assumption about the player rather than a measurement of
 * them — 23% wrong for a junior. Asked for once, stored beside handedness, and
 * the conversion becomes a fact rather than a flattering guess.
 */
interface Props {
  analysis: Analysis | Session
  /** The player's standing height, if they have ever said. */
  heightCm?: number
  /** Remember a height. Absent where nothing can store one. */
  onSetHeight?: (cm: number | undefined) => void
}

export default function PowerPanel({ analysis, heightCm, onSetHeight }: Props) {
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState(() => (isPlausibleHeight(heightCm) ? String(heightCm) : ''))

  const hand = usable(analysis.power?.speed, analysis.power?.confidence)
  const ball = usable(analysis.outbound?.flight?.speed, analysis.outbound?.flight?.speedConfidence)
  // The window was looked at and the ball was not in it — which is the ordinary
  // outcome and worth saying, because "no reading" and "your camera is too slow
  // for this" are different facts and only one of them is actionable.
  const looked = analysis.outbound?.coverage
  const height = isPlausibleHeight(heightCm) ? heightCm : undefined

  if (!hand && !ball) return null

  const speed = (v: number) =>
    height
      ? { value: Math.round(speedInKmh(v, height)).toString(), unit: 'km/h' }
      : { value: v.toFixed(1), unit: 'body heights / sec' }

  const save = () => {
    const cm = Number(draft)
    onSetHeight?.(isPlausibleHeight(cm) ? cm : undefined)
    setAsking(false)
  }

  return (
    <section className="block power" aria-label="How hard you hit it">
      <h2 className="block-title">How hard you hit it</h2>

      <div className="power-rows">
        {hand && (
          <Reading
            label="Hand through the swing"
            {...speed(hand.speed)}
            // The frame count, not a bar. Three frames and eleven are different
            // claims about the same number, and somebody filming at 30 fps
            // deserves to know which of the two they are reading. The wording
            // tracks what `readHandSpeed` actually does — the fastest short
            // stretch of the forward swing, not a reading taken at contact.
            note={`The fastest stretch of your swing, across ${analysis.power!.samples} frames`}
            soft={hand.confidence < 0.65}
          />
        )}
        {ball && (
          <Reading
            label="Ball off the strings"
            {...speed(ball.speed)}
            note="Measured from the ball itself, in the frames after contact"
            soft={ball.confidence < 0.65}
          />
        )}
      </div>

      {!ball && looked && looked.read > 0 && (
        <p className="power-miss">
          <Icon name="info" size={15} />
          <span>
            I looked at {looked.read} {looked.read === 1 ? 'frame' : 'frames'} after contact and
            could not find the ball in {looked.read === looked.found ? 'any' : 'enough'} of them.
            The ball is only in shot for a few hundredths of a second, so most phones never catch
            it. Film in slow motion if you want that number.
          </span>
        </p>
      )}

      {/* The height, asked for here rather than on the way in: this is the one
          screen where knowing it changes anything, and a question asked at the
          moment it pays for itself gets answered. */}
      {onSetHeight && (
        <div className="power-height">
          {asking ? (
            <>
              <label className="power-height-label" htmlFor="power-height-input">
                Your height, in centimetres
              </label>
              <div className="power-height-row">
                <input
                  id="power-height-input"
                  className="power-height-input"
                  type="number"
                  inputMode="numeric"
                  min={HEIGHT_CM_RANGE[0]}
                  max={HEIGHT_CM_RANGE[1]}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  autoFocus
                />
                <button className="btn btn--primary power-height-save" onClick={save}>
                  Save
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn--ghost btn--full" onClick={() => setAsking(true)}>
              <Icon name="target" size={16} />
              {height ? `Measured against ${height} cm — change` : 'Tell me your height for km/h'}
            </button>
          )}
        </div>
      )}

      {/* The caveats, in full and under the numbers rather than behind a tap.
          Every reading here is a lower bound and one of them is not the racket,
          and somebody comparing these against a radar gun at their club needs to
          know that before they conclude the app is wrong about them. Written to
          fit whichever readings actually resolved: a paragraph starting "both"
          above a single number is the page disagreeing with itself. */}
      <p className="power-note">
        {hand && ball ? 'Both are' : 'This is'} the speed <em>towards the net</em>, and read
        {hand && ball ? '' : 's'} low if you filmed from a corner rather than side on.
        {hand && ' The hand figure is your wrist, not the racket head — the racket travels faster.'}{' '}
        Use {hand && ball ? 'these' : 'this'} to watch your own serve change, never to compare
        against anyone else.
      </p>
    </section>
  )
}

/**
 * A reading is shown only where there is enough evidence for one.
 *
 * `MIN_SPEED_EVIDENCE` is the gate `findOutbound` asked for, and it applies to
 * both speeds identically — a hedge in the caption cannot catch up with a number
 * somebody has already read and remembered.
 */
function usable(
  speed: number | undefined,
  confidence: number | undefined,
): { speed: number; confidence: number } | undefined {
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) return undefined
  const c = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0
  return c >= MIN_SPEED_EVIDENCE ? { speed, confidence: c } : undefined
}

function Reading({
  label,
  value,
  unit,
  note,
  soft,
}: {
  label: string
  value: string
  unit: string
  note: string
  soft: boolean
}) {
  return (
    <div className={`power-row${soft ? ' power-row--soft' : ''}`}>
      <span className="power-label">{label}</span>
      <span className="power-value">
        {value}
        <em className="power-unit">{unit}</em>
      </span>
      <span className="power-sub">
        {note}
        {/* Said out loud rather than shaded, because the number above it is the
            same size either way and nobody reads a tint as a caveat. */}
        {soft && ' · read roughly'}
      </span>
    </div>
  )
}
