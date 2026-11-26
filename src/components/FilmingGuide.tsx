import '../styles/guide.css'
import '../styles/player.css'
import { useState } from 'react'
import { PLACEMENT, SPEED_PLACEMENT } from '../lib/placement'
import ModelServe from './ModelServe'
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

/**
 * Where the phone goes, drawn from above.
 *
 * The first rule was the one players got wrong, and it was the one given only
 * in words: "side-on" reads as "beside the court" to some and "at the side of
 * my body" to others, and only one of those is level with the baseline. A
 * picture settles it before the paragraph is read. Built from the same tokens
 * as everything else — hairline court, lime for the player and the phone's
 * view, faint labels — so it sits in the sheet as part of it.
 */
function PlacementDiagram() {
  return (
    <svg
      className="guide-diagram"
      viewBox="0 0 320 156"
      role="img"
      aria-label={`Seen from above: the phone stands ${PLACEMENT.distance} to your side, ${PLACEMENT.where}, looking across at you.`}
    >
      {/* The court, from the baseline up to the service line. */}
      <g stroke="var(--fg-faint)" strokeWidth="1.5" fill="none" strokeOpacity="0.45">
        <path d="M78 26 V104" />
        <path d="M102 26 V104" />
        <path d="M102 44 H306" />
        <path d="M204 44 V26" />
        <path d="M204 104 v-6" />
      </g>
      <path d="M78 104 H306" stroke="var(--fg-muted)" strokeWidth="2" />
      <text x="306" y="98" textAnchor="end" className="guide-diagram-label">
        baseline
      </text>
      <text x="204" y="16" textAnchor="middle" className="guide-diagram-label">
        net this way
      </text>

      {/* What the phone sees: a narrow wedge along the baseline. */}
      <path d="M34 104 L200 88 L200 122 Z" fill="var(--lime)" fillOpacity="0.08" />
      <path d="M34 104 L200 88 M34 104 L200 122" stroke="var(--lime)" strokeOpacity="0.4" strokeDasharray="3 4" />

      {/* The phone, upright, on the baseline's line. */}
      <rect x="22" y="94" width="13" height="20" rx="3" fill="var(--ink-2)" stroke="var(--fg-muted)" strokeWidth="1.5" />
      <circle cx="31.5" cy="104" r="1.6" fill="var(--fg-muted)" />
      <text x="28" y="130" textAnchor="middle" className="guide-diagram-label">
        phone
      </text>

      {/* You, just behind the baseline, facing the net. */}
      <circle cx="204" cy="110" r="7" fill="var(--lime)" />
      <path d="M204 99 v-9 M200 94 l4 -4 4 4" stroke="var(--lime)" strokeWidth="1.5" fill="none" />
      <text x="222" y="114" className="guide-diagram-label guide-diagram-label--strong">
        you
      </text>

      {/* The distance. */}
      <g stroke="var(--fg-faint)" strokeWidth="1">
        <path d="M34 144 H200" />
        <path d="M34 139 v10 M200 139 v10" />
      </g>
      <text x="117" y="140" textAnchor="middle" className="guide-diagram-label guide-diagram-label--strong">
        4 to 5 m
      </text>
    </svg>
  )
}

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
