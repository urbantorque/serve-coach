/**
 * Whether two saved swings may be drawn on top of each other, and what happens
 * to the older one when they are.
 *
 * WHAT THESE CHECKS ARE REALLY FOR. `pairTracks` makes one claim — that after the
 * transform, what is left on screen is the player and not the phone — and that
 * claim is the whole feature. A ghost that quietly carried a camera difference
 * would draw two serves apart that were identical, and the player would go and
 * change something that was never wrong. So the arithmetic is driven both ways:
 * a body filmed from a different distance, a different place in the frame and a
 * different orientation has to come back *identical*, and a body that genuinely
 * moved has to come back different. One without the other proves nothing — a
 * transform that collapsed everything to a point would pass the first.
 *
 * THE REFUSALS GET ONE CHECK EACH, and they are the reason this module exists at
 * all rather than being three lines inside a draw call. Each is asserted by its
 * own name rather than by "did not pair", because two refusals for different
 * reasons that a test cannot tell apart is how a guard gets removed by accident.
 *
 * NO CANVAS ANYWHERE HERE, by construction. `pairTracks` returns points; the
 * drawing is R49·3 and needs the browser.
 */
import { LM } from '../analysis/geometry'
import type { Landmark, Phase, PhaseId } from '../analysis/types'
import { swingTrack, type SwingTrack } from '../storage/poseTrack'
import { GHOST_YAW_TOLERANCE_DEG, pairTracks, pairedLookup, type Pairable } from '../trackPair'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

/* ------------------------------------------------------------------- a body */

/**
 * A standing body, in normalised image space, roughly the proportions the
 * tracker produces on a side-on serve.
 *
 * Every landmark index is filled, because a stored row is 33 landmarks and a
 * sparse one would exercise a shape the encoder cannot produce. Values are made
 * up — nothing here asserts a proportion is realistic, only that the same
 * proportion survives a change of camera.
 */
const BODY: Record<number, [number, number]> = {
  [LM.nose]: [0.5, 0.16],
  [LM.leftShoulder]: [0.46, 0.26],
  [LM.rightShoulder]: [0.54, 0.26],
  [LM.leftElbow]: [0.42, 0.38],
  [LM.rightElbow]: [0.58, 0.36],
  [LM.leftWrist]: [0.4, 0.5],
  [LM.rightWrist]: [0.62, 0.24],
  [LM.leftHip]: [0.47, 0.52],
  [LM.rightHip]: [0.53, 0.52],
  [LM.leftKnee]: [0.47, 0.7],
  [LM.rightKnee]: [0.53, 0.7],
  [LM.leftAnkle]: [0.47, 0.88],
  [LM.rightAnkle]: [0.53, 0.88],
}

/** Where the swing is stored from, so a phase frame has to be offset to reach it. */
const FROM = 12
/** Rows per stored swing, and the one contact sits on. */
const ROWS = 9
const CONTACT_ROW = 5

/**
 * One frame of landmarks, filmed by a given camera.
 *
 * `zoom` and `pan` are the two things the transform must remove and `aspect` is
 * the third: a portrait clip and a landscape one disagree about what an x of 0.1
 * is worth, and folding that in is the only reason a pair from two different
 * phones can line up at all.
 *
 * `wrist` displaces the racket hand *before* the camera is applied, so it is a
 * change in the player rather than in the filming — the one difference a ghost
 * is supposed to show.
 */
function landmarks(opts: {
  zoom?: number
  pan?: [number, number]
  aspect?: number
  wrist?: [number, number]
  hidden?: number[]
} = {}): Landmark[] {
  const zoom = opts.zoom ?? 1
  const [px, py] = opts.pan ?? [0, 0]
  const aspect = opts.aspect ?? 1
  const hidden = new Set(opts.hidden ?? [])

  const out: Landmark[] = []
  for (let i = 0; i <= LM.rightToe; i++) {
    const base = BODY[i] ?? BODY[LM.nose]
    let [x, y] = base
    if (i === LM.rightWrist && opts.wrist) [x, y] = opts.wrist
    // Zoom about the frame centre, then pan, then express x in frame widths.
    const fx = 0.5 + (x - 0.5) * zoom + px
    const fy = 0.5 + (y - 0.5) * zoom + py
    out.push({ x: fx / aspect, y: fy, z: 0, visibility: hidden.has(i) ? 0.1 : 0.9 })
  }
  return out
}

/** A stored swing whose every row is the same body, bar the racket hand at contact. */
function track(opts: Parameters<typeof landmarks>[0] = {}): SwingTrack {
  const frames = []
  for (let i = 0; i < FROM + ROWS; i++) {
    frames.push({
      index: i,
      t: i / 30,
      image: i < FROM ? [] : landmarks(i === FROM + CONTACT_ROW ? opts : { ...opts, wrist: undefined }),
      world: [],
      visibility: 1,
    })
  }
  const t = swingTrack(frames, FROM, FROM + ROWS - 1, opts.aspect ?? 1)
  if (!t) throw new Error('the fixture built no track')
  return t
}

const phases = (): Phase[] =>
  (['ready', 'toss', 'trophy', 'drop', 'contact', 'finish'] as PhaseId[]).map((id, i) => ({
    id,
    label: id,
    caption: '',
    frame: id === 'contact' ? FROM + CONTACT_ROW : FROM + i,
    t: 0,
    thumbnail: '',
  }))

/** One half of a pair, with everything `pairTracks` reads and nothing else. */
function serve(
  opts: {
    camera?: Parameters<typeof landmarks>[0]
    yaw?: number
    yawMeasured?: boolean
    type?: 'flat' | 'kick' | 'slice'
    rubric?: number
    noTrack?: boolean
    noContact?: boolean
  } = {},
): Pairable {
  const p = phases()
  if (opts.noContact) {
    // Contact placed outside the stored span: the row is simply not there.
    p[4] = { ...p[4], frame: FROM + ROWS + 40 }
  }
  return {
    track: opts.noTrack ? undefined : track(opts.camera),
    phases: p,
    serveType: opts.type ?? 'flat',
    scoringVersion: opts.rubric ?? 2,
    triage: {
      quality: {
        yaw_deg: opts.yaw ?? 40,
        yaw_measured: opts.yawMeasured ?? true,
      },
    },
  } as unknown as Pairable
}

/** The worst single landmark difference between two paired bodies, in frame units. */
function worstGap(
  a: ({ x: number; y: number } | null)[],
  b: ({ x: number; y: number } | null)[],
): number {
  let worst = 0
  for (let i = 0; i < a.length; i++) {
    const p = a[i]
    const q = b[i]
    if (!p || !q) continue
    worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y))
  }
  return worst
}

/** The paired samples, or a failure naming the refusal instead of a null crash. */
function paired(newer: Pairable, older: Pairable) {
  const r = pairTracks(newer, older)
  assert(r.ok, `expected a pair, got refusal: ${r.ok ? '' : r.refusal}`)
  return r.ok ? r.pair : (undefined as never)
}

/* ------------------------------------------------------------ the transform */

heading('What survives the transform is the player, not the phone')

/**
 * Shoulder-to-ankle in this fixture's frame units — the transform's own yardstick.
 *
 * Gaps are stated against it rather than in frame units, so the number below can
 * be read against the rig's measured floor: two noise realisations of one
 * identical serve sit 0.0341 body heights apart (`poseTrack.ts`). Anything an
 * order of magnitude under that cannot be mistaken for a real difference.
 */
const SCALE = BODY[LM.leftAnkle][1] - BODY[LM.leftShoulder][1]

/**
 * The residual is not zero, and what is left is worth naming: `swingTrack`
 * rounds a landmark to three decimals of *its own* frame, so a clip stored at a
 * different zoom and a different aspect quantises on a different grid. Measured
 * at 0.00039 of a shoulder-to-ankle here — about a ninetieth of the tracker's own
 * noise floor, and it does not grow with the camera difference the way a
 * surviving camera term would.
 */
const QUANTISATION = 0.001

check('a serve filmed closer, off-centre and in portrait draws on top of itself', () => {
  const newer = serve()
  const older = serve({ camera: { zoom: 1.3, pan: [0.08, -0.05], aspect: 9 / 16 } })

  const pair = paired(newer, older)
  const contact = pair.samples.find((s) => s.fromContact === 0)
  assert(!!contact, 'no sample landed on contact')

  const self = paired(newer, newer).samples.find((s) => s.fromContact === 0)!
  const gap = worstGap(contact!.image, self.image) / SCALE
  assert(
    gap < QUANTISATION,
    `the same body filmed differently came back ${gap.toFixed(5)} of a body apart, ` +
      `so some of the camera survived`,
  )
})

check('a serve that really moved comes back moved', () => {
  const newer = serve()
  // The same camera as `newer`, and a racket hand a fifth of a frame away.
  const older = serve({ camera: { wrist: [0.62, 0.44] } })

  const contact = paired(newer, older).samples.find((s) => s.fromContact === 0)!
  const self = paired(newer, newer).samples.find((s) => s.fromContact === 0)!
  const gap = worstGap(contact.image, self.image) / SCALE
  assert(
    gap > 0.15,
    `a hand moved 0.2 of a frame came back ${gap.toFixed(4)} away, so the transform is eating real difference`,
  )
})

check('nothing below the hips comes back, and everything above it does', () => {
  const sample = paired(serve(), serve()).samples[0]
  for (const lm of [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe]) {
    assert(sample.image[lm] === null, `landmark ${lm} is below the hips and came back drawable`)
  }
  for (const lm of [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftWrist, LM.rightWrist, LM.leftHip, LM.rightHip]) {
    assert(sample.image[lm] !== null, `landmark ${lm} is at or above the hips and came back null`)
  }
  assert(sample.image.length === 33, `a row of ${sample.image.length} landmarks can’t be indexed by name`)
})

check('contact is the zero of the older swing, and the samples run in time order', () => {
  const pair = paired(serve(), serve())
  const zeros = pair.samples.filter((s) => s.fromContact === 0)
  assert(zeros.length === 1, `${zeros.length} samples claim to be contact`)
  assert(
    pair.samples.every((s, i) => i === 0 || s.fromContact > pair.samples[i - 1].fromContact),
    'the older swing came back out of order',
  )
  assert(
    pair.samples[0].fromContact < 0 && pair.samples[pair.samples.length - 1].fromContact > 0,
    'the swing doesn’t span contact',
  )
})

check('the newer swing is told where its own contact falls', () => {
  const pair = paired(serve(), serve())
  /*
   * The stored rows are 1/30 apart and contact is the sixth of nine. Compared
   * to the millisecond because `replayFrom` rounds there and this reads its
   * answer rather than recomputing one — the point of the check is that the two
   * agree, not that either can be reproduced to a double's precision.
   */
  assert(
    Math.abs(pair.contactAt - CONTACT_ROW / 30) < 1e-3,
    `contact was reported at ${pair.contactAt}s, not ${(CONTACT_ROW / 30).toFixed(4)}s`,
  )
})

/* --------------------------------------------------------------- the gates */

heading('And every reason a pair is refused, by name')

const REFUSALS: { why: string; newer: Pairable; older: Pairable; expect: string }[] = [
  {
    why: 'the older report kept no swing',
    newer: serve(),
    older: serve({ noTrack: true }),
    expect: 'no_track',
  },
  {
    why: 'one camera angle stood in for a reading nobody could take',
    newer: serve(),
    older: serve({ yawMeasured: false }),
    expect: 'yaw_unmeasured',
  },
  {
    why: 'the camera moved further than the tracker already wanders',
    newer: serve({ yaw: 40 }),
    older: serve({ yaw: 40 + GHOST_YAW_TOLERANCE_DEG + 0.1 }),
    expect: 'camera_moved',
  },
  {
    why: 'the marking was recalibrated between them',
    newer: serve({ rubric: 2 }),
    older: serve({ rubric: 1 }),
    expect: 'rubric_changed',
  },
  {
    why: 'one is a kick and the other is a flat',
    newer: serve({ type: 'flat' }),
    older: serve({ type: 'kick' }),
    expect: 'serve_type_changed',
  },
  {
    why: 'contact itself was never tracked',
    newer: serve(),
    older: serve({ noContact: true }),
    expect: 'no_contact',
  },
  {
    why: 'the ankles were out of frame, so there is no length to scale by',
    newer: serve(),
    older: serve({ camera: { hidden: [LM.leftAnkle, LM.rightAnkle] } }),
    expect: 'no_scale',
  },
]

for (const r of REFUSALS) {
  check(`refused because ${r.why}`, () => {
    const result = pairTracks(r.newer, r.older)
    assert(!result.ok, 'the pair was allowed')
    assert(
      !result.ok && result.refusal === r.expect,
      `refused as ${result.ok ? '' : result.refusal}, not ${r.expect}`,
    )
  })
}

/**
 * The boundary, both sides, because a gate written `<` where it meant `<=` fails
 * on exactly one input and no test that samples the middle will ever see it.
 */
check(`a camera exactly ${GHOST_YAW_TOLERANCE_DEG}° apart is still a pair`, () => {
  const r = pairTracks(serve({ yaw: 38 }), serve({ yaw: 38 + GHOST_YAW_TOLERANCE_DEG }))
  assert(r.ok, `refused at exactly the tolerance: ${r.ok ? '' : r.refusal}`)
  assert(r.ok && Math.abs(r.pair.yawGap - GHOST_YAW_TOLERANCE_DEG) < 1e-9, 'the gap was misreported')
})

/**
 * The shape R65 has not guarded yet. A row claiming a measured angle with no
 * number behind it must refuse as unmeasured, not as a camera that moved: `NaN`
 * fails the tolerance comparison either way, so this check is the only thing
 * standing between the right outcome and the wrong name for it.
 */
check('an angle claimed as measured with no number behind it is unmeasured', () => {
  const broken = serve()
  ;(broken.triage as unknown as { quality: { yaw_deg: unknown } }).quality.yaw_deg = undefined
  const r = pairTracks(serve(), broken)
  assert(
    !r.ok && r.refusal === 'yaw_unmeasured',
    `refused as ${r.ok ? 'nothing — it was allowed' : r.refusal}, not yaw_unmeasured`,
  )
})

check('the refusal is symmetric — the angle gate doesn’t care which serve is older', () => {
  const wide = pairTracks(serve({ yaw: 50 }), serve({ yaw: 40 }))
  const other = pairTracks(serve({ yaw: 40 }), serve({ yaw: 50 }))
  assert(
    !wide.ok && !other.ok && wide.refusal === other.refusal,
    'swapping the two serves changed the answer',
  )
})

/* ------------------------------------------------------------- the lookup */

heading('And where the older serve is at an instant of the newer one')

/**
 * A pair with a clock worth searching: contact a third of a second into the
 * newer replay, the older swing running from a fifth of a second before contact
 * to a fifth after, in tenths.
 */
const clockPair = () => ({
  contactAt: 0.3,
  yawGap: 0,
  samples: [-0.2, -0.1, 0, 0.1, 0.2].map((fromContact, i) => ({
    fromContact,
    image: [{ x: i, y: i }],
  })),
})

check('contact on this serve draws contact on the other one', () => {
  const at = pairedLookup(clockPair())
  const image = at(0.3)
  assert(!!image, 'nothing was drawn at the aligned instant')
  // Sample index 2 is `fromContact: 0`.
  assert(image![0]!.x === 2, `drew sample ${image![0]!.x} at contact, not 2`)
})

check('the offset is the pairing own, not the raw replay clock', () => {
  // A tenth after contact on this serve is a tenth after contact on the other,
  // which is sample 3 — the check that would fail if the subtraction were
  // dropped or done at the call site against a different number.
  const image = pairedLookup(clockPair())(0.4)
  assert(image?.[0]?.x === 3, `drew sample ${image?.[0]?.x} a tenth past contact, not 3`)
})

check('an instant between two samples takes the nearer one, not the earlier', () => {
  const at = pairedLookup(clockPair())
  // 0.04 past contact: nearer to sample 2 (0) than sample 3 (0.1).
  assert(at(0.34)?.[0]?.x === 2, 'a moment just past contact snapped forward')
  // 0.06 past: nearer to sample 3.
  assert(at(0.36)?.[0]?.x === 3, 'a moment nearer the next sample took the earlier one')
})

check('before the other swing started, and after it ended, nothing is drawn', () => {
  const at = pairedLookup(clockPair())
  assert(at(0.09) === undefined, 'a body was drawn before the other serve began')
  assert(at(0.51) === undefined, 'a body was left frozen after the other serve ended')
  // The two ends themselves are inside it — a swing that ends exactly here has
  // a pose here, and refusing it would blank the last frame of every pair.
  assert(at(0.1) !== undefined, 'the first instant of the other swing drew nothing')
  assert(at(0.5) !== undefined, 'the last instant of the other swing drew nothing')
})

report()
