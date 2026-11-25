import { useMemo, useRef, useState } from 'react'
import { canMoveUp, tripCheckLine, type TripCheck } from '../lib/tripCheck'
import { Icon, Sheet } from './primitives'
import { readoutOf } from '../lib/analysis/anatomy'
import { METRICS } from '../lib/analysis/coaching'
import { statusOf } from '../lib/analysis/geometry'
import { FLAW_DRILL } from '../lib/analysis/faultOrder'
import { progressionFor, startingRung, stepCheckLine } from '../lib/analysis/progressions'
import type { FlawId } from '../lib/analysis/flaws'
import type { Drill } from '../lib/analysis/types'
import { CourtCard } from './CourtCard'
import { drillFor } from '../lib/analysis/verdict'
import { cue } from '../lib/analysis/voice'
import { clockOf, toRead, type PracticeSession, type ServeLine } from '../lib/session/session'
import {
  driftLine,
  fixCountLine,
  flawTitle,
  goneLine,
  headlineOf,
  noFixLine,
  sinceLine,
  unsureLine,
} from '../lib/session/sessionCopy'
import { extremes, highlightsOf, sessionStats, type Highlight } from '../lib/session/stats'
import { sessionSpeeds } from '../lib/speedTrend'
import { NO_SESSION_SPEED, defaultSpeedUnit, sessionSpeedLine } from '../lib/speedCopy'
import { readPrefs } from '../lib/storage/prefs'

/*
 * A finished practice session, read together (L2.8): the nine parts of
 * LEVEL-UP-REVIEW.md §5 that the session's own lines can stand behind. Two are
 * left out until the app can ask for them: first and second serves, and
 * tagging serves in bulk. Every sentence goes through `cue`; nothing here
 * decides what is true, only how `sessionStats` is said.
 */

/**
 * The drill for a fault at the rung the player is on (Q11): the stored rung
 * where it is one this ladder has, the ladder's own starting rung where not,
 * and the fault's one drill where it has no ladder. What Home's week names.
 */
function drillOf(flaw: FlawId, ladder?: Partial<Record<string, number>>) {
  const own = progressionFor(flaw)
  if (!own) return { drill: drillFor(FLAW_DRILL[flaw]), step: undefined, check: undefined }
  const stored = ladder?.[flaw]
  const rung = stored !== undefined && Number.isInteger(stored) && stored >= 0 && stored < own.steps.length ? stored : startingRung(own)
  return {
    drill: own.steps[rung],
    step: { at: rung + 1, of: own.steps.length },
    check: cue(stepCheckLine(own, own.steps[rung])),
  }
}

interface Props {
  session: PracticeSession
  /** The last finished session of the same serve type and rubric, to set this one against. */
  previous?: PracticeSession
  /**
   * The session's own video, when it is open here, so the best and worst
   * serves can be watched again from it (L2.11). Never a copy: the object URL
   * of the file the player picked.
   */
  videoUrl?: string
  /** Pick the video again, for a session opened without it. */
  onPickAgain?: () => void
  /** The drill the player came in with, checked across this practice (N1.5). */
  check?: TripCheck
  /**
   * Which rung of each fault's ladder the player is on (Q11), so each fix
   * names the drill they are actually doing, not the ladder's first.
   */
  ladder?: Partial<Record<string, number>>
  /** Move that drill's ladder; absent where prefs cannot be kept. */
  onLadderStep?: (flaw: string, step: number, from?: number) => void
}

export default function SessionDashboard({ session, previous, videoUrl, onPickAgain, check, ladder, onLadderStep }: Props) {
  const [watching, setWatching] = useState<Highlight>()
  const [card, setCard] = useState<{ drill: Drill; flaw: FlawId; check: string }>()
  const highlights = useMemo(
    () => new Map((session.highlights ?? highlightsOf(session.lines, session.duration)).map((h) => [h.number, h])),
    [session.highlights, session.lines, session.duration],
  )
  const stats = useMemo(() => sessionStats(session.lines), [session.lines])
  const before = useMemo(() => (previous ? sessionStats(previous.lines) : undefined), [previous])
  const picks = useMemo(() => extremes(session.lines), [session.lines])
  const byNumber = useMemo(() => new Map(session.lines.map((l) => [l.number, l])), [session.lines])
  const fixes = stats.faults.filter((f) => f.verdict).slice(0, 4)
  const speeds = useMemo(() => sessionSpeeds(session.lines), [session.lines])
  const found = session.found?.length ?? 0
  const gone = before?.verdict.filter((f) => !stats.verdict.includes(f)).slice(0, 2) ?? []

  return (
    <div className="session-dash">
      <section className="session-hero" aria-label="This practice">
        <div className="session-numbers">
          {stats.overall && <span className="t-score session-figure">{stats.overall.median}</span>}
          <p>
            <strong>{stats.overall ? 'Typical serve' : 'Your practice'}</strong>
            <span className="tnum">
              {found} serves found, {stats.read} checked
              {stats.unclear > 0 ? `, ${stats.unclear} too unclear to check` : ''}
            </span>
            {before && stats.overall && before.overall && <span className="tnum">{sinceLine(stats.overall.median, before.overall.median)}</span>}
          </p>
        </div>
        <p className="session-lede">{headlineOf(stats, true)}</p>
        {session.unsure && session.unsure.length > 0 && <p className="session-meta">{unsureLine(session.unsure.length)}</p>}
        {(speeds || session.withSpeed) && (          <p className="session-meta" id="session-speed">
            {speeds ? sessionSpeedLine(speeds, readPrefs().speedUnit ?? defaultSpeedUnit()) : NO_SESSION_SPEED}
          </p>
        )}
      </section>

      <section className="block" aria-labelledby="session-fixes">
        <h2 className="block-title" id="session-fixes">
          What to work on
        </h2>
        {fixes.length ? (
          <ol className="week-list">
            {fixes.map((f, i) => {
              const { drill, step, check: bar } = drillOf(f.flaw, ladder)
              return (
                <li className="focus-next-item" key={f.flaw}>
                  <span className="focus-next-rank">{i + 1}</span>
                  <div className="focus-next-body">
                    <h3 className="focus-next-title">{flawTitle(f.flaw)}</h3>
                    <p className="focus-next-why tnum">{fixCountLine(f, stats.read)}</p>
                    {/* The drill for it, at the player's own step, and how (Q11):
                        a name alone was a drill nobody could start from here. */}
                    {drill && (
                      <>
                        <p className="focus-next-drill">
                          <Icon name="target" size={14} />
                          <span>
                            <strong>{drill.name}</strong>
                            {step && `, step ${step.at} of ${step.of}`} · {drill.reps}
                          </span>
                        </p>
                        {i === 0 && <p className="focus-next-why">{drill.how}</p>}
                        {i === 0 && bar && (
                          <button
                            type="button"
                            className="chip chip--button week-check"
                            onClick={() => setCard({ drill, flaw: f.flaw, check: bar })}
                          >
                            <Icon name="target" size={14} />
                            Show the drill in big print
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="session-meta">{noFixLine(stats.read)}</p>
        )}
        {/* The drill the player came in with, across this practice (N1.5): a
            session used to show drills but never move the ladder. */}
        {check && (
          <div className="glance-move glance-check" role="status">
            <Icon name={check.outcome === 'passed' ? 'check' : 'info'} size={15} />
            <span>
              <strong>Drill: {check.step}</strong> · {tripCheckLine(check, 'practice')}
            </span>
            {canMoveUp(check) && onLadderStep && (
              <button type="button" className="btn btn--primary glance-check-move" onClick={() => onLadderStep(check.flaw, check.rung + 1, check.rung)}>
                Move up a step
              </button>
            )}
          </div>
        )}
      </section>

      {card && <CourtCard item={card} onClose={() => setCard(undefined)} />}

      {/* The first of these is the headline already: said once. */}
      {(stats.driftOver === 0 || stats.drifts.length !== 1) && (
        <section className="block" aria-labelledby="session-change">
          <h2 className="block-title" id="session-change">
            Start and end compared
          </h2>
          {stats.driftOver === 0 ? (
            <p className="session-meta">{cue('Too few serves from one spot to compare the start with the end.')}</p>
          ) : stats.drifts.length ? (
            stats.drifts.slice(1, 3).map((d) => (
              <p className="session-meta" key={d.id}>
                {driftLine(d)}
              </p>
            ))
          ) : (
            <p className="session-meta">{cue('Your serve stayed the same from start to end.')}</p>
          )}
        </section>
      )}

      {(contactPoints(session.lines).length >= 2 || tossPoints(session.lines).points.length >= 2) && (
        <section className="block" aria-labelledby="session-every">
          <h2 className="block-title" id="session-every">
            Every serve
          </h2>
          <ServeStrip lines={session.lines} id="contactHeight" />
          <TossStrip lines={session.lines} />
        </section>
      )}

      {picks.best.length > 0 && (
        <section className="block" aria-labelledby="session-picks">
          <h2 className="block-title" id="session-picks">
            Best and worst
          </h2>
          <Picks
            title="Best"
            numbers={picks.best}
            byNumber={byNumber}
            stills={session.stills}
            onWatch={videoUrl ? (n) => setWatching(highlights.get(n)) : undefined}
          />
          {picks.worst.length > 0 && (
            <Picks
              title="Worst"
              numbers={picks.worst}
              byNumber={byNumber}
              stills={session.stills}
              onWatch={videoUrl ? (n) => setWatching(highlights.get(n)) : undefined}
            />
          )}
          {!videoUrl && onPickAgain && (
            <button className="session-watch-again" onClick={onPickAgain}>
              Pick the same video again to watch these serves
            </button>
          )}
        </section>
      )}

      {videoUrl && (
        <Sheet
          open={watching !== undefined}
          onClose={() => setWatching(undefined)}
          title={watching ? `The serve at ${clockOf(byNumber.get(watching.number)?.t ?? watching.from)}` : ''}
        >
          {watching && <Replay url={videoUrl} from={watching.from} to={watching.to} />}
        </Sheet>
      )}

      {gone.length > 0 && (
        <section className="block" aria-labelledby="session-since">
          <h2 className="block-title" id="session-since">
            Since last session
          </h2>
          {gone.map((f) => (
            <p className="session-meta" key={f}>
              {goneLine(f)}
            </p>
          ))}
        </section>
      )}

      <details className="session-all">
        <summary>
          All {session.lines.length} serves
          <Icon name="chevron" size={14} />
        </summary>
        <ServeGrid session={session} />
      </details>
    </div>
  )
}

/** Three serves, with the still the session kept of each, its place in the video and its score. */
function Picks({
  title,
  numbers,
  byNumber,
  stills,
  onWatch,
}: {
  title: string
  numbers: number[]
  byNumber: Map<number, ServeLine>
  stills?: Record<number, string>
  /** Watch a serve again, when the video is open. */
  onWatch?: (number: number) => void
}) {
  return (
    <div className="session-picks">
      <h3 className="session-picks-title">{title}</h3>
      <ul>
        {numbers.map((n) => {
          const line = byNumber.get(n)!
          const at = clockOf(line.t)
          const face = (
            <>
              {stills?.[n] && (
                <img
                  src={stills[n]}
                  alt={`Contact, serve at ${at}`}
                  width={120}
                  height={160}
                  loading="lazy"
                  decoding="async"
                />
              )}
              <span className="session-pick-at tnum">{at}</span>
              <span className={`session-pick-score tnum is-${statusOf(line.overall ?? 0)}`}>{line.overall}</span>
            </>
          )
          return (
            <li key={n}>
              {onWatch ? (
                <button className="session-pick" onClick={() => onWatch(n)} aria-label={`Watch the serve at ${at}`}>
                  {face}
                  <span className="session-pick-play" aria-hidden="true">
                    <Icon name="play" size={14} />
                  </span>
                </button>
              ) : (
                <div className="session-pick">{face}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * One serve, played from the session's own file and held to its stretch: the
 * fragment starts it there, and it goes back to the start when it passes the
 * end, so the player can watch it as many times as they like.
 */
function Replay({ url, from, to }: { url: string; from: number; to: number }) {
  // Started by hand once it can play: a fragment URL does not always
  // autoplay, and a play() before the fragment's seek lands is dropped. Once
  // only, so a pause the player chose is not undone by the loop's own seek.
  const started = useRef(false)
  return (
    <video
      className="session-replay"
      onCanPlay={(e) => {
        if (started.current) return
        started.current = true
        void e.currentTarget.play().catch(() => {})
      }}
      // The start only: a fragment with an end pauses there, before the loop
      // below can take it back.
      src={`${url}#t=${from.toFixed(2)}`}
      muted
      playsInline
      autoPlay
      controls
      onTimeUpdate={(e) => {
        const v = e.currentTarget
        if (v.currentTime >= to || v.currentTime < from - 0.25) {
          v.currentTime = from
          if (v.paused) void v.play().catch(() => {})
        }
      }}
    />
  )
}

const W = 320
const H = 84
const PAD = 14

/**
 * One reading on every serve, in the order they were hit, against its band.
 * Dots and nothing joining them: the serves are separate, and a line between
 * them would draw a trend the start-against-end rule has not agreed to.
 */
/** A reading's confident values, serve by serve: what a strip draws. */
const contactPoints = (lines: readonly ServeLine[], id = 'contactHeight') =>
  lines
    .filter((l) => l.status === 'read' && l.readings?.[id] && l.readings[id].confidence >= 0.55)
    .map((l) => ({ n: l.number, v: l.readings![id].value }))

/** The confident tosses, along the axis most of them were read on. */
function tossPoints(lines: readonly ServeLine[]) {
  const read = lines.filter((l) => l.status === 'read' && l.toss && l.toss.confidence >= 0.55)
  const across = read.filter((l) => l.toss!.across !== undefined).length > read.length / 2
  const points = read
    .map((l) => ({ n: l.number, v: across ? l.toss!.across : l.toss!.ahead }))
    .filter((p): p is { n: number; v: number } => p.v !== undefined)
  return { across, points }
}

function ServeStrip({ lines, id }: { lines: readonly ServeLine[]; id: string }) {
  const points = contactPoints(lines, id)
  if (points.length < 2) return null
  const ideal = METRICS[id]?.ideal
  const values = points.map((p) => p.v)
  const lo = Math.min(...values, ...(ideal ? [ideal[0]] : []))
  const hi = Math.max(...values, ...(ideal ? [ideal[1]] : []))
  const y = (v: number) => H - PAD - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 2 * PAD)
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - 2 * PAD)
  const middle = [...values].sort((a, b) => a - b)[values.length >> 1]
  const label = METRICS[id]?.label ?? id
  const readout = readoutOf(id, middle)
  return (
    <figure className="chart session-strip">
      <figcaption className="chart-readout">
        <strong>{label}</strong>
        {readout && <span>{cue(`Most serves: ${readout}.`)}</span>}
      </figcaption>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} on ${points.length} serves`}>
        {ideal && (
          <rect
            x={PAD}
            width={W - 2 * PAD}
            y={y(ideal[1])}
            height={Math.max(1, y(ideal[0]) - y(ideal[1]))}
            fill="var(--great-dim)"
          />
        )}
        {points.map((p, i) => (
          <circle key={p.n} cx={x(i)} cy={y(p.v)} r={3.5} fill="var(--fg-muted)">
            <title>{`Serve ${p.n}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  )
}

/**
 * Where every toss peaked against the front foot, along the one axis this
 * camera reads (`TossMap`'s rule), as a strip over the session.
 */
function TossStrip({ lines }: { lines: readonly ServeLine[] }) {
  const { across, points } = tossPoints(lines)
  if (points.length < 2) return null
  const label = across ? 'Toss: left or right of your front foot' : 'Toss: in front of or behind your front foot'
  const values = points.map((p) => p.v)
  const lo = Math.min(0, ...values) - 0.05
  const hi = Math.max(0, ...values) + 0.05
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD)
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - 2 * PAD)
  return (
    <figure className="chart session-strip">
      <figcaption className="chart-readout">
        <strong>{label}</strong>
        <span>{across ? 'Above the line is your hitting side.' : 'Above the line is in front.'}</span>
      </figcaption>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, on ${points.length} serves`}>
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="var(--hairline)" strokeWidth="1" />
        <text x={W - PAD} y={y(0) - 4} className="chart-axis" textAnchor="end">
          front foot
        </text>
        {points.map((p, i) => (
          <circle key={p.n} cx={x(i)} cy={y(p.v)} r={3.5} fill="var(--fg-muted)">
            <title>{`Serve ${p.n}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  )
}

/**
 * One tile per serve chosen, filling in as each is read.
 *
 * Its place in the video rather than its number, because the place is what a
 * player can find again by scrubbing. A tile for a serve too unclear to read
 * says so rather than staying blank, so an empty tile always means "not yet".
 */
export function ServeGrid({ session }: { session: PracticeSession }) {
  const found = session.found ?? []
  const byNumber = new Map(session.lines.map((l) => [l.number, l]))
  const next = toRead(session)[0]
  return (
    <ol className="session-serves" aria-label="Serves">
      {(session.chosen ?? []).map((index) => {
        const line: ServeLine | undefined = byNumber.get(index + 1)
        const at = clockOf(line?.t ?? found[index] ?? 0)
        const status = line?.overall !== undefined ? statusOf(line.overall) : undefined
        const state = !line ? (index === next ? ' is-next' : '') : line.status === 'unclear' ? ' is-unclear' : ` is-${status}`
        const spoken = !line
          ? `Serve at ${at}, not checked yet`
          : line.status === 'unclear'
            ? `Serve at ${at}, too unclear to check`
            : `Serve at ${at}, ${line.overall}`
        return (
          <li key={index} className={`session-serve${state}`} aria-label={spoken}>
            <span className="session-serve-at tnum">{at}</span>
            <span className="session-serve-score tnum" aria-hidden="true">
              {!line ? '' : line.status === 'unclear' ? <Icon name="close" size={13} /> : line.overall}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
