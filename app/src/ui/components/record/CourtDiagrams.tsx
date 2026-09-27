import { DeviceMobileCameraIcon, SunIcon } from '@phosphor-icons/react'
import { useId, type ReactNode } from 'react'
import { cx } from '../cx.ts'

/**
 * Set-up diagrams (DESIGN §9.10, CAPTURE §4 Diagrams A, B and D), drawn to scale in metres with the
 * chart tokens: court --surface-2, lines --ink-2 (--ink in Court-side), field of view --good at 12%
 * with --good edges, dimension lines --ink-3 with end ticks, the phone as DeviceMobileCameraIcon
 * (upright for the default set-up, turned 90° at the fence), the sun as SunIcon in --attention.
 * Distances are measured from the centre mark (D1). These are data drawings, not icons. Label sizes
 * are in drawing units so Court-side's larger captions never push text off a scaled drawing.
 */

export type SetupVariant = 'portrait' | 'fence'

/** ITF court (metres). */
const COURT = { halfDoubles: 5.485, halfSingles: 4.115, serviceFromBaseline: 5.485, baselineToNet: 11.885 }
const DEG = Math.PI / 180

/** Portrait (upright) and landscape horizontal half-angles for the 1x lens (CAPTURE §2.2, §4). */
const HALF_ANGLE = { portrait: 20.5, fence: 34 }
const PHONE_X = { portrait: 7.5, fence: 9 }

function frame(width: number, x0: number, x1: number, y0: number, y1: number) {
  const k = width / (x1 - x0)
  const height = Math.round((y1 - y0) * k)
  return { k, height, px: (x: number) => (x - x0) * k, py: (y: number) => height - (y - y0) * k }
}

const LINE = 'stroke-ink-2 court:stroke-ink'
const DIM = 'stroke-ink-3'
const LABEL = 'fill-ink-2 font-label court:fill-ink'

function Label({ x, y, size, anchor = 'start', children }: { x: number; y: number; size: number; anchor?: 'start' | 'middle' | 'end'; children: ReactNode }) {
  return (
    // A surface-coloured halo keeps labels readable where they cross a line.
    <text x={x} y={y} textAnchor={anchor} className={cx(LABEL, 'stroke-surface')} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke" style={{ fontSize: size }}>
      {children}
    </text>
  )
}

function Figure({ title, desc, width, height, children, className }: { title: string; desc: string; width: number; height: number; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-labelledby={`${id}-t ${id}-d`}
      className={cx('block h-auto max-w-full', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      {children}
    </svg>
  )
}

/** Horizontal dimension line with 6 px end ticks. */
function DimH({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g className={DIM} strokeWidth={1}>
      <line x1={x1} x2={x2} y1={y} y2={y} />
      <line x1={x1} x2={x1} y1={y - 3} y2={y + 3} />
      <line x1={x2} x2={x2} y1={y - 3} y2={y + 3} />
    </g>
  )
}

function Phone({ cx: x, cy: y, size, turned }: { cx: number; cy: number; size: number; turned: boolean }) {
  return (
    <g transform={`translate(${x} ${y})${turned ? ' rotate(90)' : ''}`} className="text-ink">
      <circle r={size * 0.62} className="fill-surface" />
      <DeviceMobileCameraIcon x={-size / 2} y={-size / 2} size={size} aria-hidden="true" />
    </g>
  )
}

export interface PlanDiagramProps {
  variant: SetupVariant
  /** mini: the set-up choice card; full: the set-up guide. */
  size?: 'mini' | 'full'
  handedness?: 'right' | 'left'
  className?: string
}

/**
 * Diagram A, plan view (top-down): the near half of the court, you just behind the baseline right of
 * the centre mark, the phone on the baseline extension on your hitting-arm side, its field of view
 * along the baseline, and the distance from the centre mark.
 */
export function PlanDiagram({ variant, size = 'full', handedness = 'right', className }: PlanDiagramProps) {
  const mini = size === 'mini'
  const s = handedness === 'left' ? -1 : 1
  const W = mini ? 200 : 340
  const fs = mini ? 11 : 12
  // Visible window in court metres (x across, y towards the net), mirrored for left-handers.
  const [xa, xb] = s > 0 ? [-6.2, 10.8] : [-10.8, 6.2]
  const yTop = mini ? 6.2 : 7.4
  const f = frame(W, xa, xb, mini ? -3.1 : -3.6, yTop)
  const { px, py, k } = f
  const X = (x: number) => px(s * x)
  const phoneX = PHONE_X[variant]
  const half = HALF_ANGLE[variant] * DEG
  const reach = phoneX + 5.4
  const wedge = [
    [X(phoneX), py(0)],
    [X(phoneX - reach), py(reach * Math.tan(half))],
    [X(phoneX - reach), py(-reach * Math.tan(half))],
  ]
    .map((p) => p.join(','))
    .join(' ')
  const lw = mini ? 1.5 : 2
  const dimY = py(mini ? -1.7 : -2.1)
  const title = variant === 'portrait' ? 'Upright beside the court: plan view' : 'Sideways at the fence: plan view'
  const desc =
    variant === 'portrait'
      ? 'Top-down tennis court. You serve from just behind the baseline near the centre. The phone stands upright outside the court on your hitting-arm side, in line with the baseline, 7 to 8 metres from the centre mark, facing along the baseline at you, with the sun behind it.'
      : 'Top-down tennis court. You serve from just behind the baseline near the centre. The phone is clipped sideways to the side fence on your hitting-arm side, in line with the baseline, 8.5 to 9.5 metres from the centre mark, facing along the baseline at you.'
  const clipId = useId()
  const distance = variant === 'portrait' ? '7 to 8 m' : '8.5 to 9.5 m'
  const courtLeft = Math.min(X(-COURT.halfDoubles), X(COURT.halfDoubles))
  return (
    <Figure title={title} desc={desc} width={W} height={f.height} className={className}>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={W} height={f.height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* Court surface and lines (near half; the far half runs off the top). */}
        <rect x={courtLeft} y={py(yTop)} width={2 * COURT.halfDoubles * k} height={py(0) - py(yTop)} className="fill-surface-2" />
        <g className={LINE} strokeWidth={lw} fill="none" strokeLinecap="square">
          <line x1={X(-COURT.halfDoubles)} x2={X(COURT.halfDoubles)} y1={py(0)} y2={py(0)} />
          {[-COURT.halfDoubles, -COURT.halfSingles, COURT.halfSingles, COURT.halfDoubles].map((x) => (
            <line key={x} x1={X(x)} x2={X(x)} y1={py(0)} y2={py(yTop)} />
          ))}
          <line x1={X(-COURT.halfSingles)} x2={X(COURT.halfSingles)} y1={py(COURT.serviceFromBaseline)} y2={py(COURT.serviceFromBaseline)} />
          <line x1={X(0)} x2={X(0)} y1={py(COURT.serviceFromBaseline)} y2={py(yTop)} />
          <line x1={X(0)} x2={X(0)} y1={py(0)} y2={py(0.3)} />
        </g>
        {variant === 'fence' ? <line x1={X(9.15)} x2={X(9.15)} y1={0} y2={f.height} className={DIM} strokeWidth={1.5} strokeDasharray="4 4" /> : null}
        {/* Field of view along the baseline: the baseline runs down its middle. */}
        <polygon points={wedge} className="fill-good stroke-good" fillOpacity={0.12} strokeWidth={1} />
        {/* You: head and a shoulder bar, side-on (shoulder line towards the net). */}
        <rect
          x={X(0.6) - (mini ? 2 : 3)}
          y={py(-0.25) - (mini ? 10 : 14)}
          width={mini ? 4 : 6}
          height={mini ? 20 : 28}
          rx={mini ? 2 : 3}
          className="fill-ink"
        />
        <circle cx={X(0.6)} cy={py(-0.25)} r={mini ? 5 : 7} className="fill-ink stroke-surface" strokeWidth={1.5} />
        {/* Sun behind the phone. */}
        <g className="text-attention">
          <SunIcon x={X(phoneX + 1.35) - (mini ? 8 : 10)} y={py(0) - (mini ? 8 : 10)} size={mini ? 16 : 20} aria-hidden="true" />
        </g>
        <Phone cx={X(phoneX)} cy={py(0)} size={mini ? 20 : 24} turned={variant === 'fence'} />
        {/* Distance from the centre mark (D1). */}
        <DimH x1={Math.min(X(0), X(phoneX))} x2={Math.max(X(0), X(phoneX))} y={dimY} />
        <Label x={(X(0) + X(phoneX)) / 2} y={dimY + fs + 3} size={fs} anchor="middle">
          {mini ? distance : `${distance} from the centre mark`}
        </Label>
        {!mini ? (
          <>
            <Label x={X(0.6)} y={py(-0.25) + 30} size={fs} anchor="middle">
              You
            </Label>
            <Label x={X(-2.35)} y={py(yTop) + 16} size={fs} anchor="middle">
              Net this way
            </Label>
            <Label x={s > 0 ? courtLeft + 6 : courtLeft + 2 * COURT.halfDoubles * k - 6} y={py(0) - 6} size={fs} anchor={s > 0 ? 'start' : 'end'}>
              Baseline
            </Label>
            <Label x={X(phoneX + 1.35)} y={py(0) - 16} size={fs} anchor="middle">
              Sun
            </Label>
            {variant === 'fence' ? (
              <Label x={X(9.15) + (s > 0 ? -6 : 6)} y={py(yTop) + 16} size={fs} anchor={s > 0 ? 'end' : 'start'}>
                Side fence
              </Label>
            ) : null}
          </>
        ) : null}
      </g>
    </Figure>
  )
}

/**
 * Diagram B, side elevation (what the camera sees): the phone at chest height, its field of view
 * reaching the plane you serve in, the framing rule (top of the picture 4.5 m or more above the court
 * at you) and your toss.
 */
export function SideDiagram({ variant, className }: { variant: SetupVariant; className?: string }) {
  const upright = variant === 'portrait'
  const f = frame(340, -1.6, upright ? 9.6 : 10.8, -1.0, upright ? 6.8 : 5.8)
  const { px, py } = f
  const fs = 12
  const phoneH = upright ? 1.45 : 1.6
  const serverX = upright ? 6.75 : 8.25
  const halfV = (upright ? 33.65 : 20.55) * DEG
  const edge = serverX + 1.2
  const top = phoneH + serverX * Math.tan(halfV)
  const groundHit = phoneH / Math.tan(halfV)
  const dots: [number, number][] = []
  // Toss: release 1.7 m, peak 3.5 m, contact 2.6 m, drawn as 4 px dots (a diagram, not data).
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    const y = t <= 0.6 ? 1.7 + (3.5 - 1.7) * Math.sin((t / 0.6) * (Math.PI / 2)) : 3.5 - (3.5 - 2.6) * ((t - 0.6) / 0.4) ** 2
    dots.push([serverX + 0.2 + 0.3 * t, y])
  }
  const title = upright ? 'Upright beside the court: side view' : 'Sideways at the fence: side view'
  const desc = upright
    ? 'Side view of you serving. The upright phone at chest height sees from the court up to about 6 metres above it at your spot, well above even a very high toss.'
    : 'Side view of you serving. The sideways phone at the fence sees up to about 4.7 metres above the court at your spot. A measured tilt of up to 5 degrees adds room and is taken out in software.'
  const upper = phoneH + edge * Math.tan(halfV)
  const lowerX = Math.min(edge, groundHit)
  return (
    <Figure title={title} desc={desc} width={340} height={f.height} className={className}>
      {/* Field of view, and the room above your toss at your plane (4.5 m to the top of the picture). */}
      <polygon
        points={[
          [px(0), py(phoneH)],
          [px(edge), py(upper)],
          [px(edge), py(0)],
          [px(lowerX), py(0)],
        ]
          .map((p) => p.join(','))
          .join(' ')}
        className="fill-good"
        fillOpacity={0.07}
      />
      {top > 4.5 ? <rect x={px(serverX - 0.7)} y={py(top)} width={px(serverX + 0.7) - px(serverX - 0.7)} height={py(4.5) - py(top)} className="fill-good" fillOpacity={0.2} /> : null}
      <line x1={px(0)} y1={py(phoneH)} x2={px(edge)} y2={py(upper)} className="stroke-good" strokeWidth={1.25} />
      <line x1={px(0)} y1={py(phoneH)} x2={px(lowerX)} y2={py(Math.max(0, phoneH - lowerX * Math.tan(halfV)))} className="stroke-good" strokeWidth={1.25} />
      {/* The framing rule. */}
      <line x1={px(0.5)} x2={px(edge)} y1={py(4.5)} y2={py(4.5)} className={DIM} strokeWidth={1} strokeDasharray="4 3" />
      <Label x={px(0.5)} y={py(4.5) - 6} size={fs}>
        Top of the picture: 4.5 m or more at you
      </Label>
      <Label x={px(serverX) + 12} y={py(top) - 6} size={fs} anchor="end">
        {upright ? 'About 6 m' : 'About 4.7 m'}
      </Label>
      {/* Ground. */}
      <line x1={0} x2={340} y1={py(0)} y2={py(0)} className={LINE} strokeWidth={2} />
      {/* You: a standing figure 1.75 m tall. */}
      <line x1={px(serverX)} x2={px(serverX)} y1={py(0)} y2={py(1.45)} className="stroke-ink" strokeWidth={5} strokeLinecap="round" />
      <circle cx={px(serverX)} cy={py(1.62)} r={6} className="fill-ink" />
      {dots.map(([x, y], i) => (
        <circle key={i} cx={px(x)} cy={py(y)} r={2} className="fill-good" />
      ))}
      <Label x={px(serverX) - 8} y={py(3.5) + 4} size={fs} anchor="end">
        Toss peak
      </Label>
      <Label x={px(serverX)} y={py(0) + 16} size={fs} anchor="middle">
        You
      </Label>
      <Phone cx={px(0)} cy={py(phoneH)} size={22} turned={!upright} />
      <Label x={4} y={py(0) + 16} size={fs}>
        {upright ? '1.3 to 1.6 m high, level' : '1.4 to 1.8 m high'}
      </Label>
    </Figure>
  )
}

/**
 * Diagram D (optional second angle): the phone high on the back fence behind you, seeing both far
 * service boxes over the net.
 */
export function RearDiagram({ className }: { className?: string }) {
  const f = frame(300, -7.2, 7.2, -7.4, 24.2)
  const { px, py, k } = f
  const H = COURT.baselineToNet
  const phone: [number, number] = [0.2, -6]
  const half = 34 * DEG
  const reach = 32
  const wedge = [
    [px(phone[0]), py(phone[1])],
    [px(phone[0] - reach * Math.sin(half)), py(phone[1] + reach * Math.cos(half))],
    [px(phone[0] + reach * Math.sin(half)), py(phone[1] + reach * Math.cos(half))],
  ]
    .map((p) => p.join(','))
    .join(' ')
  const clipId = useId()
  return (
    <Figure
      title="View from behind: plan view"
      desc="Top-down court. A second phone is clipped high on the back fence, 5 to 7 metres behind where you serve, tilted down a little, so both far service boxes are in the picture over the net."
      width={300}
      height={f.height}
      className={className}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={300} height={f.height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={px(-COURT.halfDoubles)} y={py(2 * H)} width={2 * COURT.halfDoubles * k} height={py(0) - py(2 * H)} className="fill-surface-2" />
        {/* Far service boxes, lightly shaded: where the view from behind sees the ball land. */}
        <rect
          x={px(-COURT.halfSingles)}
          y={py(2 * H - COURT.serviceFromBaseline)}
          width={2 * COURT.halfSingles * k}
          height={(H - COURT.serviceFromBaseline) * k}
          className="fill-good"
          fillOpacity={0.18}
        />
        <g className={LINE} strokeWidth={1.5} fill="none">
          {[0, 2 * H].map((y) => (
            <line key={y} x1={px(-COURT.halfDoubles)} x2={px(COURT.halfDoubles)} y1={py(y)} y2={py(y)} />
          ))}
          {[-COURT.halfDoubles, -COURT.halfSingles, COURT.halfSingles, COURT.halfDoubles].map((x) => (
            <line key={x} x1={px(x)} x2={px(x)} y1={py(0)} y2={py(2 * H)} />
          ))}
          {[COURT.serviceFromBaseline, 2 * H - COURT.serviceFromBaseline].map((y) => (
            <line key={y} x1={px(-COURT.halfSingles)} x2={px(COURT.halfSingles)} y1={py(y)} y2={py(y)} />
          ))}
          <line x1={px(0)} x2={px(0)} y1={py(COURT.serviceFromBaseline)} y2={py(2 * H - COURT.serviceFromBaseline)} />
        </g>
        <line x1={px(-COURT.halfDoubles - 0.9)} x2={px(COURT.halfDoubles + 0.9)} y1={py(H)} y2={py(H)} className="stroke-ink" strokeWidth={3} />
        <polygon points={wedge} className="fill-good stroke-good" fillOpacity={0.08} strokeWidth={1} />
        <circle cx={px(0.6)} cy={py(-0.25)} r={6} className="fill-ink" />
        <Label x={px(0.6) + 10} y={py(-0.25) + 4} size={12}>
          You
        </Label>
        <Phone cx={px(phone[0])} cy={py(phone[1])} size={22} turned />
        <Label x={px(phone[0]) + 18} y={py(phone[1]) + 4} size={12}>
          Back fence, 2.5 to 3.3 m high
        </Label>
        <Label x={px(COURT.halfDoubles) - 4} y={py(H) - 6} size={12} anchor="end">
          Net
        </Label>
      </g>
    </Figure>
  )
}
