import { useEffect, useState } from 'react'
import { Cue, Icon, ScoreRing } from '../components/primitives'
import { DeltaChip } from '../components/Trend'
import { causalPlan, faultMoveLine, refusalFor, rotationMoveLine } from '../lib/analysis/verdict'
import type { FaultMove, RotationMove } from '../lib/analysis/carryForward'
import { SERVE_OUTCOMES, type ServeOutcome } from '../lib/storage/db'
import type { Analysis } from '../lib/analysis/types'
import { OUTCOME_LABEL, SERVE_NUMBER_LABEL } from '../lib/serveTagCopy'
import { hasLocalVoice, onVoicesChanged, speakLocally, stopSpeaking } from '../lib/speech'
import { scoreMoveCaption, scoreMoveWords, type ScoreMove } from '../lib/progress'
import { canMoveUp, tripCheckLine, type TripCheck } from '../lib/tripCheck'

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
  /** No frames needed: a reopened report opens this screen too (N1.8). */
  analysis: Omit<Analysis, 'frames'>
  /** Read this screen aloud on arrival — `Prefs.speakGlance`. */
  speak?: boolean
  onToggleSpeak?: (on: boolean) => void
  /** Straight back to the viewfinder, which is the point of this screen. */
  onRecordAnother?: () => void
  onOpenReport: () => void
  /**
   * Say which serve this was, or take it back by passing nothing.
   *
   * Absent where nothing can store it, the same rule `onLogDrill` follows on the
   * report — and the screen renders identically without it, which is the test
   * every optional prop on this file has had to pass since `move` was added.
   */
  onTagServe?: (n: 1 | 2 | undefined) => void
  /** What the player has already said about this serve, if anything. */
  serveNumber?: 1 | 2
  /**
   * Say where it landed, or take it back by passing nothing.
   *
   * Independent of `onTagServe` above — a player taps one, the other, or far
   * more often neither, and one tap must never clear the other. That rule lives
   * in `withServeTag`, not here.
   */
  onTagOutcome?: (o: ServeOutcome | undefined) => void
  /** Where the player has already said it landed, if they said. */
  outcome?: ServeOutcome
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
  /**
   * How the racket's lay-back moved against the last serve on this trip — see
   * `rotationMove`. Refuses far more often than `move` above, because its floor
   * is roughly 17° and that is what one camera can see of a shoulder.
   */
  rotation?: RotationMove
  /**
   * A joint warning this serve raised that keeps recurring — see `glanceStrain`.
   *
   * The one thing on this screen that is not about the next serve. Everything
   * else here answers "what do I do differently now"; this answers "how many
   * more of these should I hit today", which is a question only somebody
   * standing on a court with a basket can act on, and the report — read
   * afterwards, sitting down — is too late for.
   *
   * Absent almost always: it takes a live recurring pattern AND this serve
   * raising the same flag. The screen must render identically without it.
   */
  strain?: string
  /**
   * This serve's overall against the last one's (L3.1), held to the camera's
   * own line so that a move it makes on its own is said as no change. Absent
   * on a first serve, or across a change of rubric; the screen must render
   * identically without it.
   */
  scoreMove?: ScoreMove
  /**
   * A set of serves (L3.7): the running count while one is under way, or the
   * line a set just finished on this serve earned. Absent otherwise.
   */
  set?: { line: string; running: boolean }
  /** Start a set of ten of one serve number. Absent where taps cannot be stored. */
  onStartSet?: (serveNumber: 1 | 2) => void
  onStopSet?: () => void
  /**
   * The drill being worked on, checked across this trip's recorded serves
   * (N1.3): "4 of 6 clean so far", and the move once the bar is met.
   */
  tripCheck?: TripCheck
  /** Move the checked fault's ladder to a step. Absent where prefs cannot be kept. */
  onLadderStep?: (flaw: string, step: number) => void
}

export default function Glance({
  analysis,
  onRecordAnother,
  onOpenReport,
  onTagServe,
  serveNumber,
  onTagOutcome,
  outcome,
  onBack,
  move,
  rotation,
  strain,
  scoreMove,
  set,
  onStartSet,
  onStopSet,
  tripCheck,
  onLadderStep,
  speak = false,
  onToggleSpeak,
}: Props) {
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
  /*
   * The racket's lay-back against the last serve — R50b, and a different
   * question from the one above. `faultMove` follows the fault the player was
   * told about; this follows a reading nothing grades, and it refuses far more
   * often. Independent on purpose: neither silences the other, and a trip where
   * the named fault held still while the racket moved is exactly the case worth
   * seeing.
   */
  const rotationLine = rotation ? rotationMoveLine(rotation) : undefined

  /*
   * The same screen, read aloud (D6.2), for a phone propped on a fence that
   * nobody is looking at. What a sighted glance reads first: the refusal, or
   * the score and the one fix. Only with a voice on this device — see
   * `lib/speech.ts` — and the toggle only appears when there is one.
   */
  const spoken = refusal
    ? refusal.title
    : `${analysis.overall}${scoreMove ? `, ${scoreMoveWords(scoreMove)}` : ''}. ${first ? `${first.title}. ${first.why}` : 'Nothing stood out on that one. Hit another.'}`
  const [voiced, setVoiced] = useState(() => hasLocalVoice())
  useEffect(() => onVoicesChanged(() => setVoiced(hasLocalVoice())), [])
  useEffect(() => {
    if (!speak || !voiced) return
    speakLocally(spoken)
    return stopSpeaking
  }, [speak, voiced, spoken])

  return (
    <div className="screen glance">
      <header className="glance-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        {onToggleSpeak && voiced && (
          <button className="chip chip--button glance-speak" aria-pressed={speak} onClick={() => onToggleSpeak(!speak)}>
            Read aloud
          </button>
        )}
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

          {/* Against the last serve, as the report's hero puts it — the same
              chip, held to the same line (L3.1). Without it a player reads 68
              and then 74 and takes the six points home, and six is a move the
              camera makes on its own. */}
          {scoreMove && (
            <span className="hero-delta">
              <DeltaChip delta={scoreMove.delta} scope="overall" alike={scoreMove.alike} />
              <span>{scoreMoveCaption(scoreMove)}</span>
            </span>
          )}

          {/* Above the fix, not under it, and it is the only thing on this
              screen that outranks the instruction. Everything below answers
              "what do I change on the next one"; this answers "how many more
              of these should I hit", and a sentence about a joint filed
              underneath a technique cue reads as a footnote to it — the same
              reading that put this block at the top of the progress sheet.

              The report's `.injury` card is deliberately not reused. That card
              is three paragraphs and a title, which is a screen to be read, and
              this screen exists because reading one means the next serve does
              not get hit. Same box as `.glance-move`, same tokens, one rule
              down the side in the colour the report already gives this
              subject. */}
          {strain && (
            <p className="glance-move glance-strain">
              <Icon name="warn" size={15} />
              <span>{strain}</span>
            </p>
          )}

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

          {/* The drill check across this trip's serves (N1.3). The one place the
              record-and-glance route can say "move up a step": until this, only
              a basket picked from the gallery was ever checked. */}
          {tripCheck && (
            <div className="glance-move glance-check" role="status">
              <Icon name={tripCheck.outcome === 'passed' ? 'check' : 'info'} size={15} />
              <span>
                <strong>{tripCheck.step}</strong> · <Cue text={tripCheckLine(tripCheck)} />
              </span>
              {canMoveUp(tripCheck) && onLadderStep && (
                <button
                  type="button"
                  className="btn btn--primary glance-check-move"
                  onClick={() => onLadderStep(tripCheck.flaw, tripCheck.rung + 1)}
                >
                  Move up a step
                </button>
              )}
            </div>
          )}

          {/* The racket against the last serve. Same class, same shape, and the
              neutral icon in both directions on purpose: nothing grades this
              reading, so laying back further is not a tick and less is not a
              warning. */}
          {rotationLine && (
            <p className="glance-move">
              <Icon name="info" size={15} />
              <span>{rotationLine}</span>
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

      {/*
        Which serve it was, in one tap.

        R53·1 refused inference by two independent routes — the rig's 18 sd
        separation is the one that was dialled, and "serves arrive in pairs" is a
        fact about how people practise rather than about a clip — so a tap is the
        only honest route, and this is the moment for it: the player is on the
        court having just hit the thing.

        NO THIRD STATE ON SCREEN. Untagged is the default and needs no button;
        tapping the one already chosen clears it, which is the undo `unlogPractice`
        already establishes for a tap that is easy to make by accident on a phone
        held at arm's length.

        ZERO NEW CSS, which is constraint 3 taken literally rather than argued
        with. `.glance-actions` is this screen's own button layout — a flex
        column with the gap already chosen — and `t-overline` is the label class
        the score row uses. Two stacked ghost buttons is not the tightest layout
        anybody could draw for a two-way choice, and a two-across row would need
        a class this stylesheet does not have. On a phone held at arm's length,
        full-width targets are the better trade anyway.

        `aria-pressed` carries the state rather than colour alone — the gap R21
        closed elsewhere in this app, applied here while writing rather than in a
        later accessibility pass.
      */}
      {onTagServe && (
        <div className="glance-actions">
          <span className="t-overline">Which serve was it?</span>
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              className="btn btn--ghost btn--full"
              aria-pressed={serveNumber === n}
              onClick={() => onTagServe(serveNumber === n ? undefined : n)}
            >
              {SERVE_NUMBER_LABEL[n]}
            </button>
          ))}
        </div>
      )}

      {/*
        Where it landed, in one tap. R56.

        CHIPS, NOT FOUR MORE FULL-WIDTH BUTTONS. Two stacked ghost buttons was
        the right trade for a two-way choice; four would be most of a phone
        screen, on the one screen in this app that exists because reading takes
        time the next serve needs. `.chip--button` already carries a 44px tap
        target and is built for wrapping rows — its own comment says so — and
        `.reading-chips` is three properties of flex wrap. Borrowed from the
        report rather than copied into a new class, which is constraint 3 taken
        as written: nothing new, and no restyle of what was borrowed.

        THE APP DOES NOT SEE THE COURT AND NEVER CLAIMS TO. There is no service
        box here, no line, no judgement — four words a player would use, stored
        exactly as tapped. "Wide" is safe beside the fault line above it, which
        renders as "Further out this time": `wider` is an enum and never
        reaches the screen. The heading is what keeps the two apart.

        AND NOTHING IS SAID BACK. R56 names the trap in its own words — "your
        toss drifts more on the serves you miss" is a correlation over six
        points — so this round stores the tap and draws nothing from it. The
        claim is a later round's problem and it starts blocked.
      */}
      {onTagOutcome && (
        <div className="glance-actions">
          <span className="t-overline">Where did it land?</span>
          <div className="reading-chips">
            {SERVE_OUTCOMES.map((o) => (
              <button
                key={o}
                className="chip chip--button"
                aria-pressed={outcome === o}
                onClick={() => onTagOutcome(outcome === o ? undefined : o)}
              >
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
        A set of ten from the player's own taps (L3.7). Under the landing
        chips, because a set counts nothing until a landing is tapped, and in
        the same chips and asides the screen already has — nothing new to read
        on a fence.
      */}
      {onTagOutcome && set && (
        <div className="glance-actions">
          <p className="glance-move">
            <Icon name={set.running ? 'target' : 'check'} size={15} />
            <span>{set.line}</span>
          </p>
          {set.running && onStopSet && (
            <div className="reading-chips">
              <button className="chip chip--button" onClick={onStopSet}>
                Stop this set
              </button>
            </div>
          )}
        </div>
      )}
      {onTagOutcome && onStartSet && !set?.running && (
        <div className="glance-actions">
          <span className="t-overline">Start a set of 10</span>
          <div className="reading-chips">
            {([1, 2] as const).map((n) => (
              <button key={n} className="chip chip--button" onClick={() => onStartSet(n)}>
                {n === 1 ? 'First serves' : 'Second serves'}
              </button>
            ))}
          </div>
        </div>
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
