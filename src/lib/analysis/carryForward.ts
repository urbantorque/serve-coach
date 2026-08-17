/**
 * Did the thing you were just told about actually move?
 *
 * The glance screen exists to keep a loop going — record, glance, record — and
 * until now every glance was amnesiac. Serve four was told about its worst fault
 * with no idea that serve three had been told about the same one, so a player
 * standing on a baseline doing exactly what the app asked got the identical
 * sentence back and no acknowledgement that anything had changed. The report is
 * the wrong place to close that loop: it is read afterwards, sitting down, and
 * by then the basket is over.
 *
 * WHAT IS COMPARED IS `miss`, NOT THE SCORE. A score moves with every other
 * measurement on the report and with the rubric underneath all of them, so two
 * scores differing tells you almost nothing about the one fault a player was
 * working on. `FlawFinding.miss` is how far outside its target band the signal
 * landed, in the signal's own units, and it is the only number that answers
 * "did the racket get further down my back than last time" without answering
 * four other questions at once.
 *
 * WHAT COUNTS AS A MOVE IS `NOISE_FLOOR`, and not a threshold of its own.
 * `tiers.ts` already measured how far each signal wanders when the same serve is
 * filmed twice — that ensemble is what `flaws.ts` reads to decide a fault is
 * real rather than a re-roll of the tracker's own noise, and a change smaller
 * than it is the same reading twice. A second threshold beside it with a
 * different value would be two houses' opinions about one question, and the
 * house that measured it wins. The consequence is deliberate and worth stating:
 * on `hip_lead_ms`, whose floor is 76 ms, this will call almost every honest
 * improvement "no change yet" — which is the truth about what a phone can see,
 * not a failure of this module.
 *
 * REFUSES FAR MORE OFTEN THAN IT ANSWERS, and every refusal is silence rather
 * than a hedge. There is no room on the glance for a caveat — that screen
 * already drops the report's caveats for the same reason — so a comparison this
 * module cannot stand behind produces no line at all.
 *
 * NOT A SCORE, NOT A STREAK, NOT A BADGE. Nothing here is stored, nothing is
 * counted across sessions, and nothing rewards a tap. It is one observation
 * about two serves, recomputed from what is already on both reports, and it
 * disappears the moment the trip does.
 *
 * ACROSS ONE TRIP ONLY. A comparison spanning weeks is what `findPracticeFocus`
 * and the practice card are for, and they already apply a window and a floor
 * this deliberately does not. See `sameTrip` in `progress.ts` for what a trip is
 * and what that threshold cannot know.
 */
import type { FlawFinding, FlawId } from './flaws'
import { MIN_EVIDENCE } from './flaws'
import { NOISE_FLOOR } from './tiers'
import type { Diagnosis } from './diagnose'
import type { Triage } from './triage'
import type { ServeType } from '../storage/prefs'

/**
 * Everything this needs off a report, and nothing else.
 *
 * Structural rather than `Analysis` or `Session`, because both sides of the
 * comparison are one of the two and which is which depends on the caller: the
 * newer serve is usually a live `Analysis` that has not been stored yet, and the
 * older one is always a `Session` read back out of storage.
 */
export interface ComparableServe {
  id: string
  createdAt: number
  serveType?: ServeType
  triage?: Triage
  diagnosis?: Diagnosis
}

/** Which way the named fault went between two serves on one trip. */
export type MoveVerdict = 'cleared' | 'closer' | 'same' | 'wider'

export interface FaultMove {
  /** The fault the earlier serve was told about — always that one, never the new serve's. */
  flaw: FlawId
  signal: string
  /** How far outside the band each serve sat, in the signal's own units. */
  before: number
  after: number
  /**
   * The smallest difference between those two that is a difference at all.
   * `NOISE_FLOOR[signal]`, so a reader can see what the verdict rests on.
   */
  floor: number
  verdict: MoveVerdict
}

/**
 * The most recent serve before this one on the same trip, or nothing.
 *
 * Excludes the serve itself by id, because `trySave` writes the current report
 * and refreshes the session list before the glance renders — so the "history"
 * a caller is holding usually already contains the serve being asked about, and
 * comparing a serve against itself would report "no change yet" on every clip.
 *
 * Ordered by `createdAt` rather than by list position: `listSummaries` hands
 * back newest first today, and a function whose correctness depends on that
 * would break silently the day anything sorts it differently.
 */
export function previousOnTrip<T extends ComparableServe>(
  history: T[],
  current: ComparableServe,
  sameTrip: (a: { createdAt: number }, b: { createdAt: number }) => boolean,
): T | undefined {
  let best: T | undefined
  for (const s of history) {
    if (s.id === current.id) continue
    if (s.createdAt >= current.createdAt) continue
    if (!sameTrip(s, current)) continue
    if (!best || s.createdAt > best.createdAt) best = s
  }
  return best
}

/**
 * Whether the earlier serve's named fault moved, measured on the later one.
 *
 * `undefined` for every case where the two numbers are not the same
 * measurement — a different serve type, a different target tier, a reading
 * either clip could not take, or a fault the earlier serve was never told
 * about. Each of those is a case where a sentence could be produced and none of
 * them is a case where it would mean anything.
 */
export function faultMove(
  previous: ComparableServe,
  current: ComparableServe,
): FaultMove | undefined {
  const named = previous.triage?.primary_flaw
  if (previous.triage?.status !== 'ok' || !named) return undefined
  // A clip the engine rejected has no fault to have moved, and its `diagnosis`
  // describes whatever it managed to measure before deciding so.
  if (current.triage?.status !== 'ok') return undefined

  /*
   * The same serve, judged the same way, or no comparison.
   *
   * A flat serve and a kick serve are graded against different bands
   * (`SERVE_TYPES` in `coaching.ts`), so `miss` is a distance from two different
   * targets and subtracting one from the other measures the switch. `typeOf`'s
   * own default is applied here rather than imported, since a report written
   * before serve types existed was scored against the flat bands and so was
   * every other one that has no field.
   */
  if ((previous.serveType ?? 'flat') !== (current.serveType ?? 'flat')) return undefined

  const before = findingFor(previous.diagnosis, named.flaw)
  const after = findingFor(current.diagnosis, named.flaw)
  if (!before || !after) return undefined

  /*
   * The band has to have stayed where it was.
   *
   * `miss` is a distance from a target that `targetFor` derives from the rung
   * above wherever the player sits, and the level control lets that rung move
   * between two serves. A player who moved themselves up a rung mid-basket
   * would otherwise be told their fault got worse for having raised their own
   * standard, which is the most discouraging thing this screen could say and
   * would be false besides.
   */
  if (before.target_tier !== after.target_tier) return undefined

  // Both readings have to be evidence. `evaluateFlaws` already drops anything
  // under this bar before it builds a finding, so in practice this catches a
  // report restored from a backup written by an older build.
  if (before.confidence < MIN_EVIDENCE || after.confidence < MIN_EVIDENCE) return undefined

  const floor = NOISE_FLOOR[before.signal] ?? 0
  const delta = before.miss - after.miss

  /*
   * `detected` first, and it is not the same test as "the miss got smaller".
   *
   * `evaluateFlaws` clears a flaw when the miss falls inside the band OR inside
   * the signal's own noise floor, and it also has one structural override —
   * `racketNeverFell` — that no arithmetic on `miss` can see. Asking the engine
   * whether the fault is still there, rather than re-deriving it from the two
   * numbers, is what keeps this screen and the report from disagreeing about
   * the same serve.
   */
  if (!after.detected) return { flaw: named.flaw, signal: before.signal, before: before.miss, after: after.miss, floor, verdict: 'cleared' }

  const verdict: MoveVerdict =
    Math.abs(delta) < floor ? 'same' : delta > 0 ? 'closer' : 'wider'

  return { flaw: named.flaw, signal: before.signal, before: before.miss, after: after.miss, floor, verdict }
}

/** The finding for one flaw, or nothing where the clip could not read it. */
function findingFor(diagnosis: Diagnosis | undefined, flaw: FlawId): FlawFinding | undefined {
  const f = (diagnosis?.flaws ?? []).find((x) => x.flaw === flaw)
  return f && Number.isFinite(f.miss) ? f : undefined
}
