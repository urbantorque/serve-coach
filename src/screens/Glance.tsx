import { Cue, Icon, ScoreRing } from '../components/primitives'
import { causalPlan, faultMoveLine, refusalFor } from '../lib/analysis/verdict'
import type { FaultMove } from '../lib/analysis/carryForward'
import type { Analysis } from '../lib/analysis/types'

/**
 * What the serve was, in one number and one line, without leaving the court.
 *
 * The report is the right screen for somebody sitting down with their serve. It
 * is the wrong one for somebody holding a basket of balls: a score ring, a
 * ranked plan, five area cards, a frame-by-frame player, a spread panel and a
 * filmstrip is a screen to be read, and reading it means the next serve does not
 * get hit. That is the loop this exists to keep going — record, glance, record.
 *
 * It runs no analysis of its own. Everything here comes off the same `Analysis`
 * the report would render, chosen through the same `causalPlan` the report ranks
 * with, so there is no second opinion about what the serve's problem was — only
 * a smaller amount of it said at once. A lighter second engine would be a
 * different app disagreeing with the first one on the same court.
 *
 * A clip the engine could not read gets the refusal and nothing else. Being told
 * a score and an instruction off a clip the app has already decided it cannot
 * stand behind is the failure this whole codebase is arranged against, and it
 * would be worse here than anywhere: there is no room on this screen for the
 * caveats the report carries.
 */
interface Props {
  analysis: Analysis
  /** Straight back to the viewfinder, which is the point of this screen. */
  onRecordAnother?: () => void
  onOpenReport: () => void
  onBack: () => void
  /**
   * Whether the fault the previous serve on this trip was told about moved.
   *
   * Absent on the first serve of a trip, and absent far more often than not
   * after that — see `faultMove`, which refuses every comparison it cannot
   * stand behind rather than hedging one. The screen must render identically
   * without it, which is what it did before this existed.
   */
  move?: FaultMove
}

export default function Glance({ analysis, onRecordAnother, onOpenReport, onBack, move }: Props) {
  const refusal = refusalFor(analysis.triage)
  const plan = causalPlan(analysis.triage, analysis.diagnosis)
  const first = plan[0]
  /*
   * Does the heading this screen is about to draw already name this fault?
   *
   * Compared against `primary_flaw`, which `causalPlan` guarantees is what its
   * first entry was built from — and on the flaw id rather than on the rendered
   * title, since `focusFor` heads a signal past the top of its band differently
   * from one under the bottom, and a heading is not an identity.
   *
   * Not gated on there being a heading at all. A serve that cleared the fault
   * and named nothing new is the best news this screen ever carries, and it is
   * exactly the case where "Nothing stood out" alone would fail to connect the
   * result to the work — `primary_flaw` is absent there, so the full form with
   * the fault named is what gets built.
   */
  const moveLine = move
    ? faultMoveLine(move, move.flaw === analysis.triage?.primary_flaw?.flaw)
    : undefined

  return (
    <div className="screen glance">
      <header className="glance-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
      </header>

      {refusal ? (
        <section className="glance-body">
          <span className="glance-mark">
            <Icon name="warn" size={24} />
          </span>
          <h1 className="t-headline">{refusal.title}</h1>
          {/* Every hint, not the first one. They are filming instructions in the
              order worth trying, and there are only ever two or three — cutting
              them to fit a small screen would drop the one that works. */}
          <ul className="glance-hints">
            {refusal.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="glance-body">
          {/* The number the report leads with, at the size the report gives it.
              Somebody glancing at a phone propped on a fence is reading this
              from further away than they read anything else in the app.

              No visible label, on purpose — this ring is the whole screen's
              first sentence and a caption under it would be a second one. A
              screen reader gets no such context from size or position, so
              `role="img"` collapses the ring to one node with the sentence a
              sighted glance already reads, rather than a bare "68" landing
              ahead of the headline with nothing to say what it counts. */}
          <div role="img" aria-label={`Score ${analysis.overall} out of 100`}>
            <ScoreRing score={analysis.overall} status={analysis.overallStatus} size={132} />
          </div>

          {first ? (
            <>
              <h1 className="t-headline glance-fix">{first.title}</h1>
              <p className="glance-why">
                <Cue text={first.why} />
              </p>
            </>
          ) : (
            /* Scored, and nothing named. The report says this at length under a
               plan that is empty; here it is the whole message, and it is a
               good one to receive between serves. */
            <p className="glance-why">Nothing stood out on that one. Hit another.</p>
          )}

          {/* Whether the last serve's fault moved — see `faultMove`.
              Under the fix rather than over it, because this screen's job is
              still to say what to do next and a result is not an instruction.
              Its own class so it reads as a different kind of sentence from
              the coaching above it, assembled from existing tokens; nothing
              here restyles anything the screen already had. */}
          {moveLine && (
            <p className="glance-move">
              <Icon name={move?.verdict === 'wider' ? 'info' : 'check'} size={15} />
              <span>{moveLine}</span>
            </p>
          )}

          {/* Said here rather than left for the report, because this screen
              shows one of them and the player can see there were more. */}
          {analysis.serves.count > 1 && (
            <p className="glance-serves">
              {analysis.serves.count} serves in that clip — this is number{' '}
              {analysis.serves.index + 1}.
            </p>
          )}
        </section>
      )}

      <footer className="glance-actions">
        {onRecordAnother && (
          <button className="btn btn--primary btn--full" onClick={onRecordAnother}>
            <Icon name="camera" size={18} />
            Record another
          </button>
        )}
        <button className="btn btn--ghost btn--full" onClick={onOpenReport}>
          Show me everything
        </button>
      </footer>
    </div>
  )
}
