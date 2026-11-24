import { useEffect, useState } from 'react'
import { Icon } from './primitives'

const BAR = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
  transform: 'translateX(-50%)',
  width: 'min(520px, calc(100% - 24px))',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: 6,
  borderRadius: 'var(--r-pill)',
  background: 'var(--ink-2)',
  border: '1px solid var(--hairline)',
  boxShadow: 'var(--film-lift)',
  zIndex: 40,
} as const
const FILM = { flex: 1, minWidth: 0 } as const
const UPLOAD = { paddingInline: 12, whiteSpace: 'nowrap' } as const

/**
 * Film and Upload, following the reader once the landing's own buttons have
 * scrolled away above, so a visitor can act from anywhere on the page. Never
 * both at once: while the buttons at the top are on screen, or not yet
 * scrolled past, the bar is not there. Watches the element `watchId` with an
 * IntersectionObserver, not a scroll listener.
 */
export default function StickyFilmBar({ watchId, onFilm, onUpload }: { watchId: string; onFilm: () => void; onUpload?: () => void }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = document.getElementById(watchId)
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [watchId])
  if (!shown) return null
  return (
    <div style={BAR} role="region" aria-label="Film or upload a serve">
      <button className="btn btn--primary" style={FILM} onClick={onFilm}>
        <Icon name="camera" size={20} />
        Film my serve
      </button>
      {onUpload && (
        <button className="btn btn--quiet" style={UPLOAD} onClick={onUpload}>
          <Icon name="upload" size={18} />
          Upload
        </button>
      )}
    </div>
  )
}
