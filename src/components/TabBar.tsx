import { Icon } from './primitives'

export type Tab = 'today' | 'progress'

interface Props {
  on: Tab
  onTab: (tab: Tab) => void
  onFilm: () => void
  /** The engine download's progress, 0 to 1, drawn round the Film button while it runs. */
  loading?: number
  /**
   * The laptop rail's Studio (W6.3, `DESIGN.md`): the latest serve, opened in the
   * review studio. On the rail only; a phone keeps its two places and the button.
   */
  onStudio?: () => void
}

/** The camera and the word under it, inside the lime circle: the one action is labelled like the two places. */
const FILM_STACK = { flexDirection: 'column', gap: 1 } as const
const FILM_WORD = { fontSize: 14, fontWeight: 700, lineHeight: 1 } as const

/**
 * The app's structure: two places, and one action between them.
 *
 * Today answers what now, Progress answers whether it is working, and Film is
 * always under the thumb. There used to be no navigation at all: Progress was a
 * card two screens down, and filming was two differently named buttons.
 */
export default function TabBar({ on, onTab, onFilm, loading, onStudio }: Props) {
  const ring = loading !== undefined ? Math.max(0.04, Math.min(1, loading)) : undefined
  return (
    <nav className="tabbar" aria-label="Main">
      <button className={`tab${on === 'today' ? ' is-on' : ''}`} aria-current={on === 'today' ? 'page' : undefined} onClick={() => onTab('today')}>
        <Icon name="home" size={24} />
        <span>Today</span>
      </button>
      <button className="tab-film" style={FILM_STACK} onClick={onFilm} aria-label="Film a serve">
        {ring !== undefined && (
          <svg className="tab-film-ring" viewBox="0 0 76 76" aria-hidden="true">
            <circle cx="38" cy="38" r="35" pathLength={1} strokeDasharray={`${ring} 1`} />
          </svg>
        )}
        <Icon name="camera-solid" size={26} />
        <span style={FILM_WORD}>Film</span>
      </button>
      <button className={`tab${on === 'progress' ? ' is-on' : ''}`} aria-current={on === 'progress' ? 'page' : undefined} onClick={() => onTab('progress')}>
        <Icon name="progress" size={24} />
        <span>Progress</span>
      </button>
      {onStudio && (
        <button className="tab tab--rail" onClick={onStudio} aria-label="Studio: your latest serve, to review">
          <Icon name="film" size={24} />
          <span>Studio</span>
        </button>
      )}
    </nav>
  )
}
