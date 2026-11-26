import '../styles/placement.css'
import { SESSION_SAMPLE, sampleServes } from '../lib/session/plan'

/**
 * A practice video, before it is checked, as a strip of its serves (Mirror
 * M2.3): about one every twelve seconds, as the screen's own sentence guesses,
 * with the ones a sample checks marked in lime by the same `sampleServes` that
 * picks them, and "every serve" as the whole strip. A picture of the plan, not
 * a reading: no serve has been found yet, and the words beside it say "about".
 */
export default function PlanStrip({ serves }: { serves: number }) {
  const n = Math.max(1, Math.round(serves))
  const picked = new Set(sampleServes(n))
  const x = (i: number) => 14 + ((i + 0.5) * 292) / n
  const third = (k: number) => 14 + (292 * k) / 3
  const size = Math.min(n, SESSION_SAMPLE)
  return (
    <svg
      className="guide-diagram plan-strip"
      viewBox="0 0 320 76"
      role="img"
      aria-label={`Your video as about ${n} serves in a row: a sample checks ${size}, spread over the start, middle and end. Every serve checks them all.`}
    >
      <text x="14" y="14" className="guide-diagram-label guide-diagram-label--strong">
        the {size} a sample checks
      </text>
      <path d="M14 38 H306" stroke="var(--hairline)" strokeWidth="1" />
      <g stroke="var(--fg-faint)" strokeWidth="1" strokeDasharray="2 3">
        <path d={`M${third(1)} 22 V54`} />
        <path d={`M${third(2)} 22 V54`} />
      </g>
      {Array.from({ length: n }, (_, i) =>
        picked.has(i) ? (
          <path key={i} d={`M${x(i)} 26 V50`} stroke="var(--lime)" strokeWidth="3" strokeLinecap="round" />
        ) : (
          <path key={i} d={`M${x(i)} 32 V44`} stroke="var(--fg-faint)" strokeWidth="1.5" strokeLinecap="round" />
        ),
      )}
      {['start', 'middle', 'end'].map((w, k) => (
        <text key={w} x={third(k) + 292 / 6} y="70" textAnchor="middle" className="guide-diagram-label">
          {w}
        </text>
      ))}
    </svg>
  )
}
