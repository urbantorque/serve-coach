import { useState } from 'react'
import {
  HEIGHT_CM_RANGE,
  MIN_SPEED_EVIDENCE,
  estimateBallSpeed,
  formatSpeed,
  isPlausibleHeight,
} from '../lib/analysis/power'
import type { Analysis } from '../lib/analysis/types'
import type { Session } from '../lib/storage/db'
import { bestHandSpeedLine, type BestHandSpeed } from '../lib/progress'
import { Icon } from './primitives'

/**
 * How fast the serve went.
 *
 * The rest of the report is shapes judged against bands. This is the only part
 * that looks at what those shapes produced, and for most of the app's life it
 * measured one of these numbers on every clip and showed it to nobody — see the
 * note at the head of `findOutbound`, which records that deferral and names what
 * a card would need before it could exist.
 *
 * THREE NUMBERS, IN ORDER OF HOW MUCH THEY ARE WORTH, and the panel shows the
 * best one it has:
 *
 *   1. The ball, measured off the pixels after contact. A real reading of the
 *      thing a radar gun points at. Absent on nearly every phone clip — the ball
 *      is in shot for 25–50 ms — so this is the rare case.
 *   2. The serve speed ESTIMATED from the hand, as a range. Modelled, not
 *      measured: two multiplications with their uncertainty attached, spelled
 *      out in `power.ts`. Shown as a band and never as a single figure, because
 *      a single figure would claim a precision the model has not got in the one
 *      place a player is most likely to repeat it to somebody.
 *   3. The hand itself, which is what was actually measured, kept underneath so
 *      the estimate is never the only thing on screen. A player who wants to
 *      know what the app really saw can see it.
 *
 * WHEN THE BALL WAS SEEN, THE ESTIMATE IS NOT SHOWN. Two serve speeds side by
 * side, one measured and one inferred, invites the reader to average them or to
 * pick the flattering one. The measurement wins outright.
 *
 * NOTHING HERE IS SCORED. There is no band, no badge, no ring and no drill: a
 * band would be this app asserting how fast a club player ought to serve, and
 * nothing in the repo could stand behind such a number. What a speed is for is
 * watching it move across a player's own sessions.
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
  /**
   * The fastest hand speed measured across every session — see
   * `bestHandSpeed`. Absent below two usable readings, same as every other
   * cross-session record this app states.
   */
  bestSpeed?: BestHandSpeed
}

export default function PowerPanel({ analysis, heightCm, onSetHeight, bestSpeed }: Props) {
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState(() => (isPlausibleHeight(heightCm) ? String(heightCm) : ''))
  /**
   * Why the last save didn't take.
   *
   * `save` used to close the form either way, discarding an implausible
   * number in silence — the one honest thing it did was never show a wrong
   * km/h, but a player who fat-fingered "17" for "175" saw their answer
   * vanish with no explanation, and a player who already had a real height
   * on file could lose it to the same typo. Kept open with a reason instead:
   * only an explicitly empty field counts as "forget my height."
   */
  const [error, setError] = useState<string | null>(null)

  const hand = usable(analysis.power?.speed, analysis.power?.confidence)
  const ball = usable(analysis.outbound?.flight?.speed, analysis.outbound?.flight?.speedConfidence)
  // Only where the ball itself was not resolved — see the header. A measured
  // speed beside an inferred one is an invitation to pick whichever is kinder.
  const estimate = ball ? undefined : estimateBallSpeed(analysis.power)
  // The window was looked at and the ball was not in it — which is the ordinary
  // outcome and worth saying, because "no reading" and "your camera is too slow
  // for this" are different facts and only one of them is actionable.
  const looked = analysis.outbound?.coverage

  if (!hand && !ball) return null

  /**
   * One speed, in whichever unit the app is entitled to use today —
   * `formatSpeed` (`power.ts`) decides that once, for every caller. `unit`
   * never depends on the value passed in, only on whether a height is on
   * file, so reading it off an arbitrary call is exact, not approximate.
   */
  const show = (v: number) => formatSpeed(v, heightCm).value
  const { unit } = formatSpeed(0, heightCm)

  const save = () => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      onSetHeight?.(undefined)
      setAsking(false)
      setError(null)
      return
    }
    const cm = Number(trimmed)
    if (!isPlausibleHeight(cm)) {
      setError(`That doesn't look like a height — try somewhere between ${HEIGHT_CM_RANGE[0]} and ${HEIGHT_CM_RANGE[1]} cm.`)
      return
    }
    onSetHeight?.(cm)
    setAsking(false)
    setError(null)
  }

  return (
    <section className="block power" aria-label="How fast you served">
      <h2 className="block-title">How fast you served</h2>

      {ball && (
        <div className="power-headline">
          <span className="power-label">Ball off the strings</span>
          <span className="power-big">
            {show(ball.speed)}
            <em className="power-unit">{unit}</em>
          </span>
          <span className="power-sub">
            Measured from the ball itself, in the frames after contact
            {ball.confidence < 0.65 && ' · read roughly'}
          </span>
        </div>
      )}

      {estimate && (
        <div className="power-headline power-headline--estimate">
          <span className="power-label">Serve speed, estimated</span>
          {/* A range, always. The two numbers are separated by an en dash and a
              real element rather than run together in one string, so a screen
              reader says "112 to 149" instead of a subtraction. */}
          <span className="power-big">
            {show(estimate.low)}
            <span className="power-to" aria-hidden="true">
              –
            </span>
            <span className="sr-only"> to </span>
            {show(estimate.high)}
            <em className="power-unit">{unit}</em>
          </span>
          <span className="power-sub">
            Worked out from your hand speed, not measured off the ball — so it is a band, not a
            number. Give or take {Math.round(estimate.spread * 100)}%.
          </span>
        </div>
      )}

      {hand && (
        <div className="power-rows">
          <div className={`power-row${hand.confidence < 0.65 ? ' power-row--soft' : ''}`}>
            <span className="power-label">Hand through the swing — measured</span>
            <span className="power-value">
              {show(hand.speed)}
              <em className="power-unit">{unit}</em>
            </span>
            {/* The frame count, not a bar. Three frames and eleven are different
                claims about the same number, and somebody filming at 30 fps
                deserves to know which of the two they are reading. */}
            <span className="power-sub">
              The fastest stretch of your swing, across {analysis.power!.samples} frames
              {hand.confidence < 0.65 && ' · read roughly'}
            </span>
          </div>

          {/* A fact about the whole history, not this one swing — see
              `bestHandSpeed`. Ungameable the same way the trip streak and
              the tightest gap are: the only way to move this number is to
              swing an actually faster hand through an actually readable
              clip. */}
          {bestSpeed && <p className="power-sub">{bestHandSpeedLine(bestSpeed, heightCm, analysis.createdAt)}</p>}
        </div>
      )}

      {!ball && looked && looked.read > 0 && (
        <p className="power-miss">
          <Icon name="info" size={15} />
          <span>
            I looked at {looked.read} {looked.read === 1 ? 'frame' : 'frames'} after contact and
            could not find the ball in {looked.read === looked.found ? 'any' : 'enough'} of them.
            The ball is only in shot for a few hundredths of a second, so most phones never catch
            it. Film in slow motion and I can measure it instead of working it out.
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
                  onChange={(e) => {
                    setDraft(e.target.value)
                    setError(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'power-height-error' : undefined}
                  autoFocus
                />
                <button className="btn btn--primary power-height-save" onClick={save}>
                  Save
                </button>
              </div>
              {error && (
                <p className="power-height-error" id="power-height-error" role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            <button className="btn btn--ghost btn--full" onClick={() => setAsking(true)}>
              <Icon name="target" size={16} />
              {isPlausibleHeight(heightCm)
                ? `Measured against ${heightCm} cm — change`
                : 'Tell me your height for km/h'}
            </button>
          )}
        </div>
      )}

      {/* The caveats, in full and under the numbers rather than behind a tap.
          Somebody comparing this against the radar gun at their club needs to
          know what it is before they conclude the app is wrong about them — and
          what it is depends on which reading they are looking at. */}
      <p className="power-note">
        {estimate ? (
          <>
            This is <em>not a radar gun</em>. I measured your hand and worked the rest out from how
            a racket and strings behave, so a big wrist snap lands high in the band and an arm-only
            push lands low. It also reads low if you filmed from a corner rather than side on. Use
            it to watch your own serve change, never to compare against anyone else.
          </>
        ) : (
          <>
            This is the speed <em>towards the net</em>, and reads low if you filmed from a corner
            rather than side on. Use it to watch your own serve change, never to compare against
            anyone else.
          </>
        )}
      </p>
    </section>
  )
}

/**
 * A reading is shown only where there is enough evidence for one.
 *
 * `MIN_SPEED_EVIDENCE` is the gate `findOutbound` asked for, and it applies to
 * every speed identically — a hedge in the caption cannot catch up with a number
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
