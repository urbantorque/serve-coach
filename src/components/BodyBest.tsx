import { useMemo } from 'react'
import { bodyBestLine, bodyBests } from '../lib/bests'
import type { Session } from '../lib/storage/db'
import type { ServeType } from '../lib/storage/prefs'

/**
 * A body position the newest trip reached for the first time (L3.8), as the
 * form card's footnote. Its own lazy chunk since Q9, which put today's minutes
 * on Home's drills: the entry had no room for both, and a footnote can arrive
 * a moment after the card it sits under.
 */
export default function BodyBest({ sessions, serveType }: { sessions: Session[]; serveType?: ServeType }) {
  const best = useMemo(() => bodyBests(sessions, serveType)[0], [sessions, serveType])
  return best ? <span className="progress-foot">{bodyBestLine(best)}</span> : null
}
