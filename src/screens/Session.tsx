import { useState } from 'react'
import { Icon } from '../components/primitives'
import { sessionDrillCheck } from '../lib/session/evidence'
import type { Session as SavedReport } from '../lib/storage/db'
import SessionDashboard, { ServeGrid } from '../components/SessionDashboard'
import { clipLabel } from '../lib/clipLabel'
import { PLACEMENT } from '../lib/placement'
import { SESSION_SAMPLE, costLeft, guessServes, minutesOf, planChoices, speedCostLine, type PlanChoice } from '../lib/session/plan'
import { toRead, type PracticeSession, type SessionStage } from '../lib/session/session'

export type { SessionStage }

interface Props {
  session: PracticeSession
  /** The last finished session of the same serve type and rubric (L2.8). */
  previous?: PracticeSession
  /** The session's video, when it is open here, for watching its best and worst serves (L2.11). */
  videoUrl?: string
  stage: SessionStage
  /**
   * Whether the video is open, so a reading can start or carry on.
   *
   * False for a session opened from the home screen after a reload: the app
   * never keeps the file, so carrying on means picking it again.
   */
  canRead: boolean
  /** Start reading: a sample or every serve, and each serve's speed or not (N2.8). */
  onStart: (mode: 'sample' | 'every', withSpeed: boolean) => void
  onStop: () => void
  onPickAgain: () => void
  onLeave: () => void
  /** For the practice's drill check (N1.5): the saved reports, the ladder and when it moved. */
  history?: SavedReport[]
  ladder?: Partial<Record<string, number>>
  movedAt?: Partial<Record<string, number>>
  onLadderStep?: (flaw: string, step: number, from?: number) => void
}

/** The two choices, in the player's words. */
function choiceCopy(choice: PlanChoice): { title: string; body: string } {
  return choice.mode === 'sample'
    ? { title: `A sample of ${SESSION_SAMPLE}`, body: 'Five from the start, two from the middle and five from the end.' }
    : { title: 'Every serve', body: `About ${choice.reading} serves, read one at a time.` }
}

/** "About 4 minutes", capitalised to stand as a label or open a sentence. */
const timeOf = (seconds: number | undefined) => {
  if (seconds === undefined) return undefined
  const m = minutesOf(seconds)
  return m[0].toUpperCase() + m.slice(1)
}

export default function Session({
  session,
  previous,
  videoUrl,
  stage,
  canRead,
  onStart,
  onStop,
  onPickAgain,
  onLeave,
  history,
  ladder,
  movedAt,
  onLadderStep,
}: Props) {
  const label = clipLabel(session.fileName)
  const length = minutesOf(session.duration).replace(/^about /, '')
  const chosen = session.chosen?.length
  const begun = session.found !== undefined || session.lines.length > 0

  if (stage.state === 'planning' || (stage.state === 'paused' && !canRead)) {
    // Without the file there is nothing to plan: the only way on is to pick it again.
    const resuming = begun || !canRead
    return (
      <div className="screen session">
        <div className="session-inner">
          <h1>{resuming ? 'Carry on with this session' : 'A practice session'}</h1>
          <p className="analyzing-file">{label}</p>
          {resuming ? (
            <Resume session={session} perSampleMs={stage.state === 'planning' ? stage.perSampleMs : undefined} />
          ) : (
            <Choices session={session} stage={stage} onStart={onStart} />
          )}
          {resuming &&
            (canRead ? (
              <button className="btn btn--primary btn--full" onClick={() => onStart(session.mode, !!session.withSpeed)}>
                Carry on
              </button>
            ) : (
              <>
                <p className="session-note">The video is not kept on your phone. Pick the same one to carry on.</p>
                <button className="btn btn--primary btn--full" onClick={onPickAgain}>
                  Pick the video
                </button>
              </>
            ))}
          <p className="session-note">
            Keep the app open while it reads. If you leave, it pauses and keeps its place.
          </p>
          <button className="btn btn--ghost btn--full" onClick={onLeave}>
            {resuming ? 'Not now' : 'Cancel'}
          </button>
        </div>
      </div>
    )
  }

  if (stage.state === 'running') {
    const locating = session.found === undefined
    return (
      <div className="screen analyzing session">
        <div className="analyzing-inner">
          <div className="pulse">
            <span className="pulse-ball" />
          </div>
          <h1>Reading your session</h1>
          <p className="analyzing-file">{label}</p>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(stage.ratio * 100)}
            aria-label="Session progress"
          >
            <div className="progress-fill" style={{ transform: `scaleX(${stage.ratio})` }} />
          </div>
          <p className="analyzing-detail" role="status" aria-live="polite">
            {stage.detail ?? (locating ? 'Finding every serve in the video…' : 'Reading…')}
          </p>
          {!locating && <ServeGrid session={session} />}
          <p className="analyzing-aside">
            {locating
              ? 'On a long video this is the longest step.'
              : 'Each serve is saved as it is read, so stopping loses none of them.'}
          </p>
          <button className="btn btn--ghost" onClick={onStop}>
            {stage.stopping ? 'Stopping…' : 'Stop and keep what is read'}
          </button>
        </div>
      </div>
    )
  }

  if (stage.state === 'paused') {
    const at = chosen ? `${session.lines.length} of ${chosen}` : undefined
    const why =
      stage.reason === 'hidden'
        ? 'The app went into the background, so the reading paused.'
        : stage.reason === 'warm'
          ? 'Your phone is running hot, so the reading paused to let it cool.'
          : 'You stopped the reading.'
    const left = timeOf(costLeft(session, stage.perSampleMs))
    return (
      <div className="screen session">
        <div className="session-inner">
          <h1>Paused</h1>
          <p className="analyzing-file">{label}</p>
          <p className="session-lede">{why}</p>
          <p className="session-meta tnum">
            {at ? `${at} serves read, and saved.` : 'Nothing was read yet.'}
            {left && ` ${left} left.`}
          </p>
          {session.found !== undefined && <ServeGrid session={session} />}
          <button className="btn btn--primary btn--full" onClick={() => onStart(session.mode, !!session.withSpeed)}>
            Carry on
          </button>
          <button className="btn btn--ghost btn--full" onClick={onLeave}>
            Done for now
          </button>
        </div>
      </div>
    )
  }

  // Done.
  const found = session.found?.length ?? 0
  return (
    <div className="screen session">
      <div className="session-inner">
        <h1>Your session</h1>
        <p className="analyzing-file">
          {label} · {length}
        </p>
        {found === 0 ? (
          <>
            <p className="session-lede">I could not find a serve in this video.</p>
            <p className="session-note">
              Film from {PLACEMENT.distance} away with your whole body in the picture, and keep the phone still.
            </p>
          </>
        ) : (
          <SessionDashboard
            session={session}
            previous={previous}
            videoUrl={canRead ? videoUrl : undefined}
            onPickAgain={onPickAgain}
            check={history ? sessionDrillCheck(session, history, ladder, movedAt) : undefined}
            onLadderStep={onLadderStep}
          />
        )}
        <button className="btn btn--ghost btn--full" onClick={onLeave}>
          Back home
        </button>
      </div>
    </div>
  )
}

/** The plan for a session not yet begun: what it holds, and the ways to read it. */
function Choices({
  session,
  stage,
  onStart,
}: {
  session: PracticeSession
  stage: SessionStage
  onStart: (mode: 'sample' | 'every', withSpeed: boolean) => void
}) {
  const [withSpeed, setWithSpeed] = useState(false)
  const guess = guessServes(session.duration)
  const timed = stage.state === 'planning' && stage.timed
  const perSampleMs = stage.state === 'planning' ? stage.perSampleMs : undefined
  const choices = planChoices({ duration: session.duration, serves: guess, perSampleMs })
  const length = minutesOf(session.duration).replace(/^about /, '')
  return (
    <>
      <p className="session-lede">
        {length[0].toUpperCase()}
        {length.slice(1)} of video, so about {guess} serves.
      </p>
      <p className="session-meta" role="status" aria-live="polite">
        {!timed
          ? 'Timing your phone on this video…'
          : perSampleMs === undefined
            ? 'I could not time your phone on this video, so I cannot say how long it will take.'
            : 'Times are from your phone, on this video.'}
      </p>
      {/* Off by default: a speed costs the ball's pass on every serve. */}
      <div className="seg" role="group" aria-label="Serve speeds" style={{ width: 'fit-content' }}>
        {[false, true].map((on) => (
          <button
            key={String(on)}
            type="button"
            className={`seg-item${withSpeed === on ? ' is-on' : ''}`}
            aria-pressed={withSpeed === on}
            onClick={() => setWithSpeed(on)}
          >
            {on ? 'With speeds' : 'Without speeds'}
          </button>
        ))}
      </div>
      <p className="session-meta">{speedCostLine(choices)}</p>
      <ul className="session-choices">
        {choices.map((choice) => {
          const copy = choiceCopy(choice)
          const time = timeOf(withSpeed ? choice.speedSeconds : choice.seconds)
          return (
            <li key={choice.mode}>
              <button className="session-choice" onClick={() => onStart(choice.mode, withSpeed)} disabled={!timed}>
                <span className="session-choice-text">
                  <strong>{copy.title}</strong>
                  <span>{copy.body}</span>
                </span>
                <span className="session-choice-time tnum">{time ?? (timed ? '' : '…')}</span>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** A session already begun: how far it got, and what is left. */
function Resume({ session, perSampleMs }: { session: PracticeSession; perSampleMs?: number }) {
  const chosen = session.chosen?.length
  const left = timeOf(costLeft(session, perSampleMs))
  return (
    <p className="session-lede tnum">
      {chosen === undefined
        ? 'The serves were still being found when it stopped.'
        : `${session.lines.length} of ${chosen} serves read, ${toRead(session).length} to go.`}
      {left && ` ${left} left.`}
    </p>
  )
}
