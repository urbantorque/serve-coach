import '../styles/guide.css'
import '../styles/player.css'
import { useState } from 'react'
import { PLACEMENT, SPEED_PLACEMENT } from '../lib/placement'
import ModelServe from './ModelServe'
import PlacementDiagram from './PlacementDiagram'
import { Icon } from './primitives'

/**
 * Filming instructions. Deliberately opinionated and short — the difference
 * between a usable clip and a useless one is four decisions, and every extra
 * line here is a line nobody reads at the court.
 */
const RULES = [
  {
    title: `Phone side-on, ${PLACEMENT.distance} away`,
    body:
      'Line the phone up with the baseline, pointing across at you. Only a side view shows how far in front of you the ball is hit.',
  },
  {
    title: 'Fit the whole body in, feet included',
    // Upright for the swing, and said as the swing's rule: step 5 turns the
    // phone on its side for a speed, and two flat instructions read as the
    // guide contradicting itself.
    body:
      'For the swing, stand the phone upright with space above your racket at full reach. I measure every height against your own body.',
  },
  {
    title: 'Start filming before the toss',
    body:
      // Says where a practice session comes from (N3.6): the app's own
      // one-serve recording stops at 90 seconds; a whole practice is the
      // Whole practice switch (N4.4) where the browser can write it out, or the camera app.
      'Hit record a second before the ball leaves your hand. For a whole practice, switch on Whole practice in Options, or use your camera app.',
  },
  {
    title: 'Use slow motion if your phone has it',
    body:
      'The racket swings up to the ball in about an eighth of a second. Slow motion shows that part more clearly.',
  },
  {
    // N2.7: the one placement that gives an ordinary clip a serve speed.
    title: 'For a serve speed, stand the phone further back',
    body: `Unlike step 2, turn the phone on its side, ${SPEED_PLACEMENT.distance} away, ${SPEED_PLACEMENT.where}. That keeps the ball in the picture long enough for me to time it.`,
  },
]

const AVOID = [
  'Other players moving in the background',
  'Filming into the sun, or heavy shade across the court',
  'Holding the phone. Prop it on a fence or bag instead',
]

export default function FilmingGuide({ racket = 'right' }: { racket?: 'left' | 'right' }) {
  // The model serve mounts on the tap (L4.3): the guide is read in a sheet
  // on the way to filming, and a loop nobody opened is work for nothing.
  const [watching, setWatching] = useState(false)
  return (
    <div className="guide">
      <PlacementDiagram />
      <ol className="guide-list">
        {RULES.map((r, i) => (
          <li key={r.title}>
            <span className="guide-num tnum">{i + 1}</span>
            <div>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="guide-avoid">
        <h3 className="t-overline">Try to avoid</h3>
        <ul>
          {AVOID.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      <p className="guide-note">
        Filming from the front or back still works, but I can’t see how far in front of you the ball is hit.
      </p>

      <details className="guide-model" onToggle={(e) => setWatching((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="guide-model-head">
          <span>Watch a model serve</span>
          <Icon name="chevron" size={15} />
        </summary>
        {watching && <ModelServe racket={racket} />}
      </details>
    </div>
  )
}
