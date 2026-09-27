import { XIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react'
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx.ts'
import { IconButton } from './IconButton.tsx'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** Visible `title-2` heading; also the dialog's accessible name. */
  title: string
  children: ReactNode
  /**
   * content: the sheet's own height (questions open like this); peek: at most 40%; medium: 50%;
   * large: 92% (Profile, Metric info). DESIGN §8.15.
   */
  detent?: 'content' | 'peek' | 'medium' | 'large'
  /** false for sheets that must be acknowledged (referral card) or guard unsaved input. */
  dismissible?: boolean
  /** Close affordance: an X button (default) or a "Done" text button. */
  closeStyle?: 'icon' | 'done' | 'none'
  /** Sticky actions at the bottom of the sheet (one primary at most). */
  footer?: ReactNode
  className?: string
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'

const HEIGHT: Record<NonNullable<SheetProps['detent']>, string> = {
  content: 'max-h-[92dvh]',
  peek: 'max-h-[40dvh]',
  medium: 'h-[50dvh]',
  large: 'h-[92dvh]',
}

/**
 * Bottom sheet (DESIGN §8.15): role="dialog", aria-modal, labelled by its title; focus is trapped
 * while open and returns to the trigger on close; Escape, scrim tap and a downward swipe on the
 * grabber close it unless `dismissible` is false. The app behind is made inert. Springs up from the
 * bottom; with reduced motion it fades in place (120 ms).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  detent = 'content',
  dismissible = true,
  closeStyle = 'icon',
  footer,
  className,
}: SheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const reduce = useReducedMotion()
  const drag = useDragControls()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement as HTMLElement | null
    const appRoot = document.getElementById('root')
    const sheetInsideRoot = appRoot?.contains(panel.current ?? null) ?? false
    if (appRoot && !sheetInsideRoot) appRoot.inert = true
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current
    first?.focus()
    return () => {
      if (appRoot) appRoot.inert = false
      returnTo.current?.focus?.()
    }
  }, [open])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (dismissible) onCloseRef.current()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('inert'))
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (dismissible && (info.offset.y > 120 || info.velocity.y > 600)) onCloseRef.current()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-(--z-sheet)" onKeyDown={onKeyDown}>
          <motion.div
            className="absolute inset-0 bg-(--scrim)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => dismissible && onCloseRef.current()}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cx(
              'absolute inset-x-0 bottom-0 mx-auto flex max-w-(--content-max) flex-col rounded-t-sheet bg-sheet shadow-sheet outline-none',
              'border-t border-sheet-edge court:border-t-2',
              HEIGHT[detent],
              className,
            )}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 42, mass: 1 }}
            drag={dismissible && !reduce ? 'y' : false}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div
              className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center"
              onPointerDown={(e) => dismissible && drag.start(e)}
              aria-hidden="true"
            >
              <span className="h-[5px] w-9 rounded-full bg-ink-3 opacity-40" />
            </div>
            <div className="gutter flex shrink-0 items-start justify-between gap-3 pb-2">
              <h2 id={titleId} className="pt-2 text-title-2 text-ink">
                {title}
              </h2>
              {closeStyle === 'icon' ? (
                <IconButton icon={XIcon} label="Close" onClick={onClose} className="-mr-2 -mt-1" />
              ) : closeStyle === 'done' ? (
                <button type="button" onClick={onClose} className="-mr-2 h-11 rounded-control px-2 text-headline text-ink active:bg-surface-2">
                  Done
                </button>
              ) : null}
            </div>
            <div className="gutter min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">{children}</div>
            {footer ? <div className="gutter shrink-0 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">{footer}</div> : <div className="pad-safe-bottom shrink-0" />}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
