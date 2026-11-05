import { useMemo } from 'react'
import { swingOf } from '../lib/figure/swing'
import { shortDate } from '../lib/progress'
import type { PracticeSession } from '../lib/session/session'
import { aboutSpeedShort } from '../lib/speedCopy'
import { serveStory } from '../lib/serveStory'
import type { ServeTag, Session } from '../lib/storage/db'
import { readPrefs } from '../lib/storage/prefs'
import AthleteCanvas from './AthleteCanvas'
import { Icon } from './primitives'
import '../styles/serveCards.css'

interface Props {
  sessions: Session[]
  history: Session[]
  tags: ReadonlyMap<string, ServeTag>
  practice?: PracticeSession[]
  onOpen: (s: Session) => void
  onOpenPractice?: (p: PracticeSession) => void
  onAll: () => void
}

function ServeCard({ s, history, tags, onOpen }: { s: Session; history: Session[]; tags: ReadonlyMap<string, ServeTag>; onOpen: (s: Session) => void }) {
  const swing = useMemo(() => swingOf(s), [s])
  const story = serveStory(s, history, tags)
  const speed = s.speed && 'speed' in s.speed ? s.speed.speed : undefined
  const unit = readPrefs().speedUnit
  return (
    <button className="serve-card" onClick={() => onOpen(s)}>
      <span className="serve-card-stage">
        {swing && <AthleteCanvas swing={swing} mode="pose" at={swing.moments.contact ?? swing.frames.length - 1} fit={{ height: 0.62, feet: 0.94 }} label="" />}
      </span>
      <span className="serve-card-text">
        <span className={`serve-card-title${story.best ? ' is-best' : ''}`}>{story.title}</span>
        <span className="serve-card-meta">
          <strong className="tnum">{s.overall}</strong>
          <span>
            {shortDate(s.createdAt)}
            {speed ? `, ${aboutSpeedShort(speed, unit)}` : ''}
          </span>
        </span>
      </span>
    </button>
  )
}

/**
 * The last few serves, each with its own body and its own headline, so they can
 * be told apart at a glance. Out of the entry chunk: the figure comes with it.
 */
export default function ServeCards({ sessions, history, tags, practice = [], onOpen, onOpenPractice, onAll }: Props) {
  return (
    <div className="serve-cards">
      {practice.slice(0, 1).map((p) => (
        <button key={p.id} className="serve-card serve-card--practice" onClick={() => onOpenPractice?.(p)}>
          <span className="serve-card-stage">
            <Icon name="film" size={30} />
          </span>
          <span className="serve-card-text">
            <span className="serve-card-title">A whole practice</span>
            <span className="serve-card-meta">
              <span>
                {shortDate(p.createdAt)}, {p.lines.filter((l) => l.status === 'read').length} serves read
              </span>
            </span>
          </span>
        </button>
      ))}
      {sessions.map((s) => (
        <ServeCard key={s.id} s={s} history={history} tags={tags} onOpen={onOpen} />
      ))}
      {history.length > sessions.length && (
        <button className="serve-card serve-card--all" onClick={onAll}>
          <span className="t-figure tnum">{history.length}</span>
          <span>All your serves</span>
        </button>
      )}
    </div>
  )
}
