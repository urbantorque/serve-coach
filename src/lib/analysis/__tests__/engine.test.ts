/**
 * Engine checks. Run with `npm test` — see scripts/run-tests.mjs, which bundles
 * this with esbuild and executes it in Node. No test framework, no browser.
 *
 * These assert behaviour a coach would recognise: the keyframes land in the
 * right order at the right moments, and a serve with a dialled-in fault is
 * reported as having that fault and not some other one.
 */
import { findPracticeFocus, practiceHeadline, repeatabilityNote } from '../../practice'
import { buildProgress, deltaStatus, deltasAgainst } from '../../progress'
import { REAL_CHANGE } from '../realChange'
import { normalise } from '../../storage/db'
import { sessionKeyFor } from '../../storage/sessionKey'
import {
  MAX_CONSISTENCY_SERVES,
  assessQuality,
  blockingFramingIssue,
  megabytes,
  pickFocus,
  sweepServes,
  sweepWindow,
  withoutComparison,
  type SweepRun,
  type SweepServe,
} from '../analyze'
import { METRICS, metricCopy } from '../coaching'
import { sampleAnalysis } from '../../../dev/sampleAnalysis'
import { progressionFor, rungFor } from '../progressions'
import {
  IMPLAUSIBLE_HEIGHT_SPREAD,
  MIN_COMPARABLE_SERVES,
  buildConsistency,
  pairStills,
  splitByServeNumber,
} from '../consistency'
import { Cancelled } from '../../pose/extract'
import { CHAIN_RATIO_DEVIATION, CHAIN_RATIO_PER_SECOND, diagnose } from '../diagnose'
import { LM, MIN_OPENING_SWEEP_DEG, scoreAgainst, statusOf, trunkCoil } from '../geometry'
import { measure } from '../metrics'
import { detectServe, looksSlowedDown, refineExtremum, type Skeleton } from '../phases'
import { findServes } from '../serves'
import type { BallFlight } from '../../vision/ballTrack'
import type { ServeType } from '../../storage/prefs'
import {
  NotAServeError,
  type Analysis,
  type Frame,
  type Fundamental,
  type Metric,
  type Status,
} from '../types'
import { assessSpatial, viewFromCourtYaw } from '../spatial'
import { CLEAN_SERVE, U, buildServe, type ServeDials } from '../syntheticServe'
import { cueIssues } from '../voice'
import { assert, check, near, note, report, within } from './harness'

/**
 * The view the app files a clip under, read the way `assessQuality` reads it:
 * against the court, from the camera's angle to the shoulders at the ready.
 * Several checks here used their own rule — shoulders under a tenth of
 * standing height apart — which called shoulders pointing at the lens side-on;
 * a real server has their back to the guide's camera, so that rule stopped
 * meaning side-on when the rig stood like one.
 */
const sideViewOf = (frames: Frame[], skel: { keys: { ready: number }; bodyHeight: number }) =>
  viewFromCourtYaw(assessSpatial(frames, skel.keys.ready, skel.bodyHeight).court_yaw_deg) === 'side'


/** Declared up here because checks run top to bottom as the module executes. */
const DAY = 86_400_000

const FPS = 50

/**
 * A camera angle the spatial pass calls readable in depth.
 *
 * The rig's default is 82°, which is dead side-on to the court and outside
 * `DEPTH_YAW_RANGE` — a real server has their back to that camera at the ready,
 * so it sees the shoulders square and the trunk turns towards and away from it:
 * a fine place to measure heights and angles from, and the one place the app
 * refuses to state a coil *direction* from. Named so the checks that need a
 * corner say why they moved.
 */
const CORNER = 45

function run(dials: Partial<ServeDials> = {}) {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  const sideView = sideViewOf(frames, skel)
  const fundamentals = measure(frames, skel, sideView)
  return { frames, skel, fundamentals, sideView }
}

const metric = (fundamentals: Fundamental[], id: string): Metric => {
  const m = fundamentals.flatMap((f) => f.metrics).find((x) => x.id === id)
  if (!m) throw new Error(`metric "${id}" was not produced`)
  return m
}
/** A value off the card, graded or not: a row since D2.1 can be a reading. */
const measured = (fundamentals: Fundamental[], id: string): { value: number; confidence: number } => {
  const m = fundamentals.flatMap((f) => [...f.metrics, ...(f.readings ?? [])]).find((x) => x.id === id)
  if (!m) throw new Error(`"${id}" was not measured`)
  return m
}
const area = (fundamentals: Fundamental[], id: string): Fundamental => {
  const f = fundamentals.find((x) => x.id === id)
  if (!f) throw new Error(`fundamental "${id}" missing`)
  return f
}

/** Left/right landmark pairs, for turning a right-handed serve into a lefty. */
const PAIRS: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
]

/** Mirror a serve about the vertical axis: same motion, opposite hand. */
function mirror(frames: ReturnType<typeof buildServe>) {
  return frames.map((f) => {
    const flip = (src: typeof f.image, centre: number) => {
      const out = src.map((l) => ({ ...l, x: 2 * centre - l.x }))
      for (const [a, b] of PAIRS) {
        const tmp = out[a]
        out[a] = out[b]
        out[b] = tmp
      }
      return out
    }
    return { ...f, image: flip(f.image, 0.5), world: flip(f.world, 0) }
  })
}

/** Where a keyframe landed, in normalised motion time. */
function atU(frames: ReturnType<typeof buildServe>, idx: number, dials: ServeDials) {
  const preroll = 0.35
  return (frames[idx].t - preroll) / dials.motionSeconds
}

/* ------------------------------------------------------------ phase detection */

console.log('\n\x1b[1mPhase detection\x1b[0m')

check('finds the six keyframes in order', () => {
  const { skel } = run()
  const k = skel.keys
  assert(
    k.ready <= k.toss && k.toss <= k.trophy && k.trophy <= k.drop && k.drop <= k.contact && k.contact <= k.finish,
    `out of order: ${JSON.stringify(k)}`,
  )
  assert(k.ready < k.contact, 'ready and contact collapsed onto the same frame')
})

check('keyframes land where the rig put them', () => {
  const { frames, skel } = run()
  near(atU(frames, skel.keys.toss, CLEAN_SERVE), U.toss, 0.09, 'toss')
  near(atU(frames, skel.keys.trophy, CLEAN_SERVE), U.trophy, 0.09, 'trophy')
  near(atU(frames, skel.keys.drop, CLEAN_SERVE), U.drop, 0.09, 'racket drop')
  near(atU(frames, skel.keys.contact, CLEAN_SERVE), U.contact, 0.06, 'contact')
})

check('identifies a right-hander', () => {
  const { skel } = run()
  assert(skel.racket === 'right', `got ${skel.racket}`)
  assert(skel.handednessConfidence > 0.5, `low confidence: ${skel.handednessConfidence.toFixed(2)}`)
})

check('identifies a left-hander, and measures them the same', () => {
  const right = run()
  const frames = mirror(buildServe({}, FPS))
  const skel = detectServe(frames, FPS)
  assert(skel.racket === 'left', `mirrored serve read as ${skel.racket}-handed`)

  const left = measure(frames, skel, sideViewOf(frames, skel))
  // The two trunk measurements are in this list because they are signed, and a
  // sign about a vertical axis is exactly the thing that reverses when a serve
  // is mirrored. Measured without orienting them by the racket hand, every
  // left-hander's correct coil and correct cartwheel would come back as the
  // fault they are the opposite of.
  for (const id of [
    'contactHeight',
    'kneeBend',
    'dropDepth',
    'armExtension',
    'tossArmExtension',
    'shoulderTilt',
    'hipShoulderSeparation',
  ]) {
    const expected = measured(right.fundamentals, id).value
    near(
      measured(left, id).value,
      expected,
      Math.max(0.04, Math.abs(expected) * 0.08),
      `${id} for a left-hander`,
    )
  }
})

check('recovers standing height to within a few percent', () => {
  const { skel } = run()
  near(skel.bodyHeight, 0.54, 0.035, 'body height in image units')
})

check('the whole serve stays inside the frame', () => {
  // Anything that maps landmarks onto pixels assumes this, so the rig has to
  // produce a clip that could actually have been filmed.
  for (const dials of [{}, { contactReach: 1.65 }, { contactHipHeight: 1.2 }] as Partial<ServeDials>[]) {
    for (const f of buildServe(dials, FPS)) {
      for (const l of f.image) {
        within(l.x, 0, 1, 'landmark x')
        within(l.y, 0, 1, 'landmark y')
      }
    }
  }
})

check('classifies a side-on camera as side-on', () => {
  const { sideView } = run()
  assert(sideView, 'side-on serve was not classified as a side view')
})

check('rejects a clip with no serve in it', () => {
  // A player standing about with the racket down — no service motion at all.
  let threw = false
  try {
    detectServe(buildServe({ noSwing: true }, FPS), FPS)
  } catch (err) {
    threw = err instanceof NotAServeError
  }
  assert(threw, 'a motionless clip was accepted as a serve')
})

check('rejects a clip too short to read', () => {
  let threw = false
  try {
    detectServe(buildServe({}, FPS).slice(0, 5), FPS)
  } catch (err) {
    threw = err instanceof NotAServeError
  }
  assert(threw, 'a 5-frame clip was accepted')
})

/**
 * A clean right-handed clip with the tossing (left) wrist's own motion flattened
 * to a small sway, so the racket arm's real swing survives untouched on the other
 * landmark. Forcing `forceRacket` to the now-flattened side reproduces exactly
 * what a wrong stated hand — or a mirrored front-camera clip — looks like from
 * `detectServe`'s side: the labelled "racket" arm never clears the swing floor,
 * and the unlabelled one plainly did.
 */
function wrongHandedClip(): Frame[] {
  const base = buildServe({}, FPS)
  return base.map((f) => {
    const image = f.image.slice()
    image[LM.leftWrist] = { ...image[LM.leftWrist], y: 0.6 + Math.sin(f.t * 3) * 0.02 }
    return { ...f, image }
  })
}

check('rejects a clip stated as the wrong hand, and names the right one', () => {
  let err: unknown
  try {
    detectServe(wrongHandedClip(), FPS, 'left')
  } catch (e) {
    err = e
  }
  assert(err instanceof NotAServeError, 'a wrong-handed clip did not throw NotAServeError')
  if (err instanceof NotAServeError) {
    assert(err.suggestedHand === 'right', `suggested ${err.suggestedHand}, not the hand that actually swung`)
  }
})

/**
 * Both wrists frozen at a constant image position — no sway, no swing, nothing
 * for `argMaxIn`/`argMinIn` to find a peak in. `noSwing` above still has enough
 * wobble for a keyframe search to land somewhere, so it fails on amplitude
 * (`swing < 0.5`) rather than collapsing every keyframe onto `ready`. This is the
 * one degenerate case beyond even that: `orderKeys` clamps every later keyframe
 * to at least the one before it, so with nothing to distinguish, contact === ready.
 */
function frozenClip(n = 15): Frame[] {
  const base = buildServe({ noSwing: true }, FPS).slice(0, n)
  return base.map((f, i) => {
    const image = f.image.slice()
    image[LM.leftWrist] = { ...image[LM.leftWrist], y: 0.6, x: -0.18 }
    image[LM.rightWrist] = { ...image[LM.rightWrist], y: 0.6, x: 0.2 }
    return { ...f, index: i, t: i / FPS, image }
  })
}

check('rejects a clip with nothing in it to find a moment in', () => {
  let threw = false
  try {
    detectServe(frozenClip(), FPS)
  } catch (err) {
    threw = err instanceof NotAServeError
  }
  assert(threw, 'a perfectly flat clip was accepted')
})

/** The rig's clean serve, cut off at `u` of its motion. */
function stoppedBefore(u: number): Frame[] {
  const end = 0.35 + u * CLEAN_SERVE.motionSeconds
  return buildServe({}, FPS).filter((f) => f.t <= end)
}

check('a clip that stops before contact is told so, not that it is left-handed', () => {
  // The path a real one takes in `runAnalysis`: the first read offers the other
  // hand, because the only arm overhead is the tossing one; the second read is
  // against that hand. That used to come back as a serve with every keyframe on
  // one sample, which triage then refused as too few frames. Two unfinished
  // serves in the Bath motion capture did exactly this (ANALYSIS-REVIEW.md §9).
  // Cut soon after the toss, while the racket arm is still low — the shape the
  // Bath clips stop in. A clip cut just after contact is measured, with only its
  // landing refused; `depth.test.ts` holds that side.
  for (const u of [0.5, 0.55]) {
    const frames = stoppedBefore(u)
    let message = ''
    try {
      try {
        detectServe(frames, FPS)
      } catch (err) {
        if (err instanceof NotAServeError && err.suggestedHand) detectServe(frames, FPS, err.suggestedHand)
        else throw err
      }
    } catch (err) {
      if (err instanceof NotAServeError) message = err.message
    }
    assert(
      message === 'The clip ends before the racket reaches the ball.',
      `cut at ${u}: ${message || 'read as a serve'}`,
    )
  }
})

/**
 * `NotAServeError`'s message and hints are thrown inline rather than read out of
 * a table, so `copy.test.ts`'s `everyCue()` sweep never sees them — a whole
 * category of player-facing copy, shown at the exact moment someone's first clip
 * fails, that nothing had ever run past the same editor the coaching database is
 * held to. `blockingFramingIssue`'s three branches are cheap to call directly;
 * every `detectServe` refusal is exercised by the four checks above.
 */
check('every clip-refusal message and hint passes the house-voice editor', () => {
  const cases: [string, NotAServeError][] = [
    ['no player visible', blockingFramingIssue(['nobody-visible'])!],
    ['body does not fit', blockingFramingIssue(['feet-cropped', 'head-cropped'])!],
    ['hands unseen, not far', blockingFramingIssue(['hands-unseen'])!],
    ['hands unseen, too far', blockingFramingIssue(['hands-unseen', 'too-far-away'])!],
  ]
  for (const [label, err] of cases) {
    assert(err !== undefined, `${label}: blockingFramingIssue returned nothing`)
    for (const line of [err.message, ...err.hints]) {
      const issues = cueIssues(line)
      assert(issues.length === 0, `${label} failed the editor: ${issues.join('; ')}\n        "${line}"`)
    }
  }

  const thrown: [string, () => void][] = [
    ['no swing', () => detectServe(buildServe({ noSwing: true }, FPS), FPS)],
    ['too short', () => detectServe(buildServe({}, FPS).slice(0, 5), FPS)],
    ['wrong hand', () => detectServe(wrongHandedClip(), FPS, 'left')],
    ['frozen', () => detectServe(frozenClip(), FPS)],
    ['stopped before contact', () => detectServe(stoppedBefore(0.5), FPS, 'left')],
  ]
  for (const [label, run] of thrown) {
    try {
      run()
      assert(false, `${label}: expected a NotAServeError`)
    } catch (err) {
      assert(err instanceof NotAServeError, `${label}: threw something other than NotAServeError`)
      if (err instanceof NotAServeError) {
        for (const line of [err.message, ...err.hints]) {
          const issues = cueIssues(line)
          assert(issues.length === 0, `${label} failed the editor: ${issues.join('; ')}\n        "${line}"`)
        }
      }
    }
  }
})

/* ------------------------------------------------------ serves in one clip */

console.log('\n\x1b[1mFinding serves in a clip\x1b[0m')

/** A hand-height trace: a peak at each serve time, resting low between them. */
function reachTrace(peaks: { t: number; height: number }[], duration = 12, fps = 12) {
  const out = []
  for (let i = 0; i < duration * fps; i++) {
    const t = i / fps
    let height = 0.1
    for (const p of peaks) {
      const d = Math.abs(t - p.t)
      if (d < 0.5) height = Math.max(height, p.height * (1 - d / 0.5))
    }
    out.push({ t, height })
  }
  return out
}

check('finds one serve in a single-serve clip', () => {
  const found = findServes(reachTrace([{ t: 4, height: 0.9 }]))
  assert(found.length === 1, `expected 1 serve, got ${found.length}`)
  near(found[0], 4, 0.15, 'serve time')
})

check('finds every serve when a basket is filmed', () => {
  const found = findServes(
    reachTrace([
      { t: 2, height: 0.9 },
      { t: 5.5, height: 0.88 },
      { t: 9, height: 0.92 },
    ]),
  )
  assert(found.length === 3, `expected 3 serves, got ${found.length}: ${found.map(n => n.toFixed(1))}`)
  const expected = [2, 5.5, 9]
  found.forEach((t, i) => near(t, expected[i], 0.2, `serve ${i + 1}`))
})

check('returns serves in the order they were hit', () => {
  const found = findServes(
    reachTrace([
      { t: 8, height: 0.95 },
      { t: 2, height: 0.85 },
      { t: 5, height: 0.9 },
    ]),
  )
  assert(
    found.every((t, i) => i === 0 || t > found[i - 1]),
    `not chronological: ${found.map((n) => n.toFixed(1))}`,
  )
})

check('does not split one serve into several', () => {
  // A single peak sampled many times must not yield a serve per sample.
  const found = findServes(reachTrace([{ t: 6, height: 0.9 }], 12, 50))
  assert(found.length === 1, `one serve split into ${found.length}`)
})

check('ignores a practice swing that never reaches full height', () => {
  const found = findServes(
    reachTrace([
      { t: 3, height: 0.9 },
      { t: 6, height: 0.55 }, // half-hearted swing, hand nowhere near the top
      { t: 9, height: 0.88 },
    ]),
  )
  assert(found.length === 2, `expected 2 real serves, got ${found.length}`)
  near(found[0], 3, 0.2, 'first serve')
  near(found[1], 9, 0.2, 'second serve')
})

check('the same basket is read the same at any size in the frame', () => {
  // The tolerance is a share of the player's own reach (D1.6). It was 0.12 of
  // the frame, which at a third of this size is wider than the gap between a
  // serve and the practice swing, so a far player's half swing was a serve.
  const basket = [
    { t: 3, height: 0.9 },
    { t: 6, height: 0.55 },
    { t: 9, height: 0.86 },
  ]
  for (const size of [1, 0.6, 0.3]) {
    const found = findServes(reachTrace(basket).map((s) => ({ t: s.t, height: s.height * size })))
    assert(found.length === 2, `at ${size} of the frame: ${found.length} serves, ${found.map((n) => n.toFixed(1)).join(', ')}`)
  }
})

check('copes with an empty trace', () => {
  assert(findServes([]).length === 0, 'empty trace produced serves')
})

/* --------------------------------------------------------------- measurement */

console.log('\n\x1b[1mMeasurement accuracy\x1b[0m')

check('reads back the dialled knee bend', () => {
  const { fundamentals } = run({ trophyKneeAngle: 133 })
  near(metric(fundamentals, 'kneeBend').value, 47, 7, 'knee bend')
})

check('reads back the dialled shoulder tilt regardless of camera angle', () => {
  for (const cameraYaw of [82, 45, 8]) {
    const { fundamentals } = run({ shoulderTilt: 24, cameraYaw })
    near(metric(fundamentals, 'shoulderTilt').value, 24, 6, `shoulder tilt at camera yaw ${cameraYaw}`)
  }
})

check('reads back hip–shoulder separation', () => {
  const { fundamentals } = run({ shoulderYaw: 82, hipYaw: 56 })
  near(metric(fundamentals, 'hipShoulderSeparation').value, 26, 8, 'separation')
})

check('the trophy posture is not read off a single frame', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const clean = metric(measure(frames, skel, true), 'hipShoulderSeparation').value

  // One frame where the tracker loses the depth of the trunk and puts the two
  // shoulders on the wrong sides of each other in z. This is the failure world z
  // actually has: it is the least reliable thing the pose model outputs, and it
  // is almost the entire content of this measurement.
  const spiked = frames.map((f, i) =>
    i !== skel.keys.trophy
      ? f
      : {
          ...f,
          world: f.world.map((l, k) =>
            k === LM.leftShoulder
              ? { ...l, z: l.z + 0.14 }
              : k === LM.rightShoulder
                ? { ...l, z: l.z - 0.14 }
                : l,
          ),
        },
  )
  // The same skeleton is reused deliberately, so the keyframes cannot move and
  // the only thing under test is how the posture is sampled at them.
  const averaged = metric(measure(spiked, skel, true), 'hipShoulderSeparation').value
  // The same measurement with the trophy window closed to a single frame, which
  // is what this replaced.
  const single = trunkCoil(spiked, skel.keys.trophy, skel.keys.contact, 0)

  note(`one bad frame: ${clean.toFixed(1)}° → ${averaged.toFixed(1)}° averaged, ${single.toFixed(1)}° raw`)
  assert(
    Math.abs(single - clean) > 20,
    `the injected spike was too small to prove anything: it moved a raw read by ${Math.abs(single - clean).toFixed(1)}°`,
  )
  assert(
    Math.abs(averaged - clean) < Math.abs(single - clean) / 3,
    `one bad frame moved the reported coil ${Math.abs(averaged - clean).toFixed(1)}°, against ${Math.abs(single - clean).toFixed(1)}° raw`,
  )
})

check('the report and the diagnosis read the same trophy', () => {
  // Two pipelines measure this posture, and they are the same posture. When one
  // averaged across the trophy and the other read a single frame, the app could
  // hand a player a card praising their coil next to a flaw finding built from a
  // number several degrees away.
  //
  // Filmed from a corner, here and in every check below that asks the diagnosis
  // about coil. The rig's default camera sits dead side-on, which is exactly
  // where `assessSpatial` says the depth this reading is built from cannot be
  // seen — and the flaw pass now honours that verdict rather than stating the
  // number anyway. A check about the *sign* has to stand somewhere both halves
  // of the app will speak.
  const frames = buildServe({ cameraYaw: CORNER }, FPS)
  const skel = detectServe(frames, FPS)
  const reported = metric(measure(frames, skel, true), 'hipShoulderSeparation').value
  const diagnosed = diagnose(frames, skel).signals.separation_deg
  near(diagnosed, reported, 1, 'the two readings of one trophy')
})

/* ------------------------------------------------------ trophy, the wrong way */

console.log('\n\x1b[1mFaults that are the mirror of a virtue\x1b[0m')

check('a reverse cartwheel does not score like a textbook trophy', () => {
  // Tossing shoulder dropped, hitting shoulder riding high. It pulls the racket
  // down across the ball, it is common at club level, and measured as a bare
  // magnitude it is arithmetically indistinguishable from the trophy the report
  // is asking for.
  const good = run({ shoulderTilt: 24 }).fundamentals
  const reversed = run({ shoulderTilt: -24 }).fundamentals
  const tilt = metric(reversed, 'shoulderTilt')

  assert(tilt.value < -15, `a reversed cartwheel measured ${tilt.value.toFixed(1)}°`)
  assert(
    tilt.score <= metric(good, 'shoulderTilt').score - 40,
    `reversed tilt scored ${tilt.score} against ${metric(good, 'shoulderTilt').score} for the correct one`,
  )
  assert(tilt.status === 'work', `a reversed cartwheel was badged ${tilt.status}`)
  assert(Boolean(tilt.fix), 'no fix offered for a reversed cartwheel')
  assert(
    tilt.readout !== metric(good, 'shoulderTilt').readout,
    `both directions read back as "${tilt.readout}"`,
  )
  assert(
    area(reversed, 'loading').score <= area(good, 'loading').score - 20,
    `loading scored ${area(reversed, 'loading').score} against ${area(good, 'loading').score}`,
  )
})

check('a chest already open at the trophy does not score like coil', () => {
  // The shoulders have unwound past the hips before the racket has dropped. The
  // magnitude of that is the magnitude of a good coil, so the player losing the
  // serve to it used to be congratulated for it.
  const good = run({ shoulderYaw: 82, hipYaw: 56 }).fundamentals
  const open = run({ shoulderYaw: 82, hipYaw: 108 }).fundamentals
  const sep = metric(open, 'hipShoulderSeparation')

  assert(sep.value < -15, `an open chest measured ${sep.value.toFixed(1)}°`)
  assert(
    sep.score <= metric(good, 'hipShoulderSeparation').score - 40,
    `an open chest scored ${sep.score} against ${metric(good, 'hipShoulderSeparation').score} for real coil`,
  )
  assert(sep.status === 'work', `an open chest was badged ${sep.status}`)
  assert(
    sep.readout !== metric(good, 'hipShoulderSeparation').readout,
    `both directions read back as "${sep.readout}"`,
  )
  assert(
    area(open, 'loading').score <= area(good, 'loading').score - 20,
    `loading scored ${area(open, 'loading').score} against ${area(good, 'loading').score}`,
  )
})

check('the diagnosis names an open chest that the old sign could not see', () => {
  const frames = buildServe({ shoulderYaw: 82, hipYaw: 108, cameraYaw: CORNER }, FPS)
  const skel = detectServe(frames, FPS)
  const found = diagnose(frames, skel).flaws.find((f) => f.flaw === 'early_shoulder_rotation')
  assert(Boolean(found?.detected), 'an already-open chest raised no early-rotation finding')
})

check('a mirrored trophy is wrong for a left-hander too', () => {
  // The right-handed versions of these are covered above; the point here is that
  // the orientation does not quietly turn the fault back into a virtue when the
  // serve is mirrored.
  const frames = mirror(buildServe({ shoulderTilt: -24, hipYaw: 108 }, FPS))
  const skel = detectServe(frames, FPS)
  assert(skel.racket === 'left', `the mirrored serve read as ${skel.racket}-handed`)
  const f = measure(frames, skel, sideViewOf(frames, skel))
  assert(metric(f, 'shoulderTilt').value < -15, `left-handed reverse tilt measured ${metric(f, 'shoulderTilt').value.toFixed(1)}°`)
  assert(
    metric(f, 'hipShoulderSeparation').value < -15,
    `left-handed open chest measured ${metric(f, 'hipShoulderSeparation').value.toFixed(1)}°`,
  )
})

check('coil is measured the same whichever way the trunk turns', () => {
  // The one check the rig could not previously make about itself. It wears
  // right-handed labels and turns the trunk one particular way, and with no
  // recorded footage in the repo — RECORDED is empty — nothing here can say
  // whether that way round matches a real right-hander. If it does not, and the
  // measurement is oriented to agree with the rig, the two are inverted together
  // and every other coil check in this file passes for that reason alone.
  //
  // Running both rotational conventions is what removes that possibility: a
  // measurement that assumes a direction reports one of these two backwards, so
  // the pair of them can only pass if the direction is being derived rather than
  // assumed.
  for (const trunkRotationSign of [1, -1] as const) {
    const way = trunkRotationSign > 0 ? 'as dialled' : 'reversed'
    const coiled = run({ trunkRotationSign, shoulderYaw: 82, hipYaw: 56, cameraYaw: CORNER })
    const open = run({ trunkRotationSign, shoulderYaw: 82, hipYaw: 108, cameraYaw: CORNER })

    const good = metric(coiled.fundamentals, 'hipShoulderSeparation')
    const bad = metric(open.fundamentals, 'hipShoulderSeparation')
    note(`trunk ${way}: coil ${good.value.toFixed(1)}°, open chest ${bad.value.toFixed(1)}°`)

    near(good.value, 26, 8, `coil with the trunk ${way}`)
    assert(bad.value < -15, `an open chest measured ${bad.value.toFixed(1)}° with the trunk ${way}`)
    assert(good.score >= bad.score + 40, `coil scored ${good.score} against ${bad.score} for an open chest, trunk ${way}`)
    assert(bad.status === 'work', `an open chest was badged ${bad.status} with the trunk ${way}`)

    // The diagnosis has to derive the direction the same way, or the card and
    // the flaw pass end up describing opposite trophies from one clip.
    for (const { frames, skel, fundamentals } of [coiled, open]) {
      near(
        diagnose(frames, skel).signals.separation_deg,
        metric(fundamentals, 'hipShoulderSeparation').value,
        1,
        `report and diagnosis with the trunk ${way}`,
      )
    }
  }
})

/** The tracker's left and right shoulder, exchanged on one frame. */
const swapShoulders = (marks: Frame['world']): Frame['world'] =>
  marks.map((m, i) =>
    i === LM.leftShoulder ? marks[LM.rightShoulder] : i === LM.rightShoulder ? marks[LM.leftShoulder] : m,
  )

check('a left/right swap on three frames does not invert the coil', () => {
  // MediaPipe relabels left and right on a rotating torso, and the serve rotates
  // hardest between the trophy and the ball — so a swap that covers the contact
  // frames and nothing else is a live failure, not a hypothetical.
  //
  // What made it fatal was mixing two kinds of angle. The lag at the trophy is
  // read as a line and cannot see a swap; the sweep that gives it its sign was
  // read as an arrow and saw one at either end. An invariant magnitude times a
  // swap-sensitive sign inverts, so 27.5° of correct coil came back as -27.5° —
  // scored 30, read out as "your chest opens ahead of your hips", and promoted
  // to the headline fix. The player is told to undo the thing they did well.
  const frames = buildServe({ shoulderYaw: 82, hipYaw: 56, cameraYaw: CORNER }, FPS)
  const skel = detectServe(frames, FPS)
  const clean = trunkCoil(frames, skel.keys.trophy, skel.keys.contact)
  assert(clean > 15, `the rig coiled ${clean.toFixed(1)}°, too little for this check to prove anything`)

  // The same skeleton throughout: the keyframes must not be allowed to move, or
  // the check stops being about the labels.
  const swap = (fs: Frame[], at: (i: number) => boolean) =>
    fs.map((f, i) =>
      at(i) ? { ...f, world: swapShoulders(f.world), image: swapShoulders(f.image) } : f,
    )

  const atContact = trunkCoil(
    swap(frames, (i) => Math.abs(i - skel.keys.contact) <= 1),
    skel.keys.trophy,
    skel.keys.contact,
  )
  const atTrophy = trunkCoil(
    swap(frames, (i) => Math.abs(i - skel.keys.trophy) <= 1),
    skel.keys.trophy,
    skel.keys.contact,
  )
  // A swap across the whole clip was always harmless — both ends move together.
  // It is here to show that the single-endpoint case is the one that mattered.
  const throughout = trunkCoil(swap(frames, () => true), skel.keys.trophy, skel.keys.contact)

  note(`coil ${clean.toFixed(1)}° clean · ${atContact.toFixed(1)}° swapped at contact · ${atTrophy.toFixed(1)}° at the trophy · ${throughout.toFixed(1)}° throughout`)
  near(atContact, clean, 1, 'coil with the shoulders swapped around contact')
  near(throughout, clean, 1, 'coil with the shoulders swapped for the whole clip')
  // Looser: a swap on the trophy frames lands inside the ±2 window the lag is
  // averaged over, which mixes the two shoulders together rather than merely
  // relabelling them. The sign is what has to survive.
  assert(atTrophy > 0, `a swap at the trophy turned ${clean.toFixed(1)}° of coil into ${atTrophy.toFixed(1)}°`)
})

check('a trunk yawed past the wrap point measures the coil it actually held', () => {
  // The sweep from the trophy to contact runs 200° → 16° here, which crosses the
  // ±180 wrap exactly. Read as one difference it aliased into its own mirror,
  // flipping the sign and reporting -31° of open chest for 26° of correct coil.
  // Accumulating the turn frame by frame cannot alias: no serve turns the
  // shoulder line 90° between two samples.
  const wrapped = run({ shoulderYaw: 200, hipYaw: 174, cameraYaw: CORNER })
  const plain = run({ shoulderYaw: 82, hipYaw: 56, cameraYaw: CORNER })
  const a = metric(wrapped.fundamentals, 'hipShoulderSeparation')
  const b = metric(plain.fundamentals, 'hipShoulderSeparation')
  note(`coil ${b.value.toFixed(1)}° at 82°, ${a.value.toFixed(1)}° with the same trunk yawed past the wrap`)
  near(a.value, 26, 8, 'coil across the wrap point')
  // The same verdict, not the same badge: the band's middle sits at 23 since it
  // became the diagnosis's band too (D2.3), and four degrees either side of 27
  // straddle the line between "Strong" and "Solid" without either being wrong.
  const praised = (m: typeof a) => m.value >= m.ideal[0] && m.value <= m.ideal[1] && !m.fix
  assert(praised(a) && praised(b), `the same trophy read ${a.display} past the wrap and ${b.display} under it, and was not praised both times`)
})

check('a trunk that barely rotates is not handed a coil sign by noise', () => {
  // The direction is read off the shoulders sweeping open between the trophy and
  // contact. A player who arms the ball never makes that sweep, so there is no
  // direction to read — and guessing one does not produce a vague number, it
  // produces a confident "textbook coil" or a confident "chest opened early",
  // one of which is always wrong and both of which look authoritative on a card.
  for (const trunkRotationSign of [1, -1] as const) {
    // Shoulders parked within a few degrees of where they finish: no uncoiling
    // at all, which is the fault itself rather than a measurement problem. The
    // rig finishes the shoulders at 80° and the hips at 65° (`syntheticServe.ts`,
    // from the Bath serves) and parks them at `61 − dial` at the trophy, so these
    // hold the shoulders 2° short of where they finish, 6° of coil behind them.
    const armed = run({ trunkRotationSign, shoulderYaw: -17, hipYaw: -23 })
    const sep = metric(armed.fundamentals, 'hipShoulderSeparation')

    // Measured off the rig rather than assumed from the dials, so this cannot
    // quietly stop exercising the degenerate branch if the rig's contact yaw
    // moves — at which point it would be asserting nothing at all.
    const yaw = (i: number) => {
      const f = armed.frames[i]
      const a = f.world[LM.leftShoulder]
      const b = f.world[LM.rightShoulder]
      return (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI
    }
    const sweep = Math.abs(yaw(armed.skel.keys.contact) - yaw(armed.skel.keys.trophy))
    assert(
      sweep < MIN_OPENING_SWEEP_DEG,
      `the rig swept the shoulders ${sweep.toFixed(1)}°, past the ${MIN_OPENING_SWEEP_DEG}° this check needs it under`,
    )
    assert(sep.value === 0, `an unrotating trunk reported ${sep.value.toFixed(1)}° of coil`)
    assert(
      sep.status === 'work' || sep.status === 'fair',
      `a trunk that never uncoiled was badged ${sep.status}`,
    )
    assert(Boolean(sep.fix), 'no fix offered for a trunk that never uncoiled')
  }
})

/**
 * A serve a club player actually hits, rather than one dialled fault at a time.
 *
 * No racket drop — the hand stays high above the shoulder at the bottom of it —
 * barely bent knees, a flat trophy and contact a hand's width below full reach.
 * This is the shape the score curve has to stay humane about: a player like this
 * misses several bands at once by construction, which is why `SCORE_FLOOR` sits
 * at 30 and not near zero.
 */
const RECREATIONAL: Partial<ServeDials> = {
  dropBelowShoulder: -0.25,
  contactReach: 1.2,
  trophyKneeAngle: 160,
  shoulderTilt: 8,
  shoulderYaw: 70,
  hipYaw: 62,
  tossArmHold: 0.3,
}

/** The dial sets the badge checks below are run over: clean, then one fault each. */
const BADGE_DIALS: Partial<ServeDials>[] = [
  {},
  { trophyKneeAngle: 176 },
  { shoulderTilt: 6 },
  { shoulderYaw: 68, hipYaw: 59 },
  { contactReach: 1.0 },
  { dropBelowShoulder: -0.25 },
]

check('the badge and the band agree on every measurement, both ways round', () => {
  // `coaching.ts` states the rule: the fix is shown exactly when the measurement
  // falls outside its band. Deriving the badge and the fix from the score
  // instead broke it as soon as the score curve was recalibrated — 9.3° of
  // separation scored 71, came back "Solid", read out as "Slight coil" six
  // degrees under its own band, and suppressed the fix that names the
  // correction. A card cannot congratulate a player and describe their fault at
  // once.
  //
  // Both directions are asserted, because the first attempt at this capped
  // out-of-band at "fair" and satisfied only one of them: it left in-band always
  // "great", which is the same disagreement wearing the other face. The curve
  // now crosses the "Solid" threshold exactly at the band edge, so both hold
  // with nothing clamping anything.
  for (const d of BADGE_DIALS) {
    for (const m of run(d).fundamentals.flatMap((f) => f.metrics)) {
      const inBand = m.value >= m.ideal[0] && m.value <= m.ideal[1]
      if (inBand) {
        assert(!m.fix, `${m.id} is inside its band at ${m.display} but still orders a fix`)
        assert(
          m.status === 'good' || m.status === 'great',
          `${m.id} read ${m.display}, inside ${m.ideal.join('–')}, and was badged ${m.status} (score ${m.score})`,
        )
      } else {
        assert(
          m.status === 'fair' || m.status === 'work',
          `${m.id} read ${m.display}, outside ${m.ideal.join('–')}, and was badged ${m.status} (score ${m.score})`,
        )
        assert(Boolean(m.fix), `${m.id} read ${m.display}, outside its band, and offers no fix`)
      }
    }
  }
})

check('all four badges are reachable by a real measurement', () => {
  // The cap this replaced made "Solid" dead copy: in-band scored 90–100 and was
  // always "Strong", out-of-band was capped at "Refine", so `STATUS_LABEL.good`,
  // the `.metric-read--good` rule and MetricBar's `var(--good)` could never fire
  // and every band edge was a two-level jump. Nothing in the app would have
  // failed — it would simply have had three badges and pretended to have four.
  const seen = new Map<Status, string>()
  for (const d of [...BADGE_DIALS, RECREATIONAL]) {
    for (const m of run(d).fundamentals.flatMap((f) => f.metrics)) {
      if (!seen.has(m.status)) seen.set(m.status, `${m.id} ${m.display} → ${m.score}`)
    }
  }
  for (const s of ['great', 'good', 'fair', 'work'] as Status[]) {
    assert(seen.has(s), `no measurement in any test serve is ever badged "${s}"`)
  }
  note([...seen].map(([s, why]) => `${s}: ${why}`).join(' · '))
})

check('the score curve is continuous across every band edge', () => {
  // A discontinuity here is a cliff a player falls off for a measurement error.
  // The worst case is `shoulderTilt`, where the frame averaging `steadyWorld`
  // does "buys back several degrees" (see TROPHY_POSTURE_RADIUS) — so an edge
  // that dropped two badges in a degree would be reporting noise as a fault.
  // Landing the edge exactly on the "Solid" threshold is what removes it: one
  // point, one badge, either side.
  for (const serveType of ['flat', 'kick', 'slice'] as ServeType[]) {
    for (const id of Object.keys(METRICS)) {
      const copy = metricCopy(id, serveType)
      const [lo, hi] = copy.ideal
      const span = Math.abs(copy.missSpan ?? copy.range[1] - copy.range[0])
      const at = (v: number) => scoreAgainst(v, copy.ideal, copy.range, copy.missSpan)
      // A thousandth of the axis: far finer than any measurement resolves, so a
      // gap that shows up here is in the curve and not in the sampling.
      const nudge = span / 1000

      for (const [edge, outside] of [
        [lo, lo - nudge],
        [hi, hi + nudge],
      ]) {
        // Bands that run to the end of their own axis have no crossable edge
        // there — nobody can score below zero wobble.
        if (outside < copy.range[0] || outside > copy.range[1]) continue
        assert(
          at(edge) === 70,
          `${serveType} ${id} scores its band edge ${edge} as ${at(edge)}, not the 70 that "Solid" starts at`,
        )
        assert(
          at(edge) - at(outside) <= 1,
          `${serveType} ${id} drops ${at(edge) - at(outside)} points across its ${edge} edge`,
        )
        assert(
          statusOf(at(edge)) === 'good' && statusOf(at(outside)) === 'fair',
          `${serveType} ${id} jumps ${statusOf(at(edge))} → ${statusOf(at(outside))} across its ${edge} edge`,
        )
      }

      // The two invariants the curve exists to guarantee, swept rather than
      // sampled: inside the band never scores under 70, outside never reaches it.
      for (let i = 0; i <= 400; i++) {
        const v = copy.range[0] + ((copy.range[1] - copy.range[0]) * i) / 400
        const inBand = v >= lo && v <= hi
        assert(
          inBand ? at(v) >= 70 : at(v) < 70,
          `${serveType} ${id} scores ${v.toFixed(3)} (${inBand ? 'in' : 'out of'} band) as ${at(v)}`,
        )
      }
    }
  }
})

check('the widened axes still score their misses on the old curve, and it still bites', () => {
  // Both bands now sit on an axis that runs below zero, and `scoreAgainst` takes
  // its miss tolerance as a fraction of that axis — so admitting the reverse side
  // would, on its own, have made every miss on these two cheaper. A flat pair of
  // shoulders rose from 45 to 58 that way: the badge moving from "work on this"
  // to "fair" for a serve nobody changed. `missSpan` is what holds the curve
  // still, and this walks the positive half of both axes to prove it did.
  for (const id of ['shoulderTilt', 'hipShoulderSeparation']) {
    const copy = metricCopy(id)
    assert(copy.range[0] < 0, `${id} cannot show its own reverse: the axis stops at ${copy.range[0]}`)
    assert(copy.missSpan !== undefined, `${id} widened its axis without pinning the scoring span`)
    const before: [number, number] = [0, copy.range[1]]
    for (let v = 0; v <= copy.range[1]; v++) {
      assert(
        scoreAgainst(v, copy.ideal, copy.range, copy.missSpan) === scoreAgainst(v, copy.ideal, before),
        `${id} now scores ${v} as ${scoreAgainst(v, copy.ideal, copy.range, copy.missSpan)}, was ${scoreAgainst(v, copy.ideal, before)}`,
      )
    }

    // Comparing the curve against itself only catches a missing `missSpan`. It
    // says nothing about the shape, and passed unchanged with the floor lifted
    // to 60 — which would put every fault in the app at "fair" or better. These
    // pin the shape itself.
    const at = (v: number) => scoreAgainst(v, copy.ideal, copy.range, copy.missSpan)
    const [lo, hi] = copy.ideal
    const span = copy.missSpan as number

    assert(at(lo) === 70 && at(hi) === 70, `${id} scores its own band edges ${at(lo)}/${at(hi)}, not 70`)
    assert(at(lo - 0.5) < 70, `${id} scores ${at(lo - 0.5)} just outside its band, inside band territory`)

    // A miss of a tenth of the axis has to leave "Solid" behind and cost real
    // points on the way, and a miss of the full tolerance has to land in "work
    // on this" outright. That second one is what a lifted floor breaks first: at
    // SCORE_FLOOR 60 the worst any measurement can score is "fair", and the app
    // loses the ability to call anything a fault at all.
    //
    // Ten points, where this once demanded fifteen, because the band edge moved
    // from 90 to 70: everything below the band now shares 39 points instead of
    // 58, so the same fraction of the decay is worth fewer of them. As a share
    // of what is left below the band the charge went up, not down.
    assert(
      statusOf(at(lo - span * 0.1)) === 'fair',
      `${id} is still badged ${statusOf(at(lo - span * 0.1))} a tenth of its axis below the band`,
    )
    assert(
      at(lo) - at(lo - span * 0.1) >= 10,
      `${id} charges only ${at(lo) - at(lo - span * 0.1)} points for missing low by a tenth of its axis`,
    )
    assert(
      at(lo - span * 0.4) < 55 && at(hi + span * 0.4) < 55,
      `${id} scores a full-tolerance miss ${at(lo - span * 0.4)}/${at(hi + span * 0.4)}, still out of "work on this"`,
    )

    // Monotone away from the band in both directions, so a worse serve can never
    // score better than a less bad one.
    for (let v = lo; v > copy.range[0]; v--) {
      assert(at(v - 1) <= at(v), `${id} scores ${v - 1} above ${v} on the way down`)
    }
    for (let v = hi; v < copy.range[1]; v++) {
      assert(at(v + 1) <= at(v), `${id} scores ${v + 1} above ${v} on the way up`)
    }
  }
})

check('reads back contact height', () => {
  const { fundamentals } = run({ contactReach: 1.38 })
  near(metric(fundamentals, 'contactHeight').value, 1.38, 0.09, 'contact height')
})

check('reads back the tossing-arm elbow angle', () => {
  const { fundamentals } = run({ tossElbow: 172 })
  near(measured(fundamentals, 'tossArmExtension').value, 172, 10, 'toss elbow')
})

check('measures leg drive when the player leaves the ground', () => {
  const grounded = run({ contactHipHeight: 0.95 })
  const jumping = run({ contactHipHeight: 1.12 })
  assert(
    metric(jumping.fundamentals, 'legDrive').value >
      metric(grounded.fundamentals, 'legDrive').value + 0.05,
    'a jump did not register as more leg drive than staying grounded',
  )
})

check('swing timing survives a change of frame rate', () => {
  // The rig puts the racket drop 11% of the motion before contact: ~149 ms.
  const vals = [24, 30, 50, 60].map((fps) => {
    const frames = buildServe({}, fps)
    const skel = detectServe(frames, fps)
    return metric(measure(frames, skel, true), 'dropToContact').value
  })
  for (const v of vals) near(v, 149, 32, 'drop→contact')
  assert(
    Math.max(...vals) - Math.min(...vals) < 34,
    `drop→contact spread ${Math.round(Math.max(...vals) - Math.min(...vals))} ms across frame rates: ${vals.map(Math.round).join(', ')}`,
  )
})

check('a lopsided peak is timed where its two sides cross, not at the nearest sample', () => {
  // Rises at 3 per second to a peak at t = 1.013, falls at 1 per second — the
  // shape contact has. Sampled every 30 ms, the highest sample sits at 1.02.
  const peak = 1.013
  const times = [0.93, 0.96, 0.99, 1.02, 1.05, 1.08]
  const series = times.map((t) => (t <= peak ? 3 * (t - peak) : -(t - peak)))
  const i = series.indexOf(Math.max(...series))
  near(refineExtremum(series, times, i), peak, 1e-9, 'tent apex')
})

check('a peak with nothing to fit on is left at its sample', () => {
  const times = [0, 0.03, 0.06, 0.09, 0.12]
  assert(refineExtremum([1, 2, 3, 2, 1], times, 0) === 0, 'an edge was moved')
  assert(refineExtremum([1, 2, 2, 2, 1], times, 2) === 0.06, 'a plateau was moved')
  assert(refineExtremum([3, 2, 3, 2, 1], times, 2) === 0.06, 'a flank that was not rising was fitted')
})

check('drop-to-contact at 30 fps is no longer read a full sample long', () => {
  // Built finely, then read at 30 fps from ten different starting phases —
  // the grid a real clip lands on is arbitrary. Before `refineExtremum` this
  // read +31 ms long on average; the bound is what the tent fit earns.
  const HI = 2400
  const fine = buildServe({}, HI)
  const truthSkel = detectServe(fine, HI)
  const truth = (fine[truthSkel.keys.contact].t - fine[truthSkel.keys.drop].t) * 1000
  const step = HI / 30
  const errors: number[] = []
  for (let k = 0; k < step; k += 8) {
    const frames = fine.filter((_, i) => i % step === k).map((f, i) => ({ ...f, index: i }))
    const skel = detectServe(frames, 30)
    errors.push(metric(measure(frames, skel, true), 'dropToContact').value - truth)
  }
  const bias = errors.reduce((a, b) => a + b, 0) / errors.length
  note(`drop→contact at 30 fps: bias ${bias.toFixed(1)} ms over ${errors.length} phases (truth ${truth.toFixed(0)} ms)`)
  within(bias, -20, 20, 'drop→contact bias at 30 fps')
})

check('a slow-motion clip hedges its timings instead of coaching a slow rhythm', () => {
  const read = (motionSeconds: number) => {
    const frames = buildServe({ motionSeconds }, 60)
    const skel = detectServe(frames, 60)
    const all = measure(frames, skel, true, {
      confidence: { frames, skel, swingSamples: 8, view: 'side' },
    }).flatMap((f) => [...f.metrics, ...(f.readings ?? [])])
    return { slowed: looksSlowedDown(frames, skel), m: (id: string) => all.find((x) => x.id === id)! }
  }
  const real = read(1.35)
  const slowPlayer = read(2.2)
  const stretched = read(1.35 * 3)
  assert(!real.slowed, 'a clean serve was taken for slow motion')
  assert(!slowPlayer.slowed, 'a genuinely slow player was taken for slow motion')
  assert(stretched.slowed, 'a 3× slow-motion clip was read as a real-time serve')
  for (const id of ['dropToContact', 'totalTime']) {
    assert(stretched.m(id).confidence < 0.55, `${id} was scored on a stretched clock (${stretched.m(id).confidence.toFixed(2)})`)
    assert(real.m(id).confidence >= 0.55, `${id} was hedged on a real-time clip`)
  }
  assert(stretched.m('loadRatio').confidence >= 0.55, 'a share of the motion, which a stretch does not change, was hedged')
})

check('measurements hold up when the camera moves round', () => {
  const side = run({ cameraYaw: 85 })
  const angled = run({ cameraYaw: 40 })
  for (const id of ['contactHeight', 'kneeBend', 'armExtension', 'dropDepth']) {
    const a = metric(side.fundamentals, id).value
    const b = metric(angled.fundamentals, id).value
    const drift = Math.abs(a - b) / Math.max(1e-6, Math.abs(a))
    assert(drift < 0.2, `${id} drifted ${(drift * 100).toFixed(0)}% between camera angles`)
  }
})

/* ------------------------------------------------------------------- scoring */

console.log('\n\x1b[1mScoring and coaching\x1b[0m')

check('a clean serve scores well across the board', () => {
  const { fundamentals } = run()
  for (const f of fundamentals) {
    assert(f.score >= 70, `${f.label} scored ${f.score} on a deliberately clean serve`)
  }
})

check('every metric produces copy, and a fix only when it needs one', () => {
  const { fundamentals } = run({ trophyKneeAngle: 176 })
  for (const m of fundamentals.flatMap((f) => f.metrics)) {
    assert(m.insight.length > 20, `${m.id} has no insight text`)
    assert(m.display.length > 0, `${m.id} has no display value`)
    within(m.score, 0, 100, `${m.id} score`)
    if (m.status === 'great' || m.status === 'good') {
      assert(!m.fix, `${m.id} scored ${m.score} but still shows a fix`)
    } else {
      assert(Boolean(m.fix), `${m.id} scored ${m.score} but offers no fix`)
    }
  }
})

check('stiff legs are reported as a loading fault', () => {
  const { fundamentals } = run({ trophyKneeAngle: 176 })
  const kb = metric(fundamentals, 'kneeBend')
  assert(kb.status === 'work' || kb.status === 'fair', `knee bend scored ${kb.score} with straight legs`)
  assert(Boolean(kb.fix), 'no fix offered for straight legs')
  assert(
    area(fundamentals, 'loading').score < area(fundamentals, 'contact').score,
    'loading was not the weaker area despite straight legs',
  )
})

check('a shallow racket drop is reported as a swing fault, not rejected', () => {
  const { fundamentals } = run({ dropBelowShoulder: -0.25 })
  const dd = metric(fundamentals, 'dropDepth')
  assert(dd.status === 'work' || dd.status === 'fair', `drop depth scored ${dd.score} with no drop`)
  assert(Boolean(dd.fix), 'no fix offered for a shallow drop')
})

/**
 * The commonest serve this app will ever be shown.
 *
 * Ten degrees of knee bend is below the trough `findTrophy` insists on, so the
 * trophy is looked for in the arms; the racket hand stays well above the
 * shoulder, so there is no fall for the arms to find either. Both
 * keyframes end up on the toss — the state `derivation.dropOnTrophy` records —
 * and the interval between them stops being the swing's acceleration window.
 *
 * Not a pathological rig setting: this is a club player who stands tall and
 * pushes the racket at the ball, which is most of them.
 */
/**
 * A racket that never lays back: the hand left well above the shoulder.
 *
 * Since the drop band was re-anchored on real motion (ANALYSIS-REVIEW.md §9) a
 * hand that stops level with the shoulder is a full drop, so the poses below
 * that used `dropBelowShoulder` 0–0.05 for "no drop" now hold the hand 25 cm
 * above it instead — the forearm still upright, which is what a missing drop is.
 */
const MODAL_CLUB_SERVE: Partial<ServeDials> = { trophyKneeAngle: 170, dropBelowShoulder: -0.25 }

/**
 * A toss already falling by the time the racket arrives, built by hand.
 *
 * `buildServe` draws a body and no ball, so the two ball measurements are simply
 * absent from every other check in this file. That is fine everywhere except
 * here: a player who never loads and never drops the racket is also, nearly
 * always, waiting for the ball to come back down to them, and those two
 * measurements have to be in the running when the report picks what to talk
 * about — otherwise the drop wins a race half the field never entered.
 *
 * The arc is the real one, image y against seconds under the frame-normalised
 * gravity `analyze.ts` hands the tracker, so how far the ball has fallen and how
 * long it has been falling cannot be dialled apart the way an invented parabola
 * would allow.
 */
function fallingToss(
  frames: Frame[],
  skel: Skeleton,
  opts: { peak: number; fallenBy: number },
): BallFlight {
  const { bodyHeight, groundY, keys } = skel
  const gravity = (9.81 * bodyHeight) / 1.78
  const sinceApex = Math.sqrt((2 * opts.fallenBy * bodyHeight) / gravity)
  const apexT = frames[keys.contact].t - sinceApex
  const apexY = groundY - opts.peak * bodyHeight
  const x = frames[keys.contact].image[LM.rightWrist].x
  const heightAt = (t: number) => apexY + 0.5 * gravity * (t - apexT) ** 2

  return {
    coefficients: [apexY + 0.5 * gravity * apexT ** 2, -gravity * apexT, 0.5 * gravity],
    apex: { t: apexT, x, y: apexY },
    samples: frames.slice(keys.toss, keys.contact + 1).map((f) => ({ t: f.t, x, y: heightAt(f.t) })),
    confidence: 0.9,
  }
}

check('the commonest club serve is told about its drop, not its tempo', () => {
  const frames = buildServe(MODAL_CLUB_SERVE, FPS)
  const skel = detectServe(frames, FPS)
  note(`trophy ${skel.keys.trophy}, drop ${skel.keys.drop}, contact ${skel.keys.contact}`)
  assert(
    skel.derivation.dropOnTrophy,
    'the drop was treated as its own event on a serve where the racket never falls',
  )

  const fundamentals = measure(frames, skel, true, {
    ball: fallingToss(frames, skel, { peak: 1.45, fallenBy: 0.18 }),
  })
  const all = fundamentals.flatMap((f) => f.metrics)

  // Whatever else follows, the number that started this must not be on the card.
  // With the two keyframes on one instant it reads the toss-to-contact stretch —
  // roughly 680 ms against a 110–230 ms band — and scores at the floor.
  const timing = all.find((m) => m.id === 'dropToContact')
  assert(
    !timing,
    `drop-to-contact was reported as ${timing?.display} on a serve with no drop to time`,
  )

  // The swing card leads with its weakest measurement, and the weakest one has
  // to be the drop that never happened rather than the tempo of a swing that
  // never started.
  const swing = area(fundamentals, 'swing')
  const depth = metric(fundamentals, 'dropDepth')
  note(`swing headline: ${swing.headline}`)
  assert(
    swing.headline === depth.insight,
    `the swing card leads with something other than the racket drop: "${swing.headline}"`,
  )

  // And the one instruction the player is handed, ranked across every
  // measurement in the report — including a knee bend and a ball struck late,
  // both of which are genuinely poor on this serve.
  const focus = pickFocus(fundamentals)
  note(`focus: ${focus.title} · ${focus.drill.name}`)
  assert(
    focus.title === METRICS.dropDepth.label,
    `the player is sent away to work on "${focus.title}" instead of their racket drop`,
  )
  assert(focus.drill.name === METRICS.dropDepth.drill.name, 'the focus carries the wrong drill')
})

check('a drop that did happen is still timed', () => {
  // The mirror image, and the reason `MIN_DROP_SEPARATION` is small. Here the
  // legs load, so the trophy comes off the knees and the racket bottoms out at
  // its own moment however shallow that moment is — a real interval, and taking
  // it away from every player whose drop is merely shallow would cost far more
  // than the collapsed case ever cost. Dialled at the shallowest drop that still
  // dips: the hand 20 cm above the shoulder, just outside the band.
  const frames = buildServe({ dropBelowShoulder: -0.2 }, FPS)
  const skel = detectServe(frames, FPS)
  assert(!skel.derivation.dropOnTrophy, 'a drop found at its own moment was called a collapse')

  const timing = metric(measure(frames, skel, true), 'dropToContact')
  note(`shallow but separate drop: ${timing.display}`)
  within(timing.value, 80, 260, 'drop→contact off a shallow drop')
})

check('the collapsed drop is spotted at any frame rate', () => {
  // The separation is judged in seconds rather than in frames, so a phone
  // shooting slow motion must not manufacture a drop out of the gap between two
  // samples of the same instant.
  for (const fps of [24, 30, 60, 120]) {
    const frames = buildServe(MODAL_CLUB_SERVE, fps)
    const skel = detectServe(frames, fps)
    assert(skel.derivation.dropOnTrophy, `the collapse went unnoticed at ${fps} fps`)
    assert(
      !measure(frames, skel, true)
        .flatMap((f) => f.metrics)
        .some((m) => m.id === 'dropToContact'),
      `drop-to-contact survived the collapse at ${fps} fps`,
    )
  }
})

check('a low reach is reported as a contact fault', () => {
  const low = run({ contactReach: 1.0 }).fundamentals
  const full = run({ contactReach: 1.38 }).fundamentals
  const ch = metric(low, 'contactHeight')
  assert(ch.status === 'work' || ch.status === 'fair', `contact height scored ${ch.score} at 1.15×`)
  assert(Boolean(ch.fix), 'no fix offered for a low reach')
  // Measured against the same serve struck at full reach rather than against a
  // fixed number. An absolute threshold here was really pinning the bottom of
  // the score scale: `SCORE_FLOOR` moved, every out-of-band measurement moved
  // with it, and a test about whether a fault costs the area anything failed
  // because the floor is now kinder — which is a different question entirely.
  const cost = area(full, 'contact').score - area(low, 'contact').score
  assert(
    cost >= 10,
    `a reach short by a fifth of a body height cost the contact area only ${cost} points`,
  )
  assert(
    area(low, 'contact').score < area(full, 'contact').score,
    'a low reach scored the contact area no worse than a full one',
  )
})

check('dropping the tossing arm early is caught', () => {
  const held = run({ tossArmHold: 0.8 })
  const dropped = run({ tossArmHold: 0.15 })
  assert(
    metric(dropped.fundamentals, 'tossArmHold').score <
      metric(held.fundamentals, 'tossArmHold').score - 15,
    'dropping the tossing arm early did not lower the score',
  )
})

check('a wobbly toss scores below a straight one', () => {
  const straight = metric(run({ tossWobble: 0.005 }).fundamentals, 'tossPathWobble')
  const wobbly = metric(run({ tossWobble: 0.15 }).fundamentals, 'tossPathWobble')
  assert(
    wobbly.score < straight.score - 15,
    `wobble ${wobbly.value.toFixed(1)}% scored ${wobbly.score} vs straight ${straight.value.toFixed(1)}% at ${straight.score}`,
  )
})

check('one fault does not drag down unrelated areas', () => {
  const clean = run()
  const stiff = run({ trophyKneeAngle: 176 })
  const a = area(clean.fundamentals, 'toss').score
  const b = area(stiff.fundamentals, 'toss').score
  assert(Math.abs(a - b) < 12, `toss score moved ${Math.abs(a - b)} points when only the legs changed`)
})

check('scores stay inside 0–100 under absurd input', () => {
  for (const dials of [
    { trophyKneeAngle: 179, contactReach: 1.12, dropBelowShoulder: -0.05, tossArmHold: 0.02 },
    { trophyKneeAngle: 60, contactReach: 1.65, dropBelowShoulder: 0.8, tossElbow: 90 },
  ] as Partial<ServeDials>[]) {
    const { fundamentals } = run(dials)
    for (const f of fundamentals) {
      within(f.score, 0, 100, `${f.label} score`)
      for (const m of f.metrics) within(m.score, 0, 100, `${m.id} score`)
    }
  }
})

/* --------------------------------------------------------- consistency ---- */

console.log('\n\x1b[1mConsistency across serves\x1b[0m')

/** Measure a basket of serves and compare them, the way the app does. */
function basket(dialsPerServe: Partial<ServeDials>[]) {
  const analyses = dialsPerServe.map((d) => {
    const { fundamentals } = run(d)
    const overall = Math.round(
      fundamentals.reduce((s, f) => s + f.score, 0) / fundamentals.length,
    )
    return { fundamentals, overall } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  return buildConsistency(analyses, dialsPerServe.length)
}

check('needs at least two serves to say anything', () => {
  assert(basket([{}]) === undefined, 'produced a comparison from a single serve')
})

check('a repeatable motion scores high on consistency', () => {
  const c = basket([{}, {}, {}, {}])
  assert(c !== undefined, 'no comparison produced')
  assert(c!.score >= 90, `identical serves scored only ${c!.score} for consistency`)
  assert(c!.serves === 4, `compared ${c!.serves} serves, expected 4`)
})

check('a toss that wanders is named as the least repeatable element', () => {
  const c = basket([
    { contactReach: 1.38 },
    { contactReach: 1.2 },
    { contactReach: 1.45 },
    { contactReach: 1.3 },
  ])
  assert(c !== undefined, 'no comparison produced')
  const contact = c!.metrics.find((m) => m.id === 'contactHeight')
  assert(Boolean(contact), 'contact height was not compared')
  assert(
    contact!.spread > 0.15,
    `contact height spread only ${contact!.spread.toFixed(3)} despite varying reach`,
  )
  assert(
    c!.weakest!.score <= contact!.score,
    'the weakest metric was not ranked first',
  )
})

check('an element held steady while another varies keeps its own high score', () => {
  const c = basket([{ contactReach: 1.2 }, { contactReach: 1.45 }, { contactReach: 1.3 }])
  const knee = c!.metrics.find((m) => m.id === 'kneeBend')
  assert(Boolean(knee), 'knee bend was not compared')
  assert(knee!.score >= 85, `knee bend scored ${knee!.score} despite never changing`)
})

check('reports serves the sweep tried to measure and could not', () => {
  const c = basket([{}, {}])
  assert(c!.skipped === 0, `reported ${c!.skipped} skipped when all were measured`)
  const partial = buildConsistency(
    [{}, {}].map(() => {
      const { fundamentals } = run()
      return { fundamentals, overall: 70 } as unknown as Parameters<typeof buildConsistency>[0][number]
    }),
    5,
  )
  assert(partial!.skipped === 3, `expected 3 skipped, got ${partial!.skipped}`)
})

// The count handed over is what the sweep *attempted*, which is capped — so a
// clip with more serves in it than the cap must not come back reporting the
// serves past the cap as ones too unclear to read. Nothing looked at them.
check('serves past the sweep cap are not reported as unreadable', () => {
  const measured = Array.from({ length: MAX_CONSISTENCY_SERVES }, () => {
    const { fundamentals } = run()
    return { fundamentals, overall: 70 } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  const c = buildConsistency(measured, Math.min(10, MAX_CONSISTENCY_SERVES))
  assert(c!.skipped === 0, `a ten-serve clip reported ${c!.skipped} serves as unreadable`)
})

// Each chip is labelled with the serve's own number in the clip. Numbering by
// position instead points the player at the wrong serve in a clip they can count
// — and the sweep both skips unreadable serves and covers only the last few of a
// long basket, so position and serve number routinely disagree.
check('each serve is labelled by its number in the clip, not its place in the list', () => {
  const analyses = [3, 5, 6].map((index) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: 70,
      serves: { count: 7, index },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  const c = buildConsistency(analyses, 3)
  assert(
    JSON.stringify(c!.serveNumbers) === JSON.stringify([4, 6, 7]),
    `labelled the serves ${JSON.stringify(c!.serveNumbers)}, expected [4,6,7]`,
  )
})

/* ------------------------------------------------ best against worst ---- */

/** A basket where the overall score of each serve is dictated rather than measured. */
function scored(pairs: { overall: number; dials?: Partial<ServeDials>; index?: number }[]) {
  const analyses = pairs.map(({ overall, dials, index }, i) => {
    const { fundamentals } = run(dials ?? {})
    return {
      fundamentals,
      overall,
      serves: { count: pairs.length, index: index ?? i },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  return buildConsistency(analyses, pairs.length)
}

check('the best and worst serve are named by their number in the clip', () => {
  // Picked on `overall`, which is the number already on the chips. A best serve
  // chosen on any other footing is the panel disagreeing with its own display.
  const c = scored([{ overall: 61 }, { overall: 78 }, { overall: 55 }])
  assert(c!.gap !== undefined, 'no best-against-worst produced from three different scores')
  assert(c!.gap!.best === 2, `named serve ${c!.gap!.best} as the best, expected 2`)
  assert(c!.gap!.worst === 3, `named serve ${c!.gap!.worst} as the worst, expected 3`)
  assert(c!.gap!.bestScore === 78 && c!.gap!.worstScore === 55, 'carried the wrong scores')
})

check('serves that all scored the same have no better one to point at', () => {
  // The alternative is naming a best serve out of a tie, which sends the player
  // looking for a difference nothing measured.
  const c = scored([{ overall: 70 }, { overall: 70 }, { overall: 70 }])
  assert(c!.gap === undefined, 'invented a best serve out of three identical scores')
})

check('the differences are ranked by how far apart the two serves were', () => {
  // Normalised by each metric's own band width, or degrees and body-heights
  // cannot be ranked against each other at all — a 9° knee difference and a
  // 0.09× height difference would sort by which unit happened to be bigger.
  const c = scored([
    { overall: 80, dials: { contactReach: 1.2 } },
    { overall: 50, dials: { contactReach: 1.45 } },
  ])
  const d = c!.gap!.differences
  assert(d.length > 0, 'no differences reported between two clearly different serves')
  for (let i = 1; i < d.length; i++) {
    assert(d[i - 1].size >= d[i].size, `differences out of order at ${d[i].id}`)
  }
  assert(
    d[0].id === 'contactHeight',
    `ranked ${d[0].id} above contact height, which was the dial that moved`,
  )
  assert(
    d[0].bestValue !== d[0].worstValue,
    'the top difference reports the same value on both serves',
  )
})

check('every measurement is offered, and the cutting is left to whoever prints it', () => {
  // The panel drops any pair that reads back as the same words, which is a
  // question about vocabulary rather than about measurement. If this list
  // arrived pre-cut, the two halves of the panel would be filtering on
  // different rules.
  const c = scored([{ overall: 80 }, { overall: 50 }])
  assert(
    c!.gap!.differences.length === c!.metrics.length,
    `offered ${c!.gap!.differences.length} of ${c!.metrics.length} measurements`,
  )
})

/* ------------------------------------------------------ the paired stills */

/** A basket whose serves carry named stills, so the pairing can be checked by name. */
function withStills(numbers: number[], overalls: number[]) {
  return numbers.map((index, i) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: overalls[i],
      serves: { count: 9, index },
      phases: [
        { id: 'trophy', label: 'Trophy', thumbnail: `serve${index + 1}-trophy` },
        { id: 'contact', label: 'Contact', thumbnail: `serve${index + 1}-contact` },
      ],
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
}

check('the stills come from the two serves the words named', () => {
  // Matched on the serve's own number in the clip, not on position in the array.
  // A sweep skips serves it could not read and covers only the last few of a
  // long basket, so the third entry is routinely not the third serve — and
  // pairing by position would put a picture of one serve under the number of
  // another, which is worse than showing nothing.
  const analyses = withStills([2, 5, 7], [61, 80, 55])
  const c = buildConsistency(analyses, 3)!
  const pair = pairStills(analyses, c.gap!)
  assert(pair !== undefined, 'no stills paired')
  assert(pair!.best === 6 && pair!.worst === 8, `paired serves ${pair!.best} and ${pair!.worst}`)
  const trophy = pair!.positions.find((p) => p.id === 'trophy')!
  assert(
    trophy.best === 'serve6-trophy' && trophy.worst === 'serve8-trophy',
    `trophy paired ${trophy.best} against ${trophy.worst}`,
  )
})

check('positions are paired by keyframe, not by their place in the list', () => {
  // Both serves have all six under any ordinary reading. On the day one of them
  // does not, pairing by index puts one serve's trophy beside the other's
  // racket drop and nothing in the picture says so.
  const analyses = withStills([0, 1], [80, 50])
  const worst = analyses[1] as unknown as { phases: { id: string }[] }
  worst.phases.reverse()
  const c = buildConsistency(analyses, 2)!
  const pair = pairStills(analyses, c.gap!)!
  for (const p of pair.positions) {
    assert(
      (p.best ?? '').endsWith(p.id) && (p.worst ?? '').endsWith(p.id),
      `${p.id} was paired with ${p.best} and ${p.worst}`,
    )
  }
})

check('a basket with no pictures in it pairs nothing rather than empty boxes', () => {
  // The rig draws no stills, and neither does a sweep on a build where they are
  // turned off. Six rows of two empty frames is worse than the sentence.
  const analyses = withStills([0, 1], [80, 50])
  for (const a of analyses as unknown as { phases: { thumbnail?: string }[] }[]) {
    for (const p of a.phases) p.thumbnail = undefined
  }
  const c = buildConsistency(analyses, 2)!
  assert(pairStills(analyses, c.gap!) === undefined, 'paired a basket that has no pictures')
})

/*
 * R12 in NEXT.md: `maxTrackingJump`/`IMPLAUSIBLE_JUMP` catches a hand-off
 * inside one serve's own window. It has nothing to say about the sweep — each
 * serve is tracked as its own internally-consistent window, so a coach who
 * serves once mid-basket produces a serve with nothing to jump *from*.
 * `possibleHandoff` is the check the sweep needed instead: not motion inside
 * a serve, but whether the serves agree on whose body they measured.
 */
function withHeight(heights: number[]) {
  return heights.map((h) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: 70,
      scale: { bodyHeight: h, groundY: 0.95 },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
}

check('the same body filmed several times is not flagged as a hand-off', () => {
  // A body height noisy by a percent or two between serves is ordinary
  // measurement variation, not a different person.
  const c = buildConsistency(withHeight([0.54, 0.545, 0.538, 0.541]), 4)!
  assert(!c.possibleHandoff, 'ordinary session noise was read as a hand-off')
})

check('a clearly different standing height is flagged as a possible hand-off', () => {
  // One serve reading a fifth taller than the rest — a coach, or a much
  // taller player — with nothing else about the clip changing.
  const c = buildConsistency(withHeight([0.54, 0.545, 0.65, 0.538]), 4)!
  assert(c.possibleHandoff, 'a clearly different standing height was not flagged')
})

check('a report with no height reading at all is not flagged by default', () => {
  // Older or hand-assembled analyses may carry no scale at all; absence is not
  // evidence of a mismatch, and flagging it would train players to ignore a
  // warning that fires on every basket built without a camera.
  const noScale = [0, 1].map(() => {
    const { fundamentals } = run()
    return { fundamentals, overall: 70 } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  const c = buildConsistency(noScale, 2)!
  assert(!c.possibleHandoff, 'a basket with no height reading at all was flagged as a hand-off')
})

/*
 * And the limit, which is a check rather than a comment because round 36 made
 * a stored `Session` structurally satisfy this function's parameter type. The
 * compiler will hand it a history without complaint; these say what happens.
 */
check('the same player with the phone moved reads as a hand-off', () => {
  // One body, two sessions, camera six metres away and then five. Standing
  // height is a fraction of the frame, so it scales with 6/5 — a fifth taller,
  // from a change nobody would notice making.
  const c = buildConsistency(withHeight([0.54, 0.54 * (6 / 5)]), 2)!
  assert(c.possibleHandoff, 'the arithmetic this limit rests on has moved')
})

check('a camera move under a metre is enough to cross the threshold', () => {
  // Which is the number that makes it useless across sessions: at 6/1.18 =
  // 5.08 m the ratio is exactly the threshold, so 92 cm of re-propping does
  // it. Asserted either side, because a limit stated to one digit and checked
  // in one direction is a limit nobody has actually pinned down.
  const ratio = 6 / 5.08
  assert(ratio - 1 > IMPLAUSIBLE_HEIGHT_SPREAD, 'a 92 cm camera move no longer crosses the threshold')
  assert(6 / 5.1 - 1 < ratio - 1, 'the boundary is not where the refusal says it is')
})

/* ------------------------------------------- the ungraded deltas ---------- */

console.log('\n\x1b[1mA reading with no band, said as a change between two serves\x1b[0m')

/**
 * A basket assembled by hand with the two fields the delta reads.
 *
 * Hand-built rather than swept, and that is the point: the rig cannot dial spine
 * lean and shoulder rotation independently per serve, and what is under test is
 * the *rule* — when a change is licensed and when posture could have faked it —
 * not whether the engine measures either well. That question is `depth.test.ts`'s
 * and is already answered there.
 */
function deltaBasket(serves: ({ deg: number | null; lean?: number } | null)[]) {
  const analyses = serves.map((s, i) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: 70,
      serves: { count: serves.length, index: i },
      diagnosis: s && {
        externalRotation: { deg: s.deg, confidence: 0.9, lever: 0.8 },
        signals: s.lean === undefined ? {} : { spine_lean_deg: s.lean },
      },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  return buildConsistency(analyses, serves.length)!
}

const erDelta = (c: ReturnType<typeof deltaBasket>) =>
  c.uncalibrated?.find((d) => d.id === 'external_rotation_deg')

check('a change bigger than the posture that could fake it is reported', () => {
  // 18° apart, and the lean differs by 4° — which buys 2° at 0.5°/°.
  const d = erDelta(deltaBasket([{ deg: 40, lean: 10 }, { deg: 58, lean: 14 }]))
  assert(!!d, 'an 18° change against a 2° bound was not reported')
  assert(d!.from === 1 && d!.to === 2, `named serves ${d!.from} and ${d!.to}, not 1 and 2`)
  assert(Math.abs(d!.delta - 18) < 1e-9, `reported a delta of ${d!.delta}`)
  assert(Math.abs(d!.bound - 2) < 1e-9, `reported a bound of ${d!.bound}`)
})

check('a change posture alone could account for is refused, not hedged', () => {
  // 6° apart with 30° of lean difference: the bound is 15°, which eats it.
  assert(
    !erDelta(deltaBasket([{ deg: 40, lean: 5 }, { deg: 46, lean: 35 }])),
    'a change smaller than its own confounder was reported anyway',
  )
})

check('a change exactly equal to its bound is refused', () => {
  // The boundary, because `>` and `>=` differ on exactly this input and nothing
  // sampling the middle of the range would ever see the difference.
  assert(
    !erDelta(deltaBasket([{ deg: 40, lean: 10 }, { deg: 50, lean: 30 }])),
    'a change exactly the size of its bound was reported',
  )
})

check('the extremes are named, not the first and last serves', () => {
  const d = erDelta(
    deltaBasket([
      { deg: 50, lean: 10 },
      { deg: 38, lean: 10 },
      { deg: 62, lean: 10 },
      { deg: 51, lean: 10 },
    ]),
  )
  assert(!!d, 'no delta from four readable serves')
  assert(d!.from === 2 && d!.to === 3, `named serves ${d!.from} and ${d!.to}, not 2 and 3`)
})

check('a serve whose trophy arm was too folded to read drops out of the comparison', () => {
  /*
   * `readExternalRotation` returns a null `deg` below `MIN_ROTATION_LEVER`, so
   * the refusal that already exists is the one that has to apply here — a second
   * lever threshold in `consistency.ts` would be one more thing to keep in step.
   */
  const d = erDelta(
    deltaBasket([{ deg: null, lean: 10 }, { deg: 40, lean: 10 }, { deg: 55, lean: 10 }]),
  )
  assert(!!d, 'two readable serves beside one unreadable one produced nothing')
  assert(d!.from === 2 && d!.to === 3, `named serves ${d!.from} and ${d!.to}, not 2 and 3`)
})

check('a serve with no lean reading is not compared at all', () => {
  // Without the lean there is no bound, and without a bound the delta is a
  // number nobody can say is not posture. `signals` omits a reading below
  // `MIN_EVIDENCE`, so this is the ordinary shape of a poorly seen trunk.
  assert(
    !erDelta(deltaBasket([{ deg: 40 }, { deg: 62 }])),
    'a delta was reported with nothing to bound it',
  )
})

check('one readable serve is not a comparison', () => {
  assert(
    !erDelta(deltaBasket([{ deg: 40, lean: 10 }, { deg: null, lean: 10 }])),
    'a single reading was reported as a change',
  )
})

check('a basket with no diagnosis at all carries no deltas field', () => {
  // The ordinary case for every report the app has ever written before this,
  // and for every hand-assembled basket in this file.
  assert(
    deltaBasket([null, null]).uncalibrated === undefined,
    'an empty list was stored where no field should be',
  )
})

/**
 * A basket carrying landing readings and nothing else the deltas look at.
 *
 * Separate from `deltaBasket` rather than a flag on it, because the two entries
 * refuse for entirely different reasons — one is bounded by a second measurement
 * and one by its own noise — and a fixture that could produce both at once would
 * make a check that meant to name one silently pass on the other.
 */
function landingBasket(offsets: (number | null)[]) {
  const analyses = offsets.map((offset, i) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: 70,
      serves: { count: offsets.length, index: i },
      diagnosis: { landing: { offset, confidence: 0.9, secondsAfterContact: 0.5 } },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  return buildConsistency(analyses, offsets.length)!
}

const landingDelta = (c: ReturnType<typeof landingBasket>) =>
  c.uncalibrated?.find((d) => d.id === 'landing_offset_ratio')

check('a landing change bigger than the reading own noise is reported', () => {
  // 0.0035 square against 0.0657 at 0.12 m is the measured range; this spans
  // most of it, and is an order of magnitude past the ~0.0053 difference noise.
  const d = landingDelta(landingBasket([0.0035, 0.0501]))
  assert(!!d, 'a change across most of the measured range was not reported')
  assert(d!.from === 1 && d!.to === 2, `named serves ${d!.from} and ${d!.to}, not 1 and 2`)
  assert(Math.abs(d!.bound - Math.hypot(0.0028, 0.0045)) < 1e-9, `bound came back ${d!.bound}`)
})

check('a landing change inside the noise on a difference is refused', () => {
  /*
   * The case the round exists to refuse, and the reason 0.0035 is the wrong
   * number to bound with. Two readings 0.0045 apart look like a real change
   * against a floor of 0.0035 and are barely one deviation of the difference
   * between two readings — which is what a delta is.
   */
  assert(
    !landingDelta(landingBasket([0.0035, 0.0080])),
    'a change smaller than the noise on a difference was reported anyway',
  )
})

check('a landing nobody could read drops out rather than counting as square', () => {
  /*
   * `readLandingBalance` returns null on all three of its own refusals — the
   * landmarks unseen, the feet out of shot, and a clip that ended before the
   * landing. A null read as zero would be the app reporting a perfectly square
   * finish for a serve it never saw the end of, which is the exact failure that
   * field's own doc comment was written about.
   */
  const d = landingDelta(landingBasket([null, 0.0035, 0.0501]))
  assert(!!d, 'two readable landings beside one unreadable one produced nothing')
  assert(d!.from === 2 && d!.to === 3, `named serves ${d!.from} and ${d!.to}, not 2 and 3`)
})

check('the two ungraded deltas are independent, and both can appear at once', () => {
  // A basket carrying both readings gets both lines. The check that matters is
  // that neither entry's refusal silences the other — they are bounded by
  // different things and have no business agreeing.
  const analyses = [
    { deg: 40, lean: 10, offset: 0.0035 },
    { deg: 58, lean: 14, offset: 0.0501 },
  ].map((s, i) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: 70,
      serves: { count: 2, index: i },
      diagnosis: {
        externalRotation: { deg: s.deg, confidence: 0.9, lever: 0.8 },
        signals: { spine_lean_deg: s.lean },
        landing: { offset: s.offset, confidence: 0.9, secondsAfterContact: 0.5 },
      },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  const c = buildConsistency(analyses, 2)!
  const ids = (c.uncalibrated ?? []).map((d) => d.id).sort()
  assert(
    JSON.stringify(ids) === JSON.stringify(['external_rotation_deg', 'landing_offset_ratio']),
    `got ${JSON.stringify(ids)}, expected both entries`,
  )
})

/* --------------------------------------------------- sweeping a basket ---- */

/*
 * The sweep loop, without a video in it.
 *
 * `analyzeAllServes` needs a decoder, an element and a real clip; `sweepServes`
 * needs none of those, which is the whole reason it was split out. Everything
 * below is about what the loop promises the screen and the panel above it: that
 * a serve is handed over the moment it lands rather than at the end, that one
 * unreadable serve costs one serve, and that stopping early leaves the player
 * with what was actually measured and no claim about anything else.
 */
console.log('\n\x1b[1mSweeping a basket, serve by serve\x1b[0m')

/** A measured serve, as far as the sweep and the comparison are concerned. */
const measuredServe = (index: number, count: number, overall = 70) => {
  const { fundamentals } = run()
  return { fundamentals, overall, serves: { count, index } } as unknown as Analysis
}

interface SweepProbe {
  result: SweepRun
  /** Serve indexes handed to `measure`, in order — what the video work costs. */
  asked: number[]
  /** Every serve streamed out, in order. */
  streamed: SweepServe[]
  /** Interleaved measure/stream events, so "streamed as it lands" is checkable. */
  log: string[]
  /** Whether anything was streamed after the sweep's promise had already settled. */
  streamedLate: boolean
}

/**
 * Run one sweep against a scripted basket.
 *
 * `unreadable` names clip-relative serve indexes that throw the way a mishit or
 * a passer-by does. `stopAfter` presses stop between serves; `stopDuring`
 * presses it while a serve is being read, which is the case that decides
 * whether an interrupted serve gets reported to the player as an unclear one.
 */
async function sweepOf(opts: {
  count: number
  unreadable?: number[]
  /** Serves read to the end and then refused by triage (L1.7). */
  refused?: number[]
  stopAfter?: number
  stopDuring?: number
  stopBefore?: boolean
}): Promise<SweepProbe> {
  const controller = new AbortController()
  const asked: number[] = []
  const streamed: SweepServe[] = []
  const log: string[] = []
  let settled = false
  let streamedLate = false

  if (opts.stopBefore) controller.abort()

  const result = await sweepServes(
    {
      count: opts.count,
      signal: controller.signal,
      onServe: (s) => {
        if (settled) streamedLate = true
        streamed.push(s)
        log.push(`serve ${s.number}${s.analysis ? '' : ' unreadable'}`)
        if (streamed.length === opts.stopAfter) controller.abort()
      },
    },
    async (serveIndex, position) => {
      asked.push(serveIndex)
      log.push(`measure ${serveIndex}`)
      if (position === opts.stopDuring) {
        // The player presses stop while this serve is being read: the abort
        // reaches the extraction, which throws on its way out.
        controller.abort()
        throw new Cancelled()
      }
      if (opts.unreadable?.includes(serveIndex)) {
        throw new NotAServeError('I could not find a serve there.', ['Trim the clip.'])
      }
      const serve = measuredServe(serveIndex, opts.count)
      if (opts.refused?.includes(serveIndex)) {
        return { ...serve, triage: { ...serve.triage, status: 'rejected', reason: 'too_blurry' } as Analysis['triage'] }
      }
      return serve
    },
  )
  settled = true

  return { result, asked, streamed, log, streamedLate }
}

const wholeBasket = await sweepOf({ count: 4 })
const longBasket = await sweepOf({ count: 10 })
const withUnreadable = await sweepOf({ count: 5, unreadable: [2] })
const withRefused = await sweepOf({ count: 5, refused: [1, 3] })
const stoppedBetweenServes = await sweepOf({ count: 6, stopAfter: 4 })
const stoppedMidServe = await sweepOf({ count: 6, stopDuring: 4 })
const stoppedAtOnce = await sweepOf({ count: 6, stopBefore: true })
const stoppedAfterOne = await sweepOf({ count: 6, stopAfter: 1 })

// The streaming contract. Each serve reaches the caller before the next one is
// started, which is what lets the screen fill in during the minute the sweep
// takes rather than showing one undifferentiated bar and then everything at
// once. Checked as an interleaving rather than a count, because a loop that
// collected the results and replayed the callbacks at the end would pass on
// counts alone and be exactly the thing this replaced.
check('each serve is handed over as it lands, before the next one starts', () => {
  assert(
    JSON.stringify(wholeBasket.log) ===
      JSON.stringify(['measure 0', 'serve 1', 'measure 1', 'serve 2', 'measure 2', 'serve 3', 'measure 3', 'serve 4']),
    `serves did not stream one at a time: ${JSON.stringify(wholeBasket.log)}`,
  )
  assert(!wholeBasket.streamedLate, 'a serve was streamed after the sweep had already finished')
  assert(
    wholeBasket.streamed.every((s) => s.analysis !== undefined),
    'a readable serve was streamed without its measurement',
  )
})

check('a streamed serve carries its number in the clip, not its place in the sweep', () => {
  assert(
    JSON.stringify(longBasket.streamed.map((s) => s.number)) === JSON.stringify([5, 6, 7, 8, 9, 10]),
    `streamed the serves as ${JSON.stringify(longBasket.streamed.map((s) => s.number))}, expected 5–10`,
  )
})

// The cap decides how many, and the window decides which. A clip of ten is
// swept from serve five, not serve one: the last six are the ones the report on
// screen came from and the ones hit after the player had settled.
check('a long basket is swept from the end, up to the cap', () => {
  const { first, total } = sweepWindow(10)
  assert(total === MAX_CONSISTENCY_SERVES, `swept ${total} serves of ten, expected the cap`)
  assert(first === 10 - MAX_CONSISTENCY_SERVES, `started at serve ${first + 1}`)
  assert(
    JSON.stringify(longBasket.asked) === JSON.stringify([4, 5, 6, 7, 8, 9]),
    `measured serve indexes ${JSON.stringify(longBasket.asked)}`,
  )
  assert(longBasket.result.attempted === total, `attempted ${longBasket.result.attempted} of ${total}`)
})

check('one unreadable serve costs one serve, not the sweep', () => {
  assert(withUnreadable.result.serves.length === 4, `kept ${withUnreadable.result.serves.length} of 5`)
  assert(withUnreadable.result.attempted === 5, `attempted ${withUnreadable.result.attempted}, expected 5`)
  const empty = withUnreadable.streamed.filter((s) => s.analysis === undefined)
  assert(empty.length === 1, `streamed ${empty.length} empty slots, expected 1`)
  assert(empty[0].number === 3, `the empty slot was labelled serve ${empty[0].number}, expected 3`)
  const c = buildConsistency(withUnreadable.result.serves, withUnreadable.result.attempted)
  assert(c!.skipped === 1, `reported ${c!.skipped} serves as too unclear, expected 1`)
})

check('a serve the engine refused is an unclear one, not a score (L1.7)', () => {
  // Read to the end and then refused by triage. Its numbers were not believed,
  // so they must reach no chip, spread or best-against-worst.
  assert(withRefused.result.serves.length === 3, `kept ${withRefused.result.serves.length} of 5, expected 3`)
  assert(withRefused.result.attempted === 5, `attempted ${withRefused.result.attempted}, expected 5`)
  assert(
    withRefused.result.serves.every((s) => s.triage?.status !== 'rejected'),
    'a refused serve reached the comparison',
  )
  const empty = withRefused.streamed.filter((s) => s.analysis === undefined).map((s) => s.number)
  assert(JSON.stringify(empty) === JSON.stringify([2, 4]), `the empty slots were ${JSON.stringify(empty)}, expected [2,4]`)
  const c = buildConsistency(withRefused.result.serves, withRefused.result.attempted)
  assert(c!.skipped === 2, `reported ${c!.skipped} serves as too unclear, expected 2`)
})

check('a sweep with nothing to compare leaves the report, with one line saying why (L1.7)', () => {
  const a = sampleAnalysis()
  for (const readable of [0, 1]) {
    const kept = withoutComparison(a, readable)
    assert(kept.id === a.id && kept.overall === a.overall, 'the report was replaced')
    assert(kept.consistency === undefined, 'a comparison appeared from nowhere')
    const added = kept.quality.warnings.slice(a.quality.warnings.length)
    assert(added.length === 1, `added ${added.length} lines`)
    assert(cueIssues(added[0]).length === 0, `"${added[0]}": ${cueIssues(added[0]).join('; ')}`)
    assert(added[0].includes('compare') || added[0].includes('alone'), `the line does not say why: "${added[0]}"`)
  }
  assert(a.quality.warnings.length === sampleAnalysis().quality.warnings.length, 'the original report was changed')
})

/*
 * A stopped sweep is worth what it measured.
 *
 * It used to be worth nothing: cancellation threw out of the loop and the
 * player who stopped after four of six serves — four full analysis passes, the
 * most expensive work this app does — got the report back with no comparison on
 * it at all. (Four passes, not a number of seconds: nothing in this tree times
 * one, and `measure` below returns instantly.)
 */
check('stopping between serves keeps every serve already measured', () => {
  const r = stoppedBetweenServes.result
  assert(r.serves.length === 4, `kept ${r.serves.length} serves of the four measured`)
  assert(r.cancelled, 'a stopped sweep did not report itself as stopped')
  assert(
    stoppedBetweenServes.asked.length === 4,
    `kept measuring after the stop: ${stoppedBetweenServes.asked.length} serves read`,
  )
  const c = buildConsistency(r.serves, r.attempted)
  assert(c !== undefined, 'four measured serves produced no comparison')
  assert(c!.serves === 4, `compared ${c!.serves} serves`)
})

// The one that decides whether the panel lies. `skipped` is shown to the player
// as "too unclear to measure", and a serve whose read was interrupted was not
// unclear — nothing ever finished looking at it. Counting it would put a
// sentence about the camera and the player on screen off the back of the player
// pressing stop.
check('a serve interrupted mid-read is never reported as one too unclear to measure', () => {
  const r = stoppedMidServe.result
  assert(r.cancelled, 'a sweep stopped mid-serve did not report itself as stopped')
  assert(r.serves.length === 4, `measured ${r.serves.length} serves before the stop, expected 4`)
  assert(r.attempted === 4, `counted ${r.attempted} serves as attempted, expected 4`)
  assert(
    stoppedMidServe.streamed.length === 4,
    `streamed ${stoppedMidServe.streamed.length} slots, expected 4 — the interrupted serve is not one`,
  )
  const c = buildConsistency(r.serves, r.attempted)
  assert(c!.skipped === 0, `blamed the clip for ${c!.skipped} serves the player stopped`)
})

check('a sweep stopped before it starts measures nothing and claims nothing', () => {
  const r = stoppedAtOnce.result
  assert(stoppedAtOnce.asked.length === 0, `read ${stoppedAtOnce.asked.length} serves after being stopped`)
  assert(r.serves.length === 0 && r.attempted === 0, `came back with ${r.serves.length} serves`)
  assert(r.cancelled, 'did not report itself as stopped')
})

// Below two serves there is no spread to compare — one reading has a max equal
// to its min, which would score a perfect 100 for repeatability off a sample
// containing no repetition. The screen offering to compare must agree with the
// function that refuses to.
check('one measured serve is not passed off as a comparison', () => {
  const r = stoppedAfterOne.result
  assert(r.serves.length === 1, `measured ${r.serves.length} serves`)
  assert(r.serves.length < MIN_COMPARABLE_SERVES, 'one serve is not below the comparison floor')
  assert(
    buildConsistency(r.serves, r.attempted) === undefined,
    'a single serve produced a comparison',
  )
})

/* ------------------------------------------------------ noisy tracking ---- */

console.log('\n\x1b[1mHolding up against noisy tracking\x1b[0m')

/** Roughly what MediaPipe gives you on a decent phone clip, and worse. */
const REALISTIC_NOISE = 0.006
const BAD_NOISE = 0.015

check('keyframes survive realistic landmark jitter', () => {
  const clean = run()
  const noisy = run({ noise: REALISTIC_NOISE })
  for (const key of ['toss', 'trophy', 'drop', 'contact'] as const) {
    const drift = Math.abs(noisy.skel.keys[key] - clean.skel.keys[key])
    assert(drift <= 4, `${key} moved ${drift} frames under jitter`)
  }
})

check('keyframes stay in order even when tracking is poor', () => {
  const { skel } = run({ noise: BAD_NOISE })
  const k = skel.keys
  assert(
    k.ready <= k.toss && k.toss <= k.trophy && k.trophy <= k.drop && k.drop <= k.contact,
    `out of order under heavy noise: ${JSON.stringify(k)}`,
  )
})

check('a noisy serve is still recognised as a serve', () => {
  for (const noise of [REALISTIC_NOISE, BAD_NOISE]) {
    const frames = buildServe({ noise }, FPS)
    detectServe(frames, FPS) // throws NotAServeError if it cannot read it
  }
})

check('handedness is not confused by jitter', () => {
  for (const noise of [REALISTIC_NOISE, BAD_NOISE]) {
    assert(run({ noise }).skel.racket === 'right', `misread the racket hand at noise ${noise}`)
  }
})

check('measurements do not lurch under realistic jitter', () => {
  const clean = run()
  const noisy = run({ noise: REALISTIC_NOISE })
  for (const id of ['contactHeight', 'kneeBend', 'dropDepth', 'armExtension', 'shoulderTilt']) {
    const a = metric(clean.fundamentals, id).value
    const b = metric(noisy.fundamentals, id).value
    const drift = Math.abs(a - b) / Math.max(1e-6, Math.abs(a))
    assert(drift < 0.2, `${id} moved ${(drift * 100).toFixed(0)}% under jitter (${a} → ${b})`)
  }
})

check('scores stay in the same band under realistic jitter', () => {
  const clean = run()
  const noisy = run({ noise: REALISTIC_NOISE })
  for (const f of clean.fundamentals) {
    const other = noisy.fundamentals.find((x) => x.id === f.id)!
    assert(
      Math.abs(f.score - other.score) <= 15,
      `${f.label} swung ${Math.abs(f.score - other.score)} points on jitter alone`,
    )
  }
})

check('noise scatters the measurements without skewing them', () => {
  // Averaged over independent noise draws, error should cancel. Testing a
  // single draw cannot tell bias from luck: hold the seed and vary only the
  // amplitude and every landmark slides along its own straight line, which
  // reads as a clean systematic trend and is nothing of the sort.
  const truth = run()
  const N = 16
  const errors: Record<string, number[]> = {}

  for (let s = 0; s < N; s++) {
    const { fundamentals } = run({ noise: REALISTIC_NOISE, seed: 1000 + s * 7919 })
    for (const id of ['contactHeight', 'dropDepth', 'kneeBend']) {
      const want = metric(truth.fundamentals, id).value
      const got = metric(fundamentals, id).value
      ;(errors[id] ??= []).push(((got - want) / Math.abs(want)) * 100)
    }
  }

  for (const [id, errs] of Object.entries(errors)) {
    const bias = errs.reduce((a, b) => a + b, 0) / errs.length
    assert(Math.abs(bias) < 2.5, `${id} is skewed by ${bias.toFixed(2)}% under noise, not just scattered`)
  }
})

check('a straight arm is not reported as bent just because tracking is noisy', () => {
  // 180° is a ceiling, so jitter on a nearly-straight limb can only bend it and
  // the error cannot cancel. Arm extension drives a "your arm is bent at
  // contact" instruction, so this bias would put words in the coach's mouth.
  const truth = metric(run().fundamentals, 'armExtension').value
  const N = 16
  let total = 0
  for (let s = 0; s < N; s++) {
    total += metric(run({ noise: REALISTIC_NOISE, seed: 500 + s * 5657 }).fundamentals, 'armExtension').value
  }
  const bias = total / N - truth
  assert(Math.abs(bias) < 2, `arm extension reads ${bias.toFixed(2)}° off on noise alone`)
})

check('the trophy does not lurch under moderate jitter', () => {
  // Knee angle is the noisiest series in the engine — three separately
  // jittering points feeding one derived number — and its minimum is broad, so
  // this is where noise does the most damage if the smoothing is wrong.
  const clean = run()
  for (const noise of [0.004, 0.008, 0.012, 0.02]) {
    const drift = Math.abs(run({ noise }).skel.keys.trophy - clean.skel.keys.trophy)
    assert(drift <= 3, `trophy moved ${drift} frames at noise ${noise}`)
  }
})

check('a limb the tracker keeps losing lowers confidence and is called out', () => {
  const frames = buildServe({ dropout: 0.45 }, FPS)
  const skel = detectServe(frames, FPS)
  const q = assessQuality(frames, skel, FPS)
  assert(q.confidence < 0.95, `confidence ${q.confidence.toFixed(2)} despite losing a leg`)
  assert(q.warnings.length > 0, 'said nothing about repeatedly losing a limb')
})

/* --------------------------------------------------- quality and focus ---- */

console.log('\n\x1b[1mConfidence and focus\x1b[0m')

check('a clean, well-framed serve is reported as high confidence', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const q = assessQuality(frames, skel, FPS)
  assert(q.confidence > 0.8, `confidence only ${q.confidence.toFixed(2)} on a clean serve`)
  assert(q.warnings.length === 0, `warned about a clean serve: ${q.warnings.join(' / ')}`)
  assert(q.view === 'side', `classified a side-on serve as ${q.view}`)
})

check('a face-on camera is classified as such', () => {
  const frames = buildServe({ cameraYaw: 5 }, FPS)
  const skel = detectServe(frames, FPS)
  assert(assessQuality(frames, skel, FPS).view === 'front-back', 'face-on read as side-on')
})

check('too few frames through the swing is flagged, not hidden', () => {
  // A low frame rate leaves barely any samples between the drop and contact.
  const frames = buildServe({}, 12)
  const skel = detectServe(frames, 12)
  const q = assessQuality(frames, skel, 12)
  assert(q.swingSamples < 4, `expected a sparse swing, got ${q.swingSamples} samples`)
  assert(
    q.warnings.some((w) => /slow motion|frames/i.test(w)),
    `no warning about the frame rate: ${q.warnings.join(' / ')}`,
  )

  // Sparse sampling costs precision on the swing timing but leaves the joint
  // angles and heights intact, so it should lower confidence without gutting
  // it — the warning is what says specifically which number went soft.
  const dense = buildServe({}, 50)
  const denseQ = assessQuality(dense, detectServe(dense, 50), 50)
  assert(
    q.confidence < denseQ.confidence,
    `sparse (${q.confidence.toFixed(2)}) was not below dense (${denseQ.confidence.toFixed(2)})`,
  )
})

check('confidence always lands between 0 and 1', () => {
  for (const fps of [12, 24, 50]) {
    for (const dials of [{}, { cameraYaw: 20 }, { contactReach: 1.6 }] as Partial<ServeDials>[]) {
      const frames = buildServe(dials, fps)
      const q = assessQuality(frames, detectServe(frames, fps), fps)
      within(q.confidence, 0, 1, `confidence at ${fps}fps`)
    }
  }
})

check('the focus is the weakest measurement, with its fix and a drill', () => {
  const { fundamentals } = run({ trophyKneeAngle: 177 })
  const focus = pickFocus(fundamentals)
  const weakest = fundamentals
    .flatMap((f) => f.metrics)
    .sort((a, b) => a.score - b.score)[0]
  assert(focus.title === weakest.label, `focus was ${focus.title}, weakest is ${weakest.label}`)
  assert(focus.why.length > 20, 'focus has no explanation')
  assert(Boolean(focus.drill.name), 'focus offers no drill')
})

check('a serve with nothing wrong is told to keep going, not given a fault', () => {
  const perfect = run().fundamentals.map((f) => ({
    ...f,
    metrics: f.metrics.map((m) => ({ ...m, score: 95, status: 'great' as const, fix: undefined })),
  }))
  const focus = pickFocus(perfect)
  assert(/keep/i.test(focus.title), `invented a fault on a flawless serve: "${focus.title}"`)
})

/* -------------------------------------------------------------- progress --- */

console.log('\n\x1b[1mProgress across sessions\x1b[0m')

/** A stored report carrying only what the progress logic reads. */
function progressSession(
  createdAt: number,
  overall: number,
  areas: Record<string, number> = { toss: 70, loading: 70, swing: 70, contact: 70, rhythm: 70 },
): Parameters<typeof buildProgress>[0][number] {
  return {
    id: `p-${createdAt}`,
    createdAt,
    overall,
    overallStatus: statusOf(overall),
    fundamentals: Object.entries(areas).map(([id, score]) => ({ id, score, metrics: [] })),
  } as unknown as Parameters<typeof buildProgress>[0][number]
}

check('says nothing when there is no history', () => {
  assert(buildProgress([]) === undefined, 'produced a trend from nothing')
})

check('orders sessions oldest first, whatever order they arrive in', () => {
  // listSessions hands back newest first; a chart must read left to right.
  const p = buildProgress([
    progressSession(3 * DAY, 80),
    progressSession(DAY, 60),
    progressSession(2 * DAY, 70),
  ])
  assert(
    p!.points.every((pt, i) => i === 0 || pt.createdAt > p!.points[i - 1].createdAt),
    `not chronological: ${p!.points.map((x) => x.createdAt / DAY)}`,
  )
  assert(p!.latest.overall === 80, `latest was ${p!.latest.overall}`)
  assert(p!.previous!.overall === 70, `previous was ${p!.previous!.overall}`)
})

check('reports the change against the previous serve', () => {
  const p = buildProgress([progressSession(DAY, 62), progressSession(2 * DAY, 71)])
  assert(p!.overallDelta === 9, `expected +9, got ${p!.overallDelta}`)
})

check('has no delta to report from a single session', () => {
  const p = buildProgress([progressSession(DAY, 62)])
  assert(p!.overallDelta === undefined, 'invented a delta from one session')
  assert(p!.areaDeltas.length === 0, 'invented per-area deltas from one session')
})

check('tracks the best score, not just the latest', () => {
  const p = buildProgress([
    progressSession(DAY, 62),
    progressSession(2 * DAY, 88),
    progressSession(3 * DAY, 71),
  ])
  assert(p!.best === 88, `best was ${p!.best}`)
  assert(p!.latest.overall === 71, 'latest was overwritten by best')
})

check('averages the recent few rather than trusting one serve', () => {
  const p = buildProgress([
    progressSession(DAY, 40),
    progressSession(2 * DAY, 70),
    progressSession(3 * DAY, 74),
    progressSession(4 * DAY, 78),
  ])
  // mean of the last three: 70, 74, 78
  assert(p!.recentAverage === 74, `expected 74, got ${p!.recentAverage}`)
})

check('reads real improvement in the rolling average', () => {
  const p = buildProgress(
    [50, 52, 68, 72, 76].map((s, i) => progressSession((i + 1) * DAY, s)),
  )
  // last three (68,72,76) against the two before (50,52)
  assert(p!.formDelta === 21, `expected +21, got ${p!.formDelta}`)
})

check('per-area deltas compare like with like', () => {
  const p = buildProgress([
    progressSession(DAY, 65, { toss: 60, swing: 70 }),
    progressSession(2 * DAY, 75, { toss: 72, swing: 66 }),
  ])
  const byId = Object.fromEntries(p!.areaDeltas.map((d) => [d.id, d.delta]))
  assert(byId.toss === 12, `toss delta ${byId.toss}`)
  assert(byId.swing === -4, `swing delta ${byId.swing}`)
})

check('skips an area the previous session did not measure', () => {
  const p = buildProgress([
    progressSession(DAY, 65, { toss: 60 }),
    progressSession(2 * DAY, 75, { toss: 72, swing: 66 }),
  ])
  assert(
    p!.areaDeltas.every((d) => d.id !== 'swing'),
    'compared an area that has no earlier reading',
  )
})

check('treats a change under the threshold as noise', () => {
  const line = REAL_CHANGE.overall
  assert(deltaStatus(0, 'overall') === 'flat', '0 was not flat')
  assert(deltaStatus(line - 1, 'overall') === 'flat', 'just under the threshold was not flat')
  assert(deltaStatus(-(line - 1), 'overall') === 'flat', 'small decline was not flat')
  assert(deltaStatus(line, 'overall') === 'great', 'a real gain was called noise')
  assert(deltaStatus(-line, 'overall') === 'work', 'a real decline was called noise')
  assert(deltaStatus(line, 'overall', false) === 'soft', 'a gain between serves read differently was claimed')
  // Each area is held to its own line, not the overall's.
  assert(deltaStatus(line, 'contact') === 'flat', 'a contact change the camera makes was called real')
})

check('report deltas need a previous report to compare against', () => {
  const fundamentals = [{ id: 'toss', score: 80, metrics: [] }] as unknown as Parameters<typeof deltasAgainst>[0]
  assert(Object.keys(deltasAgainst(fundamentals, undefined)).length === 0, 'compared against nothing')
  const prev = progressSession(DAY, 70, { toss: 66 })
  assert(deltasAgainst(fundamentals, prev).toss?.delta === 14, 'wrong per-area delta on the report')
})

/* ------------------------------------------------------ stored reports ---- */

console.log('\n\x1b[1mReading reports written by older versions\x1b[0m')

const goodStored = () => ({
  id: 'a',
  createdAt: 1,
  overall: 71,
  overallStatus: 'good',
  handedness: 'right',
  phases: [],
  window: { start: 0, end: 2 },
  serves: { count: 1, index: 0 },
  video: { name: 'x', durationMs: 0, width: 0, height: 0 },
  quality: { confidence: 0.8, warnings: [], view: 'side', sampledFps: 30, swingSamples: 5 },
  focus: { title: 'x', why: 'y', drill: { name: 'd', how: 'h', reps: 'r' } },
  fundamentals: [
    {
      id: 'toss',
      label: 'Toss',
      score: 71,
      status: 'good',
      metrics: [{ id: 'releaseHeight', label: 'Release height', score: 71 }],
      drill: { name: 'd', how: 'h', reps: 'r' },
    },
  ],
})

check('a well-formed report passes through unchanged', () => {
  const out = normalise(goodStored())
  assert(Boolean(out), 'rejected a valid report')
  assert(out!.fundamentals[0].metrics.length === 1, 'lost a measurement')
})

check('rejects things that are not reports at all', () => {
  for (const junk of [null, undefined, 42, 'report', [], {}]) {
    assert(normalise(junk) === undefined, `accepted ${JSON.stringify(junk)}`)
  }
})

check('rejects a report with nothing measured in it', () => {
  assert(normalise({ ...goodStored(), fundamentals: [] }) === undefined, 'accepted an empty report')
})

check('fills in fields added by later versions', () => {
  const legacy = goodStored() as Record<string, unknown>
  delete legacy.serves
  delete legacy.window
  delete legacy.quality
  const out = normalise(legacy)
  assert(Boolean(out), 'dropped a report that predates newer fields')
  assert(out!.serves.count === 1, 'did not default the serve count')
  assert(Boolean(out!.quality), 'did not default the quality block')
})

check('repairs an area whose measurements are missing', () => {
  // This exact shape passed the old checks and then threw during render.
  const broken = goodStored()
  ;(broken.fundamentals[0] as Record<string, unknown>).metrics = null
  const out = normalise(broken)
  assert(Boolean(out), 'dropped a report that could have been repaired')
  assert(Array.isArray(out!.fundamentals[0].metrics), 'metrics is still not an array')
  assert(out!.fundamentals[0].metrics.length === 0, 'invented measurements')
})

check('drops individual measurements that are malformed', () => {
  const broken = goodStored()
  broken.fundamentals[0].metrics = [
    { id: 'releaseHeight', label: 'Release height', score: 71 },
    { label: 'no id' },
    { id: 'noScore' },
    null,
  ] as never
  const out = normalise(broken)
  assert(out!.fundamentals[0].metrics.length === 1, `kept ${out!.fundamentals[0].metrics.length}`)
})

check('drops an area with no usable identity', () => {
  const broken = goodStored()
  broken.fundamentals = [{ label: 'nameless' }, ...broken.fundamentals] as never
  const out = normalise(broken)
  assert(out!.fundamentals.length === 1, `kept ${out!.fundamentals.length} areas`)
})

/* --------------------------------------------------------- session keys --- */

console.log('\n\x1b[1mIdentifying a serve across re-analyses\x1b[0m')

const clipA = { name: 'serve.mp4', size: 4_200_000, lastModified: 1_700_000_000_000 }
const clipB = { name: 'serve.mp4', size: 4_200_001, lastModified: 1_700_000_000_000 }

check('the same serve keeps the same id however often it is re-read', () => {
  assert(
    sessionKeyFor(clipA, 0) === sessionKeyFor(clipA, 0),
    'a re-analysis would have been filed as a separate report',
  )
})

check('different serves in one clip get different ids', () => {
  assert(sessionKeyFor(clipA, 0) !== sessionKeyFor(clipA, 1), 'serves 1 and 2 collided')
})

check('different clips get different ids even with the same filename', () => {
  assert(sessionKeyFor(clipA, 0) !== sessionKeyFor(clipB, 0), 'two different clips collided')
})

check('ids are safe to use as storage keys', () => {
  for (const clip of [clipA, clipB, { name: 'a b/c:d?.mov', size: 1, lastModified: 0 }]) {
    const key = sessionKeyFor(clip, 3)
    assert(/^serve-[a-z0-9]+-3$/.test(key), `unexpected key shape: ${key}`)
  }
})

/* ----------------------------------------------------------- practice ----- */

console.log('\n\x1b[1mWhat to practise, across sessions\x1b[0m')

/**
 * A stored session carrying only what the practice logic reads. Each entry is
 * `[metricId, label, fundamental, score]`.
 */
function sessionWith(
  createdAt: number,
  metrics: [string, string, string, number][],
): Parameters<typeof findPracticeFocus>[0][number] {
  const byFundamental = new Map<string, { id: string; label: string; score: number }[]>()
  for (const [id, label, fundamental, score] of metrics) {
    const list = byFundamental.get(fundamental) ?? []
    list.push({ id, label, score })
    byFundamental.set(fundamental, list)
  }
  return {
    id: `s-${createdAt}`,
    createdAt,
    fundamentals: [...byFundamental.entries()].map(([id, list]) => ({
      id,
      metrics: list.map((m) => ({ ...m, fix: `fix ${m.id}` })),
    })),
  } as unknown as Parameters<typeof findPracticeFocus>[0][number]
}

/** Sessions where racket drop is always poor and everything else is fine. */
const persistentWeakness = (dropScores: number[]) =>
  dropScores.map((drop, i) =>
    sessionWith(i * DAY, [
      ['dropDepth', 'Racket drop', 'swing', drop],
      ['contactHeight', 'Contact height', 'contact', 88],
      ['kneeBend', 'Knee bend at trophy', 'loading', 90],
    ]),
  )

check('says nothing from a single session', () => {
  assert(findPracticeFocus(persistentWeakness([40])) === undefined, 'advised from one session')
})

check('names the persistently weakest measurement', () => {
  const f = findPracticeFocus(persistentWeakness([42, 45, 41, 44, 43]))
  assert(Boolean(f), 'no practice focus found')
  assert(f!.metricId === 'dropDepth', `picked ${f!.metricId} instead of dropDepth`)
  assert(f!.fundamentalLabel === 'Swing', `wrong fundamental: ${f!.fundamentalLabel}`)
  assert(Boolean(f!.drill.name), 'no drill attached')
})

check('prefers the lowest average over whoever lost the latest report', () => {
  // Contact dips once, but racket drop is worse every single time.
  const sessions = [
    sessionWith(0, [['dropDepth', 'Racket drop', 'swing', 40], ['contactHeight', 'Contact height', 'contact', 85]]),
    sessionWith(DAY, [['dropDepth', 'Racket drop', 'swing', 42], ['contactHeight', 'Contact height', 'contact', 86]]),
    sessionWith(2 * DAY, [['dropDepth', 'Racket drop', 'swing', 44], ['contactHeight', 'Contact height', 'contact', 38]]),
  ]
  const f = findPracticeFocus(sessions)
  assert(f!.metricId === 'dropDepth', `latest bad serve hijacked the advice: got ${f!.metricId}`)
})

check('the practice card hands out the rung of the ladder the plan would (L1.4)', () => {
  // The racket drop is `shallow_drop`'s number, so its drill is that ladder's,
  // on the rung the report's plan starts at, or the one the player moved to.
  const ladder = progressionFor('shallow_drop')!
  const start = findPracticeFocus(persistentWeakness([42, 45, 41, 44, 43]))!
  assert(start.drill === ladder.steps[rungFor('shallow_drop', ladder)], `handed out ${start.drill.name}`)
  const moved = findPracticeFocus(persistentWeakness([42, 45, 41, 44, 43]), undefined, undefined, undefined, {
    shallow_drop: 1,
  })!
  assert(moved.drill === ladder.steps[1], `ignored the rung the player moved to: ${moved.drill.name}`)
})

check('a kick history is handed the kick drill (L1.4)', () => {
  // Contact in front has its own kick exercise; the flat one walks contact
  // forward, which a kick struck too far in front does not need.
  const kick = [0, 1, 2].map((i) => ({
    ...sessionWith(i * DAY, [
      ['contactAhead', 'Contact point in front', 'contact', 40],
      ['kneeBend', 'Knee bend at trophy', 'loading', 90],
    ]),
    serveType: 'kick' as const,
  }))
  const f = findPracticeFocus(kick)!
  assert(f.metricId === 'contactAhead', `focus was ${f.metricId}`)
  assert(f.drill === metricCopy('contactAhead', 'kick').drill, `a kick player got "${f.drill.name}"`)
  assert(f.drill !== METRICS.contactAhead.drill, 'the flat drill reached a kick history')
})

check('counts how often it was the weakest link', () => {
  const f = findPracticeFocus(persistentWeakness([42, 45, 41, 44, 43]))
  assert(f!.timesWeakest === 5, `expected 5, got ${f!.timesWeakest}`)
  assert(f!.sessionsConsidered === 5, `considered ${f!.sessionsConsidered}`)
})

check('reads a genuine improvement as improving', () => {
  // Past the racket drop's own line for two serves a side (`ROW_CHANGE`):
  // the camera moves that row a long way on a serve whose drop collapses.
  const f = findPracticeFocus(persistentWeakness([20, 24, 50, 70, 80]))
  assert(f!.verdict === 'improving', `verdict was ${f!.verdict} (trend ${f!.trend})`)
  assert(practiceHeadline(f!).includes('right direction'), 'headline does not acknowledge progress')
})

check('a move the camera makes on its own is not progress', () => {
  // 32 against 55 on two serves a side: twenty-three points, which this row's
  // mean moves on noise alone one time in ten (L3.1).
  const f = findPracticeFocus(persistentWeakness([30, 34, 42, 52, 58]))
  assert(f!.trend === 23, `trend ${f!.trend}`)
  assert(f!.verdict === 'stuck', `a move inside the row's noise read as ${f!.verdict}`)
})

/**
 * The same sessions, each carrying a stored basket whose least steady element is
 * named. `weakestId` is what that basket's spread ranking put first.
 */
const withBaskets = (
  sessions: ReturnType<typeof persistentWeakness>,
  weakestId: string,
  weakestLabel: string,
) =>
  sessions.map((s, i) => ({
    ...s,
    consistency: {
      serves: 4,
      overallScores: [70, 64, 68, 61],
      serveNumbers: [1, 2, 3, 4],
      metrics: [],
      weakest: { id: weakestId, label: weakestLabel },
      score: 70 + i,
      status: 'fair',
      skipped: 0,
    },
  })) as unknown as Parameters<typeof findPracticeFocus>[0]

check('what to groove is carried alongside what to fix', () => {
  // The whole point of the field: contact height scores 88 across every session,
  // so nothing that ranks by score can ever mention it — and it is the element
  // that wanders most, basket after basket, which for a club player is usually
  // what is actually costing them the point.
  const f = findPracticeFocus(
    withBaskets(persistentWeakness([42, 45, 41, 44, 43]), 'contactHeight', 'Contact height'),
  )
  assert(f!.metricId === 'dropDepth', `focus moved to ${f!.metricId}`)
  assert(f!.repeatability !== undefined, 'the recurring wanderer was not carried')
  assert(f!.repeatability!.id === 'contactHeight', `carried ${f!.repeatability!.id}`)
  assert(f!.repeatability!.same === false, 'called it the same measurement as the focus')
  const note = repeatabilityNote(f!)
  assert(note.toLowerCase().includes('contact height'), `note does not name it: ${note}`)
})

check('the same measurement failing both tests is said once, not twice', () => {
  const f = findPracticeFocus(
    withBaskets(persistentWeakness([42, 45, 41, 44, 43]), 'dropDepth', 'Racket drop'),
  )
  assert(f!.repeatability!.same === true, 'did not notice it is the focus measurement')
  const note = repeatabilityNote(f!)
  assert(note.length > 0, 'said nothing about the strongest case it can make')
  assert(
    !note.toLowerCase().includes('racket drop'),
    `named the measurement a second time in the same card: ${note}`,
  )
})

check('a history with no baskets in it says nothing about repeatability', () => {
  // Every report before the sweep was stored, and every player who films one
  // serve at a time. The line has to be absent rather than hedged.
  const f = findPracticeFocus(persistentWeakness([42, 45, 41, 44, 43]))
  assert(f!.repeatability === undefined, 'invented a wanderer from no baskets')
  assert(repeatabilityNote(f!) === '', 'printed a line with nothing behind it')
})

/** Drill records for a measurement, all inside the window. */
const drilledLogs = (metricId: string, times: number) =>
  Array.from({ length: times }, (_, i) => ({
    id: `${metricId}-${i}`,
    metricId,
    drill: 'Let the racket fall',
    assignedAt: (i + 1) * DAY,
    doneAt: (i + 1) * DAY,
  }))

check('drilled and not moving reads differently from never drilled', () => {
  /*
   * The whole reason the record exists. Both of these players have a racket
   * drop stuck in the low forties across five serves; one has done the drill
   * four times and one has never logged it, and telling the first to spend more
   * time here is the wrong instruction — repeated long enough, it is how
   * somebody stops opening the app.
   */
  const sessions = persistentWeakness([42, 45, 41, 44, 43])
  const drilled = findPracticeFocus(sessions, undefined, undefined, drilledLogs('dropDepth', 4))!
  const never = findPracticeFocus(sessions, undefined, undefined, [])!

  assert(drilled.drilled === 4, `counted ${drilled.drilled} drills`)
  assert(never.drilled === 0, `counted ${never.drilled} drills on a player who logged none`)
  assert(
    practiceHeadline(drilled) !== practiceHeadline(never),
    'the two say the same thing, which is the defect this record exists to fix',
  )
  assert(practiceHeadline(drilled).includes('coach'), `drilled-and-stuck: ${practiceHeadline(drilled)}`)
})

check('the drill count is said the way somebody would say it', () => {
  // `voice.ts` lints length, hedging and lab jargon and has no opinion about
  // grammar, so "drilled it 1 times" cleared every check the build makes and
  // reached a real screen.
  const sessions = persistentWeakness([42, 45, 41, 44, 43])
  const said = (n: number) =>
    practiceHeadline(findPracticeFocus(sessions, undefined, undefined, drilledLogs('dropDepth', n))!)
  assert(said(1).includes('once'), said(1))
  assert(said(2).includes('twice'), said(2))
  assert(said(5).includes('5 times'), said(5))
  for (const n of [1, 2, 3]) {
    assert(!said(n).includes(`${n} times`) || n > 2, `said "${n} times": ${said(n)}`)
  }
})

check('a history with no records says nothing about whether they drilled', () => {
  // Every history from before the button existed, and every player who has
  // never used it. Reading that as "has not been drilling" would be the app
  // inventing a fact about somebody out of its own missing feature.
  const sessions = persistentWeakness([42, 45, 41, 44, 43])
  const unknown = findPracticeFocus(sessions)!
  const never = findPracticeFocus(sessions, undefined, undefined, [])!
  assert(unknown.drilled === undefined, `claimed ${unknown.drilled} drills from no records at all`)
  assert(
    practiceHeadline(unknown) !== practiceHeadline(never),
    'told a player with no records the same thing as one who logged nothing',
  )
})

check('drills done before this run started are not evidence about it', () => {
  // The claim on the card is about this window of sessions. A drill done last
  // winter says nothing about a measurement that has been flat since May.
  const sessions = persistentWeakness([42, 45, 41, 44, 43])
  const stale = [{ id: 'old', metricId: 'dropDepth', drill: 'x', assignedAt: -DAY, doneAt: -DAY }]
  const f = findPracticeFocus(sessions, undefined, undefined, stale)!
  assert(f.drilled === 0, `counted ${f.drilled} drills from before the window`)
})

check('a drill for something else is not credited to the focus', () => {
  const sessions = persistentWeakness([42, 45, 41, 44, 43])
  const f = findPracticeFocus(sessions, undefined, undefined, drilledLogs('kneeBend', 3))!
  assert(f.metricId === 'dropDepth', `focus was ${f.metricId}`)
  assert(f.drilled === 0, `credited ${f.drilled} knee-bend drills to the racket drop`)
})

check('reads a flat run as stuck', () => {
  const f = findPracticeFocus(persistentWeakness([44, 43, 45, 44, 43]))
  assert(f!.verdict === 'stuck', `verdict was ${f!.verdict} (trend ${f!.trend})`)
})

check('reads a decline as slipping', () => {
  const f = findPracticeFocus(persistentWeakness([80, 74, 50, 30, 20]))
  assert(f!.verdict === 'slipping', `verdict was ${f!.verdict} (trend ${f!.trend})`)
  assert(practiceHeadline(f!).includes('backwards'), 'headline does not flag the decline')
})

check('ignores a measurement that is not in every session', () => {
  // contactAhead is only present twice and is terrible; it must not be chosen
  // over a metric measured consistently across all three.
  const sessions = [
    sessionWith(0, [['dropDepth', 'Racket drop', 'swing', 55], ['contactAhead', 'Contact point in front', 'contact', 10]]),
    sessionWith(DAY, [['dropDepth', 'Racket drop', 'swing', 56], ['contactAhead', 'Contact point in front', 'contact', 12]]),
    sessionWith(2 * DAY, [['dropDepth', 'Racket drop', 'swing', 57]]),
  ]
  const f = findPracticeFocus(sessions)
  assert(f!.metricId === 'dropDepth', `chose the intermittent metric: ${f!.metricId}`)
})

check('only looks at the most recent sessions', () => {
  // Ten sessions: an old problem long since fixed, and a current one.
  const old = Array.from({ length: 5 }, (_, i) =>
    sessionWith(i * DAY, [['kneeBend', 'Knee bend at trophy', 'loading', 20], ['dropDepth', 'Racket drop', 'swing', 90]]),
  )
  const now = Array.from({ length: 5 }, (_, i) =>
    sessionWith((5 + i) * DAY, [['kneeBend', 'Knee bend at trophy', 'loading', 92], ['dropDepth', 'Racket drop', 'swing', 45]]),
  )
  const f = findPracticeFocus([...old, ...now])
  assert(f!.metricId === 'dropDepth', `stale weakness resurfaced: ${f!.metricId}`)
})

check('carries the latest advice for the chosen measurement', () => {
  const f = findPracticeFocus(persistentWeakness([42, 45, 41]))
  assert(f!.fix === 'fix dropDepth', `expected the metric's own fix, got ${f!.fix}`)
})

/* ------------------------------------------- the download counter, in words */

check('the megabyte counter reads in the reader own locale, not always a period', () => {
  // A locale that writes a comma decimal, asked directly. `toFixed` cannot
  // produce this answer whatever the reader's phone is set to, which is the
  // whole of the defect: this string is the analysing screen's status line on a
  // first run, and it is the only fraction the app puts in front of anybody.
  const german = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(4.5)
  if (german !== '4,5') {
    note('this runtime has no de-DE data; only the shape is checked')
  } else {
    assert(
      megabytes(4.5e6).includes(new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(4.5)),
      `megabytes did not defer to the runtime locale: "${megabytes(4.5e6)}"`,
    )
  }
})

check('the megabyte counter keeps the shape the status line was written around', () => {
  assert(megabytes(19e6).endsWith(' MB'), `lost the unit: "${megabytes(19e6)}"`)
  assert(megabytes(19e6).startsWith('19'), `lost the whole part: "${megabytes(19e6)}"`)
  // One decimal, always — a counter that switched between "4 MB" and "4.5 MB"
  // as it climbed would jitter its own width on every chunk.
  assert(
    /^\d+\D\d MB$/.test(megabytes(4e6)),
    `a round number lost its decimal place: "${megabytes(4e6)}"`,
  )
})

/* -------------------------------------------------------------------- report */


/* -------------------------------------- first serve against second ---------- */

console.log('\n\x1b[1mWhy a basket cannot tell a first serve from a second\x1b[0m')

/**
 * R53 offers two ways to know which kind of serve it is looking at: a tap from
 * the player, or inference within a basket. This is the check that inference is
 * not available, by two independent routes — and a guard against the very
 * measurement that looks like it says otherwise.
 *
 * **THE TRAP, WHICH IS WORTH THE WHOLE COMMENT.** Dial the rig to a plausible
 * second serve — lower reach, deeper knee bend, slower tempo — and the engine
 * separates it from a first at eighteen standard deviations on contact height
 * and twelve on knee bend. That number is meaningless. **The separation is the
 * separation that was dialled.** The rig was told the two serves differ in
 * exactly those quantities by exactly those amounts, and the engine reading them
 * back proves only that it can read its own inputs.
 *
 * To know whether contact height separates a real first serve from a real second
 * — and by how much, and whether one player's second overlaps another's first —
 * takes footage of both from the same player. That is the fixture shoot, and
 * `RECORDED` is empty.
 *
 * THE OTHER ROUTE IS WORSE. "Serves arrive in pairs" is a fact about how people
 * practise, not about a clip. Some players hit six firsts. Some alternate. Some
 * hit ten seconds because that is what they came to work on. Numbering by
 * position in the basket would be inventing the one field the partition rests on,
 * and every spread built on it would carry that invention silently.
 *
 * So the tap is the only honest route, and R53 ships as a tap or not at all.
 */
check('the rig separates a dialled second serve, and that proves nothing', () => {
  /*
   * Kept as a check rather than deleted, because the number is genuinely
   * reproducible and genuinely misleading, and somebody will measure it again.
   * What it asserts is the circularity: the readings that separate are exactly
   * the ones the dials move, and the one that was NOT dialled does not separate.
   */
  const seeds = [11, 202, 3131, 7000, 44444, 909]
  const readAt = (dials: Partial<ServeDials>) => {
    const height: number[] = []
    const span: number[] = []
    for (const seed of seeds) {
      const frames = buildServe({ ...dials, seed, noise: 0.006 }, FPS)
      const skel = detectServe(frames, FPS)
      const f = measure(frames, skel, sideViewOf(frames, skel))
      const h = f.flatMap((x) => x.metrics).find((m) => m.id === 'contactHeight')?.value
      const r = diagnose(frames, skel).chain?.span_ratio
      if (typeof h === 'number') height.push(h)
      if (typeof r === 'number' && Number.isFinite(r)) span.push(r)
    }
    return { height, span }
  }
  const sep = (a: number[], b: number[]) => {
    const m = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    const sd = (xs: number[]) => Math.sqrt(m(xs.map((x) => (x - m(xs)) ** 2)))
    return Math.abs(m(a) - m(b)) / Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2)
  }

  const first = readAt({ motionSeconds: 1.35, contactReach: 1.38, trophyKneeAngle: 133 })
  const second = readAt({ motionSeconds: 1.6, contactReach: 1.28, trophyKneeAngle: 120 })

  const dialled = sep(first.height, second.height)
  const notDialled = sep(first.span, second.span)
  note(`  contact height (dialled) separates at ${dialled.toFixed(1)} sd`)
  note(`  chain span ratio (not dialled) separates at ${notDialled.toFixed(1)} sd`)

  assert(dialled > 5, `the engine could not read a dial it was given: ${dialled.toFixed(1)} sd`)
  assert(
    notDialled < 3,
    `a reading nobody dialled separates the two at ${notDialled.toFixed(1)} sd — ` +
      'if that holds up it is a real signal and R53 is worth reopening',
  )
})


/* --------------------------------- the chain ratio, between two serves ------ */

console.log('\n\x1b[1mThe sequence, as a change between two of your own serves\x1b[0m')

/**
 * R50·3, on the bound its own premise cycle measured rather than the one the
 * round stated. The register's 21% is the total spread with seed noise in it;
 * these are the two terms it is made of, in quadrature.
 *
 * The tempo comes from the stored `phases` rather than a new field — `motionSeconds`
 * is `contact.t − ready.t`, and both are on every stored report.
 */
function ratioBasket(serves: { ratio: number | null; seconds: number }[]) {
  const analyses = serves.map((s, i) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: 70,
      serves: { count: serves.length, index: i },
      phases: [
        { id: 'ready', t: 0 },
        { id: 'contact', t: s.seconds },
      ],
      diagnosis: { chain: { span_ratio: s.ratio } },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  return buildConsistency(analyses, serves.length)!
}

const ratioDelta = (c: ReturnType<typeof ratioBasket>) =>
  c.uncalibrated?.find((d) => d.id === 'chain_span_ratio')

check('a sequence change past both terms is reported', () => {
  // 0.04 apart at identical tempo, against a ~0.0095 floor.
  const d = ratioDelta(ratioBasket([
    { ratio: 0.09, seconds: 1.35 },
    { ratio: 0.13, seconds: 1.35 },
  ]))
  assert(!!d, 'a 0.04 change at equal tempo was not reported')
  assert(
    Math.abs(d!.bound - Math.SQRT2 * CHAIN_RATIO_DEVIATION) < 1e-9,
    `at equal tempo the bound came back ${d!.bound}`,
  )
})

check('a change inside the noise on a difference is refused', () => {
  assert(
    !ratioDelta(ratioBasket([
      { ratio: 0.100, seconds: 1.35 },
      { ratio: 0.108, seconds: 1.35 },
    ])),
    'a change smaller than the noise on a difference was reported',
  )
})

check('a tempo difference widens the bound, and can eat the change', () => {
  /*
   * The half that makes this entry different from its two siblings: its bound
   * is not a constant. Two serves a second apart in tempo carry `CHAIN_RATIO_PER_SECOND`
   * (0.0223) of false change before the sequence has done anything, so the same
   * delta that passes at equal tempo is refused across one.
   */
  const same = ratioDelta(ratioBasket([
    { ratio: 0.100, seconds: 1.35 },
    { ratio: 0.111, seconds: 1.35 },
  ]))
  // 0.011 sits between the two bounds: past 0.0095 at equal tempo, inside the
  // 0.0202 that a 0.8 s gap buys. Chosen to straddle them rather than to be
  // comfortably large, since a comfortable delta would pass both and prove
  // nothing about the tempo term.
  assert(!!same, 'a 0.011 change at equal tempo was refused')

  const apart = ratioDelta(ratioBasket([
    { ratio: 0.100, seconds: 1.10 },
    { ratio: 0.111, seconds: 1.90 },
  ]))
  assert(!apart, 'the same change across a 0.8 s tempo gap was reported anyway')
  assert(
    Math.hypot(Math.SQRT2 * CHAIN_RATIO_DEVIATION, CHAIN_RATIO_PER_SECOND * 0.8) > 0.011,
    'the 0.8 s bound no longer covers the 0.011 change this check straddles with',
  )
})

check('without both tempos there is no bound, so there is no comparison', () => {
  // `motionSecondsOf` returns nothing when a keyframe is missing, which a pruned
  // or hand-edited report can be.
  const analyses = [0, 1].map((i) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: 70,
      serves: { count: 2, index: i },
      phases: i === 0 ? [{ id: 'ready', t: 0 }, { id: 'contact', t: 1.35 }] : [{ id: 'contact', t: 1.35 }],
      diagnosis: { chain: { span_ratio: i === 0 ? 0.09 : 0.15 } },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  const c = buildConsistency(analyses, 2)!
  assert(
    !c.uncalibrated?.find((d) => d.id === 'chain_span_ratio'),
    'a delta was reported with no tempo to bound it',
  )
})

check('a serve with no ratio drops out rather than reading as zero', () => {
  const d = ratioDelta(ratioBasket([
    { ratio: null, seconds: 1.35 },
    { ratio: 0.09, seconds: 1.35 },
    { ratio: 0.14, seconds: 1.35 },
  ]))
  assert(!!d, 'two readable serves beside one unreadable one produced nothing')
  assert(d!.from === 2 && d!.to === 3, `named serves ${d!.from} and ${d!.to}, not 2 and 3`)
})


/* ------------------------------- first serves against second, partitioned --- */

console.log('\n\x1b[1mA basket split by what the player said each serve was\x1b[0m')

/**
 * R53·2b's half of the round. The tap is the only route to this — R53·1 refused
 * inference — so everything here is about reading a tag and never guessing one.
 */
function tagged(serves: (1 | 2 | undefined)[]) {
  const analyses = serves.map((_, i) => {
    const { fundamentals } = run()
    return {
      fundamentals,
      overall: 70,
      serves: { count: serves.length, index: i },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  return splitByServeNumber(analyses, (a) => serves[(a.serves?.index ?? 0)])
}

check('a basket of both is split, and each side is its own comparison', () => {
  const s = tagged([1, 1, 2, 2])
  assert(s.first?.serves === 2, `the first-serve side has ${s.first?.serves} serves`)
  assert(s.second?.serves === 2, `the second-serve side has ${s.second?.serves} serves`)
  assert(s.untagged === 0, `${s.untagged} serves were untagged in a fully tagged basket`)
})

check('a serve nobody tagged is in neither bucket, and is counted', () => {
  /*
   * The refusal that carries R53·1 through to here. An untagged serve is not
   * guessed into a side — it is named as untagged, so the counts routinely fail
   * to add up to the basket and that is the honest state rather than a bug.
   */
  const s = tagged([1, 1, undefined, undefined, 2, 2])
  assert(s.untagged === 2, `counted ${s.untagged} untagged, expected 2`)
  assert(s.first?.serves === 2 && s.second?.serves === 2, 'an untagged serve reached a bucket')
})

check('one serve on a side is no comparison, and gets none', () => {
  /*
   * `buildConsistency`'s own floor, applied per bucket. One reading has a spread
   * of zero, which would score a perfect 100 off a sample containing no
   * repetition — the exact reason that floor exists.
   */
  const s = tagged([1, 2, 2, 2])
  assert(s.first === undefined, 'a single first serve was given a spread')
  assert(s.second?.serves === 3, `the second-serve side has ${s.second?.serves} serves`)
})

check('a basket nobody tagged at all splits into nothing, not into empty halves', () => {
  const s = tagged([undefined, undefined, undefined])
  assert(s.first === undefined && s.second === undefined, 'an untagged basket produced a comparison')
  assert(s.untagged === 3, `counted ${s.untagged} untagged of 3`)
})

check('each side is scored on its own serves, not on the basket', () => {
  /*
   * The point of the whole feature: a spread over both kinds is mostly the
   * difference between two intentions. Checked by giving the two sides genuinely
   * different motions and asserting the split scores differ from the combined
   * one — if they matched, the partition would be doing nothing.
   */
  const dials: Partial<ServeDials>[] = [
    { contactReach: 1.38 },
    { contactReach: 1.38 },
    { contactReach: 1.20 },
    { contactReach: 1.20 },
  ]
  const analyses = dials.map((d, i) => {
    const { fundamentals } = run(d)
    return {
      fundamentals,
      overall: 70,
      serves: { count: 4, index: i },
    } as unknown as Parameters<typeof buildConsistency>[0][number]
  })
  const whole = buildConsistency(analyses, 4)!
  const split = splitByServeNumber(analyses, (a) => ((a.serves?.index ?? 0) < 2 ? 1 : 2))
  const wholeContact = whole.metrics.find((m) => m.id === 'contactHeight')!
  const firstContact = split.first!.metrics.find((m) => m.id === 'contactHeight')!
  assert(
    firstContact.spread < wholeContact.spread / 2,
    `splitting did not tighten the spread: ${firstContact.spread.toFixed(4)} against ${wholeContact.spread.toFixed(4)}`,
  )
})

report()
