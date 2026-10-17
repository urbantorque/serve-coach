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
 *
 * The motion is no longer only the rig's. `realiseReal` runs the same noise on
 * six real serves (the Bath motion capture), and every floor has to cover both
 * — the rig's motion was written beside the bands, so a floor derived from it
 * alone only showed the engine agreeing with itself (`ANALYSIS-REVIEW.md` F1).
 * Real motion asked for wider floors on four signals; see `NOISE_FLOOR`.
 */
import fixture from './fixtures/bath-serves.json'
import { diagnose, type Diagnosis } from '../diagnose'
import { LM } from '../geometry'
import { filmMocap, unpackMocap, type MocapServe, type PackedMocapServe, type VirtualPhone } from '../mocapServe'
import { injuriesIn, type InjuryFlag } from '../triage'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { unswapFrames } from '../swapGuard'
import { NOISE_FLOOR, SIGNALS, UNDER_RESOLVED } from '../tiers'
import type { Frame } from '../types'
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
  /** The joint warnings this realisation would raise (`injuriesIn`, L1.3). */
  injuries: InjuryFlag[]
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
  return realiseFilmed((seed) => buildServe({ ...DEPTH_AWARE, ...dials, seed }, fps), tier, over, fps)
}

/**
 * The same ensemble on any filming of a serve: one clip per seed, read once.
 *
 * `realise` is this with the rig doing the filming; `realiseReal` is this with
 * the virtual phone filming real motion. One reader for both, so the two
 * tables in `depth.test.ts` cannot differ by anything but the serve.
 */
export function realiseFilmed(
  film: (seed: number) => Frame[],
  tier = 5,
  over: readonly number[] = SEEDS,
  fps = FPS,
): Realisation[] {
  const out: Realisation[] = []
  for (const seed of over) {
    // Through the swap guard, as the app reads every clip (L5.9). A filming
    // with no swaps in it comes back unchanged.
    const frames = unswapFrames(film(seed)).frames
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
      injuries: injuriesIn(d).map((r) => r.flag),
    })
  }
  return out
}

/**
 * The six real serves in `fixtures/bath-serves.json` — the Bath motion
 * capture, CC BY 4.0, attribution in that file and in `src/dev/mocap/bath.ts`.
 */
export const REAL_SERVES: MocapServe[] = (fixture.serves as PackedMocapServe[]).map((p) =>
  unpackMocap(p, (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))),
)

/**
 * How tall the player stands in the picture, ankle line to the top of the
 * head, in frame heights — nose height over 0.93, as `phases.ts` reads it.
 */
function statureInPicture(frame: Frame): number {
  const ankle = Math.max(frame.image[LM.leftAnkle].y, frame.image[LM.rightAnkle].y)
  return (ankle - frame.image[LM.nose].y) / 0.93
}

/** The rig's player in its own picture, which every noise figure here is sized against. */
const RIG_STATURE = statureInPicture(buildServe({}, FPS)[0])

/**
 * Real serve motion, filmed by the virtual phone from the guide's placement
 * with the rig's own camera noise: one ensemble per serve.
 *
 * The noise is scaled to the player rather than to the frame. The guide's
 * phone at 4.5 m puts a 1.8 m server at about 0.31 of the picture, the rig's
 * player fills 0.54, and the pose model reads a crop around the player
 * (`pose/extract.ts`), so its error follows the body's size and not the
 * frame's. Unscaled, the same jitter would land on real motion 1.7 times as
 * large and the two tables would differ by the zoom instead of the serve.
 *
 * Kept per serve rather than pooled into one list, because a floor is about
 * one serve filmed twice: six serves read as one population would add the
 * player's serve-to-serve spread to the camera's.
 */
export function realiseReal(
  serves: readonly MocapServe[] = REAL_SERVES,
  over: readonly number[] = SEEDS,
  fps = FPS,
  tier = 5,
  /** Where the virtual phone stands, when not the guide's placement. */
  phone: Partial<VirtualPhone> = {},
): Realisation[][] {
  return serves.map((serve) => {
    const scale = statureInPicture(filmMocap(serve, { ...phone, fps })[0]) / RIG_STATURE
    return realiseFilmed(
      (seed) =>
        filmMocap(serve, {
          ...phone,
          fps,
          seed,
          noise: IN_PLANE * scale,
          depthNoise: DEPTH_MULTIPLIER,
          depthBias: DEPTH_BIAS * scale,
        }),
      tier,
      over,
      fps,
    )
  })
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
  // The third, and the first read past contact. Dimensionless like
  // `chain_span_ratio` and unlike everything else in this bag, which every
  // consumer that prints it has to know — see the print sites in `depth.test.ts`.
  const offset = d.landing?.offset
  if (typeof offset === 'number' && Number.isFinite(offset)) out.landing_offset_ratio = offset
  // The leg-drive rise used to be the fourth entry here. It is graded now and
  // arrives through `signals` with the other graded readings — see its band
  // in `tiers.ts` — so carrying it here as well would declare it ungraded too.
  // The fifth, and unlike the one above it this one is a depth reading: a joint
  // angle cannot be had from a single axis. It arrives through this door for the
  // reason every other measurement does — the "declared uncalibrated ⟺ actually
  // produced" check walks this bag, so a number that skipped it would be an
  // ungraded reading nothing held to account.
  const ext = d.legDrive?.extensionDeg
  if (typeof ext === 'number' && Number.isFinite(ext)) out.knee_extension_deg = ext
  // The sixth: the racket hand over the shoulder at the knee trough (D3.5).
  // Dimensionless, read off image y.
  const cock = d.armCock?.ratio
  if (typeof cock === 'number' && Number.isFinite(cock)) out.arm_cock_ratio = cock
  // Where the toss went from the front foot (D3.1): one axis from the side and
  // the other from behind, so a clip carries at most one of the two.
  const ahead = d.tossPlacement?.ahead
  if (typeof ahead === 'number' && Number.isFinite(ahead)) out.toss_ahead_ratio = ahead
  const across = d.tossPlacement?.across
  if (typeof across === 'number' && Number.isFinite(across)) out.toss_across_ratio = across
  // The landing from each foot (D3.3).
  const front = d.landingFeet?.front
  if (typeof front === 'number' && Number.isFinite(front)) out.landing_front_ratio = front
  const follow = d.landingFeet?.backFollow
  if (typeof follow === 'number' && Number.isFinite(follow)) out.back_foot_follow_ratio = follow
  // Which way the hips went after contact, signed (L5.7). From the side only.
  const travel = d.landingTravel?.forward
  if (typeof travel === 'number' && Number.isFinite(travel)) out.landing_travel_ratio = travel
  // The body held still at the trophy (D3.4), read only at 60 fps and above.
  const hitch = d.hitch?.share
  if (typeof hitch === 'number' && Number.isFinite(hitch)) out.hitch_share_ratio = hitch
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
  /**
   * Full max-minus-min range, for a reader — the widest any one serve's takes
   * ran, when several serves are pooled. Never used to set a threshold.
   */
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
  return spreadOf([reals], (r) => r.signals)
}

/**
 * The same, over several serves each filmed many times: the camera's spread
 * within a serve, pooled across serves.
 *
 * Within-serve variances averaged, weighted by how many takes each serve
 * produced, and never the spread of every take thrown into one list — that
 * would add the player's own serve-to-serve variation to the camera's, and a
 * floor is about the same serve filmed twice.
 */
export function pooledDeviations(groups: Realisation[][]): SignalDeviation[] {
  return spreadOf(groups, (r) => r.signals)
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
  return spreadOf([reals], (r) => r.chain)
}

function spreadOf(
  groups: Realisation[][],
  pick: (r: Realisation) => Record<string, number>,
): SignalDeviation[] {
  const all = groups.flat()
  const ids = new Set(all.flatMap((r) => Object.keys(pick(r))))
  return [...ids]
    .map((id) => {
      let squares = 0
      let n = 0
      let range = 0
      for (const reals of groups) {
        const xs = reals.map((r) => pick(r)[id]).filter((v) => Number.isFinite(v))
        if (!xs.length) continue
        const mu = xs.reduce((a, b) => a + b, 0) / xs.length
        squares += xs.reduce((a, b) => a + (b - mu) ** 2, 0)
        n += xs.length
        range = Math.max(range, Math.max(...xs) - Math.min(...xs))
      }
      return {
        id,
        sd: Math.sqrt(squares / Math.max(1, n)),
        range,
        n,
        confidence: Math.min(...all.map((r) => r.bySignal[id]?.confidence ?? 1)),
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
  return verdictsOf(deviations(reals))
}

/** The same, for several serves each filmed many times — see `pooledDeviations`. */
export function pooledFloorVerdicts(groups: Realisation[][]): FloorVerdict[] {
  return verdictsOf(pooledDeviations(groups))
}

function verdictsOf(devs: SignalDeviation[]): FloorVerdict[] {
  return devs.map((d) => {
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
