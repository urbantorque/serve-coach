import { useMemo, useRef, useState } from 'react'
import type { TossMap as TossMapData, TossMapPoint } from '../lib/tossMap'
import { OUTCOME_LABEL } from '../lib/serveTagCopy'
import { placeLine, targetLine } from '../lib/tossPlaceCopy'

/*
 * Every serve's toss in a basket, along the one axis this camera reads (D6.3).
 *
 * A strip, front foot at the zero tick, one mark per serve. Identity is never
 * colour alone: the marks differ in shape as well — a dot for in, a diamond for
 * a miss, an empty ring for a serve nobody tagged — and the legend and the list
 * under the strip say the same in words. The two colours are the app's own
 * (`--great`, `--work`): every token this skin has sits above the dataviz
 * lightness band, so they fail that one check by construction, and pass
 * colour-blind separation (ΔE 9.3) and contrast; adding tokens to pass it would
 * be a re-skin.
 */

const W = 320
const H = 76
const PAD = 18
const BASE = 36
const R = 6

const MISS = new Set(['long', 'net', 'wide'])


function Mark({ p, x, y, on }: { p: TossMapPoint; x: number; y: number; on: boolean }) {
  const r = on || p.current ? R + 1.5 : R
  if (!p.outcome) {
    return <circle cx={x} cy={y} r={r - 1} fill="var(--ink-1)" stroke="var(--fg-faint)" strokeWidth="2" />
  }
  if (MISS.has(p.outcome)) {
    const s = r * 1.2
    return (
      <path
        d={`M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z`}
        fill="var(--work)"
        stroke="var(--ink-1)"
        strokeWidth="2"
      />
    )
  }
  return <circle cx={x} cy={y} r={r} fill="var(--great)" stroke="var(--ink-1)" strokeWidth="2" />
}

export default function TossMap({ map }: { map: TossMapData }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number>()

  const geom = useMemo(() => {
    const values = map.points.map((p) => p.value)
    // Always show the foot and the target, and a little either side of the tosses.
    const lo = Math.min(0, map.target[0], ...values) - 0.12
    const hi = Math.max(0, map.target[1], ...values) + 0.05
    const x = (v: number) => PAD + ((v - lo) / (hi - lo)) * (W - 2 * PAD)
    // Stack serves that would sit on top of each other, so every one shows.
    const placed: { p: TossMapPoint; cx: number; cy: number }[] = []
    for (const p of [...map.points].sort((a, b) => a.value - b.value)) {
      const cx = x(p.value)
      const level = placed.filter((q) => Math.abs(q.cx - cx) < R * 2.2).length
      placed.push({ p, cx, cy: BASE - level * (R * 2.2) })
    }
    return { x, placed }
  }, [map])

  const track = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const at = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    geom.placed.forEach((q, i) => {
      if (Math.abs(q.cx - at) < Math.abs(geom.placed[best].cx - at)) best = i
    })
    setHover(best)
  }

  const active = hover !== undefined ? geom.placed[hover]?.p : undefined
  const ends = map.axis === 'ahead' ? ['Behind', 'In front'] : ['Tossing side', 'Hitting side']
  const tagged = map.points.some((p) => p.outcome)
  // An end label that would run into the foot's is left off: the foot's own
  // label already says where the strip turns over.
  const roomy = (x: number) => Math.abs(x - geom.x(0)) > 64

  return (
    <figure className="chart toss-map">
      <svg
        ref={svgRef}
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Where ${map.points.length} tosses peaked against your front foot`}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={() => setHover(undefined)}
      >
        {/* Where to aim (L4.7): dashed, as every target in the app is, and
            under the marks so each toss still reads on top of it. */}
        <rect
          className="toss-map-target"
          x={geom.x(map.target[0])}
          y={6}
          width={geom.x(map.target[1]) - geom.x(map.target[0])}
          height={BASE + R + 6 - 6}
          rx="4"
        />
        <line x1={PAD} x2={W - PAD} y1={BASE + R + 6} y2={BASE + R + 6} stroke="var(--hairline)" strokeWidth="1" />
        <line
          x1={geom.x(0)}
          x2={geom.x(0)}
          y1={BASE + R + 2}
          y2={BASE + R + 10}
          stroke="var(--fg-faint)"
          strokeWidth="1"
        />
        <text x={geom.x(0)} y={H - 4} className="chart-axis" textAnchor="middle">
          front foot
        </text>
        {roomy(PAD) && (
          <text x={PAD} y={H - 4} className="chart-axis">
            {ends[0]}
          </text>
        )}
        {roomy(W - PAD) && (
          <text x={W - PAD} y={H - 4} className="chart-axis" textAnchor="end">
            {ends[1]}
          </text>
        )}
        {geom.placed.map((q, i) => (
          <g key={q.p.serve}>
            <title>{`Serve ${q.p.serve}: ${placeLine(map.axis, q.p.value)}`}</title>
            <Mark p={q.p} x={q.cx} y={q.cy} on={i === hover} />
          </g>
        ))}
      </svg>

      <figcaption className="chart-readout">
        {active ? (
          <>
            <strong className="tnum">Serve {active.serve}</strong>
            <span>
              {placeLine(map.axis, active.value)}
              {active.outcome ? `, ${OUTCOME_LABEL[active.outcome].toLowerCase()}` : ''}
              {active.from === 'hand' ? ', from where your hand let go' : ''}
            </span>
          </>
        ) : (
          <span className="chart-hint">Touch the strip to see any serve</span>
        )}
      </figcaption>

      <p className="toss-map-aim">{targetLine(map.axis, map.target, map.inTarget, map.points.length)}</p>

      {/* The strip as a list, for anyone not looking at it. */}
      <ol className="sr-only">
        {map.points.map((p) => (
          <li key={p.serve}>
            Serve {p.serve}: {placeLine(map.axis, p.value)}
            {p.outcome ? `, ${OUTCOME_LABEL[p.outcome].toLowerCase()}` : ''}.
          </li>
        ))}
      </ol>

      <ul className="toss-map-legend">
        <li>
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="var(--great)" />
          </svg>
          In
        </li>
        <li>
          <svg width="14" height="14" aria-hidden="true">
            <path d="M7 1 L13 7 L7 13 L1 7 Z" fill="var(--work)" />
          </svg>
          Long, net or wide
        </li>
        <li>
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="var(--fg-faint)" strokeWidth="2" />
          </svg>
          {tagged ? 'Not marked' : 'Mark a serve as in or out to colour it'}
        </li>
      </ul>
    </figure>
  )
}
