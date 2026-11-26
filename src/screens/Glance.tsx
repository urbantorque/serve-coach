import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Cue, Icon, ScoreRing } from '../components/primitives'
import { DeltaChip } from '../components/DeltaChip'
import { causalPlan, faultMoveLine, refusalFor, rotationMoveLine } from '../lib/analysis/verdict'
import type { FaultMove, RotationMove } from '../lib/analysis/carryForward'
import { SERVE_OUTCOMES, type ServeOutcome } from '../lib/storage/db'
import type { Analysis } from '../lib/analysis/types'
import { OUTCOME_LABEL, SERVE_NUMBER_LABEL, serveTagSummary } from '../lib/serveTagCopy'
import { hasLocalVoice, onVoicesChanged, speakLocally, stopSpeaking } from '../lib/speech'
import { scoreMoveCaption, scoreMoveWords, type ScoreMove } from '../lib/progress'
import { canMoveUp, tripCheckLine, tripDrillCheck } from '../lib/tripCheck'
import { repLine, setDone } from '../lib/guidedSet'
import { judgeServe } from '../lib/analysis/progressions'
import type { FlawId } from '../lib/analysis/flaws'
import { beforeAfter } from '../lib/graduationCard'
import FixedPair from '../components/FixedPair'
import TermCue from '../components/TermCue'
import type { Session } from '../lib/storage/db'
import { readPrefs } from '../lib/storage/prefs'
import { onCourtDefault } from '../lib/framing/handsFree'
import { defaultSpeedUnit, speedFigures, speedGlanceLine, speedRangeLine, speedSpokenLine } from '../lib/speedCopy'
import '../styles/court.css'
import { MOVE_UP } from '../lib/phrases'
import { FAULT_NAME } from '../lib/graduation'

/** The serve itself beside its reading, on a laptop only (E5.7). */
const GlanceFigure = lazy(() => import('../components/GlanceFigure'))
const laptop = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches

/** An invisible copy of the Stay here chip, holding the row's height once the countdown stops. */
const HOLD_SPACE = { visibility: 'hidden' } as const

/**
 * Seconds before the glance hands back to the viewfinder on its own, with
 * hands-free on (C3). Long enough to hear the glance and walk back to the
 * baseline with the next ball; the viewfinder then waits for the player to
 * stand ready before it counts down, so arriving early costs nothing.
 */
export const BACK_TO_CAMERA_S = 15

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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
  /** Each serve number's best set of ten, said on its chip (N3.2). */
  bestSets?: { 1?: number; 2?: number }
  /** Move the checked fault's ladder to a step. Absent where prefs cannot be kept. */
  /** `from` is the rung being left, so a move up can be told from a step back (Q10). */
  onLadderStep?: (flaw: string, step: number, from?: number) => void
  /** The saved serves: for the trip's drill check (N1.3) and a passed step's before and after (N3.3). */
  history?: readonly Session[]
  /** What the trip check needs besides the history: the ladder, when it moved, a chosen drill (N1.4). */
  trip?: { ladder?: Partial<Record<string, number>>; movedAt?: Partial<Record<string, number>>; target?: FlawId }
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
  bestSets,
  onLadderStep,
  history,
  trip,
  speak = false,
  onToggleSpeak,
}: Props) {
  const refusal = refusalFor(analysis.triage)
  // The step's evidence, once a trip has passed it (N3.3): the fault's moment
  // on the last serve that named it before, beside today's clean one.
  // Worked out here, in the glance's own chunk, so the entry carries none of it.
  const tripCheck = useMemo(
    () => (history ? tripDrillCheck(history as Session[], analysis as Session, trip?.ladder, trip?.movedAt, trip?.target) : undefined),
    [history, analysis, trip],
  )
  const stepPair = useMemo(
    () =>
      tripCheck?.outcome === 'passed' && history
        ? beforeAfter([...history.filter((s) => s.id !== analysis.id), analysis as Session], tripCheck.flaw, tripCheck.since)
        : undefined,
    [tripCheck, history, analysis],
  )
  const plan = causalPlan(analysis.triage, analysis.diagnosis)
  /*
   * With no graded fault, the card's own focus, as the report leads with it
   * (Mirror M1.4): a serve whose report said "Work on this next" was "Nothing
   * stood out" here, read between serves as a clean one.
   */
  const first = plan[0] ?? (refusal ? undefined : analysis.focus)
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
  const moveLine = move && !(trip?.target && move.flaw !== trip.target)
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
   * Court mode (C3): hands-free is on, so the phone is on the fence and the
   * player is walking back to it. One figure as big as it will go — the speed
   * if one was read, the score if not — and the fix as one line, readable from
   * a couple of metres. Everything else on this screen follows underneath for
   * whoever walks up to the phone.
   */
  const prefs = readPrefs()
  const unit = prefs.speedUnit ?? defaultSpeedUnit()
  const reading = analysis.speed && 'speed' in analysis.speed ? speedFigures(analysis.speed.speed, unit) : undefined
  // The viewfinder's own default (Q6): a phone player who never set hands-free
  // filmed with it on, so this screen has to be read from the fence too.
  const handsFree = prefs.handsFree ?? onCourtDefault()
  const court = handsFree && !refusal
  /*
   * A guided set (C1.1): the player chose this drill to check, so what is said
   * is this serve against its one fault, and the set so far. Once the set has
   * its answer the loop back to the camera stops: the set is over.
   */
  const guided = trip?.target && (!tripCheck || tripCheck.flaw === trip.target)
    ? repLine(trip.target, judgeServe(analysis as Session, trip.target), tripCheck)
    : undefined
  const setOver = !!guided && setDone(tripCheck)
  /*
   * In a guided set the big line is the set's fault and this serve's verdict
   * on it (E4.4): it named the serve's first fix, another fault, while the
   * voice said "not yet" about the one being checked.
   */
  const setJudged = guided && trip?.target ? judgeServe(analysis as Session, trip.target) : undefined
  const setLine = guided && trip?.target ? `${FAULT_NAME[trip.target]}: ${setJudged === 'clean' ? 'gone on this serve' : setJudged === 'named' ? 'still there' : 'I couldn’t judge this one'}` : undefined
  // A passed step is the one thing to do next (E1.6): its button takes the
  // lime, and filming another serve steps back to a plain button beside it.
  const stepUp = !!tripCheck && canMoveUp(tripCheck) && !!onLadderStep
  const filmClass = stepUp ? 'btn btn--ghost' : 'btn btn--primary'

  /*
   * The picture a laptop's width is for (E5.7): the fault the big line names,
   * held at its moment, painted only when this serve had it. In a guided set
   * on court that is the set's fault; otherwise the first fix.
   */
  const figureFix = court && setLine && trip?.target ? { title: FAULT_NAME[trip.target], flaw: trip.target } : first
  const figurePaint = court && setLine ? setJudged === 'named' : !!first

  // And then back to the camera, counted down where it can be seen, with any
  // touch of this screen — a tag, a scroll — keeping it here instead.
  const [backIn, setBackIn] = useState<number | null>(() => (handsFree && onRecordAnother && !setOver ? BACK_TO_CAMERA_S : null))
  // Whether this screen opened counting down, so the stopped row keeps its place.
  const counted = useRef(backIn !== null)
  const recordAnotherRef = useRef(onRecordAnother)
  recordAnotherRef.current = onRecordAnother
  useEffect(() => {
    if (backIn === null) return
    if (backIn <= 0) {
      recordAnotherRef.current?.()
      return
    }
    const id = setTimeout(() => setBackIn(backIn - 1), 1000)
    return () => clearTimeout(id)
  }, [backIn])

  /*
   * The same screen, read aloud (D6.2), for a phone propped on a fence that
   * nobody is looking at. What a sighted glance reads first: the refusal, or
   * the score and the one fix. Only with a voice on this device — see
   * `lib/speech.ts` — and the toggle only appears when there is one.
   */
  const spoken = refusal
    ? refusal.title
    : guided
      ? guided
      : // The speed first, when there is one (C3): the reading a player most
      // wants, and the one this screen cannot show from the baseline.
      `${reading ? `${speedSpokenLine(reading, unit)} Score ` : ''}${analysis.overall}${scoreMove ? `, ${scoreMoveWords(scoreMove)}` : ''}. ${first ? `${first.title}.` : 'Nothing stood out on that one. Hit another.'}`
  const [voiced, setVoiced] = useState(() => hasLocalVoice())
  // The tag fold keeps its own open state: the countdown re-renders this screen every second.
  const [tagsOpen, setTagsOpen] = useState(false)
  useEffect(() => onVoicesChanged(() => setVoiced(hasLocalVoice())), [])
  useEffect(() => {
    if (!speak || !voiced) return
    speakLocally(spoken)
    return stopSpeaking
  }, [speak, voiced, spoken])

  // Under the readout in court mode, where a player walking back is looking;
  // at the foot, by the button it presses, otherwise.
  /*
   * Once stopped, the row stays with the same height: it used to vanish on the
   * pointer-down that stopped it, so everything below jumped up before the tap
   * landed, and the first tap on anything under it hit the wrong thing.
   */
  const nextRow =
    backIn !== null ? (
      <p className="court-next" role="timer" aria-live="off">
        <span>Back to the camera in {backIn}{'\u00a0'}s</span>
        <button type="button" className="chip chip--button" onClick={() => setBackIn(null)}>
          Stay here
        </button>
      </p>
    ) : counted.current ? (
      <p className="court-next">
        <span>I’ll stay on this screen</span>
        <span className="chip chip--button" aria-hidden="true" style={HOLD_SPACE}>
          Stay here
        </span>
      </p>
    ) : null

  return (
    <div className={`screen glance${court ? ' glance--court' : ''}`} onPointerDown={backIn !== null ? () => setBackIn(null) : undefined}>
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

      {!refusal && laptop() && (
        <Suspense fallback={<figure className="glance-figure"><div className="glance-stage" /></figure>}>
          <GlanceFigure analysis={analysis} fix={figureFix} paint={figurePaint} />
        </Suspense>
      )}

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
          {/* Two numbers and one line, as big as the screen allows: the whole of
              what a player walking back wants, and nothing to study. The speed
              is lime because it is the reading; neither is a grade. */}
          {/* On court the warning leads, above the numbers (E4.4), as it does on the report. */}
          {strain && court && (
            <p className="glance-move glance-strain">
              <Icon name="warn" size={15} />
              <span>{strain}</span>
            </p>
          )}
          {court && (
            <div className="court-readout">
              <div className="court-numbers">
                {reading && (
                  <p className="court-readout-figure court-readout-figure--speed">
                    <span className="court-readout-unit court-readout-about">about</span>
                    {reading.best}
                    <span className="court-readout-unit">{reading.unit}</span>
                    <span className="sr-only"> off the racket</span>
                  </p>
                )}
                <p className="court-readout-figure" role="img" aria-label={`Score ${analysis.overall} out of 100`}>
                  {analysis.overall}
                  <span className="court-readout-unit">score</span>
                </p>
              </div>
              {reading && (
                <p className="court-readout-note">{speedRangeLine(reading)}</p>
              )}
              {scoreMove && <p className="court-readout-note">{sentence(scoreMoveWords(scoreMove))}.</p>}
              <p className="court-readout-line">
                {setLine ? <strong>{setLine}</strong> : first ? <strong>{first.title}</strong> : 'Nothing stood out. Hit another.'}
              </p>
            </div>
          )}
          {/* The next serve, under the figure rather than under every tag and
              chip on the screen (Q8). It is what the walk back is for. */}
          {court && onRecordAnother && (
            <button className={`${filmClass} btn--big btn--full`} onClick={onRecordAnother}>
              <Icon name="camera" size={20} />
              Film another serve
            </button>
          )}
          {court && nextRow}

          {/* Off court there is room for the number the report leads with, and
              no walk back to read it from. */}
          {!court && (
            <div role="img" aria-label={`Score ${analysis.overall} out of 100`}>
              <ScoreRing score={analysis.overall} status={analysis.overallStatus} size={132} />
            </div>
          )}

          {/* Against the last serve, as the report's hero puts it — the same
              chip, held to the same line (L3.1). Without it a player reads 68
              and then 74 and takes the six points home, and six is a move the
              camera makes on its own. */}
          {scoreMove && !court && (
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
          {strain && !court && (
            <p className="glance-move glance-strain">
              <Icon name="warn" size={15} />
              <span>{strain}</span>
            </p>
          )}

          {first ? (
            <>
              <h1 className={court ? 'sr-only' : 't-headline glance-fix'}>{first.title}</h1>
              {!court && (
                <p className="glance-why">
                  <TermCue text={first.why} />
                </p>
              )}
            </>
          ) : (
            /* Scored, and nothing named. The report says this at length under a
               plan that is empty; here it is the whole message, and it is a
               good one to receive between serves. */
            !court && <p className="glance-why">Nothing stood out on that one. Hit another.</p>
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
                <strong>Drill: {tripCheck.step}</strong> · <Cue text={tripCheckLine(tripCheck)} />
              </span>
              {canMoveUp(tripCheck) && onLadderStep && (
                <button
                  type="button"
                  className="btn btn--primary glance-check-move"
                  onClick={() => onLadderStep(tripCheck.flaw, tripCheck.rung + 1, tripCheck.rung)}
                >
                  {MOVE_UP}
                </button>
              )}
            </div>
          )}
          {/* Two figures side by side are a screen to study, not a glance from
              the fence (Q8): in court mode they wait for "Show me everything". */}
          {stepPair && !court && <FixedPair then={stepPair.then} now={stepPair.now} title="That step, then and now" />}

          {/* The racket against the last serve. Same class, same shape, and the
              neutral icon in both directions on purpose: nothing grades this
              reading, so laying back further is not a tick and less is not a
              warning. */}
          {rotationLine && !court && (
            <p className="glance-move">
              <Icon name="info" size={15} />
              <span>{rotationLine}</span>
            </p>
          )}

          {/* The speed in one line, when one was read (N2.7); a miss waits
              for the report's fold. */}
          {!court && analysis.speed && 'speed' in analysis.speed && (
            <p className="glance-serves">
              {speedGlanceLine(speedFigures(analysis.speed.speed, readPrefs().speedUnit ?? defaultSpeedUnit()))}
            </p>
          )}

          {/* Said here rather than left for the report, because this screen
              shows one of them and the player can see there were more. */}
          {analysis.serves.count > 1 && (
            <p className="glance-serves">
              {analysis.serves.count} serves in that clip. This is number{' '}
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
        with. `.glance-actions` is this screen's own button layout, `t-overline`
        the label class the score row uses, and the chips are the landing row's
        own (`.reading-chips`, `.chip--button` with its 44px press). They were
        two stacked full-width buttons until Q8, which made a two-way tap most
        of a screen on the one screen that is read between serves.

        `aria-pressed` carries the state rather than colour alone — the gap R21
        closed elsewhere in this app, applied here while writing rather than in a
        later accessibility pass.
      */}
      {/* Both tag rows folded to one line that says what is known (2026-11-25):
          optional, and open while a set of ten is counting, which needs the
          landing taps. */}
      {(onTagServe || onTagOutcome) && !refusal && (
        <details
          className="glance-tags"
          open={tagsOpen || Boolean(set?.running)}
          onToggle={(e) => setTagsOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="link-btn link-btn--quiet tag-summary">
            {serveTagSummary(serveNumber, outcome)}
            <Icon name="chevron" size={16} />
          </summary>
        {onTagServe && (
          <div className="glance-actions">
            <span className="t-overline">Which serve was it?</span>
            {/* One row of chips since Q8, as the landing below has always been:
                two full-width buttons were most of a screen for a two-way tap. */}
            <div className="reading-chips">
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  className="chip chip--button"
                  aria-pressed={serveNumber === n}
                  onClick={() => onTagServe(serveNumber === n ? undefined : n)}
                >
                  {SERVE_NUMBER_LABEL[n]}
                </button>
              ))}
            </div>
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
        {/* Inside the fold since 2026-11-25: a set counts the landing taps
            above it, and as its own line under the fold it was one more thing
            to read between serves. */}
        {onTagOutcome && onStartSet && !set?.running && (
          <div className="glance-actions">
            <span className="t-overline">Count how many of your next 10 go in</span>
            <div className="reading-chips">
              {([1, 2] as const).map((n) => (
                <button key={n} className="chip chip--button" onClick={() => onStartSet(n)}>
                  {n === 1 ? 'First serves' : 'Second serves'}
                  {bestSets?.[n] !== undefined && <span className="chip-note">· best {bestSets[n]} of 10</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        </details>
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

      <footer className="glance-actions">
        {!court && nextRow}
        {onRecordAnother && !court && (
          <button className={`${filmClass} btn--full`} onClick={onRecordAnother}>
            <Icon name="camera" size={18} />
            Film another serve
          </button>
        )}
        <button className="btn btn--quiet btn--full" onClick={onOpenReport}>
          Open the full report
        </button>
      </footer>
    </div>
  )
}
