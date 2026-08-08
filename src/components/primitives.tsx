import { useEffect, useRef, useState, type ReactNode } from 'react'
import { readoutOf } from '../lib/analysis/anatomy'
import type { Status } from '../lib/analysis/types'

/* ------------------------------------------------------------------ ScoreRing */

/**
 * Counts a displayed number up to its target instead of popping in place.
 *
 * Only runs when `enabled` — the many small meters in a list stay static, the
 * same restraint the bar itself already observes (see `animate` on
 * `ScoreRing`). The bar is drawn from this number rather than from the score,
 * so the two halves of one reading can never sit on screen disagreeing about
 * what the score is.
 */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target)
  const from = useRef(enabled ? 0 : target)
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
     * pane. Without this the meter would sit at a hard zero for as long as that
     * lasted, and a score of nought is a claim about the serve, not an absence
     * of one.
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
  /** Meters animate on first paint; suppressed for the many small ones. */
  animate?: boolean
}

/**
 * A score, said as a number over a segmented ramp.
 *
 * Was a circular gauge, which spent its whole middle on a numeral it had then
 * shrunk to fit inside itself, and drew the one curve left in a squared system.
 * Flattened out, the number gets the room and the bar says where on the ramp it
 * lands. Kept as one component at every size because a report and a history row
 * must not disagree about what sixty-eight looks like: the small ones simply
 * carry fewer segments, since four blocks read at 42px wide and ten do not.
 */
export function ScoreRing({ score, status, size = 132, label, animate = true }: ScoreRingProps) {
  const shown = useCountUp(score, animate)
  const pct = Math.max(0, Math.min(100, shown))

  const hero = size >= 120
  const segments = hero ? 10 : size >= 70 ? 6 : 4
  const barHeight = hero ? 16 : size >= 70 ? 14 : 12
  const per = 100 / segments

  return (
    <div
      className={[
        'score-meter',
        hero ? 'score-meter--hero' : '',
        // Only while the number is still moving. Once it lands the transition
        // goes back on, so a later change to the score slides instead of
        // snapping.
        shown !== score ? 'score-meter--counting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: size }}
    >
      <span
        className="score-meter-value tnum"
        style={hero ? undefined : { fontSize: Math.round(size * 0.46) }}
      >
        {shown}
      </span>
      <div className="score-meter-bar" style={{ height: barHeight }} aria-hidden="true">
        {Array.from({ length: segments }, (_, i) => (
          <span className="score-meter-seg" key={i}>
            <span
              className="score-meter-fill"
              style={{
                background: `var(--${status})`,
                transform: `scaleX(${Math.max(0, Math.min(1, (pct - i * per) / per))})`,
              }}
            />
          </span>
        ))}
      </div>
      {label && <span className="score-meter-label">{label}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ MetricBar */

interface MetricBarProps {
  value: number
  ideal: [number, number]
  range: [number, number]
  status: Status
  /**
   * Which measurement this is, so the two ends of the axis can be named.
   *
   * Optional because the axis is drawn in one other place from a spread rather
   * than a single value; without it the bar is unlabelled, never numbered. A
   * raw bound printed under a bar is the one thing this report has always
   * refused — "0.14×" tells a club player nothing they can stand on a court
   * and change.
   */
  id?: string
}

/**
 * One measurement against the band it should be inside.
 *
 * The clearest thing in the report: a framed axis, the target zone drawn as a
 * green block, and a hard playhead where the body actually was. The playhead
 * carries a white edge so it stays a separate object when it lands exactly on
 * the band's own border, which is precisely the case a player most needs to
 * read — just inside versus just outside is the whole verdict.
 */
export function MetricBar({ value, ideal, range, status, id }: MetricBarProps) {
  const span = range[1] - range[0] || 1
  const pct = (v: number) => ((Math.max(range[0], Math.min(range[1], v)) - range[0]) / span) * 100

  const bandLeft = pct(ideal[0])
  const bandRight = pct(ideal[1])

  const low = id ? readoutOf(id, range[0]) : ''
  const high = id ? readoutOf(id, range[1]) : ''

  return (
    <div className={`metric-axis metric-axis--${status}`}>
      <div className="bar" role="presentation">
        <div className="bar-track" />
        <div
          className="bar-band"
          style={{ left: `${bandLeft}%`, width: `${Math.max(2, bandRight - bandLeft)}%` }}
        />
        <div className="bar-marker" style={{ left: `${pct(value)}%` }} />
      </div>
      {low && high && low !== high && (
        <p className="bar-ends">
          <span>{low}</span>
          <span>{high}</span>
        </p>
      )}
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

  if (!open) return null

  return (
    <div className="sheet-backdrop" onClick={onClose}>
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

const PATHS: Record<string, ReactNode> = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M9 5v14M15 5v14" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  camera: (
    <>
      <path d="M3 8.5A2.5 2.5 0 015.5 6h1.7l1-1.8h5.6l1 1.8h1.7A2.5 2.5 0 0119 8.5v8A2.5 2.5 0 0116.5 19h-11A2.5 2.5 0 013 16.5z" />
      <circle cx="11" cy="12" r="3.2" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" />
      {/* Butt caps here alone: a square cap would push each sprocket line a
          stroke past the frame it is supposed to sit inside. */}
      <path d="M8 5.5v13M16 5.5v13" strokeLinecap="butt" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  offline: (
    <>
      <path d="M12 3.5v11" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4.5 17.5v1a2 2 0 002 2h11a2 2 0 002-2v-1" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  share: (
    <>
      <path d="M12 3.5v11.5" />
      <path d="M8 7.5l4-4 4 4" />
      <path d="M5 13v6a1.8 1.8 0 001.8 1.8h10.4A1.8 1.8 0 0019 19v-6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0110.7 4h2.6a1.2 1.2 0 011.2 1.2V7" />
      <path d="M6.5 7l.8 12.1A1.9 1.9 0 009.2 21h5.6a1.9 1.9 0 001.9-1.9L17.5 7" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <rect x="11.2" y="11.2" width="1.6" height="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.6" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4.5L21 19.5H3z" />
      <path d="M12 10v4M12 16.6v.6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4.5M8 8.5l4-4 4 4" />
      <path d="M4.5 15v3a2 2 0 002 2h11a2 2 0 002-2v-3" />
    </>
  ),
}

/**
 * Line icons cut to the same weight as everything around them.
 *
 * 2.4 in a 24 unit box lands on 2px at the default 20px, which is the border
 * width on every control — at 1.7 the icons read as a lighter, older set that
 * had wandered in next to Archivo Black. Caps and joins are square, matching
 * the geometry of the page; the two places that hurt legibility say so where
 * they are drawn rather than dropping the whole set back to round.
 */
export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  )
}
