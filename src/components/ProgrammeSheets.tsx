import { useState } from 'react'
import { goalOptions, chooseGoal, todayFor, type Programme, type ProgrammeContext } from '../lib/programme'
import { COURT_MINUTES, type CourtMinutes } from '../lib/courtPlan'
import { weekCalendar } from '../lib/calendar'
import { shareBlob } from '../lib/share/reportCard'
import type { Session } from '../lib/storage/db'
import { readPrefs, writePrefs, type Prefs } from '../lib/storage/prefs'
import { Icon } from './primitives'
import { filmable } from '../lib/analysis/progressions'
import { NEXT_TIME, lastPracticeLine } from '../lib/session/sessionCopy'
import type { PracticeSession } from '../lib/session/session'
import { CourtCard } from './CourtCard'
import '../styles/programme.css'

/** Today's session, in minutes, with the court card and the way to film the check. */
export function SessionBody({
  programme,
  onFilmCheck,
  practice = [],
}: {
  programme: Programme
  onFilmCheck: () => void
  /** The practice sessions read so far, for what the last one says about today (W6.4). */
  practice?: readonly PracticeSession[]
}) {
  const [minutes, setMinutes] = useState<CourtMinutes>(() => readPrefs().courtMinutes ?? programme.minutes)
  const [card, setCard] = useState(false)
  const blocks = todayFor(programme, minutes)
  const first = programme.plan.items[0]
  const last = lastPracticeLine(practice)
  return (
    <div className="session-today">
      {last && (
        <p className="programme-note">
          <strong>Last practice.</strong> {last} <strong>{NEXT_TIME}</strong>
        </p>
      )}
      <div className="seg" role="group" aria-label="How long you have">
        {COURT_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            className={`seg-item${minutes === m ? ' is-on' : ''}`}
            aria-pressed={minutes === m}
            onClick={() => {
              setMinutes(m)
              writePrefs({ courtMinutes: m })
            }}
          >
            {m} min
          </button>
        ))}
      </div>
      <ol className="session-blocks">
        {blocks.map((b, i) => (
          <li key={i} className={`session-block session-block--${b.kind}`}>
            <span className="session-block-min tnum">{b.minutes}</span>
            <span>{b.line}</span>
          </li>
        ))}
      </ol>
      {first && (
        <button type="button" className="btn btn--primary btn--big btn--full" onClick={() => setCard(true)}>
          Show the drill in big print
        </button>
      )}
      {/* A step with no served ball has no check to film (W5.2): the session ends on a plain serve instead. */}
      <button type="button" className="btn btn--ghost btn--full" onClick={onFilmCheck}>
        <Icon name="camera" size={18} />
        {!first || filmable(first.flaw, first.drill.name) ? 'Film serves to check it' : 'Film a serve'}
      </button>
      <button
        type="button"
        className="btn btn--quiet btn--full"
        onClick={() => {
          const ics = weekCalendar(programme.plan, { now: new Date(), cadence: readPrefs().cadence, minutes })
          void shareBlob(new Blob([ics], { type: 'text/calendar' }), 'serve-practice.ics', 'Serve practice', 'text/calendar')
        }}
      >
        <Icon name="calendar" size={18} />
        Add to calendar
      </button>
      {card && first && <CourtCard item={first} onClose={() => setCard(false)} />}
    </div>
  )
}

/** The whole road to the goal, and one tap to pick a different one. */
export function ProgrammeBody({
  programme,
  sessions,
  prefs,
  evidence,
  more,
  onChoose,
}: {
  programme: Programme
  sessions: Session[]
  prefs: Prefs
  evidence?: readonly Session[]
  more?: ProgrammeContext
  onChoose: (patch: Pick<Prefs, 'goal'>) => void
}) {
  const options = goalOptions(sessions, prefs, Date.now(), evidence, more)
  return (
    <div className="programme">
      <p className="programme-why">{programme.why}</p>
      <p className="programme-pace">{programme.pace}</p>
      {programme.note && <p className="programme-note">{programme.note}</p>}
      <ol className="programme-weeks">
        {programme.weeks.map((w) => (
          <li key={w.label} className={`programme-week programme-week--${w.state}`} aria-current={w.state === 'current' ? 'step' : undefined}>
            <span className="programme-week-mark">{w.state === 'done' ? <Icon name="check" size={13} /> : null}</span>
            <span className="programme-week-text">
              <span className="programme-week-label">{w.label}</span>
              <strong>{w.title}</strong>
              {w.state === 'current' && (
                <>
                  <span>{w.check}</span>
                  <span>{w.know}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
      {options.length > 0 && (
        <section className="programme-goals" aria-labelledby="goals-title">
          <h3 className="t-subhead" id="goals-title">
            Rather work on something else?
          </h3>
          {options.map((o) => (
            <button key={o.title} className="programme-goal" onClick={() => onChoose(chooseGoal(o.goal))}>
              <span>
                <strong>{o.title}</strong>
                <span>{o.line}</span>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
