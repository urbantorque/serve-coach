import { useMemo } from 'react'
import { swingOf, workParts } from '../lib/figure/swing'
import { shortDate } from '../lib/progress'
import type { PracticeSession } from '../lib/session/session'
import { aboutSpeedShort } from '../lib/speedCopy'
import { cardScents, type CardScent } from '../lib/serveCardScent'
import type { ServeTag, Session } from '../lib/storage/db'
import { readPrefs } from '../lib/storage/prefs'
import AthleteCanvas from './AthleteCanvas'
import { DeltaChip } from './DeltaChip'
import { Icon } from './primitives'

interface Props {
  sessions: Session[]
  history: Session[]
  tags: ReadonlyMap<string, ServeTag>
  practice?: PracticeSession[]
  onOpen: (s: Session) => void
  onOpenPractice?: (p: PracticeSession) => void
  onAll: () => void
}

function ServeCard({ s, scent, onOpen }: { s: Session; scent: CardScent; onOpen: (s: Session) => void }) {
  const swing = useMemo(() => swingOf(s), [s])
  const { story, moment, paint, vsUsual } = scent
  const speed = s.speed && 'speed' in s.speed ? s.speed.speed : undefined
  const unit = readPrefs().speedUnit
  return (
    <button className="serve-card" onClick={() => onOpen(s)}>
      <span className="serve-card-stage">
        {swing && (
          <AthleteCanvas
            swing={swing}
            mode="pose"
            at={swing.moments[moment] ?? swing.moments.contact ?? swing.frames.length - 1}
            work={paint ? workParts(paint, swing.racket) : undefined}
            fit={{ height: 0.62, feet: 0.94 }}
            label=""
          />
        )}
      </span>
      <span className="serve-card-text">
        <span className={`serve-card-title${story.best ? ' is-best' : ''}`}>{story.title}</span>
        <span className="serve-card-meta">
          <strong className="tnum">{s.overall}</strong>
          {/* Against their usual, only past their own noise (E2.3). */}
          {vsUsual !== undefined && <DeltaChip delta={vsUsual} scope="overall" compact />}
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
 * What each card carries, and why no two neighbours read the same, is
 * `cardScents`'s (E2.3).
 */
export default function ServeCards({ sessions, history, tags, practice = [], onOpen, onOpenPractice, onAll }: Props) {
  const scents = useMemo(() => cardScents(sessions, history, tags), [sessions, history, tags])
  return (
    <div className="serve-cards">
      {practice.slice(0, 1).map((p) => (
        <button key={p.id} className="serve-card serve-card--practice" onClick={() => onOpenPractice?.(p)}>
          <span className="serve-card-stage">
            <Icon name="film" size={30} />
          </span>
          <span className="serve-card-text">
            <span className="serve-card-title">A whole practice video</span>
            <span className="serve-card-meta">
              <span>
                {shortDate(p.createdAt)}, {p.lines.filter((l) => l.status === 'read').length} serves checked
              </span>
            </span>
          </span>
        </button>
      ))}
      {sessions.map((s, i) => (
        <ServeCard key={s.id} s={s} scent={scents[i]} onOpen={onOpen} />
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
