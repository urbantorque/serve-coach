/**
 * How far a signal moves when nothing about the serve moves at all.
 *
 * Every band in `tiers.ts` is a claim that two serves on opposite sides of it
 * are different serves. That claim is only worth as much as the measurement's
 * own repeatability: a signal that swings 57 ms across noise realisations of one
 * identical serve cannot support a 45 ms band, however carefully the band was
 * chosen. `NOISE_FLOOR` is the engine's answer to that, and this file is where
 * the numbers in it come from.
 *
 * Extracted out of `depth.test.ts` because it had grown into the thing the
 * floors are derived from while still being a private function in one suite. Two
 * consequences of that were worth paying to remove:
 *
 *   - a second suite that wanted to ask "is this signal repeatable enough to
 *     grade?" had to reimplement the ensemble, and two ensembles that disagree
 *     are worse than none, and
 *   - the *decision* taken about an under-resolved signal lived nowhere. It was
 *     visible only as a number in `NOISE_FLOOR` that happened to equal that
 *     signal's `seriousMiss`, which is not something a reader of `tiers.ts`
 *     would ever notice. `floorVerdict` below names it.
 *
 * This is a model of camera noise, not a measurement of one. See the caveat at
 * the end of `depth.test.ts`; nothing here is confirmed against real footage,
 * because there is none.
 */
import { diagnose, type Diagnosis } from '../diagnose'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { NOISE_FLOOR, SIGNALS, UNDER_RESOLVED } from '../tiers'
import type { FlawId } from '../flaws'

/**
 * The frame rate the ensemble is filmed at by default — an ordinary phone's.
 *
 * A default and not a constant, because half of what this file is cited for is
 * how a signal behaves as the frame rate CHANGES: `hip_lead_ms` used to deviate
 * 45.4 ms at 30 fps, 56.6 at 50 and 110.6 at 120 — worse the more frames it was
 * given — and both `CHAIN_WINDOW_SECONDS` and `TRUNK_WINDOW_SECONDS` exist
 * because of that table. With the second of those in place the same sweep at
 * sixty seeds reads 43.3 / 50.1 / 35.6, which is the point: the slope was the
 * filter, not the phone. This used to be hard-coded into `realise`, so
 * every one of those figures was a recorded number pointing at a file that
 * could not produce it — the same defect `seeds` was parameterised to remove,
 * reintroduced along the other axis. Pass `fps` to `realise` to reproduce them.
 */
export const FPS = 50

/** In-plane landmark jitter, matching what the rest of the suite calls realistic. */
export const IN_PLANE = 0.006

/**
 * How much worse depth is, and how much of it moves as one.
 *
 * Four times the in-plane error sits in the middle of the published range for
 * MediaPipe world landmarks; the bias term is about a percent of frame height,
 * which on this rig's scale is roughly three centimetres of whole-body depth
 * error on a given frame. The bias is the half that matters: a yaw angle is a
 * *difference* of two landmark positions, so independent jitter on them largely
 * cancels, and an offset that moves the whole player does not cancel at all.
 */
export const DEPTH_MULTIPLIER = 4
export const DEPTH_BIAS = 0.006

/**
 * The dials every derivation here is taken at: one serve, a modelled camera.
 *
 * Named and exported so a suite cannot accidentally derive a floor from a
 * gentler camera than the one the floors were set against.
 */
export const DEPTH_AWARE: Partial<ServeDials> = {
  noise: IN_PLANE,
  depthNoise: DEPTH_MULTIPLIER,
  depthBias: DEPTH_BIAS,
}

/**
 * `n` noise realisations, spread by a large odd stride.
 *
 * Parameterised rather than a fixed list because the two things derived from this
 * ensemble need different numbers of draws. A deviation settles in a couple of
 * dozen; a naming *rate* in the low percent does not, and the rate tables in
 * `tiers.ts` were taken over sixty. Those tables used to cite this file while
 * this file could only produce twenty-four, so the derivation they pointed at was
 * unrunnable — a recorded number rather than a reproducible one, which is the
 * thing the whole `UNDER_RESOLVED` mechanism exists to avoid.
 *
 * Prefixed and strided rather than 0..n so that consecutive seeds are not
 * consecutive states of the generator.
 */
export const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => 7000 + i * 4523)

/**
 * The ensemble the suite runs on every change.
 *
 * Twenty-four rather than a round hundred because the whole suite has to stay
 * fast enough to run on every change; it is enough draws for a deviation and
 * openly not enough for a tail. Nothing asserted against it turns on a rare
 * event — see `namedOn`, which is deliberately read as a rate and compared with
 * wide margins. For a rate worth quoting, pass `seeds(60)` to `realise`.
 */
export const SEEDS = seeds(24)

/** One realisation of the ensemble: what the engine measured, and what it named. */
export interface Realisation {
  signals: Record<string, number>
  /**
   * Every measurement the engine takes and does not grade, flattened to the
   * same shape as `signals` — the chain's per-link peak times, and the trophy
   * external rotation beside them. See `flattenUngraded`.
   *
   * Kept separate from `signals` rather than merged into it, which is the whole
   * reason this field exists. `signals` is what the engine grades, infers a tier
   * from and pairs into injury flags; the chain is measured and deliberately
   * does none of those things. Merging the two to save a field would make the
   * ensemble unable to tell a graded number from an ungraded one — and the
   * ungraded ones are ungraded on purpose, recorded in `UNCALIBRATED`.
   *
   * Anything the engine dropped is absent rather than zero, exactly as in
   * `signals`, so `deviations` counts them the same way.
   *
   * Still named `chain` because the chain was all there was when it was written
   * and every reader of this file knows it by that name; what it holds is the
   * ungraded set, which is what `depth.test.ts` actually checks it against.
   */
  chain: Record<string, number>
  /** The flaws the engine named to the player on this realisation. */
  named: Set<FlawId>
  /** Every flaw finding, named or not, keyed by the signal that proves it. */
  bySignal: Record<string, { detected: boolean; miss: number; confidence: number }>
}

/**
 * Film the same serve once per seed and read it.
 *
 * Realisations the detector refuses are dropped rather than counted as a zero: a
 * clip that could not be read is not a reading of any value, and averaging it in
 * as one is the exact defaulting `metrics.ts` forbids. The count that comes back
 * is therefore the number that were readable, and callers report it.
 *
 * `over` defaults to the suite's twenty-four. Pass `seeds(60)` to reproduce the
 * naming-rate tables quoted in `tiers.ts`; that takes long enough that it is not
 * what the suite runs on every change.
 *
 * `fps` defaults to `FPS` and is the axis every frame-rate claim in the engine
 * is derived along — `hip_lead_ms` getting worse the more frames it is given,
 * and the chain window being stated in seconds because of it. Filming and
 * detecting are handed the same rate, because a clip's rate is one fact about
 * it: telling the detector a different number would be measuring the engine's
 * response to a lie rather than to a phone.
 */
export function realise(
  dials: Partial<ServeDials> = {},
  tier = 5,
  over: readonly number[] = SEEDS,
  fps = FPS,
): Realisation[] {
  const out: Realisation[] = []
  for (const seed of over) {
    const frames = buildServe({ ...DEPTH_AWARE, ...dials, seed }, fps)
    let skel
    try {
      skel = detectServe(frames, fps)
    } catch {
      continue
    }
    const d = diagnose(frames, skel, { tier })
    out.push({
      signals: d.signals,
      chain: flattenUngraded(d),
      named: new Set(d.flaws.filter((f) => f.detected).map((f) => f.flaw)),
      bySignal: Object.fromEntries(
        d.flaws.map((f) => [f.signal, { detected: f.detected, miss: f.miss, confidence: f.confidence }]),
      ),
    })
  }
  return out
}

/**
 * The chain object as a flat record, dropping the links that were not in view.
 *
 * A dropped link arrives as `null` and is left out entirely rather than mapped
 * to a number, so a clip where the racket hand was never seen contributes
 * nothing to that link's deviation instead of contributing a zero that would
 * halve it. Same rule `realise` already applies to a whole unreadable clip, and
 * the same rule `metrics.ts` applies to a value it could not compute.
 */
/**
 * Every measurement the engine takes and deliberately does not grade, flat.
 *
 * The chain was the only such measurement when `flattenChain` was written, so
 * the bag was named after it. `Diagnosis.externalRotation` is the second, on
 * exactly the same terms, and it has to arrive through the same door: the
 * "declared uncalibrated ⟺ actually produced" check in `depth.test.ts` walks
 * this bag, so a measurement that skipped it would be an ungraded number nothing
 * held to account, which is the one thing that check exists to prevent.
 *
 * Takes the whole `Diagnosis` rather than a field, because what belongs in here
 * is a property of the measurement's *status* — ungraded — and not of where it
 * happens to be stored.
 */
export function flattenUngraded(d: Diagnosis): Record<string, number> {
  const out = flattenChain(d.chain)
  // Dropped rather than zeroed when the arm could not be read, the same rule
  // every link above follows: an angle nobody measured is not a neutral one.
  const deg = d.externalRotation?.deg
  if (typeof deg === 'number' && Number.isFinite(deg)) out.external_rotation_deg = deg
  return out
}

export function flattenChain(chain: Diagnosis['chain']): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [link, v] of Object.entries(chain)) {
    if (link === 'span_ms') {
      if (typeof v === 'number') out.chain_span_ms = v
      continue
    }
    if (link === 'span_ratio') {
      // Dimensionless, where every other entry here is milliseconds. Anything
      // reading this record has to know that — `depth.test.ts` keeps it out of
      // the ms-bounded provenance groups for exactly that reason.
      if (typeof v === 'number') out.chain_span_ratio = v
      continue
    }
    const ms = (v as { ms: number | null }).ms
    if (ms !== null) out[`${link}_peak_ms`] = ms
  }
  return out
}

export interface SignalDeviation {
  id: string
  /** Standard deviation across the ensemble, in the signal's own units. */
  sd: number
  /** Full max-minus-min range, for a reader. Never used to set a threshold. */
  range: number
  /** How many realisations produced this signal at all. */
  n: number
  /** The worst evidence score the flaw pass gave it, across the ensemble. */
  confidence: number
}

/**
 * How much each signal moved, worst first.
 *
 * Reported as a standard deviation as well as a full range. The range is what a
 * reader wants to see and a poor thing to set a threshold from — over
 * twenty-four draws it is dominated by the two most unlucky ones — so everything
 * downstream that has to pick a number uses the deviation.
 *
 * Sorted by deviation *against the signal's own floor*, so the list leads with
 * whichever signal its floor is covering least comfortably rather than with
 * whichever happens to be measured in the largest units. Milliseconds and
 * ratios in one table sort meaninglessly any other way.
 */
export function deviations(reals: Realisation[]): SignalDeviation[] {
  return spreadOf(reals, (r) => r.signals)
}

/**
 * The same arithmetic over the chain's per-link peak times.
 *
 * Separate entry point rather than a flag, because the two answer different
 * questions and only one of them has floors to be sorted against: every id here
 * is in `UNCALIBRATED` by construction, so `NOISE_FLOOR` has nothing to say and
 * the ordering falls back to raw deviation. Reading a chain link's number out of
 * `deviations()` would silently compare it against a floor of 1 and rank it
 * beside signals measured in degrees.
 */
export function chainDeviations(reals: Realisation[]): SignalDeviation[] {
  return spreadOf(reals, (r) => r.chain)
}

function spreadOf(
  reals: Realisation[],
  pick: (r: Realisation) => Record<string, number>,
): SignalDeviation[] {
  const ids = new Set(reals.flatMap((r) => Object.keys(pick(r))))
  return [...ids]
    .map((id) => {
      const xs = reals.map((r) => pick(r)[id]).filter((v) => Number.isFinite(v))
      const mu = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
      const variance = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, xs.length)
      return {
        id,
        sd: Math.sqrt(variance),
        range: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
        n: xs.length,
        confidence: Math.min(...reals.map((r) => r.bySignal[id]?.confidence ?? 1)),
      }
    })
    .sort(
      (a, b) =>
        b.sd / Math.max(1e-9, Math.abs(NOISE_FLOOR[b.id] ?? 1)) -
        a.sd / Math.max(1e-9, Math.abs(NOISE_FLOOR[a.id] ?? 1)),
    )
}

/**
 * How much of a floor a signal's own repeatability asks for.
 *
 * One and a half deviations, matching what `NOISE_FLOOR` documents. Rounded
 * *up* to the signal's own precision, never down: rounding a floor down is a
 * cap, and a cap that arrives by rounding is exactly the kind that nobody
 * notices. Ratios keep three places, degrees and milliseconds go to whole units.
 */
export function floorWanted(sd: number, signal: string): number {
  const step = SIGNALS[signal]?.unit === 'ratio' ? 0.001 : 1
  return Math.ceil((1.5 * sd) / step - 1e-9) * step
}

export interface FloorVerdict extends SignalDeviation {
  /** What the table actually holds. */
  floor: number
  /** What this signal's own repeatability asks for. */
  wanted: number
  /** The engine's own definition of a fault worth acting on, for this signal. */
  seriousMiss: number
  /**
   * The measurement is less repeatable than the engine's definition of a
   * serious miss. A fact about the ensemble, not a policy: no choice of floor
   * makes it false, which is why the decision taken has to be written down
   * separately in `UNDER_RESOLVED`.
   */
  underResolved: boolean
  /**
   * The floor written down is below what the repeatability asks for — somebody
   * chose to grade this signal finer than it measures. This is the thing that
   * used to be invisible.
   */
  capped: boolean
  /** The stated reason, when this signal is declared in `tiers.ts`. */
  declared?: string
}

/** Every signal's floor, set beside what its own repeatability asks of it. */
export function floorVerdicts(reals: Realisation[]): FloorVerdict[] {
  return deviations(reals).map((d) => {
    const floor = NOISE_FLOOR[d.id]
    const wanted = floorWanted(d.sd, d.id)
    const seriousMiss = SIGNALS[d.id]?.seriousMiss ?? Number.POSITIVE_INFINITY
    return {
      ...d,
      floor,
      wanted,
      seriousMiss,
      underResolved: wanted > seriousMiss,
      // Compared against the rounded-up figure, so a floor that sits exactly on
      // what the measurement asks for is not reported as a cap.
      capped: floor !== undefined && floor < wanted,
      declared: UNDER_RESOLVED[d.id],
    }
  })
}

/**
 * How often a flaw was named across the ensemble, as a rate in 0–1.
 *
 * The number that decides whether a detector is worth having. A flaw named on
 * every realisation of a broken serve and none of a clean one is a detector; a
 * flaw named on a third of the broken ones and a tenth of the clean ones is a
 * coin the camera is flipping, and the difference is invisible in any test that
 * films the serve once.
 */
export function namedOn(reals: Realisation[], flaw: FlawId): number {
  if (!reals.length) return 0
  return reals.filter((r) => r.named.has(flaw)).length / reals.length
}
