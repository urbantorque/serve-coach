import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Status } from '../lib/analysis/types'
import { GLYPHS, type IconName } from './icons'
import { useBackLayer } from './useBackLayer'

/* ------------------------------------------------------------------ ScoreRing */

/**
 * Counts a displayed number up to its target instead of popping in place.
 *
 * Only runs when `enabled` — the many small rings in a list stay static, the
 * same restraint the ring stroke itself already observes (see `animate` on
 * `ScoreRing`). Mirrors the ring's own ~1s fill so the number settles roughly
 * when the stroke does, rather than finishing early or lagging behind it.
 */
function useCountUp(target: number, enabled: boolean): number {
  // Under reduced motion the first frame is already the final score (N4.6):
  // starting at 0 and jumping in an effect flashed a zero first.
  const moving = enabled && !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [value, setValue] = useState(moving ? 0 : target)
  const from = useRef(moving ? 0 : target)
  const raf = useRef(0)

  useEffect(() => {
    if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      from.current = target
      return
    }
    const start0 = from.current
    const t0 = performance.now()
    const duration = 1000
    cancelAnimationFrame(raf.current)
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      const eased = 1 - (1 - t) ** 3
      const shown = Math.round(start0 + (target - start0) * eased)
      setValue(shown)
      // Kept current every tick, not just at the end — if the target changes
      // mid-animation the next run must start from the number on screen, not
      // jump back to where the interrupted animation began.
      from.current = shown
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)

    /*
     * If the frames never come, land on the number anyway.
     *
     * `requestAnimationFrame` does not fire in a document that is not
     * compositing — a backgrounded tab, an inert or hidden frame, a headless
     * pane. The ring's stroke is plain SVG and draws the real score regardless,
     * so a starved animation leaves the arc showing sixty-eight per cent with a
     * hard zero in the middle of it: the two halves of one number disagreeing,
     * which is worse than either being wrong on its own.
     *
     * Well past the animation's own second, so it only ever catches the case
     * where the frames genuinely did not arrive.
     */
    const bail = setTimeout(() => {
      setValue(target)
      from.current = target
    }, 2500)

    return () => {
      cancelAnimationFrame(raf.current)
      clearTimeout(bail)
    }
  }, [target, enabled])

  return value
}

interface ScoreRingProps {
  score: number
  status: Status
  size?: number
  label?: string
  /** Rings animate on first paint; suppressed for the many small ones. */
  animate?: boolean
}

export function ScoreRing({ score, status, size = 132, label, animate = true }: ScoreRingProps) {
  const stroke = size < 70 ? 5 : 9
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const filled = circumference * (Math.max(0, Math.min(100, score)) / 100)
  const shown = useCountUp(score, animate)

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth={stroke}
        />
        <circle
          className={animate ? 'ring-fill ring-fill--animate' : 'ring-fill'}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`var(--${status})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-inner">
        <span className="ring-score tnum" style={{ fontSize: size * 0.31 }}>
          {shown}
        </span>
        {label && <span className="ring-label">{label}</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ MetricBar */

interface MetricBarProps {
  value: number
  ideal: [number, number]
  range: [number, number]
  status: Status
}

/** A single axis with the target band shaded and a marker at the measurement. */
export function MetricBar({ value, ideal, range, status }: MetricBarProps) {
  const span = range[1] - range[0] || 1
  const pct = (v: number) => ((Math.max(range[0], Math.min(range[1], v)) - range[0]) / span) * 100

  const bandLeft = pct(ideal[0])
  const bandRight = pct(ideal[1])

  return (
    <div className="bar" role="presentation">
      <div className="bar-track" />
      <div
        className="bar-band"
        style={{ left: `${bandLeft}%`, width: `${Math.max(2, bandRight - bandLeft)}%` }}
      />
      <div
        className="bar-marker"
        style={{ left: `${pct(value)}%`, background: `var(--${status})` }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------------ Cue */

/**
 * One line of coaching, with its marked words carried in bold.
 *
 * Copy marks the instruction itself — `**Keep the arm straight**` — and this is
 * the only place those markers are turned into type. A player reading a report
 * between serves scans for the bold and acts on it; the sentence around it is
 * there for the ones who want the reason. Rendered as a fragment so the caller
 * decides what element it lands in, and never with `dangerouslySetInnerHTML`:
 * this is a formatting convention, not a licence to inject markup.
 */
export function Cue({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="cue-key">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/* ---------------------------------------------------------------------- Sheet */

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** How long a closing sheet stays on screen; matches `.is-leaving` in `states.css`. */
const SHEET_EXIT_MS = 200

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Bottom sheet. Closes on Escape or a backdrop tap.
 *
 * Focus is trapped inside while it is open and handed back to whatever opened
 * it on close. `aria-modal` asserts to a screen reader that the rest of the page
 * is unreachable, so a keyboard user must not be able to Tab out behind the
 * overlay and start operating controls they cannot see — the attribute has to
 * be backed by the behaviour, not just declared.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null)
  // The phone's back gesture closes the sheet rather than the app.
  useBackLayer(open, onClose)

  // Reached through a ref so the trap effect depends only on `open`. Every
  // caller passes an inline arrow, and an effect keyed on that identity tears
  // down and re-arms on each parent re-render — yanking focus back to the
  // panel root mid-interaction (delete a serve in the history sheet, and the
  // list refresh stole your place in it).
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      )
      if (!items.length) {
        e.preventDefault()
        panel.current.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      // Returning focus to the trigger is what stops a keyboard user being
      // dumped back at the top of the document every time they close a sheet.
      opener?.focus?.()
    }
  }, [open])

  /*
   * Kept on screen for one short exit after `open` goes false.
   *
   * The sheet slid up on the way in and vanished in a single frame on the way
   * out, which made closing read as something breaking rather than something
   * put away. `leaving` holds the last render for `SHEET_EXIT_MS` under an
   * exit class; the backdrop stops taking taps at once, so nothing behind it
   * waits on the animation. Reduced motion collapses the animation in
   * `tokens.css` and the sheet is simply gone when the timer fires.
   */
  const [leaving, setLeaving] = useState(false)
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      setLeaving(false)
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    setLeaving(true)
    const t = setTimeout(() => setLeaving(false), SHEET_EXIT_MS)
    return () => clearTimeout(t)
  }, [open])

  if (!open && !leaving) return null

  return (
    <div
      className={open ? 'sheet-backdrop' : 'sheet-backdrop is-leaving'}
      onClick={open ? onClose : undefined}
      aria-hidden={open ? undefined : true}
    >
      <div
        className="sheet"
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- Icons */

/** A glyph from `icons.ts`: Phosphor, at one weight, so the set agrees with itself. */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d={GLYPHS[name]} />
    </svg>
  )
}
