import '../styles/placement.css'

/**
 * All of you in the picture, drawn (Mirror M2.2): the phone's picture, upright,
 * with a player at full reach inside it, the racket head and the feet both in,
 * and room around them. For a clip refused because the body wasn't seen: the
 * fix is a picture before it is a sentence. A diagram of the fix, the same
 * tokens as the placement drawn beside it in the guide, never a reading of the
 * player's own clip.
 */
export default function FramingDiagram() {
  return (
    <svg
      className="guide-diagram"
      viewBox="0 0 320 170"
      role="img"
      aria-label="The phone upright, with all of you in the picture: feet at the bottom, racket at full reach at the top."
    >
      {/* The phone's picture, upright. */}
      <rect x="122" y="6" width="76" height="158" rx="10" fill="none" stroke="var(--fg-muted)" strokeWidth="1.5" />

      {/* A player at full reach, the racket above. */}
      <g stroke="var(--lime)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M160 79 V112" />
        <path d="M160 112 L152 146 M160 112 L168 146" />
        <path d="M148 146 h6 M166 146 h6" />
        <path d="M161 82 L166 58 L168 40" />
        <path d="M159 82 L147 68" />
        <ellipse cx="169" cy="28" rx="6" ry="9" strokeWidth="2" />
      </g>
      <circle cx="158" cy="68" r="6" fill="var(--lime)" />

      {/* Both ends inside, with room. */}
      <g stroke="var(--fg-faint)" strokeWidth="1">
        <path d="M106 19 H128" />
        <path d="M106 149 H128" />
      </g>
      <text x="100" y="24" textAnchor="end" className="guide-diagram-label guide-diagram-label--strong">
        racket in
      </text>
      <text x="100" y="154" textAnchor="end" className="guide-diagram-label guide-diagram-label--strong">
        feet in
      </text>
      <text x="212" y="90" className="guide-diagram-label">
        phone upright
      </text>
    </svg>
  )
}
