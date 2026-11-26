import '../styles/placement.css'
import { PLACEMENT } from '../lib/placement'

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
export default function PlacementDiagram() {
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
