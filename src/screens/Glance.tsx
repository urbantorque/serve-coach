import { Cue, Icon, ScoreRing } from '../components/primitives'
import { causalPlan, refusalFor } from '../lib/analysis/verdict'
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
}

export default function Glance({ analysis, onRecordAnother, onOpenReport, onBack }: Props) {
  const refusal = refusalFor(analysis.triage)
  const plan = causalPlan(analysis.triage, analysis.diagnosis)
  const first = plan[0]

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
              from further away than they read anything else in the app. */}
          <ScoreRing score={analysis.overall} status={analysis.overallStatus} size={132} />

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
