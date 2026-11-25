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
import { DRILLS, FUNDAMENTALS } from './coaching'
import type { BodyAxis } from './axes'
import type { Diagnosis } from './diagnose'
import { FLAWS, MIN_EVIDENCE, type FlawId } from './flaws'
import { CARD_SIGNAL, SIGNALS, type Severity } from './tiers'
import type { Triage } from './triage'
import type { Drill, FundamentalId } from './types'

/**
 * How a step is passed (L4.2). By the app, when the step is a served ball it
 * can film and judge for the fault: a basket of `CHECK_SERVES`, at the
 * ladder's own bar. By the player, when it is a toss, a throw or a swing with
 * no ball, which the engine has nothing to read in, against a bar they can see.
 */
export type StepCheck = { by: 'engine' } | { by: 'self'; bar: string }

/** A rung: a drill that says how it is passed. The type is what makes every step declare one. */
export type Step = Drill & { check: StepCheck }

const ENGINE: StepCheck = { by: 'engine' }
const served = (drill: Drill): Step => ({ ...drill, check: ENGINE })
const selfChecked = (drill: Drill, bar: string): Step => ({ ...drill, check: { by: 'self', bar } })

export interface Progression {
  /** One thing to feel, about the ball, the racket or the court. */
  cue: string
  /**
   * The cue cut to what a voice can say between two serves (C1.1): at most six
   * words, said before a guided set and after any serve that still had the
   * fault. Required, so a ladder cannot ship without its spoken line.
   */
  say: string
  /** Most guided first, most like a match last. Three to five. */
  steps: Step[]
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
const POINTS: Step = {
  name: 'Play ten points',
  how: 'Play ten points, two serves each, and keep the change you have been working on in every serve.',
  reps: '10 points',
  check: ENGINE,
}

const THREE_DEPTHS: Step = {
  name: 'Serve to three lengths',
  how: 'Serve two into the box, two past the service line and two to the back fence. Repeat three times.',
  reps: '3 rounds',
  check: ENGINE,
}

const PROGRESSIONS: Partial<Record<FlawId, Progression>> = {
  // The tossing arm let down early (L5.4): held up with no swing first, then
  // into the swing at the pace the arm can keep.
  toss_arm_drops: {
    cue: 'Keep pointing at the ball with your tossing hand until the racket starts up to it.',
    say: 'Point at the ball',
    steps: [
      {
        name: 'Toss and point',
        how: 'Toss, keep a finger pointing at the ball as it rises and falls, and catch it without swinging.',
        reps: '15 tosses',
        check: { by: 'self', bar: 'Move up when you point all the way to the catch on twelve of fifteen.' },
      },
      served(DRILLS.point_and_hold),
      {
        name: 'Half pace, arm up',
        how: 'From the service line at half pace, keep your tossing arm pointing up until the racket swings up to the ball.',
        reps: '20 serves',
        check: ENGINE,
      },
      POINTS,
    ],
    easier: 'Hold two balls in your tossing hand. Toss one and keep the hand up, holding the other, until the racket starts up.',
    mistake: 'Pulling the tossing arm down to start the swing. Start the swing with the racket, and let the tossing arm come down after.',
    pass: 4,
  },
  // A ball met over or behind the head (L5.3): the toss sent in front, then
  // the serve that follows it into the court.
  contact_behind: {
    cue: 'Send the ball up in front of you, so it would land a racket length inside the baseline.',
    say: 'Toss it out in front',
    steps: [
      {
        name: 'Toss in front',
        how: 'Toss without swinging and let the ball land about a racket length in front of your front foot.',
        reps: '15 tosses',
        check: { by: 'self', bar: 'Move up when twelve of fifteen land in front of your front foot.' },
      },
      {
        name: 'Toss onto a racket in front',
        how: 'Lay your racket a racket length in front of your front foot, and toss so the ball lands on the strings.',
        reps: '20 tosses',
        check: { by: 'self', bar: 'Move up when sixteen of twenty land on the strings.' },
      },
      served(DRILLS.step_in_toss),
      {
        name: 'Serve and step into the court',
        how: 'From the baseline, toss far enough in front that you have to step into the court to hit every serve.',
        reps: '20 serves',
        check: ENGINE,
      },
      POINTS,
    ],
    easier: 'Stand a step inside the baseline and toss so you have to lean forward to reach the ball.',
    mistake: 'Leaning back to reach a toss that went behind you. Move the toss, not your body.',
    pass: 5,
  },

  waiters_tray: {
    cue: 'Hold the racket like a hammer and swing up to the ball with the edge of the frame, not the strings, facing forward.',
    say: 'Edge first, up to the ball',
    steps: [
      {
        name: 'Edge bounces',
        how: 'With a hammer grip, bounce a ball on the racket edge, then alternate edge and strings.',
        reps: '50 bounces',
        check: { by: 'self', bar: 'Move up when you can swap edge and strings twenty times without losing the ball.' },
      },
      {
        name: 'Edge-first swings',
        how: 'No ball. Swing slowly, keeping the edge of the frame facing forward as the racket goes down behind you and up.',
        reps: '15 swings',
        check: { by: 'self', bar: 'Move up when the edge leads on every swing. A window or your shadow shows it.' },
      },
      {
        name: 'Service line edge serves',
        how: 'From the service line, swing edge first and turn the strings to face the ball at the last moment before you hit it.',
        reps: '25 serves',
        check: ENGINE,
      },
      served(DRILLS.edge_first_serve),
      {
        name: 'Grip check points',
        how: 'Play ten points and check your hammer grip before every serve, first and second.',
        reps: '10 points',
        check: ENGINE,
      },
    ],
    easier:
      'Stand side-on with the racket up behind your head. Bounce a ball up high and tap it over the net, edge of the frame first.',
    mistake:
      'Going back to holding the racket like a frying pan between serves. Check your grip before every ball and ignore where early serves land.',
    pass: 4,
  },

  toss_height: {
    cue: 'Lift the ball straight up and let go with open fingers, so it rises higher than your racket can reach.',
    say: 'Toss above your reach',
    steps: [
      {
        name: 'Lift and let go',
        how: 'Lift with a straight arm and open fingers, let the ball go between eye level and the top of your head, and catch it.',
        reps: '15 tosses',
        check: { by: 'self', bar: 'Move up when the ball leaves your fingers above your head on twelve of fifteen.' },
      },
      selfChecked(DRILLS.rail_height_toss, 'Move up when sixteen of twenty tosses peak level with the rail.'),
      {
        name: 'Swing at every toss',
        how: 'From the service line at half pace, swing at every toss, even the bad ones. Hit the ball as it starts to come down.',
        reps: '20 serves',
        check: ENGINE,
      },
      {
        name: 'Same height, full serve',
        how: 'From the baseline at your normal pace, toss to the same height every time.',
        reps: '20 serves',
        check: ENGINE,
      },
      {
        name: 'One-serve points',
        how: 'Play ten points with only one serve each, tossing to the same height every time.',
        reps: '10 points',
        check: ENGINE,
      },
    ],
    easier: 'Toss something heavier, like a small water bottle, to feel a slow lift instead of a flick.',
    mistake:
      'Flicking the ball from a bent elbow or wrist. Lift with a straight arm and let the ball leave your fingers, not your palm.',
    pass: 5,
  },

  toss_drift: {
    cue: 'Lift the ball up one straight line, so it would land on the same spot in front of your front foot.',
    say: 'One straight line up',
    steps: [
      // Replaced by the axis drill where the diagnosis knows which way the toss
      // wandered — see `progressionFor`. This is the axis-blind one.
      selfChecked(DRILLS.one_line_toss, 'Move up when you catch sixteen of twenty without moving your feet.'),
      {
        name: 'Toss onto a racket',
        how: 'Lay your racket on the court in front of your front foot. Toss without swinging and let the ball land on the strings.',
        reps: '20 tosses',
        check: { by: 'self', bar: 'Move up when sixteen of twenty tosses land on the strings.' },
      },
      {
        name: 'Swing at every toss',
        how: 'From the service line at half pace, swing at every toss, even the bad ones.',
        reps: '20 serves',
        check: ENGINE,
      },
      {
        name: 'One toss, two targets',
        how: 'From the baseline, alternate serves down the middle and out wide with the same toss for both.',
        reps: '20 serves',
        check: ENGINE,
      },
      POINTS,
    ],
    easier: 'Start with your tossing arm already raised to shoulder height, then lift it straight up from there and let go.',
    mistake:
      'Swinging the tossing arm across your body, which sends the ball behind your head. Keep it pointing up at the ball.',
    pass: 5,
  },

  /*
   * The fault is a sideways fold at the waist, seen from behind (W6.1). The
   * ladder used to coach the eyes, which fixes a head pulled down, not a body
   * folding across its hips. It now starts on the stack itself, the hitting
   * shoulder under the tossing arm with the trunk straight, and its cue
   * points at the ball's height, outside the body, as every cue here does.
   * The first step was replaced rather than one added, so a player already on
   * this ladder keeps the step number they were on.
   */
  posture_collapse: {
    cue: 'Reach up to the ball as tall as you can, as if it sits higher than it does.',
    say: 'Reach tall to the ball',
    steps: [
      {
        name: 'Point high and swing',
        how: 'No ball. Swing through your serve with the tossing arm pointing high, so your hitting shoulder dips under it.',
        reps: '15 swings',
        check: { by: 'self', bar: 'Move up when the hitting shoulder dips under the tossing arm on every swing, with no bend at the waist.' },
      },
      served(DRILLS.head_up_hold),
      {
        name: 'Listen for the bounce',
        how: 'From the baseline at half pace, keep looking up at the contact spot until you hear the ball bounce.',
        reps: '20 serves',
        check: ENGINE,
      },
      {
        name: 'Eyes up on first serves',
        how: 'Play ten points and keep your eyes up until the bounce on every first serve.',
        reps: '10 points',
        check: ENGINE,
      },
    ],
    easier:
      'Fix the toss first. A toss that wanders makes you lean to reach it, and that bends you at the waist.',
    mistake:
      'Bending at the waist to get the shoulder down. The tilt comes from the shoulders, with the trunk straight, never from folding over the hips.',
    pass: 5,
  },

  shallow_drop: {
    cue: 'Let the racket tip fall towards the court behind you, then throw it up at the ball.',
    say: 'Let the tip fall behind you',
    steps: [
      {
        name: 'Swing from behind your back',
        how: 'Start with the racket hanging down your back, tip to the ground, on a loose grip, then swing up.',
        reps: '10 swings',
        check: { by: 'self', bar: 'Move up when every swing goes from behind your back to full reach without stopping.' },
      },
      selfChecked(DRILLS.ball_in_a_sock, 'Move up when the sock swings all the way through on all fifteen.'),
      served(DRILLS.back_scratch_drop),
      {
        name: 'Swing, then serve',
        how: 'From the baseline, alternate one swing with no ball and one serve. Let the racket fall as far behind you on the serve.',
        reps: '10 pairs',
        check: ENGINE,
      },
      THREE_DEPTHS,
    ],
    easier: 'Throw an old ball overhead, high and far. A good throw lets the racket arm fall behind you on its own.',
    mistake:
      'Bending the wrist or lowering the elbow to get the racket lower. Keep the grip loose and let the racket fall by itself.',
    pass: 4,
  },

  collapsed_elbow: {
    cue: 'Throw the racket head up at the ball, as if lobbing it over a high fence.',
    say: 'Throw the racket head up',
    steps: [
      selfChecked(DRILLS.overhead_throw, 'Move up when twelve of fifteen throws peak well above the net.'),
      {
        name: 'Toss one, throw one',
        how: 'Hold a ball in each hand. Lift one with the tossing hand while the other hand throws its ball into the box.',
        reps: '20 throws',
        check: { by: 'self', bar: 'Move up when sixteen of twenty throws land in the box.' },
      },
      {
        name: 'Racket-up serves',
        how: 'From the service line, start with the racket up behind your head, elbow at shoulder height, then toss and serve.',
        reps: '20 serves',
        check: { by: 'self', bar: 'Move up when sixteen of twenty land in the box with your elbow at shoulder height.' },
      },
      {
        name: 'Half-pace serves',
        how: 'From the baseline at half pace, use your full serve and swing the racket up and forward at the ball.',
        reps: '20 serves',
        check: ENGINE,
      },
      POINTS,
    ],
    easier: 'Kneel on one knee, start with the racket up behind your head, and serve, so only your arm does the work.',
    mistake:
      'Lifting the elbow high too early, to look right. Throw the racket head up at the ball and let the elbow follow.',
    pass: 4,
  },

  early_shoulder_rotation: {
    // Not "until you hear the strings hit the ball", which asked for no trunk
    // turn before contact and argued with this ladder's own "Turn your chest late" (L1.5).
    cue: 'Keep the logo on your shirt facing the side fence until the racket starts up, then turn to the net.',
    say: 'Logo to the side fence',
    steps: [
      {
        name: 'Seated serves',
        how: 'Sit side-on on a bench and serve into the fence with the racket already up.',
        reps: '15 serves',
        check: { by: 'self', bar: 'Move up when twelve of fifteen reach the fence from the bench.' },
      },
      selfChecked(DRILLS.hip_lead_turn, 'Move up when your hips turn before your chest on all ten. A window shows it.'),
      {
        name: 'Stay sideways longer',
        how: 'From the service line, serve into the box while staying sideways for longer than feels natural.',
        reps: '20 serves',
        check: ENGINE,
      },
      {
        name: 'Turn your chest late',
        how: 'From the baseline at half pace, let your chest turn only as the racket comes up to the ball.',
        reps: '20 serves',
        check: ENGINE,
      },
      POINTS,
    ],
    easier: 'Throw a ball overhead from side-on, letting your chest turn only as your arm comes through.',
    mistake: 'Taking "stay sideways" to mean never turn. Your chest still turns to face the net as you hit, only later.',
    pass: 4,
  },

  no_leg_drive: {
    cue: 'Serve deep enough to reach the back fence, pushing up off the court with your legs to do it.',
    say: 'Send it to the back fence',
    steps: [
      selfChecked(DRILLS.push_throws, 'Move up when your legs start every throw before your arm does.'),
      served(DRILLS.back_leg_serve),
      {
        name: 'Long serves',
        how: 'From the service line, serve so the ball travels as far as it can past its first bounce.',
        reps: '15 serves',
        check: ENGINE,
      },
      THREE_DEPTHS,
      POINTS,
    ],
    easier: 'Serve hard into a fence from a few metres away with no target, so a miss stops mattering.',
    mistake: 'Hitting hard with only your arm. A tense arm swings slower, so let your legs and hips start the swing.',
    pass: 5,
  },

  low_contact: {
    cue: 'Hit the ball at the highest point your racket can reach, with your arm fully stretched.',
    say: 'Hit it at full reach',
    steps: [
      {
        name: 'Find your highest point',
        how: 'Hold the racket at full stretch with a ball on the strings, then roll it off upwards to feel your highest point.',
        reps: '10 reps',
        check: { by: 'self', bar: 'Move up when the ball rolls off at the same top point ten times running.' },
      },
      served(DRILLS.up_and_out),
      {
        name: 'Land past the line',
        how: 'From the baseline at most of your pace, serve and land past a line a step inside the court.',
        reps: '20 serves',
        check: ENGINE,
      },
      POINTS,
    ],
    easier: 'If your toss is low, fix that first. You can’t reach high for a ball that never got there.',
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
export type Judged = 'clean' | 'named' | 'unread'

/** One serve against one fault — exported for graduation (L3.4), which counts the same way. */
/**
 * Whether a drill can be filmed as a check (W5.2): a step the app judges from a
 * served ball. A toss caught, a throw or a swing with no ball has nothing for
 * the engine to read, and counting serves for it measures a drill the player
 * is not doing. A drill that is not a ladder step is the fault's own, and is.
 */
export function filmable(flaw: string | undefined, drill: string): boolean {
  const step = flaw ? PROGRESSIONS[flaw as FlawId]?.steps.find((s) => s.name === currentDrillName(drill)) : undefined
  return step?.check.by !== 'self'
}

export function judgeServe(
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
  const verdicts = serves.map((s) => judgeServe(s, flaw))
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
    return `Fault gone on ${check.clean} of ${check.read} serves in that video. You’ve passed this step.`
  }
  if (check.outcome === 'not_yet') {
    return `Fault gone on ${check.clean} of ${check.read} serves in that video. Stay on this step for now.`
  }
  return `I could judge only ${check.read} of those serves for this fault. Film a few more to check the step.`
}

/** The toss-drift ladder's first rung where the diagnosis knows which way the toss wandered. */
const AXIS_FIRST: Record<BodyAxis, Step> = {
  depth: selfChecked(DRILLS.baseline_drop_toss, 'Move up when sixteen of twenty tosses fall onto the line.'),
  lateral: selfChecked(DRILLS.fence_line_toss, 'Move up when sixteen of twenty tosses brush the fence going up.'),
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
  return { ...base, steps: [AXIS_FIRST[axis], ...base.steps.slice(1)] }
}

/**
 * Where a ladder starts for a fault this bad (L4.2), until the player moves.
 *
 * A fault the engine calls serious starts on the most guided step, a medium
 * one a step up, a slight one two steps up. Never on the last step: that one
 * is the match, and a ladder that started there would be no ladder. The grade
 * is the engine's own (`severityOf`: the miss against the signal's serious
 * miss), the same one the plan is ordered by. With no grade to go on — a
 * card row no report has named lately — it starts where a medium fault does.
 */
export const START_BY_SEVERITY: Record<Exclude<Severity, 'none'>, number> = { high: 0, medium: 1, low: 2 }

export function startingRung(ladder: Progression, severity?: Severity): number {
  const at = START_BY_SEVERITY[severity && severity !== 'none' ? severity : 'medium']
  return Math.max(0, Math.min(at, ladder.steps.length - 2))
}

/**
 * The grade a fault was last named at, on the newest report that named it.
 * What the season's cards start its ladder from, so they start where that
 * report's plan did.
 */
export function lastSeverity(
  sessions: readonly { createdAt: number; diagnosis?: Diagnosis }[],
  flaw: FlawId,
): Severity | undefined {
  let at = -Infinity
  let out: Severity | undefined
  for (const s of sessions) {
    const f = s.diagnosis?.flaws.find((x) => x.flaw === flaw && x.detected)
    if (f && s.createdAt > at) {
      at = s.createdAt
      out = f.severity
    }
  }
  return out
}

/** How a step is passed, in the player's words. */
export function stepCheckLine(ladder: Progression, step: Step): string {
  if (step.check.by === 'self') return step.check.bar
  return `Film a basket of ${CHECK_SERVES} on this step. Move up when ${ladder.pass} come back without this fault.`
}

/** Which side of its band a card row missed on. */
export type MissSide = 'low' | 'high'

/** The side a row's value fell outside its band, or undefined inside it. */
export function missSide(m: { value: number; ideal?: [number, number] }): MissSide | undefined {
  // A row stored before the band was kept on it says nothing about its side.
  if (!m.ideal) return undefined
  return m.value < m.ideal[0] ? 'low' : m.value > m.ideal[1] ? 'high' : undefined
}

/**
 * The fault a card row reads the same number as, through the signal they
 * share (`CARD_SIGNAL`): contact height is `low_contact`'s, the racket drop
 * `shallow_drop`'s. Undefined for a row no fault is judged on.
 *
 * Given the side the row missed on, undefined as well for a miss on the other
 * side from the fault's (N7.3). A fault is one direction of its signal: contact
 * far in front is not contact behind the head, and handing out that fault's
 * ladder for it would walk the player the wrong way.
 */
export function faultForMetric(metricId: string, side?: MissSide): FlawId | undefined {
  const signal = CARD_SIGNAL[metricId]
  if (!signal) return undefined
  const direction = SIGNALS[signal]?.direction
  if ((direction === 'higher' && side === 'high') || (direction === 'lower' && side === 'low')) return undefined
  return FLAWS.find((s) => s.signal === signal || s.sideOn === signal)?.flaw
}

/**
 * The scoring area a fault belongs to, read off the card row that carries the
 * same number (N0.2). Undefined for a fault no card row shares a number with.
 *
 * Exists so a body area gets one drill. A practice row with no fault of its own
 * (the knee bend) used to fall back to its area's general drill, Push throws,
 * on the same page where the plan gave that area's fault (the legs) Back-leg
 * serves: two exercises for one pair of legs, and three things to do.
 */
export function areaOfFault(flaw: FlawId): FundamentalId | undefined {
  const spec = FLAWS.find((s) => s.flaw === flaw)
  if (!spec) return undefined
  const row = Object.keys(CARD_SIGNAL).find((m) => CARD_SIGNAL[m] === spec.signal || CARD_SIGNAL[m] === spec.sideOn)
  if (!row) return undefined
  return (Object.keys(FUNDAMENTALS) as FundamentalId[]).find((id) => FUNDAMENTALS[id].metrics.includes(row))
}

/**
 * The rung of a fault's ladder the player is on: the one they moved to, when
 * this ladder has it, or else where the fault's severity starts it (L4.2).
 */
export function rungFor(
  flaw: FlawId,
  ladder: Progression,
  rungs?: Partial<Record<string, number>>,
  severity?: Severity,
): number {
  const stored = rungs?.[flaw]
  if (stored !== undefined && Number.isInteger(stored) && stored >= 0 && stored < ladder.steps.length) {
    return stored
  }
  return startingRung(ladder, severity)
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
  severity?: Severity,
  side?: MissSide,
): { drill: Drill; flaw?: FlawId } {
  const flaw = faultForMetric(metricId, side)
  const ladder = flaw ? progressionFor(flaw) : undefined
  if (!flaw || !ladder) return { drill: own }
  return { drill: ladder.steps[rungFor(flaw, ladder, rungs, severity)], flaw }
}

/**
 * Which rung a drill is on, by name — `-1` when it is on none. By name since
 * L4.2: a shared drill on a ladder is wrapped with its check, and a stored
 * report's drill has been through storage, so neither is the same object.
 */
export const stepOf = (progression: Progression, drill: Drill): number =>
  progression.steps.findIndex((s) => s.name === currentDrillName(drill.name))

/**
 * Drills renamed for plain words (2026-11-25), old name to new. A stored
 * report keeps the name its drill had then, and a ladder finds its step by
 * name, so an old name is read as the new one here. A practice log keeps the
 * old name on purpose: it records what the player was told.
 */
export const RENAMED_DRILLS: Readonly<Record<string, string>> = {
  'Play it out': 'Play ten points',
  'Box, line, fence': 'Serve to three lengths',
  'Racket ahead on the court': 'Toss onto a racket in front',
  'Into the court': 'Serve and step into the court',
  'Racket on the court': 'Toss onto a racket',
  'Eyes up on big points': 'Eyes up on first serves',
  'Start it hanging': 'Swing from behind your back',
  'Double throw': 'Toss one, throw one',
  'Sideways longer': 'Stay sideways longer',
  'Turn late': 'Turn your chest late',
  'Find your top': 'Find your highest point',
  'Push throws': 'Push up and throw',
  'Hip lead turn': 'Hips turn first',
  'Hit up and out': 'Swing up from the service line',
  'One line toss': 'Toss and catch',
  'Rail height toss': 'Toss to a fence rail',
  'Swing as it turns': 'Start the swing at the peak',
  'Shoulder over shoulder': 'Point high and swing',
  'Land inside': 'Push up, land inside',
  'Step-in toss': 'Toss into the court',
  'One-beat finish': 'Speed up after the trophy',
  'Edge-first serve': 'Lead with the racket edge',
  'Head up hold': 'Chin up after contact',
}

/** A drill's name as it is called now. */
export const currentDrillName = (name: string): string => RENAMED_DRILLS[name] ?? name

/** Every ladder, for the tests that walk the copy. */
export const everyProgression = (): [FlawId, Progression][] =>
  Object.entries(PROGRESSIONS) as [FlawId, Progression][]
