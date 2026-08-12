/**
 * Where the triage layer's identifiers become something a player can read.
 *
 * `triage.ts` deals in raw data on purpose — a flaw id, a drill id, a reject
 * reason, an injury flag — because a paragraph of instruction is not data and
 * mixing the two is how an engine ends up with prose baked into its thresholds.
 * That left a gap nobody had filled: the engine has produced a named breakdown
 * and the single drill that corrects it since the diagnostic pass shipped, and
 * every one of those verdicts went into storage and out again without one word
 * of it ever reaching the screen. The report page ranked measurements instead,
 * which answers a different question — "which number is lowest" rather than
 * "what is going wrong, and what causes it".
 *
 * This module is the only place the two vocabularies meet, and it is the only
 * place in the engine allowed to write a sentence about a flaw.
 *
 * Three things come out of it:
 *
 *   `refusalFor`     — why the clip could not be read, and what to film instead.
 *   `injuryNotes`    — mechanics that risk a joint, never suppressed.
 *   `causalFocus`    — the one instruction, from the fault rather than the number.
 *
 * Everything written here goes through `cue`, so it lives under the same word
 * and sentence ceiling as the rest of the copy database. The tests lint it.
 */
import { DRILLS } from './coaching'
import type { Diagnosis } from './diagnose'
import type { FlawId } from './flaws'
import type { BodyAxis } from './axes'
import {
  HIERARCHY,
  drillIdFor,
  type InjuryFlag,
  type RejectReason,
  type Triage,
} from './triage'
import { SEVERITY_RANK, rungName, type Severity } from './tiers'
import type { Analysis, Drill } from './types'
import { cue } from './voice'

/* --------------------------------------------------------------- refusal -- */

export interface Refusal {
  reason: RejectReason
  title: string
  /**
   * What to do differently, in the order worth trying.
   *
   * Plain sentences rather than `cue`d ones: these are filming instructions, not
   * coaching, and the two-sentence ceiling that keeps a cue sharp would cut
   * "move the camera back rather than zooming" down to something ambiguous.
   */
  hints: string[]
}

const REFUSALS: Record<RejectReason, { title: string; hints: string[] }> = {
  body_not_visible: {
    title: 'I could not see enough of you',
    hints: [
      'Keep your whole body in frame — feet on the ground, racket at the top — for the entire serve.',
      'Move the camera back a few steps instead of zooming in.',
    ],
  },
  too_few_frames: {
    title: 'That clip is too short to read',
    hints: [
      'The swing lasts about a fifth of a second, so a normal clip only catches it two or three times.',
      'Film in slow motion, or set the camera to 60 frames per second.',
    ],
  },
  too_blurry: {
    title: 'Your racket arm blurred out',
    hints: [
      'Film in brighter light. Most of this is the camera holding the shutter open indoors or at dusk.',
      'Slow motion fixes it too, because each frame gets a shorter exposure.',
    ],
  },
  camera_unusable: {
    title: 'I could not work out where the camera was',
    hints: [
      'Rest the phone on something steady at about waist height, ten steps to your side.',
      'Keep it still. A hand-held pan moves the reference every measurement is taken against.',
    ],
  },
}

/**
 * Why this clip produced nothing worth saying, or nothing.
 *
 * The engine measures a rejected clip anyway — it has no way not to, the
 * measurements are what the rejection is judged from — so the numbers exist and
 * look exactly like numbers off a good clip. That is the whole danger. A serve
 * filmed at 24 frames a second still yields a racket drop to three decimal
 * places, and it is confabulated. This is what stands between that and a player
 * going away to fix it.
 */
export function refusalFor(triage: Triage | undefined): Refusal | undefined {
  if (!triage || triage.status !== 'rejected') return undefined
  // A reason this build has no copy for still has to refuse. A stored report can
  // name one — written by a newer version, restored from a hand-edited backup —
  // and indexing straight into the table would take the page down with it. The
  // generic answer loses the specific advice and keeps the refusal, which is the
  // half that matters.
  const known = triage.reason && REFUSALS[triage.reason]
  if (!known) {
    return {
      reason: triage.reason ?? 'camera_unusable',
      title: 'I could not read that clip',
      hints: [
        'Film side-on from about ten steps away, with your whole body in frame.',
        'Bright light and slow motion fix most of what goes wrong.',
      ],
    }
  }
  return { reason: triage.reason!, ...known }
}

/* ---------------------------------------------------------------- injury -- */

export interface InjuryNote {
  flag: InjuryFlag
  severity: Severity
  title: string
  body: string
}

const INJURIES: Record<InjuryFlag, { title: string; body: string }> = {
  wrist_strain_forced_pronation: {
    title: 'Watch your wrist',
    body: 'Your palm starts flat and then turns hard through the ball, so the wrist takes a load the forearm should carry.',
  },
  lumbar_load_posture_collapse: {
    title: 'Watch your lower back',
    body: 'Your spine folds sideways under the swing. A hundred of those in a session is where back pain starts.',
  },
  shoulder_load_no_drop: {
    title: 'Watch your shoulder',
    body: 'You reach high without letting the racket fall behind you first, so the shoulder makes up the difference.',
  },
}

/**
 * Mechanics that cost a joint rather than a point.
 *
 * Ordered worst first and never filtered by the hierarchy that picks the single
 * flaw. A player being funnelled towards a wrist problem needs to hear it
 * whatever their primary fault is — `triage` keeps these out of the suppression
 * count for exactly that reason, and dropping them here would undo it one layer
 * further down.
 *
 * The one thing that does suppress them is a refusal, and that happens upstream:
 * `triage` returns an empty list on any clip it rejects. The flags are read from
 * the same measurements the rejection has just declared unreliable, so a warning
 * about somebody's wrist assembled out of them would be the confident wrong
 * answer wearing the one badge nobody would think to doubt.
 */
export function injuryNotes(triage: Triage | undefined): InjuryNote[] {
  if (!triage?.injury_risk?.length) return []
  return [...triage.injury_risk]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    // A flag this build has no words for is dropped rather than rendered as a
    // crash. Reports outlive the code that wrote them, and a row restored from a
    // backup — or written by a newer version and read by an older one — can name
    // a fourth flag that this table has never heard of.
    .filter(({ flag }) => flag in INJURIES)
    .map(({ flag, severity }) => ({
      flag,
      severity,
      title: INJURIES[flag].title,
      body: cue(INJURIES[flag].body),
    }))
}

/* ------------------------------------------------------------ the one job -- */

/**
 * One fault, said the way a coach standing behind you would say it.
 *
 * `low` and `high` exist because one signal — the toss peak — is a band with a
 * wrong answer on each side, and a single sentence for both would tell half the
 * players who see it the opposite of what they need. Every other flaw is
 * one-sided, so `low` carries it and `high` is absent.
 */
interface FlawCopy {
  title: string
  low: string
  high?: string
  highTitle?: string
  /**
   * The same fault, said for the axis it was actually measured along.
   *
   * One entry today, and it is the largest heading on the report. `toss_drift`
   * read "Your toss drifts sideways" on every clip, while the number underneath
   * it is 99% front-to-back on the side-on framing this app recommends — so the
   * heading, and the drill under it, named the one axis the reading barely
   * contained. The base entry above is now axis-neutral and true of both, and
   * these say which way once the camera has been asked.
   *
   * Overrides only what it declares. A stored report with no axis on it, or a
   * clip filmed at the 45° tie where `diagnose` refuses to guess, falls back to
   * the neutral line rather than to a coin toss.
   */
  byAxis?: Partial<Record<BodyAxis, Partial<Pick<FlawCopy, 'title' | 'low'>>>>
}

const FLAW_COPY: Record<FlawId, FlawCopy> = {
  waiters_tray: {
    title: 'Palm turned up under the racket',
    low: 'Your hand sits flat under the handle, so the strings face the sky and the arm cannot turn through the ball.',
  },
  toss_height: {
    title: 'Your toss lands short',
    low: 'The ball never gets to the top of your reach, so you strike it on the way down.',
    highTitle: 'Your toss goes too high',
    high: 'The ball hangs above your reach, so you wait for it and the swing loses its rhythm.',
  },
  toss_drift: {
    // Axis-neutral, because this is what the report says when it does not know
    // which way the toss wandered. True of both axes and of the tie between
    // them; `byAxis` sharpens it wherever the camera angle can be read.
    title: 'Your toss wanders off line',
    low: 'The ball leaves your hand on a new path each serve, so you move to it instead of standing under it.',
    byAxis: {
      // The usual case on the framing this app recommends. No direction is
      // claimed — `axes.ts` recovers yaw from an `acos` and cannot tell a lens
      // in front of the player from one behind, so "forwards and back" names
      // the axis and stops. "Your toss drifts forwards" would be a coin toss
      // printed as an observation.
      depth: {
        title: 'Your toss drifts forwards and back',
        low: 'The ball leaves your hand nearer or further out each serve, so you reach for it or crowd it.',
      },
      // The original line, unchanged, now printed only where it is true: a
      // camera round towards face-on, where image x really does carry the
      // shoulder-line axis.
      lateral: {
        title: 'Your toss drifts sideways',
        low: 'The ball leaves your hand travelling across your body, so you chase it instead of standing under it.',
      },
    },
  },
  posture_collapse: {
    title: 'Your body folds sideways',
    low: 'Your upper body tips over instead of stacking up, so the swing loses height and your lower back takes the load.',
  },
  collapsed_elbow: {
    title: 'Your hitting elbow falls',
    low: 'Your elbow drops below your shoulder, so the arm swings from the elbow instead of unwinding from the shoulder.',
  },
  shallow_drop: {
    title: 'The racket stops short behind you',
    low: 'Your racket hand never gets far enough down your back, so the swing starts halfway and arrives slow.',
  },
  early_shoulder_rotation: {
    title: 'Your shoulders open too early',
    low: 'Your chest turns to the court before your hips do, so the legs and trunk add nothing to the swing.',
  },
  arming_the_ball: {
    title: 'The arm goes first',
    low: 'Your shoulders fire before your hips, so the serve runs on arm strength and the speed stops there.',
  },
  // Unreachable today, and kept rather than deleted. `pancake_contact` carries
  // `notNamed` in flaws.ts — see `UNDER_RESOLVED.pronation_deg` in tiers.ts for
  // the measurement that decided it — so no report can print this copy. It stays
  // because the record has to be total and because the suppression is a fact
  // about the pronation estimator rather than about the fault: the day a better
  // estimator lands, this is the copy that comes back. Do not read it as live.
  pancake_contact: {
    title: 'The strings meet the ball flat',
    low: 'Your hand never turns over through the ball, so you push it forward instead of driving across it.',
  },
  low_contact: {
    title: 'You strike the ball low',
    low: 'You meet the ball below full reach, so the serve has to climb before it can come down.',
  },
}

/**
 * Every flaw's drill, resolved.
 *
 * Exported so a test can assert the map is total — `FLAW_DRILL` names a drill id
 * and `DRILLS` defines one, and nothing but a test connects the two. A missing
 * entry is a report whose single instruction has no exercise under it.
 */
export const drillFor = (id: string | undefined): Drill | undefined =>
  id ? DRILLS[id] : undefined

/**
 * The one thing to work on, taken from the fault rather than from the ranking.
 *
 * `pickFocus` ranks measurements and hands back the lowest-scoring one. That is
 * a reasonable fallback and a poor first answer, because the lowest number is
 * routinely the *symptom*: a low contact point scores worst on a serve whose
 * actual problem is a toss that never got high enough, and the report then sends
 * somebody away to reach higher for a ball that was never there. The whole point
 * of the hierarchy in `triage` is to refuse that trade, and until now nothing
 * downstream asked it.
 *
 * Returns undefined when there is no fault to name — a clean serve, a refused
 * clip, or a report filed before the diagnostic pass existed — and the caller
 * falls back to the ranking.
 */
export function causalFocus(triage: Triage | undefined): Analysis['focus'] | undefined {
  if (!triage || triage.status !== 'ok' || !triage.primary_flaw) return undefined

  const { flaw, value, target, axis } = triage.primary_flaw
  return focusFor(flaw, value, target, axis)
}

/**
 * One flaw, turned into a title, a reason and the exercise that corrects it.
 *
 * The drill is resolved from `drillIdFor` rather than from `triage.drill_id`,
 * which only ever names the primary's. Returns undefined where either table has
 * no entry, so a flaw the copy database has not caught up with is left out of a
 * plan rather than printed as a blank heading.
 *
 * `axis` is what the diagnosis measured the signal along, where that is a
 * question. It picks both halves of the answer — the sentence and the exercise —
 * from the same fact, so the heading and the drill under it cannot name opposite
 * axes. They did: the card read "drifts forwards and back" under a heading that
 * said "sideways", above a drill for sideways.
 */
function focusFor(
  flaw: FlawId,
  value: number,
  target: [number, number],
  axis?: BodyAxis,
): Analysis['focus'] | undefined {
  const base = FLAW_COPY[flaw]
  if (!base) return undefined

  // Spread rather than replaced: an axis entry states only the lines that differ
  // by axis, and `high`/`highTitle` stay whatever the base said.
  const copy = { ...base, ...(axis ? base.byAxis?.[axis] : undefined) }

  const drill = drillFor(drillIdFor(flaw, axis))
  if (!drill) return undefined

  // Which half of the sentence applies: a signal past the top of its band is a
  // different fault from one under the bottom of it, and the same flaw id covers
  // both. A toss too high and a toss too low are not the same instruction.
  const overshot = copy.high !== undefined && value > target[1]
  return {
    title: overshot ? (copy.highTitle ?? copy.title) : copy.title,
    why: cue(overshot ? copy.high : copy.low),
    drill,
  }
}

/**
 * How many drills the report will ever put in front of a player at once.
 *
 * One was the original answer and it was too thin: somebody who has just filmed
 * a whole basket has earned more than a single sentence. A drill per failing
 * measurement was the other extreme and the worse one — five open areas put a
 * dozen exercises on screen, which is the list nobody acts on. Four is the cap
 * on a plan that still reads as a plan.
 */
export const MAX_PLAN = 4

/**
 * The two-to-four things to work on, in the order that causes the others.
 *
 * Built by the same rule `triage` picks its primary by, continued instead of
 * stopped: walk the hierarchy from grip down to contact, take the detected
 * faults in each group worst-first, and skip anything already attributed to a
 * fault also detected. The first entry is therefore always the primary flaw, so
 * the plan and the stored verdict cannot disagree.
 *
 * Symptoms stay out no matter how much room is left. A low contact point caused
 * by a toss that never got high enough is not a second thing to practise — it is
 * the first thing, seen from underneath, and listing it would send somebody to
 * reach higher for a ball that was never there.
 *
 * Reads `diagnosis` rather than re-deriving anything: both it and `triage` are
 * stored on the report, so a reopened session gets the same plan it had.
 */
export function causalPlan(
  triage: Triage | undefined,
  diagnosis: Diagnosis | undefined,
): Analysis['focus'][] {
  const primary = causalFocus(triage)
  if (!primary || !triage?.primary_flaw) return []

  const out = [primary]
  const detected = (diagnosis?.flaws ?? []).filter((f) => f.detected)
  const attributed = new Set(detected.filter((f) => f.caused_by).map((f) => f.flaw))

  for (const level of HIERARCHY) {
    if (out.length >= MAX_PLAN) break
    const here = detected
      .filter((f) => level.flaws.includes(f.flaw))
      .filter((f) => f.flaw !== triage.primary_flaw!.flaw && !attributed.has(f.flaw))
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])

    for (const f of here) {
      if (out.length >= MAX_PLAN) break
      const entry = focusFor(f.flaw, f.value, f.target, f.axis)
      if (entry) out.push(entry)
    }
  }

  return out
}

/**
 * What was found and deliberately not said.
 *
 * Still a count, never a list. The plan above it now carries up to four things,
 * so what is left over is whatever the cap and the causal rule between them held
 * back — and a player who clears the plan and refilms needs to know the report
 * was holding anything at all, or a new fault next week reads as the app
 * changing its mind.
 */
export function suppressedNote(
  triage: Triage | undefined,
  /** How many the plan actually printed. Defaults to the one-item case. */
  shown = 1,
): string | undefined {
  if (!triage || triage.status !== 'ok') return undefined
  const n = (triage.suppressed_count ?? 0) - Math.max(0, shown - 1)
  if (n < 1) return undefined
  return cue(
    n === 1
      ? 'One other thing shows up in this serve. It sits downstream of these, so start here.'
      : `${n} other things show up in this serve. They sit downstream of these, so start here.`,
  )
}

/**
 * The player's rung and the one above it, as a label.
 *
 * The engine never scores against a fixed standard — every target band comes
 * from the tier ladder and belongs to the rung above wherever the player sits —
 * and that fact was invisible on screen, which made the targets look like
 * absolutes somebody had decided. Saying it out loud is also what makes the
 * level control worth having: a player who sees the wrong rung can move it.
 */
export function tierLabel(triage: Triage | undefined): string | undefined {
  if (!triage?.tier) return undefined
  return `Marked as ${rungName(triage.tier.current)}, aiming one step above it`
}

/* ------------------------------------------------------------ for the lint -- */

/**
 * Every sentence this module can put in front of a player, labelled.
 *
 * Exported for the copy test, which walks the whole database and fails the build
 * on the first line that drifts past the ceiling. Without this the lint would
 * stop at `coaching.ts` and a module that writes prose about flaws would be the
 * one place in the app where the house voice was a suggestion.
 *
 * The refusal hints are deliberately absent. They are filming instructions
 * rather than coaching — two clauses about where to stand and what the light is
 * doing — and the two-sentence ceiling that keeps a cue sharp would cut them
 * into something ambiguous. They are checked for length by the lint separately.
 */
export function everyVerdictCue(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  for (const [flaw, copy] of Object.entries(FLAW_COPY)) {
    out.push({ where: `flaw.${flaw}.low`, text: copy.low })
    if (copy.high) out.push({ where: `flaw.${flaw}.high`, text: copy.high })
    // The per-axis lines are the ones a player actually reads on most clips —
    // the neutral entry above is the fallback — so they are linted at the same
    // ceiling rather than sitting behind a nested key the walk never opened.
    for (const [axis, byAxis] of Object.entries(copy.byAxis ?? {})) {
      if (byAxis?.low) out.push({ where: `flaw.${flaw}.${axis}.low`, text: byAxis.low })
    }
  }
  for (const [flag, copy] of Object.entries(INJURIES)) {
    out.push({ where: `injury.${flag}`, text: copy.body })
  }
  return out
}

/** The three tables, for the totality checks. Read-only views. */
export const VERDICT_TABLES = {
  flaws: FLAW_COPY,
  injuries: INJURIES,
  refusals: REFUSALS,
} as const
