/**
 * Validating the engine against real footage.
 *
 * The synthetic rig proves the maths is self-consistent, but it cannot prove the
 * engine agrees with reality: it has no motion blur, no rolling shutter, no
 * far-side limb guessed at from behind a torso, and its world-landmark z is
 * exact where MediaPipe's is the noisiest thing it outputs. Those are precisely
 * the conditions the measurements have to survive, and the only way to know they
 * do is to check the pipeline against clips a human has labelled.
 *
 * A fixture stores the *pose output* rather than the video, which is what makes
 * this testable at all: the checks run in Node with no browser, no decode and no
 * model, they are a few hundred kilobytes rather than a few hundred megabytes,
 * and — because the recorded landmarks never change — a regression can only come
 * from the analysis code, which is the thing under test.
 *
 * DOM-free by construction, so the test runner can import it directly.
 */

import { detectWithContact, type ContactRead } from './contact'
import { measure } from './metrics'
import { detectServe } from './phases'
import { assessSpatial, turnedPicture, viewFromCourtYaw } from './spatial'
import type { Frame, Landmark, PhaseId, Quality } from './types'
import type { BallFlight } from '../vision/ballTrack'

/* ------------------------------------------------------------------ packing */

/**
 * Frames flattened into number arrays and rounded.
 *
 * Stored as JSON so a fixture is reviewable in a diff, but one frame is 33
 * landmarks in two coordinate spaces — as objects that is ~40 kB a frame and a
 * 120-frame clip becomes a 5 MB file nobody will commit. Flattened and rounded
 * to the precision the tracker actually resolves, the same clip is ~250 kB.
 */
export interface PackedFrames {
  count: number
  /** Sample times in seconds. */
  t: number[]
  /** count × 33 × 4, as x, y, z, visibility. */
  image: number[]
  world: number[]
}

/**
 * Rounding is deliberate, not incidental: image coords are a fraction of the
 * frame and world coords are metres, so they need different precision to keep
 * the same physical resolution. 5 dp of a frame is well under a pixel; 4 dp of a
 * metre is a tenth of a millimetre. Both are far finer than the tracker's own
 * repeatability, so nothing measurable is lost.
 */
const round = (v: number, dp: number) => {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

export function packFrames(frames: Frame[]): PackedFrames {
  const image: number[] = []
  const world: number[] = []
  const t: number[] = []

  for (const f of frames) {
    t.push(round(f.t, 4))
    for (let i = 0; i < 33; i++) {
      const im = f.image[i] ?? { x: 0, y: 0, z: 0, visibility: 0 }
      image.push(round(im.x, 5), round(im.y, 5), round(im.z, 5), round(im.visibility, 3))
      const w = f.world[i] ?? { x: 0, y: 0, z: 0, visibility: 0 }
      world.push(round(w.x, 4), round(w.y, 4), round(w.z, 4), round(w.visibility, 3))
    }
  }

  return { count: frames.length, t, image, world }
}

export function unpackFrames(packed: PackedFrames): Frame[] {
  const frames: Frame[] = []
  for (let i = 0; i < packed.count; i++) {
    const read = (src: number[]): Landmark[] => {
      const out: Landmark[] = []
      for (let k = 0; k < 33; k++) {
        const o = (i * 33 + k) * 4
        out.push({ x: src[o], y: src[o + 1], z: src[o + 2], visibility: src[o + 3] })
      }
      return out
    }
    frames.push({ index: i, t: packed.t[i], image: read(packed.image), world: read(packed.world), visibility: 0 })
  }
  return frames
}

/* ----------------------------------------------------------------- fixtures */

export interface FixtureExpectation {
  /** Which hand actually held the racket. */
  handedness?: 'right' | 'left'
  view?: Quality['view']
  /**
   * Hand-labelled keyframe times in seconds, read off the clip by scrubbing.
   * Partial is fine — label the ones you are sure of and leave the rest out.
   */
  keyframes?: Partial<Record<PhaseId, number>>
  /**
   * Values measured outside the app: contact height off a wall mark, knee angle
   * from a protractor on a paused frame, drop-to-contact from the frame count.
   * These are the only assertions here that can catch the engine being
   * self-consistently wrong.
   */
  metrics?: Record<string, number>
  /**
   * How each entry in `metrics` was measured, in the labeller's own words —
   * "protractor on the paused trophy frame", "wall mark at 2.60 m, contact two
   * bricks above".
   *
   * Required, one per metric, and checked by `validateFixtureSchema`. This is
   * the only structural defence against the failure the whole fixture suite
   * exists to prevent: a value pasted out of the app's own report, which asserts
   * that the engine reproduces itself and nothing else. Omission is the easy
   * path and copying is the tempting one, so the schema makes the easy path
   * fail — a copied number now needs a sentence describing a measurement that
   * was never taken, which is a lie somebody has to type on purpose rather than
   * a box they forgot to fill in.
   */
  metricSource?: Record<string, string>
  /** The clip should be rejected as not-a-serve. */
  rejected?: boolean
}

export interface Fixture {
  id: string
  /** Human description: "adult male, side-on, 240 fps slow motion, iPhone 13". */
  label: string
  /**
   * `recorded` came off a real camera. `synthetic` came from the rig and exists
   * to prove this harness runs, not to validate anything about reality — a suite
   * of only synthetic fixtures is worth exactly nothing here.
   */
  source: 'recorded' | 'synthetic'
  notes?: string
  /** Sampled frames per second, as `extractFrames` reported it. */
  fps: number
  frames: PackedFrames
  /**
   * The tossed ball, when the app found one — as the report carries it, in the
   * same levelled space and on the same clock as `frames`. Without it the two
   * ball measurements and the ball's say in contact (`readContact`) escaped
   * every replay (D1.5). Absent is fine: most clips have no ball.
   */
  ball?: BallFlight
  expect: FixtureExpectation
  tolerance?: Partial<Tolerance>
}

export interface Tolerance {
  /** Seconds a detected keyframe may sit away from its label. */
  keyframeSeconds: number
  /** Tighter for contact, which a human can label to the frame. */
  contactSeconds: number
  /** Per-unit allowance for a measured value: degrees, body-heights, ms, %. */
  degrees: number
  ratio: number
  ms: number
  percent: number
}

/**
 * Defaults sized to what a human labeller can actually resolve, not to what
 * would make the suite pass. A keyframe scrubbed by eye on 30 fps footage is
 * good to about two frames; contact is the one moment anybody can pick exactly,
 * so it gets a tighter bound. The metric allowances are roughly the width of the
 * band each measurement is scored against divided by four — tight enough that a
 * miss changes the advice the player is given, which is the standard that
 * matters.
 */
export const DEFAULT_TOLERANCE: Tolerance = {
  keyframeSeconds: 0.09,
  contactSeconds: 0.05,
  degrees: 9,
  ratio: 0.07,
  ms: 45,
  percent: 9,
}

const UNIT_KEY: Record<string, keyof Tolerance> = {
  '°': 'degrees',
  '×': 'ratio',
  ms: 'ms',
  '%': 'percent',
}

/* ------------------------------------------------------------ schema checks */

/**
 * What is wrong with a fixture file, before the engine is asked to run on it.
 *
 * `fatal` means the file cannot be fed to the pipeline at all — a frame array of
 * the wrong length, a missing `expect`. Everything else is a labelling fault:
 * the file would run, and running it would produce a green tick that means
 * nothing. Both fail the suite; the split exists only so a structurally broken
 * file is not also reported as having failed twenty comparisons it never made.
 */
export interface FixtureSchemaIssue {
  /** Dotted path into the fixture, e.g. `expect.metrics.contactHeight`. */
  where: string
  /** What is wrong, and what to do about it. */
  problem: string
  fatal: boolean
}

/**
 * The phase ids a keyframe label may use.
 *
 * Duplicated from `PhaseId` in types.ts because a fixture arrives as JSON and a
 * type cannot check JSON. `satisfies` ties the two together: adding a phase to
 * `PhaseId` without adding it here is a compile error, so the runtime list
 * cannot drift into silently ignoring a label the labeller took the trouble to
 * write.
 */
const PHASE_IDS = ['ready', 'toss', 'trophy', 'drop', 'contact', 'finish'] as const satisfies
  readonly PhaseId[]

const VIEWS = ['side', 'front-back', 'angled'] as const satisfies readonly Quality['view'][]

/**
 * Shortest `metricSource` note accepted, in characters.
 *
 * Eight is enough for the shortest honest answer anybody would actually write
 * ("protractor", "wall mark", "frame count") and short enough that it never
 * blocks a real one. Its job is not to judge the prose — it is to stop `"x"` and
 * `" "` being used to clear the provenance requirement without stating anything.
 */
const MIN_SOURCE_CHARS = 8

/**
 * Letters, as opposed to characters, a note must contain.
 *
 * `MIN_SOURCE_CHARS` alone is cleared by any eight keystrokes: `"????????"`,
 * `"--------"`, `"________"`, `"~~~~~~~~"` and nine full stops were all accepted
 * as the provenance of a measurement before this existed. A note that says how
 * something was measured is made of words, so the bar is on letters and nothing
 * else. Six, because the shortest honest note the README suggests — "wall mark"
 * — has eight, "frame count" has ten, and "tape at 2.60 m" has seven; six leaves
 * room under all of them while leaving none at all for a row of punctuation.
 */
const MIN_SOURCE_LETTERS = 6

/**
 * Notes that clear the length bar while stating nothing, or stating the one
 * thing that disqualifies the value.
 *
 * The first group is the placeholder a person types to move on. The second is
 * the honest admission — "from the app", "engine output" — which is exactly the
 * case this whole mechanism exists to catch, so it must be rejected rather than
 * accepted for its candour.
 *
 * `screenshot` used to sit in the second group and was wrong there. A screenshot
 * of the *clip* is the medium this repo's own labelling instructions ask for —
 * README.md says to use a "protractor on a paused frame", and the `metricSource`
 * doc-comment's example is "protractor on the paused trophy frame". It was
 * refusing "protractor on a screenshot of the paused trophy frame": a real
 * measurement, described accurately, turned away. A screenshot of the *report*
 * is still caught, by the `the app` and `report` branches beside it.
 */
const HOLLOW_SOURCE =
  /^(todo|tbd|n\/?a|none|unknown)\b|\b(the ?app|engine|serve.?coach|report|copied|as.reported)\b/i

/**
 * A note that is one short chunk typed over and over.
 *
 * The `\b` in HOLLOW_SOURCE's first group cannot match where the character
 * before it is not a word character and the string ends there, so its `\?+` and
 * `-+` branches never fired for the exact strings they named, and `none` typed
 * three times ran straight past its own `none` branch. Matching the shape
 * instead of the vocabulary catches all of them and does not have to guess which
 * key the labeller held down: `"????????"`, `"xxxxxxxx"`, `"~~~~~~~~"` and
 * `"nonenonenone"` are one chunk repeated, and no sentence describing a
 * measurement is.
 */
const REPEATED_FILLER = /^(.{1,8}?)\1+$/

/**
 * How much of a clip's own timeline a keyframe label may sit outside.
 *
 * Not zero, because the sampled frames are a decimated view of the video: a
 * human scrubbing the original can legitimately pick a contact instant that
 * falls a sample either side of the first or last frame the pipeline kept. One
 * sampling interval is that slack. Beyond it the label belongs to a different
 * clip — the commonest way a fixture goes wrong is a file renamed and relabelled
 * from the wrong take, and a contact time four seconds past the end of a
 * two-second clip is that mistake announcing itself.
 */
const KEYFRAME_SLACK_FRAMES = 1

/**
 * How far past `DEFAULT_TOLERANCE` a fixture may widen its own allowance.
 *
 * The cheapest fixture that cannot fail is not an empty `expect` — it is a full
 * one with `tolerance: { degrees: 1e6, ratio: 1e6, ... }` under it. There is no
 * sidecar to delete and no provenance sentence to invent; it is one extra JSON
 * key, and every check still runs, still prints, and still passes. Measured
 * before this bound existed: keyframes at 0.0001 s, `contactHeight: 99` against
 * an engine reading of 1.4, four comparisons made, zero issues, `passed: true`,
 * and `source: 'recorded'` so it counted towards MINIMUM_RECORDED.
 *
 * Three, from `DEFAULT_TOLERANCE`'s own derivation: those defaults are about a
 * quarter of the band each measurement is scored against. At 4× a fixture may be
 * a whole band wrong — the engine hands the player different advice and the tick
 * stays green — so the ceiling has to sit strictly under four. Three leaves a
 * labeller room to argue that footage was hard to scrub while keeping the
 * disagreement inside the band, which is the standard the defaults were sized
 * to. README.md states the rule in words: do not widen `tolerance` to make it
 * green. This is that sentence made enforceable.
 */
const MAX_TOLERANCE_MULTIPLE = 3

/**
 * What is wrong with a fixture's description, or nothing.
 *
 * Split out of `validateFixtureSchema` and exported so the export tool can
 * refuse a placeholder at the moment somebody is typing it, rather than three
 * steps later. The old sequence was: export a draft labelled "TODO: describe
 * this clip", label everything else, add it to RECORDED, run the suite, and only
 * then read that the description was never written. By then the suite is red and
 * reads like a code failure.
 *
 * One function rather than the same regex in both places. An export tool with
 * its own opinion of what counts as described is a second gate that drifts from
 * the first, and the drift is silent in the direction that matters: the export
 * accepting something the suite will reject.
 *
 * Deliberately not a quality bar. It catches nothing and the placeholder, and
 * says nothing about whether "adult male, side-on" is a better description than
 * "me". A bar on length or vocabulary here would be a number nobody derived
 * from anything, applied to prose, which is how a check ends up rejecting
 * honest labels for their wording.
 */
export function labelProblem(label: string): string | undefined {
  const s = label.trim()
  if (!s) return 'missing — say who, which camera angle, which frame rate, which phone'
  // The export writes "TODO: describe this clip". A fixture nobody described is
  // a fixture nobody can tell the coverage gap from, and coverage across hands,
  // frame rates and angles is the entire point of MINIMUM_RECORDED.
  if (/\bTODO\b/i.test(s)) return 'still the exported placeholder — describe the clip'
  return undefined
}

/**
 * Read a fixture file the way the suite has to: assuming nothing.
 *
 * Every rule here is a specific way the fixture pipeline has produced, or would
 * produce, a green tick that means nothing. Takes `unknown` because a fixture
 * arrives as parsed JSON, where the `Fixture` type is a claim rather than a
 * fact.
 *
 * Returns every issue rather than the first, for the same reason
 * `validateFixture` does: a labeller fixing one problem at a time and re-running
 * is a labeller who stops labelling.
 */
export function validateFixtureSchema(input: unknown): FixtureSchemaIssue[] {
  const issues: FixtureSchemaIssue[] = []
  const bad = (where: string, problem: string, fatal = false) =>
    issues.push({ where, problem, fatal })

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return [{ where: '', problem: 'not a JSON object', fatal: true }]
  }
  const f = input as Record<string, unknown>

  /* -- identity ---------------------------------------------------------- */

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  if (!str(f.id)) bad('id', 'missing — needed to name the check in the suite output', true)
  const labelFault = labelProblem(str(f.label))
  // Fatal only when there is no label at all. A placeholder is a labelling
  // fault: the file would run, and running it would produce a tick nobody can
  // attribute to a clip.
  if (labelFault) bad('label', labelFault, !str(f.label))
  if (f.source !== 'recorded' && f.source !== 'synthetic') {
    bad('source', `must be "recorded" or "synthetic", got ${JSON.stringify(f.source)}`, true)
  }

  /* -- frames ------------------------------------------------------------ */

  if (typeof f.fps !== 'number' || !Number.isFinite(f.fps) || f.fps <= 0) {
    bad('fps', 'must be a positive number — every keyframe tolerance is in seconds', true)
  }

  const packed = f.frames as Partial<PackedFrames> | undefined
  if (typeof packed !== 'object' || packed === null) {
    bad('frames', 'missing — a fixture without pose output has nothing to replay', true)
  } else {
    const count = packed.count
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      bad('frames.count', 'must be a positive whole number of frames', true)
    } else {
      // Length mismatches are the failure mode of a hand-edited fixture: a
      // frame deleted from `t` but not from `image` shifts every landmark by
      // one slot from that point on, and `unpackFrames` reads it back without
      // complaint as a serve where the arm is in the wrong place. It would run,
      // and it would be wrong in a way no assertion here could attribute.
      const lane = (name: 'image' | 'world') => {
        const arr = packed[name]
        if (!Array.isArray(arr)) return bad(`frames.${name}`, 'missing landmark array', true)
        const want = count * 33 * 4
        if (arr.length !== want) {
          bad(`frames.${name}`, `expected ${want} numbers (${count} × 33 × 4), got ${arr.length}`, true)
        } else if (arr.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
          bad(`frames.${name}`, 'contains a non-finite value — NaN propagates through every metric', true)
        }
      }
      if (!Array.isArray(packed.t) || packed.t.length !== count) {
        bad('frames.t', `expected ${count} sample times, got ${(packed.t as unknown[])?.length}`, true)
      } else if (packed.t.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
        bad('frames.t', 'contains a non-finite sample time', true)
      }
      lane('image')
      lane('world')
    }
  }

  /* -- the ball, when there is one ---------------------------------------- */

  if (f.ball !== undefined) {
    const b = f.ball as Partial<BallFlight> | null
    const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
    const point = (p: unknown) =>
      typeof p === 'object' && p !== null && ['t', 'x', 'y'].every((k) => finite((p as Record<string, unknown>)[k]))
    if (
      typeof b !== 'object' ||
      b === null ||
      !Array.isArray(b.coefficients) ||
      b.coefficients.length !== 3 ||
      !b.coefficients.every(finite) ||
      !point(b.apex) ||
      !Array.isArray(b.samples) ||
      !b.samples.every(point) ||
      !finite(b.confidence)
    ) {
      bad('ball', 'not a ball flight — coefficients, apex, samples and confidence, as the report stores it', true)
    }
  }

  /* -- the fixture's own allowance --------------------------------------- */

  // A fixture may widen its tolerance; it may not widen it until the comparison
  // stops being one. See MAX_TOLERANCE_MULTIPLE for what a wide-open allowance
  // buys somebody padding the recorded count.
  if (f.tolerance !== undefined) {
    if (typeof f.tolerance !== 'object' || f.tolerance === null || Array.isArray(f.tolerance)) {
      bad('tolerance', 'must be an object of per-unit allowances, or absent')
    } else {
      for (const [key, value] of Object.entries(f.tolerance as Record<string, unknown>)) {
        if (!(key in DEFAULT_TOLERANCE)) {
          // A misspelt key is silently ignored by the spread in
          // `validateFixture`, so the labeller believes they widened something
          // and the default is what actually applied.
          bad(
            `tolerance.${key}`,
            `not a tolerance — expected one of ${Object.keys(DEFAULT_TOLERANCE).join(', ')}`,
          )
          continue
        }
        const base = DEFAULT_TOLERANCE[key as keyof Tolerance]
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          bad(`tolerance.${key}`, `must be a positive number, got ${JSON.stringify(value)}`)
          continue
        }
        if (value > base * MAX_TOLERANCE_MULTIPLE) {
          bad(
            `tolerance.${key}`,
            `${value} is ${(value / base).toFixed(1)}× the default ${base} — past ` +
              `${MAX_TOLERANCE_MULTIPLE}× the check can’t fail on anything that would change ` +
              `the player's advice. If the engine disagrees, that is the finding (fixtures/README.md)`,
          )
        }
      }
    }
  }

  /* -- the unlabelled-dump gate ------------------------------------------ */

  // Never weaken this. The export writes `_UNVERIFIED: true` onto a file whose
  // `expect` is the engine's own current answer. Such a file runs green forever
  // and proves only that the code is deterministic.
  if ('_UNVERIFIED' in f) {
    bad(
      '_UNVERIFIED',
      'this is an unlabelled export, not ground truth — label it and remove the flag (fixtures/README.md)',
    )
  }

  // Every other underscore key is a sidecar the export attached so the labeller
  // could see what the engine said. Once labelling is done they have to go, and
  // that deletion is the moment the labeller has to look at the engine's answer
  // and their own and decide they differ. Leaving them is how a draft drifts
  // into the RECORDED list looking finished.
  const sidecars = Object.keys(f).filter((k) => k.startsWith('_') && k !== '_UNVERIFIED')
  for (const key of sidecars) {
    bad(key, "the engine's own answers, kept for reference while labelling — delete before committing")
  }

  /* -- expectations ------------------------------------------------------ */

  const expect = f.expect as FixtureExpectation | undefined
  if (typeof expect !== 'object' || expect === null) {
    bad('expect', 'missing — a fixture with nothing expected of it asserts nothing', true)
    return issues
  }

  const keyframes = (expect.keyframes ?? {}) as Record<string, unknown>
  const metrics = (expect.metrics ?? {}) as Record<string, unknown>
  const sources = (expect.metricSource ?? {}) as Record<string, unknown>

  if (expect.rejected === true) {
    // A clip is either a serve the engine must read correctly or one it must
    // refuse. Both at once means one half is never checked, and which half is
    // decided by an early `return` in validateFixture rather than by anyone.
    if (Object.keys(keyframes).length || Object.keys(metrics).length) {
      bad('expect', 'rejected clips can’t also carry keyframes or metrics — pick one')
    }
  } else if (
    !Object.keys(keyframes).length &&
    !Object.keys(metrics).length &&
    expect.handedness === undefined
  ) {
    // The commonest way to pad a fixture count: a real clip, real pose output,
    // and an `expect` block with everything deleted. It passes instantly and
    // moves the RECORDED tally one closer to the minimum while checking nothing.
    //
    // `handedness` is in the condition because `validateFixture` compares it —
    // an `expect` of `{handedness: 'left'}` alone produces a real failing check
    // against a right-handed read. Without it here the fault said "this fixture
    // cannot fail" about a fixture that was at that moment failing. `view` is
    // not in the condition: nothing compares it, it only selects which metrics
    // the pipeline is asked for, so a `view`-only expectation genuinely cannot
    // fail.
    bad('expect', 'no keyframes, no metrics, no handedness and not rejected — this fixture can’t fail')
  }

  if (expect.handedness !== undefined && expect.handedness !== 'left' && expect.handedness !== 'right') {
    bad('expect.handedness', `must be "left" or "right", got ${JSON.stringify(expect.handedness)}`)
  }
  if (expect.view !== undefined && !VIEWS.includes(expect.view)) {
    bad('expect.view', `must be one of ${VIEWS.join(', ')}, got ${JSON.stringify(expect.view)}`)
  }

  const times = Array.isArray(packed?.t) ? (packed.t as number[]).filter(Number.isFinite) : []
  const fps = typeof f.fps === 'number' && f.fps > 0 ? f.fps : 0
  const slack = fps ? KEYFRAME_SLACK_FRAMES / fps : 0
  const first = times.length ? Math.min(...times) - slack : undefined
  const last = times.length ? Math.max(...times) + slack : undefined

  for (const [phase, t] of Object.entries(keyframes)) {
    if (!(PHASE_IDS as readonly string[]).includes(phase)) {
      bad(`expect.keyframes.${phase}`, `not a phase — expected one of ${PHASE_IDS.join(', ')}`)
      continue
    }
    if (typeof t !== 'number' || !Number.isFinite(t)) {
      bad(`expect.keyframes.${phase}`, 'must be a time in seconds')
      continue
    }
    if (first !== undefined && last !== undefined && (t < first || t > last)) {
      bad(
        `expect.keyframes.${phase}`,
        `${t}s is outside the clip (${first.toFixed(2)}–${last.toFixed(2)}s) — labelled from the wrong take?`,
      )
    }
  }

  for (const [id, value] of Object.entries(metrics)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      bad(`expect.metrics.${id}`, 'must be a number')
      continue
    }
    const source = typeof sources[id] === 'string' ? (sources[id] as string).trim() : ''
    if (!source) {
      bad(
        `expect.metricSource.${id}`,
        'missing — say how this was measured outside the app, or delete the metric',
      )
    } else if (
      source.length < MIN_SOURCE_CHARS ||
      (source.match(/\p{L}/gu)?.length ?? 0) < MIN_SOURCE_LETTERS ||
      REPEATED_FILLER.test(source) ||
      HOLLOW_SOURCE.test(source)
    ) {
      bad(
        `expect.metricSource.${id}`,
        `"${source}" doesn’t describe a measurement taken outside the app`,
      )
    }
  }

  for (const id of Object.keys(sources)) {
    if (!(id in metrics)) {
      // Harmless on its own, but it is the residue of a deleted metric, and the
      // next person to add a metric with that id inherits somebody else's
      // provenance note without noticing.
      bad(`expect.metricSource.${id}`, 'describes a metric that isn’t expected — stale, delete it')
    }
  }

  /* -- values copied out of the engine ----------------------------------- */

  /**
   * Exact equality against a sidecar is proof, not suspicion.
   *
   * The sidecars hold what the engine said at export time. A hand measurement —
   * a protractor, a wall mark, a frame count — landing on the engine's own
   * value to every decimal place it printed does not happen; a copy does. This
   * only works while the sidecar is present, which is why leaving one is
   * flagged rather than silently tolerated: deleting it to escape this check is
   * a deliberate act, not an oversight.
   */
  for (const key of sidecars) {
    const side = f[key]
    if (typeof side !== 'object' || side === null) continue
    for (const [id, engineValue] of Object.entries(side as Record<string, unknown>)) {
      if (typeof engineValue !== 'number') continue
      if (metrics[id] === engineValue) {
        bad(`expect.metrics.${id}`, `identical to ${key}.${id} — this is the engine's own output`)
      }
      if (keyframes[id] === engineValue) {
        bad(`expect.keyframes.${id}`, `identical to ${key}.${id} — this is the engine's own output`)
      }
    }
  }

  return issues
}

export interface FixtureIssue {
  what: string
  expected: number | string
  actual: number | string
  /** How far out, in the metric's own unit. Absent for non-numeric mismatches. */
  error?: number
}

/**
 * One comparison the validator made, whether or not it agreed.
 *
 * `issues` only holds disagreements, which is right for a test runner and wrong
 * for the person labelling the clip: they need to see that contact landed 12 ms
 * out against a 50 ms allowance just as much as they need to see the one that
 * missed, because a fixture sitting at 90% of every tolerance is a fixture about
 * to go red on a change that broke nothing. `scripts/replay-fixture.mjs` prints
 * these; the suite ignores them.
 */
export interface FixtureCheck {
  what: string
  expected: number | string
  actual: number | string
  /** Signed, in the metric's own unit. Absent for non-numeric comparisons. */
  error?: number
  /** What was allowed, same unit. Absent where the comparison is exact. */
  tolerance?: number
  ok: boolean
}

export interface FixtureResult {
  id: string
  label: string
  source: Fixture['source']
  passed: boolean
  issues: FixtureIssue[]
  /** Every comparison attempted, passing ones included. For the replay tool. */
  checks: FixtureCheck[]
  /** Schema faults found before the engine was run. Any of these fails the fixture. */
  schema: FixtureSchemaIssue[]
  /** Signed error per labelled keyframe, in seconds. Useful even when passing. */
  keyframeError: Partial<Record<PhaseId, number>>
  metricError: Record<string, number>
  /**
   * Why the fixture could not be run at all, if it could not.
   *
   * Two different things end up here and a caller printing it under an "engine"
   * heading will mislabel one of them. If `schema` holds a `fatal` entry, the
   * file was never fed to the pipeline and this string is that file's problem;
   * otherwise `detectServe` threw on the clip and this is the engine's own
   * message. Discriminate with `result.schema.some((s) => s.fatal)` — a bad file
   * reported as an engine failure sends the reader hunting a detector bug that
   * is really a missing comma.
   */
  error?: string
}

/**
 * Run one labelled clip through the pipeline and report every disagreement.
 *
 * Reports all of them rather than throwing on the first, because when a change
 * to the detector moves things, the useful output is the full pattern of what
 * moved and by how much — one assertion failure tells you almost nothing about
 * whether you have broken the trophy or shifted every keyframe by a frame.
 *
 * The schema is checked here rather than only at the call sites, so that a
 * malformed or unlabelled fixture fails wherever it is run. Before this, a
 * fixture with a short frame array unpacked into undefined landmarks, threw
 * inside `detectServe`, and was reported as `error` — indistinguishable from the
 * engine genuinely failing on real footage, which is the one signal this suite
 * exists to produce.
 */
export function validateFixture(fixture: Fixture): FixtureResult {
  const tol = { ...DEFAULT_TOLERANCE, ...fixture.tolerance }
  const result: FixtureResult = {
    id: fixture.id,
    label: fixture.label,
    source: fixture.source,
    passed: true,
    issues: [],
    checks: [],
    schema: [],
    keyframeError: {},
    metricError: {},
  }

  const fail = (issue: FixtureIssue) => {
    result.issues.push(issue)
    result.passed = false
  }

  /** Record a comparison, and fail the fixture if it disagreed. */
  const compare = (check: FixtureCheck) => {
    result.checks.push(check)
    if (!check.ok) fail({ what: check.what, expected: check.expected, actual: check.actual, error: check.error })
  }

  result.schema = validateFixtureSchema(fixture)
  // Mirrored into `issues` as well as `schema`, because every existing caller
  // reports failures by printing `issues`. A fixture that failed only on schema
  // would otherwise fail with an empty explanation, which reads as a flaky
  // suite and gets re-run rather than fixed.
  for (const s of result.schema) {
    fail({ what: `schema ${s.where || 'fixture'}`, expected: 'valid', actual: s.problem })
  }
  // A structurally broken file cannot be unpacked, let alone analysed. Say so
  // and stop, rather than letting `unpackFrames` produce a plausible-looking
  // serve out of holes and reporting twenty comparisons nobody made.
  if (result.schema.some((s) => s.fatal)) {
    result.error = result.schema
      .filter((s) => s.fatal)
      .map((s) => `${s.where}: ${s.problem}`)
      .join('; ')
    return result
  }

  const frames = unpackFrames(fixture.frames)

  // The steps `runAnalysis` takes on landmarks, in its order: a picture on its
  // side is refused before a serve is looked for, and contact is read from the
  // hand and the ball together.
  let skel: ReturnType<typeof detectServe>
  let contact: ContactRead
  try {
    const turned = turnedPicture(frames)
    if (turned) throw turned
    ;({ skel, contact } = detectWithContact(frames, fixture.fps, undefined, fixture.ball))
  } catch (err) {
    // A clip labelled as not-a-serve *should* land here.
    if (fixture.expect.rejected) {
      compare({ what: 'clip rejected', expected: 'rejected', actual: 'rejected', ok: true })
      return result
    }
    result.passed = false
    result.error = (err as Error).message
    return result
  }

  if (fixture.expect.rejected) {
    compare({
      what: 'clip should have been rejected',
      expected: 'rejected',
      actual: 'analysed',
      ok: false,
    })
    return result
  }

  if (fixture.expect.handedness) {
    compare({
      what: 'handedness',
      expected: fixture.expect.handedness,
      actual: skel.racket,
      ok: skel.racket === fixture.expect.handedness,
    })
  }

  for (const [phase, labelled] of Object.entries(fixture.expect.keyframes ?? {})) {
    if (typeof labelled !== 'number') continue
    const idx = skel.keys[phase as keyof typeof skel.keys]
    const detected = frames[idx]?.t
    if (detected === undefined) continue
    const error = detected - labelled
    result.keyframeError[phase as PhaseId] = Number(error.toFixed(4))
    const allowed = phase === 'contact' ? tol.contactSeconds : tol.keyframeSeconds
    compare({
      what: `keyframe ${phase}`,
      expected: labelled,
      actual: detected,
      error,
      tolerance: allowed,
      ok: Math.abs(error) <= allowed,
    })
  }

  const expectedMetrics = fixture.expect.metrics
  if (expectedMetrics && Object.keys(expectedMetrics).length > 0) {
    // The view drives which metrics exist at all, so derive it the same way the
    // pipeline does rather than trusting the label.
    const sideView = fixture.expect.view
      ? fixture.expect.view === 'side'
      : viewFromCourtYaw(assessSpatial(frames, skel.keys.ready, skel.bodyHeight, skel).court_yaw_deg) === 'side'
    const produced = measure(frames, skel, sideView, { ball: fixture.ball, contact }).flatMap((f) => f.metrics)

    for (const [id, expected] of Object.entries(expectedMetrics)) {
      const m = produced.find((x) => x.id === id)
      if (!m) {
        // Not a near-miss: the pipeline dropped this measurement entirely, which
        // is what it does when the view or the tracking cannot support it. The
        // house rule is that an unmeasurable value is dropped, never defaulted,
        // so there is no number to diff against — say so rather than print a
        // zero somebody will read as an answer.
        compare({ what: `metric ${id}`, expected, actual: 'not produced', ok: false })
        continue
      }
      const error = m.value - expected
      result.metricError[id] = Number(error.toFixed(4))
      const allowed = tol[UNIT_KEY[m.unit] ?? 'ratio']
      compare({
        what: `metric ${id}`,
        expected,
        actual: Number(m.value.toFixed(3)),
        error,
        tolerance: allowed,
        ok: Math.abs(error) <= allowed,
      })
    }
  }

  return result
}
