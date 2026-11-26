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
import { ModelPose, OwnPose } from './DrillPose'
import '../styles/programme.css'

/** Today's session, in minutes, with the court card and the way to film the check. */
export function SessionBody({
  programme,
  onFilmCheck,
  practice = [],
  lastServe,
}: {
  programme: Programme
  onFilmCheck: () => void
  /** The practice sessions read so far, for what the last one says about today (W6.4). */
  practice?: readonly PracticeSession[]
  /** The player's last serve, drawn by the check at the first drill's fault (Mirror M2.4). */
  lastServe?: Session
}) {
  const [minutes, setMinutes] = useState<CourtMinutes>(() => readPrefs().courtMinutes ?? programme.minutes)
  const [card, setCard] = useState(false)
  const blocks = todayFor(programme, minutes)
  const first = programme.plan.items[0]
  const last = lastPracticeLine(practice)
  // A step with no served ball has no check to film (W5.2): its row films a plain serve, and says so.
  const checks = !first || filmable(first.flaw, first.drill.name)
  /*
   * Each drill row's key position, and the player's own last serve by the
   * check (Mirror M2.4): the rows were minutes and names, with nothing shown.
   */
  const racket = readPrefs().handedness ?? lastServe?.handedness ?? 'right'
  const items = programme.plan.items
  const ownCheck = programme.goal.kind === 'fault' && lastServe && first?.flaw ? first.flaw : undefined
  const poseFor = (b: (typeof blocks)[number], i: number) => {
    if (b.kind === 'check') return ownCheck && lastServe ? <OwnPose session={lastServe} flaw={ownCheck} /> : null
    if (b.kind !== 'drill') return null
    const flaw = items[blocks.slice(0, i).filter((x) => x.kind === 'drill').length]?.flaw
    return flaw ? <ModelPose flaw={flaw} racket={racket} /> : null
  }
  const posed = blocks.some((b, i) => poseFor(b, i) !== null)
  /*
   * One main action (E1.2): the drill, full screen, which is what the court is
   * for. The check is filmed from its own row, at the point in the session it
   * comes, and the calendar is a quiet link beside the time: three equal
   * exits stacked at the foot is what DESIGN.md bans.
   */
  return (
    <div className="session-today">
      {last && (
        <p className="programme-note">
          <strong>Last practice.</strong> {last} <strong>{NEXT_TIME}</strong>
        </p>
      )}
      <div className="session-time">
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
        <button
          type="button"
          className="link-btn link-btn--quiet"
          onClick={() => {
            const ics = weekCalendar(programme.plan, { now: new Date(), cadence: readPrefs().cadence, minutes })
            void shareBlob(new Blob([ics], { type: 'text/calendar' }), 'serve-practice.ics', 'Serve practice', 'text/calendar')
          }}
        >
          <Icon name="calendar" size={16} />
          Add to calendar
        </button>
      </div>
      <ol className="session-blocks">
        {blocks.map((b, i) => (
          <li key={i} className={`session-block session-block--${b.kind}${poseFor(b, i) ? ' session-block--pose' : ''}`}>
            <span className="session-block-min tnum">
              {b.minutes}
              <span className="session-block-unit"> min</span>
            </span>
            {b.kind === 'check' ? (
              <button type="button" className="session-block-film" onClick={onFilmCheck}>
                <span>{checks ? b.line : 'Film a serve to see where you are.'}</span>
                <Icon name="camera" size={20} />
              </button>
            ) : (
              <span>{b.line}</span>
            )}
            {poseFor(b, i)}
          </li>
        ))}
      </ol>
      {posed && <p className="programme-note">Small figures: the model at each drill’s moment{ownCheck ? ', and your last serve by the check' : ''}.</p>}
      <button type="button" className="btn btn--primary btn--big btn--full" onClick={first ? () => setCard(true) : onFilmCheck}>
        {first ? 'Show the drill full screen' : 'Film a serve'}
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
