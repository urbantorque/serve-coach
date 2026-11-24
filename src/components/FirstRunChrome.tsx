import type { MouseEvent } from 'react'
import { pathFor, type InfoPageId } from '../lib/routes'

/*
 * The landing's way around: a first-time visitor's top links. Its way to act
 * from anywhere is the sticky bar (StickyFilmBar.tsx, loaded once needed).
 * Inline styles: the split stylesheets are at their budget.
 */

const TOP = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12, alignSelf: 'start' } as const
const MARK = { fontSize: 16, fontWeight: 720, color: 'var(--fg)', letterSpacing: '-0.01em' } as const
const LINKS = { display: 'flex', columnGap: 14 } as const
const LINK = { display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', textDecoration: 'none' } as const

/**
 * The name and three ways in, at the top of the landing: how it works (the
 * section below), the plans and privacy. A modified click opens the address as
 * the browser would; a plain one stays in the app.
 */
export default function FirstRunTop({ onShowPage }: { onShowPage?: (page: InfoPageId) => void }) {
  const open = (p: InfoPageId) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onShowPage || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onShowPage(p)
  }
  const toHow = (e: MouseEvent<HTMLAnchorElement>) => {
    const how = document.getElementById('first-how')
    if (!how) return
    e.preventDefault()
    how.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <header className="first-top" style={TOP}>
      <span style={MARK}>Serve Coach</span>
      <nav style={LINKS} aria-label="About Serve Coach">
        <a style={LINK} href="#first-how" onClick={toHow}>
          How it works
        </a>
        {onShowPage && (
          <>
            <a style={LINK} href={pathFor({ kind: 'page', page: 'pricing' }, import.meta.env.BASE_URL)} onClick={open('pricing')}>
              Plans
            </a>
            <a style={LINK} href={pathFor({ kind: 'page', page: 'privacy' }, import.meta.env.BASE_URL)} onClick={open('privacy')}>
              Privacy
            </a>
          </>
        )}
      </nav>
    </header>
  )
}
