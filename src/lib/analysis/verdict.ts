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
import type { FaultMove, MoveVerdict, RotationMove } from './carryForward'
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
import { STRAIN_WINDOW, type StrainCleared, type StrainRecord } from './strain'
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

/**
 * What each flag has been doing, said in the past tense across trips.
 *
 * Deliberately not the report's own `body`. That one explains the mechanics to
 * somebody looking at the serve it happened on, in the present tense, and
 * reprinting it under a count would be the same paragraph twice with a number
 * bolted on. This is the other half of the sentence a count needs: the subject
 * and the verb, so the reader knows which body part the number is about without
 * having to go and reopen a report from three weeks ago.
 */
const RECURRING: Record<InjuryFlag, string> = {
  wrist_strain_forced_pronation: 'Your wrist has turned hard through the ball',
  lumbar_load_posture_collapse: 'Your lower back has folded under the swing',
  shoulder_load_no_drop: 'Your shoulder has covered a high reach',
}

/**
 * One sentence for a joint warning that keeps recurring, or nothing.
 *
 * States the count and stops. No advice, because the report that raised each of
 * those flags already carried the mechanics and the fix, and no adjective,
 * because "worryingly" or "repeatedly" would be this app editorialising over a
 * number that is already the strongest thing it can honestly say.
 *
 * `undefined` for a flag this build has no words for, the same reason
 * `injuryNotes` filters: a report restored from a backup can name a flag a
 * newer version invented.
 */
export function strainLine(record: Pick<StrainRecord, 'flag' | 'trips' | 'of'>): string | undefined {
  const subject = RECURRING[record.flag]
  if (!subject) return undefined
  return cue(`${subject} on ${record.trips} of your last ${record.of} trips.`)
}

/**
 * The same mechanic, said as a thing that has stopped happening.
 *
 * Written out rather than negated from `RECURRING`, because "your lower back has
 * not folded" is a sentence about the fold and this one has to be about the back
 * holding. Each says what the body is doing now, in the same plain register as
 * the warning it replaces, and none of them congratulates anybody: the app
 * reports what it counted and the player can decide how pleased to be.
 */
const CLEARED: Record<InjuryFlag, string> = {
  wrist_strain_forced_pronation: 'Your wrist has stopped turning hard through the ball',
  lumbar_load_posture_collapse: 'Your lower back has held straight under the swing',
  shoulder_load_no_drop: 'Your racket has fallen behind you before you reach',
}

/**
 * One sentence for a joint warning that has stopped, or nothing.
 *
 * States the run of clean trips and stops, for the same reason `strainLine`
 * states the count and stops. It is deliberately not a milestone, a badge or a
 * congratulation — `clearedStrain` is a count of analysed serves, and dressing it
 * up as an award would make the one honest thing on this block look like the
 * rest of the internet.
 */
export function strainClearedLine(record: Pick<StrainCleared, 'flag' | 'since'>): string | undefined {
  const subject = CLEARED[record.flag]
  if (!subject) return undefined
  return cue(`${subject} on your last ${record.since} trips.`)
}

/**
 * The joint each flag is about, named plainly and on its own.
 *
 * `INJURIES[flag].title` is an instruction — "Watch your lower back" — and this
 * is a noun phrase, so it cannot be derived from that one by cutting a word off
 * the front. Kept beside the titles rather than beside the caller that needs it,
 * so all the words this module can say about a flag are in one place and adding
 * a fourth flag fails in one file.
 */
const JOINT: Record<InjuryFlag, string> = {
  wrist_strain_forced_pronation: 'your wrist',
  lumbar_load_posture_collapse: 'your lower back',
  shoulder_load_no_drop: 'your shoulder',
}

/**
 * The warning as it reaches somebody standing on a baseline with a basket.
 *
 * The shortest form in the file, because the glance has less room than any other
 * screen and every word here is a word somebody reads instead of hitting the
 * next serve. It names the joint, ties it to the serve just hit — "that is" —
 * and gives the count, and nothing else: no mechanics, because the report
 * carries them, and no instruction, because this is not a fault to fix on the
 * next serve, it is a reason to stop after twenty rather than after eighty.
 *
 * `undefined` for a flag this build has no words for, like every other line.
 */
export function strainGlanceLine(
  record: Pick<StrainRecord, 'flag' | 'trips' | 'of'>,
): string | undefined {
  const joint = JOINT[record.flag]
  if (!joint) return undefined
  return cue(`That is ${joint} on ${record.trips} of your last ${record.of} trips.`)
}

/**
 * The history behind one injury card, in a clause.
 *
 * Sits under the card's own body, which has just explained the mechanics on this
 * serve, so it opens with "Also" and does not name the body part again. Says
 * what it counted and nothing else: no "again", which would be the app tutting,
 * and no advice, because the card above it already carries the fix.
 *
 * Flag-independent, unlike `strainLine` and `strainClearedLine` — the card it
 * appears on has already named the joint, so there is no subject to look up and
 * nothing for an unknown flag to break.
 */
export function strainBehindLine(record: { trips: number; of: number }): string | undefined {
  if (record.trips < 1 || record.of < 1) return undefined
  const trips = record.of === 1 ? 'trip' : 'trips'
  return cue(`Also on ${record.trips} of your ${record.of} ${trips} before this one.`)
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

/* --------------------------------------------------- did the last one move -- */

/**
 * The second half of the sentence: which way the fault went.
 *
 * Four states rather than three, because "gone" and "closer" are different
 * news and a player who fixed something deserves to be told they fixed it.
 * "Wider" is here for the same reason `sixWeekMilestone` reports a regression
 * as plainly as an improvement — a screen that only speaks on good news is the
 * same lie with the shape sanded off, and a player who has just made their
 * serve worse is the one person on this court who most needs to know.
 *
 * Deliberately vague about size. `FaultMove` carries the two misses and a
 * caller could subtract them, but the glance is read between serves with a ball
 * in the other hand, and a number there would be the raw readout the report
 * exists to translate. `voice.ts` bans one on screen outright.
 */
const MOVE_COPY: Record<MoveVerdict, string> = {
  cleared: 'Not on this one.',
  closer: 'Closer this time.',
  same: 'Still there.',
  wider: 'Further out this time.',
}

/**
 * The same four, for when the fault is already the heading above this line.
 *
 * A player rarely fixes a racket drop in one serve, so the common case by a
 * wide margin is that the earlier serve's fault is also this serve's — and
 * repeating the title under a heading that already says it reads as a stutter,
 * not as progress. These say which way it went and name the comparison instead
 * of the fault. `cleared` cannot reach here by construction and is written out
 * anyway: a table with a hole in it is one refactor away from a crash.
 */
const MOVE_AGAIN_COPY: Record<MoveVerdict, string> = {
  cleared: 'Gone since your last serve.',
  closer: 'Closer than your last serve.',
  same: 'No change from your last serve.',
  wider: 'Further out than your last serve.',
}

/**
 * What the last serve was told, and whether this one did it.
 *
 * The fault named is always the EARLIER serve's, never this one's. A glance
 * showing the new serve's worst fault beside "closer this time" would be two
 * different faults in one sentence, and the player would read the verdict as
 * being about the fault they can see rather than the one they were working on.
 *
 * Built out of `FLAW_COPY[…].title`, which is the same phrase the report heads
 * that fault with, so the two screens cannot end up calling one fault two
 * things. The axis variants are deliberately not consulted: this is a reminder
 * of a sentence the player already read, and re-deriving which axis it was
 * would risk reminding them of a different one.
 *
 * `alreadyNamed` is the caller saying the heading directly above already
 * carries this exact fault — see `MOVE_AGAIN_COPY`. It is passed rather than
 * worked out here because only the screen knows what it drew.
 */
export function faultMoveLine(move: FaultMove, alreadyNamed = false): string | undefined {
  if (alreadyNamed) return cue(MOVE_AGAIN_COPY[move.verdict])
  const title = FLAW_COPY[move.flaw]?.title
  if (!title) return undefined
  return cue(`Last serve: ${lowerFirst(title)}. ${MOVE_COPY[move.verdict]}`)
}

/**
 * The titles are written to open a card, so they start with a capital. Dropped
 * into the middle of a sentence they need it back off — except where the word
 * carries its own, which today is nothing in the table and tomorrow might be.
 */
const lowerFirst = (s: string): string =>
  /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s

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
  /*
   * The recurrence line is assembled from a subject and a count, so linting the
   * subject alone would check the half that cannot break the ceiling. Linted at
   * `STRAIN_WINDOW` rather than at a number chosen here, so widening the window
   * to something that spells longer is caught by the editor rather than shipped.
   */
  for (const flag of Object.keys(RECURRING) as InjuryFlag[]) {
    const text = strainLine({ flag, trips: STRAIN_WINDOW, of: STRAIN_WINDOW })
    if (text) out.push({ where: `strain.${flag}`, text })
  }
  for (const flag of Object.keys(CLEARED) as InjuryFlag[]) {
    const text = strainClearedLine({ flag, since: STRAIN_WINDOW })
    if (text) out.push({ where: `cleared.${flag}`, text })
  }
  // Both the singular and the plural form, since they are different sentences.
  for (const of of [1, STRAIN_WINDOW]) {
    const text = strainBehindLine({ trips: 1, of })
    if (text) out.push({ where: `behind.${of}`, text })
  }
  for (const flag of Object.keys(JOINT) as InjuryFlag[]) {
    const text = strainGlanceLine({ flag, trips: STRAIN_WINDOW, of: STRAIN_WINDOW })
    if (text) out.push({ where: `glance.${flag}`, text })
  }
  /*
   * The carry-forward line is assembled rather than stored, so linting
   * `MOVE_COPY` on its own would check half a sentence and miss the half that
   * can actually break the ceiling. Every flaw against every verdict is forty
   * strings, which is cheap, and it is the only way the lint sees the joined
   * form a player reads.
   */
  for (const flaw of Object.keys(FLAW_COPY) as FlawId[]) {
    for (const verdict of Object.keys(MOVE_COPY) as MoveVerdict[]) {
      const move: FaultMove = { flaw, signal: '', before: 0, after: 0, floor: 0, verdict }
      for (const again of [false, true]) {
        const text = faultMoveLine(move, again)
        if (text) out.push({ where: `move.${flaw}.${verdict}${again ? '.again' : ''}`, text })
      }
    }
  }
  return out
}

/** The three tables, for the totality checks. Read-only views. */
export const VERDICT_TABLES = {
  flaws: FLAW_COPY,
  injuries: INJURIES,
  refusals: REFUSALS,
} as const

/**
 * The racket's lay-back, between this serve and the last one on the trip.
 *
 * NO FIGURE, for the reason `uncalibratedLine` gives on the report: `voice.ts`
 * refuses a line carrying degrees, the usual escape is `readoutOf`, and it is
 * shut — `external_rotation_deg` has no ladder in `anatomy.ts` and cannot be
 * given one, because a ladder is a set of absolute stops and this reading has no
 * zero. So the direction ships and the magnitude does not. `rotationMove` has
 * already proved the change is bigger than both the noise and the posture that
 * could fake it, which licenses "further" and nothing past it.
 *
 * NEITHER DIRECTION IS GRADED. Laying the racket back further is usually good
 * and is not always: nothing in this engine knows what this number should be for
 * a club player, which is why it sits in `UNCALIBRATED` at all. Both lines say
 * what changed and stop.
 */
export function rotationMoveLine(move: RotationMove): string {
  return move.delta > 0
    ? cue('Your racket laid back further than on your last serve.')
    : cue('Your racket laid back less than on your last serve.')
}
