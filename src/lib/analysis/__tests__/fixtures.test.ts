/**
 * The fixture pipeline checking itself.
 *
 * Every other suite in this folder tests the engine. This one tests the thing
 * that decides whether the engine has been tested at all, which is a different
 * job with a different failure mode: nothing here goes wrong loudly. A fixture
 * that asserts nothing, a fixture whose `expect` was pasted out of the app's own
 * report, a frame array one landmark short — all three run, all three go green,
 * and all three raise the recorded-fixture count towards the number the project
 * treats as "validated against reality".
 *
 * So the assertions below are almost all of the form "this bad fixture is
 * caught". A validator nobody has watched reject anything is a validator that
 * quietly returns an empty array.
 */
import {
  DEFAULT_TOLERANCE,
  packFrames,
  validateFixture,
  validateFixtureSchema,
  type Fixture,
  type PackedFrames,
} from '../groundTruth'
import { buildServe } from '../syntheticServe'
import { buildRejectedDraft } from '../../../dev/exportFixture'
import { MINIMUM_RECORDED, RECORDED, fixtureGate } from './fixtures'
import { assert, check, fail, heading, note, report, warn } from './harness'

const FPS = 50

/** Pose output good enough to be beside the point — every test here is about the metadata. */
const FRAMES: PackedFrames = packFrames(buildServe({}, FPS))

/**
 * A fixture as it should look once a human has finished with it: described,
 * labelled from the clip, and with every number attributed to something outside
 * the app. Tests mutate a copy of this so each one names exactly one fault.
 */
const good = (): Fixture => ({
  id: 'adult-male-side-30fps',
  label: 'Adult male, right handed, side-on, 30 fps, iPhone 13',
  source: 'recorded',
  fps: FPS,
  frames: FRAMES,
  expect: {
    handedness: 'right',
    view: 'side',
    keyframes: { contact: FRAMES.t[Math.floor(FRAMES.count * 0.6)] },
  },
})

/** The paths of every schema issue raised, for asserting on. */
const faults = (f: unknown) => validateFixtureSchema(f).map((i) => i.where)

const raises = (f: unknown, where: string, what: string) => {
  const found = validateFixtureSchema(f)
  assert(
    found.some((i) => i.where === where),
    `${what}: expected an issue at "${where}", got ${JSON.stringify(faults(f))}`,
  )
}

/* ------------------------------------------------------------ a clean file */

heading('Fixture schema — what it lets through')

check('a described, labelled, attributed fixture passes', () => {
  const found = validateFixtureSchema(good())
  assert(found.length === 0, `a clean fixture was rejected: ${JSON.stringify(found)}`)
})

check('a metric with a real provenance note passes', () => {
  const f = good()
  f.expect.metrics = { contactHeight: 1.42 }
  f.expect.metricSource = { contactHeight: 'wall mark at 2.60 m, contact one brick above' }
  const found = validateFixtureSchema(f)
  assert(found.length === 0, `a measured metric was rejected: ${JSON.stringify(found)}`)
})

check('a rejected-clip fixture needs no keyframes', () => {
  const f = good()
  f.expect = { rejected: true }
  assert(validateFixtureSchema(f).length === 0, 'a refusal fixture was rejected')
})

/* ------------------------------------------------------------- malformed */

heading('Fixture schema — malformed files')

check('a file that is not an object is rejected', () => {
  assert(validateFixtureSchema(null).length > 0, 'null accepted')
  assert(validateFixtureSchema('{}').length > 0, 'a string accepted')
  assert(validateFixtureSchema([good()]).length > 0, 'an array of fixtures accepted')
})

check('a short landmark array is rejected, not silently reindexed', () => {
  // The failure this prevents: `unpackFrames` reads landmark k of frame i at a
  // fixed offset, so one number missing from `image` shifts every landmark
  // after it by a quarter of a landmark. The clip still analyses. The arm is
  // just somewhere else.
  const f = good()
  f.frames = { ...FRAMES, image: FRAMES.image.slice(0, -1) }
  raises(f, 'frames.image', 'a truncated landmark array')
})

check('a frame count that disagrees with the sample times is rejected', () => {
  const f = good()
  f.frames = { ...FRAMES, t: FRAMES.t.slice(0, -3) }
  raises(f, 'frames.t', 'three missing sample times')
})

check('a non-finite landmark is rejected', () => {
  const f = good()
  const image = FRAMES.image.slice()
  image[500] = NaN
  f.frames = { ...FRAMES, image }
  raises(f, 'frames.image', 'a NaN landmark')
})

check('missing identity and frames are rejected', () => {
  raises({ ...good(), id: '' }, 'id', 'an empty id')
  raises({ ...good(), source: 'downloaded' }, 'source', 'an unknown source')
  raises({ ...good(), fps: 0 }, 'fps', 'a zero frame rate')
  const { frames: _drop, ...noFrames } = good()
  raises(noFrames, 'frames', 'a fixture with no pose output')
})

check('the exported placeholder label is rejected', () => {
  const f = good()
  f.label = 'TODO: describe this clip — player, camera angle, frame rate, phone'
  raises(f, 'label', 'an undescribed clip')
})

check('malformed structure is fatal, so the engine is never run on it', () => {
  const f = good()
  f.frames = { ...FRAMES, world: [] }
  const result = validateFixture(f)
  assert(!result.passed, 'a broken fixture passed')
  assert(result.error !== undefined, 'a broken fixture produced no error line')
  assert(result.checks.length === 0, 'comparisons were reported against frames that do not exist')
})

/* ------------------------------------------------------- unlabelled dumps */

heading('Fixture schema — unlabelled dumps')

check('_UNVERIFIED is rejected', () => {
  raises({ ...good(), _UNVERIFIED: true }, '_UNVERIFIED', 'an unlabelled export')
})

check("the engine's own answers left attached are rejected", () => {
  raises({ ...good(), _engineMetrics: { contactHeight: 1.42 } }, '_engineMetrics', 'a leftover sidecar')
  raises({ ...good(), _engineRejection: 'no swing found' }, '_engineRejection', 'a leftover sidecar')
})

check('the draft the app exports cannot pass as ground truth', () => {
  // End to end: whatever `src/dev/exportFixture.ts` hands the labeller must be
  // refused until they have done the labelling. If this ever goes green the
  // export and the validator have drifted apart and an app dump can pad the
  // recorded count.
  const draft = buildRejectedDraft({ frames: buildServe({}, FPS), fps: FPS }, 'clip.mov', 'no swing')
  const found = validateFixtureSchema(draft)
  assert(found.length > 0, 'a straight-from-the-app draft was accepted as a fixture')
  assert(found.some((i) => i.where === '_UNVERIFIED'), 'the unverified flag went unnoticed')
})

/* ---------------------------------------------------- copied engine output */

heading('Fixture schema — values copied from the engine')

check('a metric identical to the sidecar value is named as copied', () => {
  const f = { ...good(), _engineMetrics: { contactHeight: 1.417 } } as Fixture & {
    _engineMetrics: Record<string, number>
  }
  f.expect.metrics = { contactHeight: 1.417 }
  f.expect.metricSource = { contactHeight: 'wall mark at 2.60 m, contact one brick above' }
  const copied = validateFixtureSchema(f).find((i) => i.where === 'expect.metrics.contactHeight')
  assert(copied !== undefined, `copy went unnoticed: ${JSON.stringify(faults(f))}`)
  assert(
    copied !== undefined && /engine's own output/.test(copied.problem),
    `wrong reason: ${copied?.problem}`,
  )
})

check('a keyframe left exactly as the engine found it is named as copied', () => {
  const t = FRAMES.t[Math.floor(FRAMES.count * 0.6)]
  const f = { ...good(), _engineKeyframes: { contact: t } }
  raises(f, 'expect.keyframes.contact', 'an uncorrected keyframe')
})

check('a metric with no stated provenance is rejected', () => {
  const f = good()
  f.expect.metrics = { contactHeight: 1.42 }
  raises(f, 'expect.metricSource.contactHeight', 'an unattributed metric')
})

check('a provenance note that states nothing is rejected', () => {
  const sources = [
    'TODO',
    'n/a',
    'x',
    '   ',
    'from the app',
    'engine output',
    'a screenshot of the report',
    // Every one of these was ACCEPTED as the provenance of a measurement. The
    // first group of HOLLOW_SOURCE ended in `\b`, which cannot match where the
    // character before it is punctuation and the string ends there, so the
    // branches written for `?` and `-` never fired on `?` and `-`. Eight
    // keystrokes of anything cleared MIN_SOURCE_CHARS on their own.
    '????????',
    '--------',
    '________',
    '~~~~~~~~',
    '.........',
    'nonenonenone',
    '1234567890',
  ]
  for (const source of sources) {
    const f = good()
    f.expect.metrics = { contactHeight: 1.42 }
    f.expect.metricSource = { contactHeight: source }
    raises(f, 'expect.metricSource.contactHeight', `"${source}" as provenance`)
  }
})

check('the labelling procedure this repo documents is accepted', () => {
  // The expensive direction to be wrong in. README.md tells the labeller to put
  // a protractor on a paused frame; `screenshot` sat in the hollow-note list, so
  // a labeller who did exactly that and said so had their real fixture refused.
  // A screenshot of the *report* is still caught, above.
  for (const source of [
    'protractor on a screenshot of the paused trophy frame',
    'measured off a screenshot, 2.60 m wall mark',
    'protractor',
    'frame count',
    'tape at 2.60 m',
  ]) {
    const f = good()
    f.expect.metrics = { contactHeight: 1.42 }
    f.expect.metricSource = { contactHeight: source }
    const found = validateFixtureSchema(f)
    assert(found.length === 0, `"${source}" was refused: ${JSON.stringify(found)}`)
  }
})

check('provenance left behind by a deleted metric is rejected', () => {
  const f = good()
  f.expect.metricSource = { contactHeight: 'wall mark at 2.60 m, contact one brick above' }
  raises(f, 'expect.metricSource.contactHeight', 'stale provenance')
})

/* --------------------------------------------------- fixtures that cannot fail */

heading('Fixture schema — fixtures that cannot fail')

check('a fixture expecting nothing is rejected', () => {
  // Real footage, real pose output, `expect` emptied. Instantly green, and one
  // closer to MINIMUM_RECORDED. This is the cheapest way to fake coverage and
  // the one a tired labeller reaches for.
  const f = good()
  f.expect = {}
  raises(f, 'expect', 'a fixture with nothing expected of it')
})

check('a clip cannot be both refused and measured', () => {
  const f = good()
  f.expect.rejected = true
  raises(f, 'expect', 'a fixture that is a serve and not a serve')
})

check('a keyframe outside the clip is rejected', () => {
  const f = good()
  f.expect.keyframes = { contact: FRAMES.t[FRAMES.count - 1] + 4 }
  raises(f, 'expect.keyframes.contact', 'a label from a different take')
})

check('a keyframe against an unknown phase is rejected', () => {
  const f = good()
  f.expect.keyframes = { tosss: 0.4 } as unknown as Fixture['expect']['keyframes']
  raises(f, 'expect.keyframes.tosss', 'a misspelt phase')
})

check('a fixture that only says which hand can still fail, and is allowed', () => {
  // `validateFixture` compares handedness, so `{handedness: 'left'}` on its own
  // produces a real check that a right-handed read fails. The "cannot fail"
  // fault used to be raised on it — a fixture told it could never fail while it
  // was failing.
  const f = good()
  f.expect = { handedness: 'left' }
  assert(
    !faults(f).includes('expect'),
    `a fixture with a testable handedness was called untestable: ${JSON.stringify(faults(f))}`,
  )
  const result = validateFixture(f)
  assert(
    result.checks.some((c) => c.what === 'handedness' && !c.ok),
    'the handedness comparison the schema check now trusts was never made',
  )
})

check('a view on its own is not an expectation', () => {
  // Nothing compares `view`; it only picks which metrics the pipeline is asked
  // for. So this one really cannot fail.
  const f = good()
  f.expect = { view: 'side' }
  raises(f, 'expect', 'a fixture expecting only a camera angle')
})

check('a tolerance widened until nothing can fail is rejected', () => {
  // The cheapest fixture that cannot fail, and the one the schema check missed
  // for longest: no sidecar to delete, no provenance to invent, one extra JSON
  // key. Before this, keyframes at 0.0001 s and `contactHeight: 99` against an
  // engine reading of 1.4 made four comparisons, raised zero issues and passed.
  const f = good()
  f.tolerance = { keyframeSeconds: 1e6, contactSeconds: 1e6, degrees: 1e6, ratio: 1e6, ms: 1e6, percent: 1e6 }
  f.expect.metrics = { contactHeight: 99 }
  f.expect.metricSource = { contactHeight: 'wall mark at 2.60 m, contact one brick above' }
  raises(f, 'tolerance.contactSeconds', 'a wide-open contact allowance')
  raises(f, 'tolerance.degrees', 'a wide-open angle allowance')
  const result = validateFixture(f)
  assert(!result.passed, 'a fixture that cannot fail passed')
})

check('a tolerance a labeller could argue for is allowed', () => {
  // Hard footage is real. The bar is that the disagreement stays inside the band
  // the measurement is scored against, not that the default is sacred.
  const f = good()
  f.tolerance = { keyframeSeconds: DEFAULT_TOLERANCE.keyframeSeconds * 2 }
  assert(
    validateFixtureSchema(f).length === 0,
    `a doubled keyframe allowance was refused: ${JSON.stringify(faults(f))}`,
  )
})

check('a misspelt tolerance key is named rather than ignored', () => {
  // `validateFixture` spreads the object over the defaults, so a typo applies
  // nothing and says nothing: the labeller believes they widened a bound and the
  // default is what actually ran.
  const f = good()
  f.tolerance = { keyframeSecond: 0.2 } as unknown as Fixture['tolerance']
  raises(f, 'tolerance.keyframeSecond', 'a misspelt tolerance key')
})

check('handedness and view outside their vocabularies are rejected', () => {
  raises({ ...good(), expect: { ...good().expect, handedness: 'r' } }, 'expect.handedness', 'a short hand')
  raises({ ...good(), expect: { ...good().expect, view: 'sideways' } }, 'expect.view', 'an invented view')
})

/* ------------------------------------------------------------ the wiring */

heading('Fixture schema — wired into validateFixture')

check('a labelling fault fails the fixture and says why', () => {
  // The point of running the schema inside `validateFixture` rather than only
  // at one call site: a bad fixture fails wherever it is run, and it fails with
  // an explanation rather than an empty issue list that reads as flakiness.
  const f = good()
  f.expect.metrics = { contactHeight: 1.42 }
  const result = validateFixture(f)
  assert(!result.passed, 'an unattributed metric passed validateFixture')
  assert(result.schema.length > 0, 'schema issues were not reported')
  assert(
    result.issues.some((i) => i.what.startsWith('schema ')),
    `schema faults did not reach the issue list: ${JSON.stringify(result.issues)}`,
  )
})

check('a clean fixture still records every comparison it made', () => {
  const result = validateFixture(good())
  assert(result.checks.length > 0, 'no comparisons recorded')
  assert(
    result.checks.every((c) => typeof c.what === 'string'),
    'a comparison was recorded without a name',
  )
})

/* ------------------------------------------------------- the coverage gate */

heading('Recorded-footage gate')

const stub = (id: string, source: Fixture['source'] = 'recorded'): Fixture => ({
  ...good(),
  id,
  source,
})

/**
 * Six clips that actually cover something: both hands, two camera angles, two
 * frame rates. This is what "quiet" is supposed to mean, and building it here
 * rather than repeating one clip six times is the point — the old version of
 * this test passed the gate six copies of one right-handed side-on 50 fps clip
 * and asserted silence.
 */
const spread = (): Fixture[] =>
  ([
    ['right', 'side', 30],
    ['right', 'angled', 30],
    ['right', 'front-back', 60],
    ['left', 'side', 60],
    ['left', 'angled', 30],
    ['left', 'side', 30],
  ] as const).map(([handedness, view, fps], i) => ({
    ...stub(`clip-${i}`),
    fps,
    expect: { ...good().expect, handedness, view },
  }))

check('an empty list warns rather than failing', () => {
  // Nothing has been filmed, and the codebase says so in every place that would
  // otherwise be overclaiming. There is no false statement to catch.
  assert(fixtureGate([], 6).level === 'warn', 'an empty fixture list failed the suite')
})

check('a part-full list fails', () => {
  // The escalation this gate exists for. One real clip turns every "unvalidated
  // against real footage" caveat in the repo into a false statement, and what
  // replaces it is a green suite covering one player, one hand, one frame rate.
  for (const n of [1, 3, 5]) {
    const gate = fixtureGate(
      Array.from({ length: n }, (_, i) => stub(`clip-${i}`)),
      6,
    )
    assert(gate.level === 'fail', `${n} of 6 recorded fixtures did not fail the suite`)
    assert(gate.counted === n, `counted ${gate.counted}, expected ${n}`)
  }
})

check('a full, spread list is quiet', () => {
  const gate = fixtureGate(spread(), 6)
  assert(gate.level === 'ok', `a full, spread fixture set reported ${gate.level}: ${gate.lines.join(' ')}`)
})

check('six clips of the same kind do not satisfy the gate', () => {
  // The state the gate's own fail message calls dangerous, reached by the
  // easiest route to six clips there is: one player, one hand, one frame rate,
  // one angle. The count alone used to be the whole test, so this returned `ok`
  // with no lines while the comment above it and the README table both promised
  // a spread check.
  const same = Array.from({ length: 6 }, (_, i) => stub(`clip-${i}`))
  const gate = fixtureGate(same, 6)
  assert(gate.level === 'fail', 'six clips of one player, one hand and one frame rate went quiet')
  assert(gate.counted === 6, `counted ${gate.counted}`)
})

check('each missing axis is named on its own', () => {
  const oneHand = spread().map((f) => ({ ...f, expect: { ...f.expect, handedness: 'right' as const } }))
  assert(/handedness/.test(fixtureGate(oneHand, 6).lines.join(' ')), 'a one-handed set was not named as such')

  const oneRate = spread().map((f) => ({ ...f, fps: 30 }))
  assert(/frame rate/.test(fixtureGate(oneRate, 6).lines.join(' ')), 'a single-frame-rate set was not named')

  const oneView = spread().map((f) => ({ ...f, expect: { ...f.expect, view: 'side' as const } }))
  assert(/camera view/.test(fixtureGate(oneView, 6).lines.join(' ')), 'a single-angle set was not named')
})

check('an unlabelled clip is named, not counted towards the spread', () => {
  // "We have no left-handed footage" and "nobody wrote down which hand" are
  // different problems and only one of them is fixed by filming.
  const set = spread()
  set[0] = { ...set[0], expect: { ...set[0].expect, handedness: undefined } }
  const gate = fixtureGate(set, 6)
  assert(gate.level === 'fail', 'an unlabelled fixture passed the spread check')
  assert(
    gate.lines.some((l) => l.includes(set[0].id)),
    `the unlabelled fixture was not named: ${gate.lines.join(' ')}`,
  )
})

check('a synthetic fixture does not count towards the minimum', () => {
  // Otherwise the cheapest route to a quiet gate is six calls to the rig, and
  // the tally would say "validated against reality" about the rig validating
  // itself.
  const set = Array.from({ length: 6 }, (_, i) => stub(`clip-${i}`, 'synthetic'))
  const gate = fixtureGate(set, 6)
  assert(gate.level === 'fail', 'six synthetic fixtures satisfied the recorded-footage gate')
  assert(gate.counted === 0, `counted ${gate.counted} recorded fixtures among six synthetic ones`)
})

check('the same fixture listed twice is caught', () => {
  const gate = fixtureGate([stub('clip'), stub('clip')], 6)
  assert(gate.level === 'fail', 'a duplicated import line counted as two clips')
})

/* ------------------------------------------- the fixtures actually committed */

heading('Committed fixtures')

for (const fixture of RECORDED) {
  check(`${fixture.id} — schema`, () => {
    const found = validateFixtureSchema(fixture)
    assert(
      found.length === 0,
      found.map((i) => `${i.where}: ${i.problem}`).join('\n      '),
    )
  })
}

if (!RECORDED.length) note('no recorded fixtures to schema-check')

const gate = fixtureGate()

if (gate.level === 'fail') {
  fail(`recorded-footage coverage (${gate.counted} of ${MINIMUM_RECORDED})`, gate.lines.join('\n      '))
} else if (gate.level === 'warn') {
  warn(gate.lines)
} else {
  note(`${gate.counted} recorded fixtures, minimum ${MINIMUM_RECORDED}`)
}

report()
