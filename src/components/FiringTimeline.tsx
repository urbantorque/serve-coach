import type { ChainTiming, FiringOrder } from '../lib/analysis/diagnose'
import { cue } from '../lib/analysis/voice'

/*
 * When each part of the body peaked, against contact (D3.8).
 *
 * One series of moments on one time axis, so no legend: each mark is labelled
 * where it sits. The legs, the elbow and the hand are the three the order is
 * checked on and wear the ordinary ink; the trunk is drawn faint and said to be
 * unchecked, because its peak is read from inferred depth — see `FiringOrder`.
 */

const W = 320
const H = 104
const PAD = 14
const AXIS = 58
/** Label rows, nearest the axis first, alternating above and below it. */
const ROWS = [-12, 20, -26, 34]
/** Labels closer than this share no row. */
const LABEL_GAP = 34

type Link = { id: 'legs' | 'shoulders' | 'elbow' | 'wrist'; label: string; checked: boolean }
const LINKS: Link[] = [
  { id: 'legs', label: 'Legs', checked: true },
  { id: 'shoulders', label: 'Trunk', checked: false },
  { id: 'elbow', label: 'Elbow', checked: true },
  { id: 'wrist', label: 'Hand', checked: true },
]

function firingLine(order: FiringOrder): string {
  if (order.inOrder) return cue('Legs, then elbow, then hand: the order that hands the speed up to the racket.')
  // Each with the one move that answers it, not only what happened (L1.5).
  if (order.late === 'legs') return cue('Your elbow got going before your legs finished pushing up. Let the legs start the swing.')
  return cue('Your hand whipped through before your elbow led. Lead up with the elbow and let the hand follow.')
}

export default function FiringTimeline({ chain, order }: { chain: ChainTiming; order: FiringOrder }) {
  const points = LINKS.flatMap((l) => {
    const ms = chain[l.id].ms
    return ms === null ? [] : [{ ...l, ms }]
  })
  const lo = Math.min(-250, ...points.map((p) => p.ms)) - 20
  const hi = Math.max(40, ...points.map((p) => p.ms)) + 20
  const x = (ms: number) => PAD + ((ms - lo) / (hi - lo)) * (W - 2 * PAD)
  // Each label takes the nearest row with nothing else close in it, in time
  // order — the trunk, the elbow and the hand usually peak within 20 ms of each
  // other, and a fixed alternation printed two of them over one another.
  const used: { x: number; row: number }[] = []
  const placed = [...points]
    .sort((a, b) => a.ms - b.ms)
    .map((p) => {
      const at = x(p.ms)
      const row = ROWS.find((r) => !used.some((u) => u.row === r && Math.abs(u.x - at) < LABEL_GAP)) ?? ROWS[0]
      used.push({ x: at, row })
      return { ...p, row }
    })

  return (
    <figure className="chart firing">
      <svg
        className="chart-svg firing-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`When each part peaked: ${points
          .map((p) => `${p.label} ${Math.abs(p.ms)} ms ${p.ms <= 0 ? 'before' : 'after'} contact`)
          .join(', ')}`}
      >
        <line x1={PAD} x2={W - PAD} y1={AXIS} y2={AXIS} stroke="var(--hairline)" strokeWidth="1" />
        <line x1={x(0)} x2={x(0)} y1={16} y2={AXIS + 6} stroke="var(--fg-faint)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={x(0)} y={11} className="chart-axis" textAnchor="middle">
          contact
        </text>
        {placed.map((p) => (
          <g key={p.id} opacity={p.checked ? 1 : 0.55}>
            <circle cx={x(p.ms)} cy={AXIS} r="5" fill={p.checked ? 'var(--fg)' : 'none'} stroke="var(--fg-muted)" strokeWidth="2" />
            <text
              x={x(p.ms)}
              y={AXIS + p.row}
              className="firing-label"
              textAnchor="middle"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="chart-readout">
        <span>{firingLine(order)}</span>
      </figcaption>
      <p className="chart-hint firing-note">I show the trunk without checking it, because one camera can’t see its turn clearly.</p>
    </figure>
  )
}
