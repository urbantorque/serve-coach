import {
  ArrowLineRightIcon,
  ArrowLineUpIcon,
  ArrowsHorizontalIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleDashedIcon,
  CompassIcon,
  FilmStripIcon,
  HandPalmIcon,
  MagnifyingGlassPlusIcon,
  PersonSimpleIcon,
  RecordIcon,
  TennisBallIcon,
  WarningCircleIcon,
  XCircleIcon,
  type Icon,
} from '@phosphor-icons/react'
import type { Ref } from 'react'
import type { CheckId, CheckState, LiveCheck } from '../../screens/record/live/framing.ts'
import { cx } from '../cx.ts'

const STATE_WORD: Record<CheckState, string> = {
  pass: 'passed',
  warn: 'passed with a note',
  block: 'needs a fix',
  pending: 'not checked yet',
}

/** Check glyph (DESIGN §8.20): pass CheckCircle ink, warn WarningCircle, block XCircle, pending CircleDashed. */
export function CheckGlyph({ state, size = 22 }: { state: CheckState; size?: number }) {
  const G = state === 'pass' ? CheckCircleIcon : state === 'warn' ? WarningCircleIcon : state === 'block' ? XCircleIcon : CircleDashedIcon
  const tone = state === 'pass' ? 'text-ink' : state === 'pending' ? 'text-ink-3' : 'text-attention'
  return <G size={size} aria-hidden="true" className={cx('shrink-0', tone)} />
}

/** One checklist item: glyph + word (+ value in the landscape rail and the detail sheet). */
export function CheckItem({ check, showValue, className }: { check: LiveCheck; showValue?: boolean; className?: string }) {
  return (
    <li className={cx('flex min-h-[38px] items-center gap-1.5', className)} data-check={check.id} data-state={check.state}>
      <CheckGlyph state={check.state} size={20} />
      <span className="flex min-w-0 flex-col">
        <span className="text-subhead leading-tight text-ink [overflow-wrap:anywhere]">
          {check.label}
          <span className="sr-only">: {STATE_WORD[check.state]}</span>
        </span>
        {showValue ? <span className="text-footnote tabular-nums text-ink-2">{check.value}</span> : null}
      </span>
    </li>
  )
}

export interface ChecklistRailProps {
  checks: LiveCheck[]
  layout: 'portrait' | 'landscape'
  collapsed: boolean
  onToggle: () => void
}

/**
 * Live checklist (DESIGN §10.3 R3): portrait = 3 × 3 rail at the bottom of the preview (glyph +
 * word); landscape = a two-column rail on the right (values are in the capture detail sheet, which
 * keeps the rail inside a 390 px tall screen). Opaque --surface with a 2 px ink edge so it reads in
 * sun. Collapses to one "8 of 9 ready" chip with a 44 px handle.
 */
export function ChecklistRail({ checks, layout, collapsed, onToggle }: ChecklistRailProps) {
  const done = checks.filter((c) => c.state === 'pass' || c.state === 'warn').length
  const summary = `${done} of ${checks.length} ready`
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded="false"
        className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-surface px-4 py-1 text-subhead leading-tight tabular-nums text-ink hover:bg-surface-2"
      >
        {summary}
        <CaretUpIcon size={20} aria-hidden="true" />
      </button>
    )
  }
  return (
    <div className={cx('rounded-card border-2 border-ink bg-surface', layout === 'portrait' ? 'px-2 pt-1 pb-2' : 'w-[276px] px-3 pb-1')}>
      <div className="flex items-center justify-between">
        <p className="text-footnote font-label text-ink-2">Checks</p>
        <button type="button" onClick={onToggle} aria-expanded="true" aria-label="Hide checklist" className="-mr-2 grid size-11 place-items-center rounded-full text-ink hover:bg-surface-2">
          <CaretDownIcon size={20} aria-hidden="true" />
        </button>
      </div>
      {/* Portrait: 3 columns at default text, fewer as the text grows, so names wrap rather than cut off. */}
      <ul aria-label="Framing checks" className={cx('grid gap-x-1', layout === 'portrait' ? 'grid-cols-[repeat(auto-fill,minmax(min(100%,6.5rem),1fr))]' : 'grid-cols-2')}>
        {checks.map((c) => (
          <CheckItem key={c.id} check={c} className={layout === 'landscape' ? 'min-h-[34px]' : undefined} />
        ))}
      </ul>
    </div>
  )
}

const PILL_ICON: Record<CheckId | 'motion' | 'ready' | 'turn', Icon> = {
  level: ArrowsHorizontalIcon,
  'in-frame': PersonSimpleIcon,
  'room-above': ArrowLineUpIcon,
  'room-ahead': ArrowLineRightIcon,
  steady: HandPalmIcon,
  light: WarningCircleIcon,
  ball: TennisBallIcon,
  fps: FilmStripIcon,
  size: MagnifyingGlassPlusIcon,
  motion: CompassIcon,
  ready: CheckIcon,
  turn: ArrowsHorizontalIcon,
}

export interface InstructionPillProps {
  kind: keyof typeof PILL_ICON
  text: string
  detail?: string
}

/**
 * The one instruction (DESIGN §10.3 R3): opaque --surface pill, 2 px ink border, glyph 28 +
 * title-2. Exactly one at a time; a polite live region announces changes.
 */
export function InstructionPill({ kind, text, detail, ref }: InstructionPillProps & { ref?: Ref<HTMLDivElement> }) {
  const G = PILL_ICON[kind]
  return (
    <div ref={ref} tabIndex={-1} className="flex max-w-[270px] flex-col items-center gap-1 rounded-card">
      <p
        role="status"
        aria-live="polite"
        className="inline-flex min-h-13 items-center gap-2 rounded-card border-2 border-ink bg-surface px-4 py-2 text-headline text-ink [text-wrap:balance]"
      >
        <G size={28} aria-hidden="true" className="shrink-0" />
        <span className="font-strong">{text}</span>
      </p>
      {detail ? <p className="rounded-control bg-surface px-3 py-1 text-center text-footnote text-ink [text-wrap:balance]">{detail}</p> : null}
    </div>
  )
}

export interface RecordButtonProps {
  ready: boolean
  /** Under the button: "Ready", "1 fix", "Checking". */
  label: string
  onPress: () => void
  /** stacked: word under the button (upright); inline: word beside it (sideways, DESIGN R3-L). */
  layout?: 'stacked' | 'inline'
}

/** Record (DESIGN §10.3 R3): 72 px circle; Ready = optic fill with an ink edge, otherwise --surface. */
export function RecordButton({ ready, label, onPress, layout = 'stacked' }: RecordButtonProps) {
  return (
    <div className={cx('flex items-center gap-1', layout === 'stacked' ? 'flex-col' : 'flex-row-reverse gap-2')}>
      <button
        type="button"
        onClick={onPress}
        aria-label={ready ? 'Record, ready' : `Record, ${label}`}
        className={cx(
          'grid size-[72px] place-items-center rounded-full border-2 border-ink text-ink transition-transform duration-(--dur-press) active:scale-[0.97] motion-reduce:transition-none',
          ready ? 'bg-optic hover:bg-optic-press' : 'bg-surface hover:bg-surface-2',
        )}
      >
        <RecordIcon size={32} aria-hidden="true" />
      </button>
      <span className={cx('text-footnote font-label text-ink', layout === 'inline' && 'rounded-full bg-surface px-2 py-1')} aria-hidden="true">
        {label}
      </span>
    </div>
  )
}

export interface FramingOverlayProps {
  orientation: 'portrait' | 'landscape'
  /** Detected feet row (0..1), or null for the default guide. */
  feetY: number | null
  tilt: { pitchDeg: number; rollDeg: number } | null
  level: boolean
}

const HALO = 'var(--overlay-halo)'
const GUIDE = 'var(--overlay-line)'

/**
 * Framing guides over the preview (DESIGN §10.3 R3, CAPTURE Diagram C): toss room at the top, the
 * stand-here band, the baseline guide, the feet line and the level guide (horizon rotating with
 * roll, centre dot moving with pitch; solid with the word "Level" within 2°). White at 60% with the
 * dark halo (§2.7). Guides are not data, so they may be dashed.
 */
export function FramingOverlay({ orientation, feetY, tilt, level }: FramingOverlayProps) {
  const portrait = orientation === 'portrait'
  const tossBand = 0.2
  const band = portrait ? [0.3, 0.7] : [0.35, 0.6]
  const feet = feetY ?? (portrait ? 0.68 : 0.8)
  const roll = tilt?.rollDeg ?? 0
  const dotY = 0.5 - Math.max(-0.12, Math.min(0.12, (tilt?.pitchDeg ?? 0) * 0.012))
  const line = (props: React.SVGProps<SVGLineElement>) => (
    <>
      <line {...props} stroke={HALO} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeDasharray={props.strokeDasharray} />
      <line {...props} stroke={GUIDE} strokeOpacity={0.85} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </>
  )
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x={0} y={0} width={100} height={tossBand * 100} fill={GUIDE} fillOpacity={0.12} />
        {line({ x1: band[0] * 100, x2: band[0] * 100, y1: tossBand * 100, y2: feet * 100, strokeDasharray: '6 6' })}
        {line({ x1: band[1] * 100, x2: band[1] * 100, y1: tossBand * 100, y2: feet * 100, strokeDasharray: '6 6' })}
        {line({ x1: 50, x2: 50, y1: 50, y2: 100, strokeDasharray: '2 6' })}
        {line({ x1: 0, x2: 100, y1: feet * 100, y2: feet * 100, strokeDasharray: '8 6' })}
        <g transform={`rotate(${-roll} 50 50)`}>{line({ x1: 12, x2: 88, y1: 50, y2: 50, strokeDasharray: level ? undefined : '10 6' })}</g>
      </svg>
      {/* The centre dot stays round whatever the preview's aspect. */}
      <span
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        style={{ left: '50%', top: `${dotY * 100}%`, borderColor: GUIDE, background: level ? GUIDE : 'transparent', boxShadow: `0 0 0 2px ${HALO}` }}
      />
      <span className="absolute left-3 text-footnote font-label" style={{ top: `calc(${tossBand * 100}% + 0.25rem)`, color: GUIDE, textShadow: `0 0 3px ${HALO}` }}>
        Toss room above
      </span>
      <span className="absolute left-3 text-footnote font-label" style={{ top: `calc(${feet * 100}% + 0.25rem)`, color: GUIDE, textShadow: `0 0 3px ${HALO}` }}>
        {feetY === null ? 'Feet about here' : 'Feet here'}
      </span>
      {level ? (
        <span className="absolute right-3 text-footnote font-label" style={{ top: 'calc(50% + 0.4rem)', color: GUIDE, textShadow: `0 0 3px ${HALO}` }}>
          Level
        </span>
      ) : null}
    </div>
  )
}

export interface SpotStateViewProps {
  kind: 'ready' | 'change' | 'toss'
  word: string
  line: string
  orientation: 'portrait' | 'landscape'
  onDismiss: () => void
}

/**
 * Serving-spot state (DESIGN §10.3 R4): full bleed, readable from 6 to 10 m. Ready = optic field +
 * CheckIcon + "Ready"; a change = near-white field + HandPalmIcon + one word. Field, glyph, word and
 * sound all differ, so no single channel carries the meaning. Tap to return to the preview.
 */
export function SpotStateView({ kind, word, line, orientation, onDismiss }: SpotStateViewProps) {
  const G = kind === 'ready' ? CheckIcon : kind === 'toss' ? TennisBallIcon : HandPalmIcon
  const portrait = orientation === 'portrait'
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={`${word}. ${line}. Tap to see the camera.`}
      className={cx(
        'absolute inset-0 z-(--z-camera) flex items-center justify-center gap-6 px-8 text-ink',
        portrait ? 'flex-col' : 'flex-row',
        kind === 'ready' ? 'bg-optic' : 'bg-surface',
      )}
    >
      <G aria-hidden="true" className={portrait ? 'size-[min(55vw,214px)]' : 'size-[min(55vh,214px)]'} />
      <span className={cx('flex flex-col gap-3', portrait ? 'items-center text-center' : 'items-start text-left')}>
        <span className="font-wide leading-none font-strong" style={{ fontSize: portrait ? 'min(23vw, 92px)' : 'min(18vw, 150px)' }}>
          {word}
        </span>
        <span className="max-w-[20ch] text-[34px] leading-tight font-label">{line}</span>
      </span>
    </button>
  )
}
