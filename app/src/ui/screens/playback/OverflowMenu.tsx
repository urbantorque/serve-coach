/**
 * App-bar overflow menu (DESIGN §8.1 right slot: DotsThreeIcon). A small level-3 popover of 44 px
 * items; Escape and outside taps close it; arrow keys move between items; focus returns to the button.
 */
import { DotsThreeIcon, type Icon } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cx } from '../../components/cx.ts'

export interface MenuItem {
  label: string
  icon?: Icon
  onSelect: () => void
  destructive?: boolean
  hidden?: boolean
}

export function OverflowMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const visible = items.filter((i) => !i.hidden)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      els[(i + 1) % els.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      els[(i - 1 + els.length) % els.length]?.focus()
    } else if (e.key === 'Tab') close(false)
  }

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-grid size-11 place-items-center rounded-full text-ink hover:bg-surface-2 active:bg-surface-2"
      >
        <DotsThreeIcon aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute top-12 right-0 z-(--z-sheet) flex w-64 flex-col overflow-hidden rounded-card border-token border-line bg-sheet py-1 shadow-sheet"
        >
          {visible.map((item) => {
            const G = item.icon
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close(false)
                  item.onSelect()
                }}
                className={cx(
                  'flex min-h-11 items-center gap-3 px-4 text-left text-body hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:-outline-offset-2',
                  item.destructive ? 'text-critical' : 'text-ink',
                )}
              >
                {G ? <G size={20} aria-hidden="true" /> : null}
                {item.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
