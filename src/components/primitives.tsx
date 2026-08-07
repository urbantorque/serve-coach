import { useEffect, useRef, type ReactNode } from 'react'
import type { Status } from '../lib/analysis/types'

/* ------------------------------------------------------------------ ScoreRing */

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
          {score}
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

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
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
  }, [open, onClose])

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
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M8 5v14M16 5v14" />
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
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
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

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  )
}
