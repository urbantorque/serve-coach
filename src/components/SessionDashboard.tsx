import { useMemo } from 'react'
import { Icon } from './primitives'
import { readoutOf } from '../lib/analysis/anatomy'
import { METRICS } from '../lib/analysis/coaching'
import { statusOf } from '../lib/analysis/geometry'
import { FLAW_DRILL } from '../lib/analysis/triage'
import { drillFor } from '../lib/analysis/verdict'
import { cue } from '../lib/analysis/voice'
import { clockOf, toRead, type PracticeSession, type ServeLine } from '../lib/session/session'
import { driftLine, fixCountLine, flawTitle, goneLine, headlineOf, sinceLine } from '../lib/session/sessionCopy'
import { extremes, sessionStats } from '../lib/session/stats'

/*
 * A finished practice session, read together (L2.8): the nine parts of
 * LEVEL-UP-REVIEW.md §5 that the session's own lines can stand behind. Two are
 * left out until the app can ask for them: first and second serves, and
 * tagging serves in bulk. Every sentence goes through `cue`; nothing here
 * decides what is true, only how `sessionStats` is said.
 */

interface Props {
  session: PracticeSession
  /** The last finished session of the same serve type and rubric, to set this one against. */
  previous?: PracticeSession
}

export default function SessionDashboard({ session, previous }: Props) {
  const stats = useMemo(() => sessionStats(session.lines), [session.lines])
  const before = useMemo(() => (previous ? sessionStats(previous.lines) : undefined), [previous])
  const picks = useMemo(() => extremes(session.lines), [session.lines])
  const byNumber = useMemo(() => new Map(session.lines.map((l) => [l.number, l])), [session.lines])
  const fixes = stats.faults.filter((f) => f.verdict).slice(0, 4)
  const found = session.found?.length ?? 0

  return (
    <div className="session-dash">
      <p className="session-lede">{headlineOf(stats)}</p>

      <dl className="session-figures">
        <div>
          <dt>Found</dt>
          <dd className="tnum">{found}</dd>
        </div>
        <div>
          <dt>Read</dt>
          <dd className="tnum">{stats.read}</dd>
        </div>
        <div>
          <dt>Unclear</dt>
          <dd className="tnum">{stats.unclear}</dd>
        </div>
        {stats.overall && (
          <div>
            <dt>Typical</dt>
            <dd className={`tnum session-figure--${statusOf(stats.overall.median)}`}>{stats.overall.median}</dd>
          </div>
        )}
      </dl>

      <section className="block" aria-labelledby="session-fixes">
        <h2 className="block-title" id="session-fixes">
          What to work on
        </h2>
        {fixes.length ? (
          <ol className="week-list">
            {fixes.map((f, i) => {
              const drill = drillFor(FLAW_DRILL[f.flaw])
              return (
                <li className="focus-next-item" key={f.flaw}>
                  <span className="focus-next-rank">{i + 1}</span>
                  <div className="focus-next-body">
                    <h3 className="focus-next-title">{flawTitle(f.flaw)}</h3>
                    {drill && <p className="focus-next-drill">{drill.name}</p>}
                    <p className="focus-next-why tnum">{fixCountLine(f, stats.read)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="session-meta">{cue('No fault showed on most of your serves.')}</p>
        )}
      </section>

      <section className="block" aria-labelledby="session-change">
        <h2 className="block-title" id="session-change">
          Start against end
        </h2>
        {stats.driftOver === 0 ? (
          <p className="session-meta">
            {cue('Too few serves from one spot to compare the start with the end.')}
          </p>
        ) : stats.drifts.length ? (
          stats.drifts.slice(0, 2).map((d) => (
            <p className="session-meta" key={d.id}>
              {driftLine(d)}
            </p>
          ))
        ) : (
          <p className="session-meta">{cue('Held steady from start to end.')}</p>
        )}
      </section>

      <section className="block" aria-labelledby="session-every">
        <h2 className="block-title" id="session-every">
          Every serve
        </h2>
        <ServeStrip lines={session.lines} id="contactHeight" />
        <TossStrip lines={session.lines} />
      </section>

      {picks.best.length > 0 && (
        <section className="block" aria-labelledby="session-picks">
          <h2 className="block-title" id="session-picks">
            Best and worst
          </h2>
          <Picks title="Best" numbers={picks.best} byNumber={byNumber} stills={session.stills} />
          {picks.worst.length > 0 && (
            <Picks title="Worst" numbers={picks.worst} byNumber={byNumber} stills={session.stills} />
          )}
        </section>
      )}

      {before && stats.overall && before.overall && (
        <section className="block" aria-labelledby="session-since">
          <h2 className="block-title" id="session-since">
            Since last session
          </h2>
          <p className="session-meta tnum">
            {sinceLine(stats.overall.median, before.overall.median)}
          </p>
          {before.verdict
            .filter((f) => !stats.verdict.includes(f))
            .slice(0, 2)
            .map((f) => (
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
}: {
  title: string
  numbers: number[]
  byNumber: Map<number, ServeLine>
  stills?: Record<number, string>
}) {
  return (
    <div className="session-picks">
      <h3 className="session-picks-title">{title}</h3>
      <ul>
        {numbers.map((n) => {
          const line = byNumber.get(n)!
          return (
            <li key={n}>
              {stills?.[n] ? (
                <img src={stills[n]} alt={`Contact, serve at ${clockOf(line.t)}`} width={120} height={160} />
              ) : (
                <span className="session-pick-blank" aria-hidden="true" />
              )}
              <span className="session-pick-at tnum">{clockOf(line.t)}</span>
              <span className={`session-pick-score tnum is-${statusOf(line.overall ?? 0)}`}>{line.overall}</span>
            </li>
          )
        })}
      </ul>
    </div>
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
function ServeStrip({ lines, id }: { lines: readonly ServeLine[]; id: string }) {
  const points = lines
    .filter((l) => l.status === 'read' && l.readings?.[id] && l.readings[id].confidence >= 0.55)
    .map((l) => ({ n: l.number, v: l.readings![id].value }))
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
  const read = lines.filter((l) => l.status === 'read' && l.toss && l.toss.confidence >= 0.55)
  const across = read.filter((l) => l.toss!.across !== undefined).length > read.length / 2
  const points = read
    .map((l) => ({ n: l.number, v: across ? l.toss!.across : l.toss!.ahead }))
    .filter((p): p is { n: number; v: number } => p.v !== undefined)
  if (points.length < 2) return null
  const label = across ? 'Toss across your front foot' : 'Toss in front of your front foot'
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
          ? `Serve at ${at}, not read yet`
          : line.status === 'unclear'
            ? `Serve at ${at}, too unclear to read`
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
