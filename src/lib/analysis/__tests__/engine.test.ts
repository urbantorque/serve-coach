/**
 * Engine checks. Run with `npm test` — see scripts/run-tests.mjs, which bundles
 * this with esbuild and executes it in Node. No test framework, no browser.
 *
 * These assert behaviour a coach would recognise: the keyframes land in the
 * right order at the right moments, and a serve with a dialled-in fault is
 * reported as having that fault and not some other one.
 */
import { findPracticeFocus, practiceHeadline } from '../../practice'
import { MEANINGFUL_DELTA, buildProgress, deltaStatus, deltasAgainst } from '../../progress'
import { normalise } from '../../storage/db'
import { sessionKeyFor } from '../../storage/sessionKey'
import { assessQuality, pickFocus } from '../analyze'
import { buildConsistency } from '../consistency'
import { statusOf } from '../geometry'
import { measure } from '../metrics'
import { detectServe } from '../phases'
import { findServes } from '../serves'
import { NotAServeError, type Fundamental, type Metric } from '../types'
import { CLEAN_SERVE, U, buildServe, type ServeDials } from './syntheticServe'
import { assert, check, near, report, within } from './harness'

/** Declared up here because checks run top to bottom as the module executes. */
const DAY = 86_400_000

const FPS = 50

function run(dials: Partial<ServeDials> = {}) {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  const spanRatio = skel.shoulderWidth / skel.bodyHeight
  const sideView = spanRatio < 0.1
  const fundamentals = measure(frames, skel, sideView)
  return { frames, skel, fundamentals, sideView }
}

const metric = (fundamentals: Fundamental[], id: string): Metric => {
  const m = fundamentals.flatMap((f) => f.metrics).find((x) => x.id === id)
  if (!m) throw new Error(`metric "${id}" was not produced`)
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

  const left = measure(frames, skel, skel.shoulderWidth / skel.bodyHeight < 0.1)
  for (const id of ['contactHeight', 'kneeBend', 'dropDepth', 'armExtension', 'tossArmExtension']) {
    const expected = metric(right.fundamentals, id).value
    near(
      metric(left, id).value,
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

check('reads back contact height', () => {
  const { fundamentals } = run({ contactReach: 1.38 })
  near(metric(fundamentals, 'contactHeight').value, 1.38, 0.09, 'contact height')
})

check('reads back the tossing-arm elbow angle', () => {
  const { fundamentals } = run({ tossElbow: 172 })
  near(metric(fundamentals, 'tossArmExtension').value, 172, 10, 'toss elbow')
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
  const { fundamentals } = run({ dropBelowShoulder: 0.03 })
  const dd = metric(fundamentals, 'dropDepth')
  assert(dd.status === 'work' || dd.status === 'fair', `drop depth scored ${dd.score} with no drop`)
  assert(Boolean(dd.fix), 'no fix offered for a shallow drop')
})

check('a low reach is reported as a contact fault', () => {
  const { fundamentals } = run({ contactReach: 1.15 })
  const ch = metric(fundamentals, 'contactHeight')
  assert(ch.status === 'work' || ch.status === 'fair', `contact height scored ${ch.score} at 1.15×`)
  assert(
    area(fundamentals, 'contact').score < 80,
    `contact area scored ${area(fundamentals, 'contact').score} despite a low reach`,
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

check('reports serves the scan found but could not measure', () => {
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
  assert(deltaStatus(0) === 'flat', '0 was not flat')
  assert(deltaStatus(MEANINGFUL_DELTA - 1) === 'flat', 'just under the threshold was not flat')
  assert(deltaStatus(-(MEANINGFUL_DELTA - 1)) === 'flat', 'small decline was not flat')
  assert(deltaStatus(MEANINGFUL_DELTA) === 'great', 'a real gain was called noise')
  assert(deltaStatus(-MEANINGFUL_DELTA) === 'work', 'a real decline was called noise')
})

check('report deltas need a previous report to compare against', () => {
  const fundamentals = [{ id: 'toss', score: 80 }] as unknown as Parameters<typeof deltasAgainst>[0]
  assert(Object.keys(deltasAgainst(fundamentals, undefined)).length === 0, 'compared against nothing')
  const prev = progressSession(DAY, 70, { toss: 66 })
  assert(deltasAgainst(fundamentals, prev).toss === 14, 'wrong per-area delta on the report')
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

check('counts how often it was the weakest link', () => {
  const f = findPracticeFocus(persistentWeakness([42, 45, 41, 44, 43]))
  assert(f!.timesWeakest === 5, `expected 5, got ${f!.timesWeakest}`)
  assert(f!.sessionsConsidered === 5, `considered ${f!.sessionsConsidered}`)
})

check('reads a genuine improvement as improving', () => {
  const f = findPracticeFocus(persistentWeakness([30, 34, 42, 52, 58]))
  assert(f!.verdict === 'improving', `verdict was ${f!.verdict} (trend ${f!.trend})`)
  assert(practiceHeadline(f!).includes('right direction'), 'headline does not acknowledge progress')
})

check('reads a flat run as stuck', () => {
  const f = findPracticeFocus(persistentWeakness([44, 43, 45, 44, 43]))
  assert(f!.verdict === 'stuck', `verdict was ${f!.verdict} (trend ${f!.trend})`)
})

check('reads a decline as slipping', () => {
  const f = findPracticeFocus(persistentWeakness([62, 58, 50, 42, 38]))
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

/* -------------------------------------------------------------------- report */

report()
