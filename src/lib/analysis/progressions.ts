/**
 * How each fault is coached past one drill: a feel to aim for, a ladder of
 * steps from the most guided to the most like a match, an easier way in, the
 * mistake to watch for, and the bar for moving up.
 *
 * WHY A LADDER. A drill is one rung. A player who cannot do it needs the rung
 * below, and a player who can needs to know what comes next and when they have
 * earned it — otherwise the same sentence on every report is the whole coaching
 * relationship. Every source this was built from teaches the same shape: make
 * the task easier by changing it (a closer target, a racket already up, no
 * ball) rather than by chopping the serve into poses, then add pace, then add
 * pressure.
 *
 * WHERE IT COMES FROM. The research brief is in `.scratch/research-drills.md`
 * and its sources are cited there. In outline:
 *
 *   · the order of priorities — grip, then the toss, then the legs — is Dr Mark
 *     Kovacs's (Kovacs & Ellenbecker 2011, Sports Health 3(6); the Kovacs
 *     Institute's finding that most serve faults start at the toss or the load);
 *   · the throwing drills and the back-leg serve are his too, and so is the cap
 *     on throws, which is why no ladder here asks for more than fifteen;
 *   · the edge-first grip chain, the racket-falling drills and the chimney toss
 *     are Feel Tennis and Essential Tennis; the seated and kneeling serves are
 *     Top Tennis Training; the three-depth serve and the grip check before every
 *     point are the USTA's; swinging at every toss, even a bad one, is the ITF
 *     Coaching Review's (constraints-led coaching);
 *   · every cue points outside the body — at the ball, the racket or the court —
 *     because that is what moved serve accuracy in Wulf et al. 2002 and held up
 *     under pressure in Meier et al. 2020.
 *
 * Intuitive Tennis (Nikola Aracic) names most of these faults as the common
 * club ones, which is how this list was checked for gaps; none of the steps are
 * his, and nothing here claims they are.
 *
 * WHAT IS LEFT OUT ON PURPOSE. No step holds a position. "Hold the pose" drills
 * are the commonest way a player learns to stop at the top of the swing and
 * start again from still, and the sources that use them say so. The pancake has
 * no ladder because the engine never names it (`flaws.ts`).
 *
 * The bar is a count of serves the engine no longer names the fault on, out of
 * six, at the player's own target — not a threshold of its own. The noise floors
 * in `tiers.ts` already decide when a reading is a fault and when it is the
 * tracker, and a second opinion here would drift from the first.
 */
import { DRILLS } from './coaching'
import type { BodyAxis } from './axes'
import type { Diagnosis } from './diagnose'
import { FLAWS, MIN_EVIDENCE, type FlawId } from './flaws'
import { CARD_SIGNAL } from './tiers'
import { FLAW_DRILL, type Triage } from './triage'
import type { Drill } from './types'

export interface Progression {
  /** One thing to feel, about the ball, the racket or the court. */
  cue: string
  /** Most guided first, most like a match last. Three to five. */
  steps: Drill[]
  /** The way in for somebody who cannot do the first step yet. */
  easier: string
  /** What usually goes wrong while doing these. */
  mistake: string
  /** Of six serves filmed on this step, how many must come back clean to move up. */
  pass: number
}

/** How many serves a check is made over: one short basket. */
export const CHECK_SERVES = 6

/** Steps that close several ladders, written once. */
const POINTS: Drill = {
  name: 'Play it out',
  how: 'Play ten points with two serves each, keeping the same feel on every one.',
  reps: '10 points',
}

const THREE_DEPTHS: Drill = {
  name: 'Box, line, fence',
  how: 'Serve two into the box, two past the service line and two to the back fence. Repeat three times.',
  reps: '3 rounds',
}

const PROGRESSIONS: Partial<Record<FlawId, Progression>> = {
  waiters_tray: {
    cue: 'Hold the racket like a hammer and let the edge lead the way up to the ball.',
    steps: [
      {
        name: 'Edge bounces',
        how: 'With a hammer grip, bounce a ball on the racket edge, then alternate edge and strings.',
        reps: '50 bounces',
      },
      {
        name: 'Edge-first swings',
        how: 'No ball. Swing slowly and let the racket edge lead down your back and up to the ball.',
        reps: '15 swings',
      },
      {
        name: 'Service line edge serves',
        how: 'From the service line, swing edge first and let the strings turn to the ball only at the end.',
        reps: '25 serves',
      },
      DRILLS.edge_first_serve,
      {
        name: 'Grip check points',
        how: 'Play ten points and check your hammer grip before every serve, first and second.',
        reps: '10 points',
      },
    ],
    easier:
      'Stand side-on with the racket up behind your head, let a ball bounce, and tap it into the court edge first.',
    mistake:
      'Sliding back to a frying-pan grip between serves. Check the grip before every ball and ignore where the early serves land.',
    pass: 4,
  },

  toss_height: {
    cue: 'Lift the ball up a narrow chimney and let it float off your fingers above your racket reach.',
    steps: [
      {
        name: 'Lift and let go',
        how: 'Lift with a straight arm and open fingers, let the ball go between eye level and the top of your head, and catch it.',
        reps: '15 tosses',
      },
      DRILLS.rail_height_toss,
      {
        name: 'Swing at every toss',
        how: 'From the service line at half pace, swing at every toss, even the bad ones. The ball should feel still when you hit it.',
        reps: '20 serves',
      },
      {
        name: 'Same height, full serve',
        how: 'From the baseline at your normal pace, toss to the same height every time.',
        reps: '20 serves',
      },
      {
        name: 'One-serve points',
        how: 'Play ten points with one serve each, so every toss has to count.',
        reps: '10 points',
      },
    ],
    easier: 'Toss something heavier, like a small water bottle, to feel a slow lift instead of a flick.',
    mistake:
      'Flicking the ball from a bent elbow or wrist. Lift with a straight arm and let the ball leave your fingers, not your palm.',
    pass: 5,
  },

  toss_drift: {
    cue: 'Lift the ball up one straight line, so it would land on the same spot in front of your front foot.',
    steps: [
      // Replaced by the axis drill where the diagnosis knows which way the toss
      // wandered — see `progressionFor`. This is the axis-blind one.
      DRILLS.one_line_toss,
      {
        name: 'Racket on the court',
        how: 'Lay your racket on the court in front of your front foot. Toss without swinging and let the ball land on the strings.',
        reps: '20 tosses',
      },
      {
        name: 'Swing at every toss',
        how: 'From the service line at half pace, swing at every toss, even the bad ones.',
        reps: '20 serves',
      },
      {
        name: 'One toss, two targets',
        how: 'From the baseline, alternate serves down the middle and out wide with the same toss for both.',
        reps: '20 serves',
      },
      POINTS,
    ],
    easier: 'Start with the tossing arm already at shoulder height and lift only the last part.',
    mistake:
      'Swinging the tossing arm across your body, which sends the ball behind your head. Keep it pointing up at the ball.',
    pass: 5,
  },

  posture_collapse: {
    cue: 'Keep looking at the spot where you hit the ball until you hear it land.',
    steps: [
      {
        name: 'Toss and look',
        how: 'Toss, keep your eyes and your tossing arm up for a count of one, then catch.',
        reps: '15 tosses',
      },
      DRILLS.head_up_hold,
      {
        name: 'Listen for the bounce',
        how: 'From the baseline at half pace, keep looking up at the contact spot until you hear the ball bounce.',
        reps: '20 serves',
      },
      {
        name: 'Eyes up on big points',
        how: 'Play ten points and keep your eyes up until the bounce on every first serve.',
        reps: '10 points',
      },
    ],
    easier:
      'Fix the toss first. A toss that wanders makes your body chase it, and the chase is what folds you over.',
    mistake:
      'Looking at the target before you hit. Some tilt is good, so stay tall through the ball rather than stiffly upright.',
    pass: 5,
  },

  shallow_drop: {
    cue: 'Let the racket tip fall towards the court behind you, then throw it up at the ball.',
    steps: [
      {
        name: 'Start it hanging',
        how: 'Start with the racket already hanging behind you on a loose grip, then swing up from there.',
        reps: '10 swings',
      },
      DRILLS.ball_in_a_sock,
      DRILLS.back_scratch_drop,
      {
        name: 'Swing, then serve',
        how: 'From the baseline, alternate one swing without a ball and one serve, keeping the racket falling as deep.',
        reps: '10 pairs',
      },
      THREE_DEPTHS,
    ],
    easier: 'Throw an old ball overhead, high and far. A good throw lets the racket arm fall behind you on its own.',
    mistake:
      'Bending the wrist or sinking the elbow to fake the depth. Keep the grip loose and let the racket fall by itself.',
    pass: 4,
  },

  collapsed_elbow: {
    cue: 'Throw the racket head up at the ball, as if lobbing it over a high fence.',
    steps: [
      DRILLS.overhead_throw,
      {
        name: 'Double throw',
        how: 'Hold a ball in each hand. Lift one with the tossing hand while the other hand throws its ball into the box.',
        reps: '20 throws',
      },
      {
        name: 'Racket-up serves',
        how: 'From the service line, start with the racket already up behind you and serve from there.',
        reps: '20 serves',
      },
      {
        name: 'Half-pace serves',
        how: 'From the baseline at half pace, use the full motion and hit up and out.',
        reps: '20 serves',
      },
      POINTS,
    ],
    easier: 'Kneel on one knee and serve from the racket-up position, so only your arm is working.',
    mistake:
      'Hoisting the elbow high and early to look right. Throw the racket head at the ball and let the elbow sort itself out.',
    pass: 4,
  },

  early_shoulder_rotation: {
    // Not "until you hear the strings hit the ball", which asked for no trunk
    // turn before contact and argued with this ladder's own "Turn late" (L1.5).
    cue: 'Keep the logo on your shirt facing the side fence until the racket starts up, then turn to the net.',
    steps: [
      {
        name: 'Seated serves',
        how: 'Sit side-on on a bench and serve into the fence with the racket already up.',
        reps: '15 serves',
      },
      DRILLS.hip_lead_turn,
      {
        name: 'Sideways longer',
        how: 'From the service line, serve into the box while staying sideways for longer than feels natural.',
        reps: '20 serves',
      },
      {
        name: 'Turn late',
        how: 'From the baseline at half pace, let your chest turn only as the racket comes up to the ball.',
        reps: '20 serves',
      },
      POINTS,
    ],
    easier: 'Throw a ball overhead from side-on, letting your chest turn only as your arm comes through.',
    mistake: 'Hearing "stay sideways" as "never turn". Your chest still turns through the ball, only later.',
    pass: 4,
  },

  no_leg_drive: {
    cue: 'Send the ball all the way to the back fence and let your body throw your arm.',
    steps: [
      DRILLS.push_throws,
      DRILLS.back_leg_serve,
      {
        name: 'Long serves',
        how: 'From the service line, serve so the ball travels as far as it can past its first bounce.',
        reps: '15 serves',
      },
      THREE_DEPTHS,
      POINTS,
    ],
    easier: 'Serve hard into a fence from a few metres away with no target, so a miss stops mattering.',
    mistake: 'Muscling it with the arm. A tense arm swings slower, so let your legs and hips start the swing.',
    pass: 5,
  },

  low_contact: {
    cue: 'Meet the ball with the racket as high as it can go: top floor, not halfway up.',
    steps: [
      {
        name: 'Find your top',
        how: 'Hold the racket at full stretch with a ball on the strings, then roll it off upwards to feel your highest point.',
        reps: '10 reps',
      },
      DRILLS.up_and_out,
      {
        name: 'Land past the line',
        how: 'From the baseline at most of your pace, serve and land past a line a step inside the court.',
        reps: '20 serves',
      },
      POINTS,
    ],
    easier: 'If your toss is low, fix that first. You cannot reach high for a ball that never got there.',
    mistake: 'Ducking your head, or reaching forwards for a toss that went too far in front. Toss up, then hit up.',
    pass: 5,
  },
}

/**
 * What a basket said about the step a player is on.
 *
 * Counted from the sweep's own diagnoses, one per serve, so it is the engine's
 * judgement and not a second one: a serve is clean when the fault was looked
 * for, could be seen, and was not named. A serve the fault could not be judged
 * on — refused, the limb unseen, the ball missing — is not counted either way,
 * because a step passed on serves nobody could read is a step nobody passed.
 */
export interface DrillCheck {
  flaw: FlawId
  /** Serves the fault could be judged on. */
  read: number
  /** Of those, the ones it was not named on. */
  clean: number
  /** The ladder's bar, out of `CHECK_SERVES`. */
  need: number
  outcome: 'passed' | 'not_yet' | 'unread'
}

/** A serve's verdict on one fault: clean, named, or not judged at all. */
type Judged = 'clean' | 'named' | 'unread'

function judge(
  serve: { diagnosis?: Diagnosis; triage?: Triage },
  flaw: FlawId,
): Judged {
  if (serve.triage?.status !== 'ok') return 'unread'
  const finding = serve.diagnosis?.flaws.find((f) => f.flaw === flaw)
  if (!finding || !(finding.confidence >= MIN_EVIDENCE)) return 'unread'
  return finding.detected ? 'named' : 'clean'
}

/**
 * Check one basket against the bar of a fault's ladder.
 *
 * Passed when enough serves came back clean. Not yet when too many were named
 * for the bar to be reachable inside one basket, or when a full basket was read
 * and fell short. Otherwise too few serves could be judged to say, and the
 * player is told to film more rather than told they failed.
 */
export function checkDrill(
  flaw: FlawId,
  serves: { diagnosis?: Diagnosis; triage?: Triage }[],
): DrillCheck | undefined {
  const ladder = PROGRESSIONS[flaw]
  if (!ladder) return undefined
  const verdicts = serves.map((s) => judge(s, flaw))
  const clean = verdicts.filter((v) => v === 'clean').length
  const named = verdicts.filter((v) => v === 'named').length
  const read = clean + named
  const need = ladder.pass
  const outcome: DrillCheck['outcome'] =
    clean >= need ? 'passed' : named > CHECK_SERVES - need || read >= CHECK_SERVES ? 'not_yet' : 'unread'
  return { flaw, read, clean, need, outcome }
}

/** The line a check earns on the report, in the copy rules' voice. */
export function drillCheckLine(check: DrillCheck): string {
  if (check.outcome === 'passed') {
    return `Clean on ${check.clean} of ${check.read} serves in that basket, so you have passed this step.`
  }
  if (check.outcome === 'not_yet') {
    return `Clean on ${check.clean} of ${check.read} serves in that basket. Stay on this step for now.`
  }
  return `Only ${check.read} of those serves showed this clearly. Film a few more to check the step.`
}

/**
 * The ladder for one fault, with the axis drill on its first rung where the
 * toss had an axis — the same choice `drillIdFor` makes for the report, so the
 * drill on the card and the rung marked on the ladder are one object.
 */
export function progressionFor(flaw: FlawId, axis?: BodyAxis): Progression | undefined {
  const base = PROGRESSIONS[flaw]
  if (!base) return undefined
  if (flaw !== 'toss_drift' || !axis) return base
  const first = axis === 'depth' ? DRILLS.baseline_drop_toss : DRILLS.fence_line_toss
  return { ...base, steps: [first, ...base.steps.slice(1)] }
}

/**
 * The fault a card row reads the same number as, through the signal they
 * share (`CARD_SIGNAL`): contact height is `low_contact`'s, the racket drop
 * `shallow_drop`'s. Undefined for a row no fault is judged on.
 */
export function faultForMetric(metricId: string): FlawId | undefined {
  const signal = CARD_SIGNAL[metricId]
  if (!signal) return undefined
  return FLAWS.find((s) => s.signal === signal || s.sideOn === signal)?.flaw
}

/**
 * The rung of a fault's ladder the player is on: the one they moved to, when
 * this ladder has it, or else the rung the report's own drill sits on.
 */
export function rungFor(
  flaw: FlawId,
  ladder: Progression,
  rungs?: Partial<Record<string, number>>,
): number {
  const stored = rungs?.[flaw]
  if (stored !== undefined && Number.isInteger(stored) && stored >= 0 && stored < ladder.steps.length) {
    return stored
  }
  return Math.max(0, stepOf(ladder, DRILLS[FLAW_DRILL[flaw]]))
}

/**
 * The drill for a card row, from one source (L1.4).
 *
 * A row that reads the same number as a fault hands out that fault's ladder,
 * on the player's rung, so the practice card, the fallback focus and the
 * report's plan cannot give three exercises for one fault. A row with no
 * fault keeps its own drill, which the caller passes in already resolved for
 * the serve type.
 */
export function drillForMetric(
  metricId: string,
  own: Drill,
  rungs?: Partial<Record<string, number>>,
): { drill: Drill; flaw?: FlawId } {
  const flaw = faultForMetric(metricId)
  const ladder = flaw ? progressionFor(flaw) : undefined
  if (!flaw || !ladder) return { drill: own }
  return { drill: ladder.steps[rungFor(flaw, ladder, rungs)], flaw }
}

/** Which rung a drill is on, by identity — `-1` when it is on none. */
export const stepOf = (progression: Progression, drill: Drill): number =>
  progression.steps.indexOf(drill)

/** Every ladder, for the tests that walk the copy. */
export const everyProgression = (): [FlawId, Progression][] =>
  Object.entries(PROGRESSIONS) as [FlawId, Progression][]
