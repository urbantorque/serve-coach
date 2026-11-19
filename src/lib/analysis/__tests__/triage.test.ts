/**
 * The engine against clips nobody would call good.
 *
 * Everything else in this suite feeds the pipeline a serve it can read. This
 * file feeds it what actually arrives: thirty frames a second, a hand smeared
 * across the frame, a phone held at an angle over a fence, a limb the tracker
 * loses for half the swing. The requirement is not that the numbers survive —
 * mostly they do not — it is that the engine knows they did not, says which
 * clip problem caused it, and never crashes doing so.
 *
 * The other half is triage: whatever is wrong, the player is handed exactly one
 * thing to fix and exactly one drill, chosen by what causes what rather than by
 * what scored worst.
 */
import { assessQuality } from '../analyze'
import { DRILLS } from '../coaching'
import { metricConfidence, SOFT_MEASUREMENT } from '../confidence'
import { diagnose } from '../diagnose'
import { evaluateFlaws, type FlawId } from '../flaws'
import { detectServe } from '../phases'
import { MAX_PICTURE_ROLL, assessSpatial, courtYawFrom, levelFrames, NOTABLE_ROLL } from '../spatial'
import { stabilise } from '../kalman'
import {
  ARM_FIRST_AT,
  hierarchyFor,
  FLAW_DRILL,
  HIERARCHY,
  LIMITS,
  assessResilience,
  rejectionFor,
  triage,
  type Resilience,
} from '../triage'
import { buildServe, type ServeDials } from '../syntheticServe'
import { NotAServeError } from '../types'
import { runEngine } from '../../../dev/mocap/engine'
import { filmMocap } from '../mocapServe'
import { REAL_SERVES, SEEDS, realise, realiseReal } from './repeatability'
import { assert, check, heading, near, note, report } from './harness'

const FPS = 50
/** What a phone actually records, and what most clips arrive as. */
const PHONE_FPS = 30

function pipeline(dials: Partial<ServeDials> = {}, fps = FPS, tier = 5) {
  const frames = buildServe(dials, fps)
  const skel = detectServe(frames, fps)
  const resilience = assessResilience(frames, skel)
  const diagnosis = diagnose(frames, skel, { tier })
  return { frames, skel, resilience, result: triage(diagnosis, resilience) }
}

/* ================================================== spatial correction ==== */

heading('Finding true vertical')

check('a level phone reports no roll', () => {
  const { frames, skel } = pipeline()
  const spatial = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
  assert(Math.abs(spatial.roll_deg) < 2, `a level clip reported ${spatial.roll_deg}° of roll`)
})

check('a cocked phone is measured and rotated back onto gravity', () => {
  const level = buildServe({}, FPS)
  const skel = detectServe(level, FPS)
  const tilted = rollFrames(level, 12)

  const seen = assessSpatial(tilted, skel.keys.ready, skel.bodyHeight)
  near(seen.roll_deg, 12, 2.5, 'the roll was mis-measured')

  const levelled = levelFrames(tilted, seen.roll_deg)
  const after = assessSpatial(levelled, skel.keys.ready, skel.bodyHeight)
  assert(
    Math.abs(after.roll_deg) < Math.abs(seen.roll_deg) / 3,
    `correcting left ${after.roll_deg}° of ${seen.roll_deg}°`,
  )
  note(`roll ${seen.roll_deg}° measured, ${after.roll_deg}° left after levelling`)
})

check('correcting the roll restores the heights it distorted', () => {
  const level = buildServe({}, FPS)
  const skel = detectServe(level, FPS)
  const height = (fs: typeof level) =>
    (skel.groundY - fs[skel.keys.contact].image[16].y) / skel.bodyHeight

  const tilted = rollFrames(level, 12)
  const before = Math.abs(height(tilted) - height(level))
  const after = Math.abs(
    height(levelFrames(tilted, assessSpatial(tilted, skel.keys.ready, skel.bodyHeight).roll_deg)) -
      height(level),
  )
  assert(after < before, `levelling made contact height worse: ${before} → ${after}`)
  note(`contact height error ${before.toFixed(3)} tilted, ${after.toFixed(3)} levelled`)
})

/**
 * The gap between a gentle tilt (levelled and moved on, tested above at 12°)
 * and a severe one (refused outright, tested below from 30°): every angle in
 * between is levelled and trusted, and nothing had checked whether the
 * correction actually holds up all the way to that boundary rather than
 * quietly degrading as the tilt grows. It does, when measured the way a real
 * clip is: `analyze.ts` re-detects the skeleton, ground and contact frame from
 * the levelled frames rather than reusing the tilted clip's own — recomputing
 * both sides of the height measurement in the corrected space keeps a global
 * offset from surviving into the reading, which is exactly what a stale
 * ground reference would let through.
 */
check('the correction holds all the way to the refusal boundary, not just at a gentle tilt', () => {
  const level = buildServe({}, FPS)
  const cleanSkel = detectServe(level, FPS)
  const contactHeightOf = (fs: typeof level, skel: typeof cleanSkel) =>
    (skel.groundY - fs[skel.keys.contact].image[16].y) / skel.bodyHeight
  const baseline = contactHeightOf(level, cleanSkel)

  // From 8°: levelling grows from nothing at 5° and is whole from 7° (H37), so a
  // 6° tilt is half corrected by design, not by a failing correction.
  for (const deg of [8, 10, 14, 17]) {
    const tilted = rollFrames(level, deg)
    const tiltedSkel = detectServe(tilted, FPS)
    const spatial = assessSpatial(tilted, tiltedSkel.keys.ready, tiltedSkel.bodyHeight)
    assert(rejectionFor(assessResilience(tilted, tiltedSkel)) === undefined, `${deg}° was refused, not a gap case`)

    const levelled = levelFrames(tilted, spatial.roll_deg)
    const levelledSkel = detectServe(levelled, FPS)
    const corrected = Math.abs(contactHeightOf(levelled, levelledSkel) - baseline)
    assert(corrected < 0.005, `${deg}° of roll left ${corrected.toFixed(4)} of contact-height error after levelling`)
  }
})

check('a small tilt is left alone rather than rotated on a noisy estimate', () => {
  const frames = buildServe({}, FPS)
  assert(
    levelFrames(frames, NOTABLE_ROLL - 1) === frames,
    'a negligible roll still cost a copy of every landmark',
  )
})

/**
 * R14 in NEXT.md: axes.ts assumes image y is vertical, which is only true if
 * the sensor's rotation was honoured on the way in. The rig cannot render a
 * genuinely mis-rotated MP4 — that needs a real decoder and a real phone,
 * the same block the court trip and the fixture shoot are already waiting on
 * — but it can render what a badly-rotated *reading* of one would look like
 * to the pose model: a body that is not where an upright clip says it should
 * be. `rollFrames` already does that faithfully for an ordinary cocked phone;
 * driven past `NOTABLE_ROLL`'s own ±25° clamp, it is the closest thing to
 * that clip this suite can build.
 */
check('a severely rotated clip is refused, not measured through a 25° clamp', () => {
  for (const deg of [30, 45, 60, 75, 89]) {
    const level = buildServe({}, FPS)
    const skel = detectServe(level, FPS)
    const tilted = rollFrames(level, deg)
    const resilience = assessResilience(tilted, skel)
    const reason = rejectionFor(resilience)
    assert(
      reason !== undefined,
      `a clip rotated ${deg}° was not refused — spatial confidence ${resilience.spatial.confidence}`,
    )
  }
})

/**
 * The check above borrows its keyframes from the level clip rather than
 * detecting them from the tilted one, which is not what `analyze.ts` actually
 * does on a real clip: its first pass calls `detectServe` on the raw, still-
 * tilted frames, and only reaches `assessSpatial`/`rejectionFor` if that first
 * call succeeds. This simulates that real sequence end to end and found a
 * genuine, precisely-bounded gap: `detectServe` on its own succeeds cleanly
 * all the way to 100° (confirmed by sweep, comfortably past where the second
 * check above already proves 30-89° gets the correct camera_unusable refusal
 * once assessSpatial runs), but somewhere between 100° and 110° it starts
 * throwing on the first pass instead -- via the ordinary swing-amplitude
 * check in `assertPlausible`, which was never designed to characterise a tilt
 * this severe. Past that point, including the full 180° inversion a phone
 * mounted upside down would produce, a player is told "That does not look
 * like a serve" rather than anything about their camera angle -- true that
 * the clip was refused (it fails safe; no numbers are ever shown), false as
 * to why, which sends a player who filmed a real service motion looking for
 * the wrong fix. Closing that gap meant estimating roll before there is a
 * skeleton to read `keys.ready` from, which was declined here at the time as a
 * change to `analyze.ts`'s detect -> assess -> level sequence. It has since
 * been made (D7.8, `turnedPicture`): the roll is read off the whole clip
 * first, and the check after the next one holds the reason. This one keeps
 * the older guarantee, that every angle fails safely and never crashes.
 */
check('past the point detectServe fails on its own, it still fails safely rather than crashing', () => {
  /*
   * Through the pipeline rather than `detectServe` alone. Since the toss is
   * read from the tossing hand's own lift (`findRelease`), the detector finds
   * a "serve" in a clip rolled 110° where it used to throw; what the guarantee
   * is about is the player, and the pipeline still refuses every one of these
   * — the keyframes it found put contact on the toss, which is refused before
   * anything is measured. The reason that refusal gave (the clip ends before
   * the racket reaches the ball) was the wrong one for a rotated phone, and is
   * now `turnedPicture`'s, before the detector runs.
   */
  for (const deg of [110, 135, 165, 179, 180, 181]) {
    const level = buildServe({}, FPS)
    const tilted = rollFrames(level, deg)
    let outcome: string
    try {
      const result = runEngine(tilted, FPS)
      outcome = result.ok ? result.run.verdict.status : 'refused'
    } catch (err) {
      outcome = err instanceof NotAServeError ? 'refused' : `crashed: ${err}`
    }
    assert(outcome === 'refused' || outcome === 'rejected', `${deg}° did not fail safely: ${outcome}`)
  }
})

check('a phone tilted past levelling is told so, from a lean to upside down', () => {
  // D7.8. Under 30° the clip is levelled and measured; past it the player is
  // told what was wrong with the picture rather than with the serve. A clip
  // rolled 30–40° used to be levelled by 25° — `estimateRoll`'s clamp — and
  // measured with the rest still in it, and 89–110° was told it ended before
  // contact. The real serve is filmed from the guide's placement; its own
  // standing axis reads a few degrees off upright, so its sweep starts higher.
  const reason = (frames: ReturnType<typeof buildServe>, fps: number) => {
    const r = runEngine(frames, fps)
    return r.ok ? `measured (${r.run.verdict.status})` : r.refusal
  }
  const real = filmMocap(REAL_SERVES[0], { fps: 30 })
  const picture = /tilted|on its side|upside down/
  for (const deg of [-90, -45, 35, 40, 50, 60, 75, 89, 90, 100, 110, 135, 165, 180]) {
    const rig = reason(rollFrames(buildServe({}, FPS), deg), FPS)
    assert(picture.test(rig), `rig rolled ${deg}°: "${rig}"`)
    if (Math.abs(deg) >= 40) {
      const motion = reason(rollFrames(real, deg), 30)
      assert(picture.test(motion), `real serve rolled ${deg}°: "${motion}"`)
    }
  }
  for (const deg of [0, 10, 20, -20]) {
    const rig = reason(rollFrames(buildServe({}, FPS), deg), FPS)
    assert(rig.startsWith('measured'), `a ${deg}° roll, which levelling handles, was refused: "${rig}"`)
  }
  note(
    `refused from ${MAX_PICTURE_ROLL}°: ${reason(rollFrames(buildServe({}, FPS), 40), FPS)} / ` +
      `${reason(rollFrames(buildServe({}, FPS), 90), FPS)} / ${reason(rollFrames(buildServe({}, FPS), 180), FPS)}`,
  )
})

check('a body the tracker barely saw is not called upside down', () => {
  // The Commons table-tennis clip: its "shoulders" sit below its "hips" in
  // every frame, steadily, at visibility under a half in three frames of four.
  // A picture the pose model cannot read is not a phone on its side, so it gets
  // no verdict from the roll and goes on to be refused as no serve.
  const garbled = rollFrames(buildServe({}, FPS), 165).map((f, i) =>
    i % 4 === 0
      ? f
      : { ...f, image: f.image.map((p, k) => (k >= 11 && k <= 28 ? { ...p, visibility: 0.3 } : p)) },
  )
  const r = runEngine(garbled, FPS)
  const said = r.ok ? `measured (${r.run.verdict.status})` : r.refusal
  note(`a body seen in a quarter of the frames: ${said}`)
  assert(!/upside down|on its side|tilted/.test(said), `a garbled track was blamed on the phone: "${said}"`)
})

check('the camera angle is recovered from the shoulder line', () => {
  const sideOn = pipeline({ cameraYaw: 88 })
  const angled = pipeline({ cameraYaw: 45 })
  // The stored yaw is the camera against the shoulders at the ready, and a
  // real server has their back to the guide's camera — so side-on to the court
  // is square to the shoulders, and the larger COURT angle is the claim.
  const court = (r: typeof sideOn) => courtYawFrom(r.result.quality!.yaw_deg)
  assert(
    court(sideOn) > court(angled),
    `side-on read as ${court(sideOn)}° to the court, angled as ${court(angled)}°`,
  )
  assert(sideOn.result.quality!.depth_unreliable, 'a dead side-on camera claimed to see depth')
  assert(!angled.result.quality!.depth_unreliable, 'a three-quarter view was called unreadable')
})

/* ============================================================ blur math === */

heading('Tracking through blur')

check('a clean track passes through the filter essentially untouched', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const window = frames.slice(skel.keys.trophy, skel.keys.contact + 1)
  const track = stabilise(
    window.map((f) => f.image[16]),
    window.map((f) => f.t),
  )
  let worst = 0
  window.forEach((f, i) => {
    worst = Math.max(worst, Math.hypot(track.points[i].x - f.image[16].x, track.points[i].y - f.image[16].y))
  })
  assert(worst / skel.bodyHeight < 0.05, `the filter moved a clean hand by ${worst.toFixed(4)}`)
  note(`clean track moved at most ${(worst / skel.bodyHeight).toFixed(4)} body heights`)
})

check('the filter pulls a jittery hand back towards its own path', () => {
  const clean = buildServe({}, FPS)
  const noisy = buildServe({ noise: 0.01, seed: 5 }, FPS)
  const skel = detectServe(clean, FPS)
  const lo = skel.keys.trophy
  const hi = skel.keys.contact

  const raw = mean(
    range(lo, hi).map((i) =>
      Math.hypot(noisy[i].image[16].x - clean[i].image[16].x, noisy[i].image[16].y - clean[i].image[16].y),
    ),
  )
  const window = noisy.slice(lo, hi + 1)
  const track = stabilise(
    window.map((f) => f.image[16]),
    window.map((f) => f.t),
  )
  const filtered = mean(
    range(lo, hi).map((i) =>
      Math.hypot(
        track.points[i - lo].x - clean[i].image[16].x,
        track.points[i - lo].y - clean[i].image[16].y,
      ),
    ),
  )
  assert(filtered < raw, `filtering made the track worse: ${raw.toFixed(4)} → ${filtered.toFixed(4)}`)
  note(`error ${raw.toFixed(4)} raw, ${filtered.toFixed(4)} filtered`)
})

check('a landmark the tracker loses is carried by its own momentum', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const lo = skel.keys.trophy
  const hi = skel.keys.contact
  const truth = frames.slice(lo, hi + 1).map((f) => ({ ...f.image[16] }))

  // Four frames through the swing arrive parked and unseen — exactly what a
  // pose model returns when a limb vanishes into a smear.
  const window = frames.slice(lo, hi + 1).map((f) => ({ ...f, image: [...f.image] }))
  for (let i = 3; i < 7 && i < window.length; i++) {
    window[i].image[16] = { ...truth[2], visibility: 0.08 }
  }

  const track = stabilise(
    window.map((f) => f.image[16]),
    window.map((f) => f.t),
  )
  const stuck = Math.hypot(truth[5].x - truth[2].x, truth[5].y - truth[2].y)
  const recovered = Math.hypot(track.points[5].x - truth[5].x, track.points[5].y - truth[5].y)
  assert(recovered < stuck, `the filter sat on the stale position: ${recovered} against ${stuck}`)
  note(`lost frame recovered to within ${(recovered / skel.bodyHeight).toFixed(3)} body heights`)
})

check('blur is scored from both what was seen and what made sense', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const clean = assessResilience(frames, skel).blur
  const smeared = assessResilience(buildServe({ noise: 0.02, seed: 9 }, FPS), skel).blur
  assert(smeared > clean, `a smeared clip scored ${smeared} against a clean ${clean}`)
  note(`blur ${clean.toFixed(2)} clean, ${smeared.toFixed(2)} smeared`)
})

/*
 * R8 in NEXT.md: occlusion is a different failure from blur, and `wildness`
 * cannot see it. A hand smeared by fast motion produces a noisy track — large
 * second differences, which `wildness` is built to catch. A hand MediaPipe has
 * lost behind the body for a stretch is often the opposite: the model holds
 * roughly still on its last plausible guess rather than declining, at full
 * visibility, which reads as a *clean* track to a statistic built on
 * curvature. `frozenThroughSwing` in kalman.ts asks the other question —
 * did the racket hand travel at all through the one window guaranteed to be a
 * large, fast excursion — and these drive it with the rig's own
 * `occlusionSeconds` dial.
 */
check('a racket hand frozen through the whole drop-to-contact window is caught', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const clean = assessResilience(frames, skel)
  const occluded = assessResilience(buildServe({ occlusionSeconds: 0.5 }, FPS), skel)

  assert(clean.blur < LIMITS.blur, `a clean track was already flagged blurred: ${clean.blur}`)
  assert(occluded.blur >= LIMITS.blur, `a frozen track scored only ${occluded.blur}`)
  note(`blur ${clean.blur.toFixed(2)} clean, ${occluded.blur.toFixed(2)} frozen through the drop`)
})

check('a frozen drop-to-contact window is refused, not reported as a number', () => {
  // Not necessarily 'too_blurry': a wrist frozen for half a second can also
  // confuse where the drop and contact keyframes themselves land — `drop` is
  // the lowest point *after* the trophy, and a track that stopped moving can
  // leave too little of the window either side of it for `swingSamples` to
  // clear its own floor first. `rejectionFor` checks that ahead of blur, and
  // either reason is the same honest outcome: refused rather than guessed at.
  const frames = buildServe({ occlusionSeconds: 0.5 }, FPS)
  const skel = detectServe(frames, FPS)
  const resilience = assessResilience(frames, skel)
  const reason = rejectionFor(resilience)
  assert(
    reason === 'too_blurry' || reason === 'too_few_frames',
    `a frozen swing was not refused at all: got ${reason}`,
  )
})

check('the wildness statistic alone misses a frozen track — this is why the second check exists', () => {
  // Not a claim about a defect: it is the reason `frozenThroughSwing` had to
  // be a different statistic rather than a tighter band on the existing one.
  // A held-still landmark has near-zero curvature, so `wildness` reads it as
  // clean however long it is held — pinned so nobody "simplifies" the two
  // checks back into one.
  const frames = buildServe({ occlusionSeconds: 0.5 }, FPS)
  const skel = detectServe(frames, FPS)
  const window = frames.slice(skel.keys.ready, skel.keys.finish + 1)
  // Right wrist, MediaPipe's index — the rig's default player is right-handed,
  // matching the same landmark the filter test above reads.
  const track = stabilise(
    window.map((f) => f.image[16]),
    window.map((f) => f.t),
  )
  const zigzag = track.wildness / skel.bodyHeight
  assert(zigzag < 0.02, `wildness alone already caught this: ${zigzag}`)
})

/* ============================================================= refusal ==== */

heading('Refusing a clip it cannot read')

check('a body nobody can see is refused before anything is measured', () => {
  const r: Resilience = base({ visibility: 0.2 })
  assert(rejectionFor(r) === 'body_not_visible', `got ${rejectionFor(r)}`)
})

check('too few frames through the swing is its own refusal', () => {
  assert(rejectionFor(base({ swingSamples: 1 })) === 'too_few_frames', 'a stuttering clip passed')
})

check('two samples through the swing is read, with the timing left soft (N2.7)', () => {
  // A quick 30 fps serve whose drop the camera did catch sits here; refusing it
  // refused the copies that read the drop right. The timing is hedged instead.
  assert(rejectionFor(base({ swingSamples: 2 })) === undefined, 'a serve with its drop caught was refused')
  assert(LIMITS.swingSamples === 2, `the limit is ${LIMITS.swingSamples}`)
})

check('a smeared clip is refused rather than guessed at', () => {
  assert(rejectionFor(base({ blur: 0.9 })) === 'too_blurry', 'a smear was analysed anyway')
})

check('an unusable camera angle is refused last, after the clip itself', () => {
  const both = base({ visibility: 0.2, spatial: 0.1 })
  assert(rejectionFor(both) === 'body_not_visible', 'the deeper problem was not reported first')
})

check('a refusal carries no findings at all', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const out = triage(diagnose(frames, skel, { tier: 5 }), base({ blur: 0.95 }))
  assert(out.status === 'rejected' && out.reason === 'too_blurry', 'the clip was not refused')
  assert(!out.primary_flaw && !out.drill_id && !out.tier, 'a refusal still handed out advice')
  assert(out.injury_risk.length === 0 && out.suppressed_count === 0, 'a refusal leaked findings')
})

check('a good clip is not refused', () => {
  const { result } = pipeline()
  assert(result.status === 'ok', `a clean serve was refused as ${result.reason}`)
})

/* ======================================================== the hierarchy === */

heading('One thing to work on')

check('exactly one flaw and one drill come back, whatever was found', () => {
  const messy = pipeline({
    palmToSky: 80,
    trophyArmLayOver: 1,
    trophyForearmDrop: 0.22,
    tossWobble: 0.09,
    spineLean: 34,
    dropBelowShoulder: -0.25,
    hipLead: -0.09,
    contactReach: 1.0,
  })
  const out = messy.result
  assert(out.status === 'ok', `a readable clip was refused: ${out.reason}`)
  assert(Boolean(out.primary_flaw), 'a serve with six faults produced none')
  assert(Boolean(out.drill_id), 'a flaw came back with no drill')
  assert(out.suppressed_count > 0, 'nothing was suppressed on a serve full of faults')
  note(`${out.primary_flaw!.flaw} chosen, ${out.suppressed_count} suppressed`)
})

check('the grip outranks everything below it', () => {
  const { result } = pipeline({
    palmToSky: 80,
    trophyArmLayOver: 1,
    trophyForearmDrop: 0.22,
    dropBelowShoulder: 0.05,
    hipLead: -0.09,
  })
  assert(result.primary_flaw?.flaw === 'waiters_tray', `chose ${result.primary_flaw?.flaw}`)
  assert(result.primary_flaw?.group === 'grip', 'the grip was not reported as the grip')
})

check('a bad toss outranks the swing faults underneath it', () => {
  // 0.15 since L5.1: the toss is judged on the card's band, and 0.09 sits in it.
  const { result } = pipeline({ tossWobble: 0.15, dropBelowShoulder: 0.05, hipLead: -0.09 })
  assert(result.primary_flaw?.group === 'toss', `chose ${result.primary_flaw?.group}`)
})

check('a player with a terrible toss is not lectured on sequencing', () => {
  const { result } = pipeline({ tossWobble: 0.09, spineLean: 34, hipLead: -0.09 })
  assert(
    result.primary_flaw?.flaw !== 'arming_the_ball',
    'sequencing was named while the toss was still wrong',
  )
})

check('a symptom is never chosen over the cause it was attributed to', () => {
  /*
   * Placed on readings rather than posed on the rig, and the rig is why. The
   * pair is a racket drop that stayed high and an elbow that fell, and since
   * the drop band was re-anchored on real motion (ANALYSIS-REVIEW.md §9) the
   * two cannot share a serve: a hand left a hand's width above the shoulder
   * holds the elbow up with it, and the rig — which keeps both arm lengths —
   * will not pose one without the other. The rule under test is the triage's,
   * not the pair's, so it is held on readings set past both bands.
   */
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const diagnosis = diagnose(frames, skel, { tier: 5 })
  const flaws = evaluateFlaws(
    {
      drop_depth_ratio: { value: -0.3, confidence: 0.9 },
      elbow_lift_ratio: { value: -0.3, confidence: 0.9 },
    },
    5,
  )
  const symptom = flaws.find((f) => f.flaw === 'shallow_drop')
  assert(symptom?.detected === true && symptom.caused_by === 'collapsed_elbow', 'the pair no longer attributes')
  const result = triage({ ...diagnosis, flaws }, assessResilience(frames, skel))
  assert(result.primary_flaw?.flaw !== 'shallow_drop', 'the symptom outranked its own cause')
  assert(result.primary_flaw?.flaw === 'collapsed_elbow', `chose ${result.primary_flaw?.flaw}`)
})

check('the swing is reached once the foundations are sound', () => {
  // From a corner: the guide's own camera sees a real server's shoulders
  // square, so the coil is hedged there and nothing in this group can be named
  // from it (`flaws.test.ts`, "a chest already open at the trophy"). An open
  // chest, because a level trunk is under the floor real motion set.
  const { result } = pipeline({ shoulderYaw: 82, hipYaw: 116, cameraYaw: 45 })
  assert(result.primary_flaw?.group === 'sequence', `chose ${result.primary_flaw?.group}`)
})

check('above club level, legs come straight after the toss, ahead of the drop', () => {
  // Kovacs's order: the release, then the load. A serve that never drives and
  // also drops short is sent to its legs first.
  const { result } = pipeline({ trophyKneeAngle: 170, contactHipHeight: 0.95, dropBelowShoulder: -0.25 }, FPS, 6)
  assert(result.primary_flaw?.group === 'legs', `chose ${result.primary_flaw?.group}`)
})

check('at club level and below, the arm comes before the legs (L3.9)', () => {
  // The arm action matures first and leg drive last (Whiteside 2013), and a
  // serve with no leg drive costs speed but adds no load to the shoulder
  // (Reid 2008). The same serve, at each rung: the order turns at rung 4.
  for (const tier of [2, 3, 4, 5, 6, 8]) {
    const { result } = pipeline({ trophyKneeAngle: 170, contactHipHeight: 0.95, dropBelowShoulder: -0.25 }, FPS, tier)
    const want = tier <= ARM_FIRST_AT ? 'drop' : 'legs'
    note(`rung ${tier}: ${result.primary_flaw?.group}`)
    assert(result.primary_flaw?.group === want, `at rung ${tier} the plan led with ${result.primary_flaw?.group}, not ${want}`)
  }
  const order = (tier: number) => hierarchyFor(tier).map((g) => g.group).join(' > ')
  assert(order(4) === 'grip > toss > drop > legs > posture > sequence > contact', order(4))
  assert(order(5) === 'grip > toss > legs > posture > drop > sequence > contact', order(5))
})

check('a clean serve at its own level is handed nothing to fix', () => {
  const { result } = pipeline({}, FPS, 4)
  assert(result.status === 'ok', 'a clean serve was refused')
  assert(!result.primary_flaw, `a clean serve was told to fix ${result.primary_flaw?.flaw}`)
  assert(!result.drill_id, 'a clean serve came back with a drill')
})

check('every flaw the engine can name has a drill that exists', () => {
  const named = new Set<FlawId>()
  for (const level of HIERARCHY) level.flaws.forEach((f) => named.add(f))
  for (const flaw of named) {
    const id = FLAW_DRILL[flaw]
    assert(Boolean(id), `${flaw} has no drill`)
    assert(Boolean(DRILLS[id]), `${flaw} points at a drill that does not exist: ${id}`)
  }
  for (const [flaw, id] of Object.entries(FLAW_DRILL)) {
    assert(named.has(flaw as FlawId), `${flaw} has a drill but sits in no hierarchy group`)
    assert(Boolean(DRILLS[id]), `${flaw} points at a missing drill`)
  }
})

/* ============================================================== injury ==== */

heading('Mechanics that risk a joint')

check('a tray grip is flagged as an elbow and wrist risk', () => {
  // The turn through contact is still dialled, but since L1.3 the flag no
  // longer reads it: the forearm's turn is under-resolved, and the flag stands
  // on the named tray alone.
  const { result } = pipeline({ palmToSky: 80, trophyArmLayOver: 1, trophyForearmDrop: 0.22, pronation: 120 })
  const risks = result.injury_risk.map((r) => r.flag)
  note(risks.join(', ') || 'none')
  assert(
    risks.includes('wrist_strain_forced_pronation'),
    `a tray grip rotated hard through the ball was not flagged: ${risks.join(', ') || 'none'}`,
  )
})

check('a clean serve raises no injury flags', () => {
  assert(pipeline({}).result.injury_risk.length === 0, 'a clean serve was called dangerous')
})

check('an injury flag survives triage even when its flaw is not the one chosen', () => {
  // The forearm drop is what actually turns the palm up on this rig — the
  // `palmToSky` dial alone left the measured grip three degrees outside its
  // band, which the noise floor in `tiers.ts` now correctly declines to call a
  // fault at all. A tray grip this test can rest an assertion on has to be one
  // the engine could tell from a clean grip on a real camera.
  const { result } = pipeline({
    palmToSky: 80,
    // Laid over since L5.2, and the forearm at 0.3 rather than 0.4: with the
    // arm let down as well, 0.4 stretches it until it cocks at 74°, too high to
    // be a tray.
    trophyArmLayOver: 1,
    trophyForearmDrop: 0.3,
    spineLean: 34,
    tossWobble: 0.09,
  })
  assert(result.primary_flaw?.group === 'grip', 'the grip did not win the hierarchy')
  assert(result.injury_risk.length > 0, 'the injury flag was suppressed along with its flaw')
})

heading('Joint warnings stand on measured footing (L1.3)')

const rate = (runs: { injuries: string[] }[], flag: string) =>
  runs.filter((r) => r.injuries.includes(flag)).length / Math.max(1, runs.length)

check("no joint warning is raised on real serves from the guide's placement", () => {
  // The six Bath serves, twenty-four noisy takes each. Before L1.3 the wrist
  // flag's second witness was true on every real serve, and the lower back
  // was warned about from a lean the side camera reads along its lens.
  const runs = realiseReal(REAL_SERVES, SEEDS, 50, 5).flat()
  const raised = runs.filter((r) => r.injuries.length)
  note(`the guide: ${raised.length} of ${runs.length} real takes raised a warning`)
  assert(runs.length > 100, `only ${runs.length} takes were readable`)
  assert(raised.length === 0, `${raised.map((r) => r.injuries.join('+')).join(', ')}`)
})

check('from the back fence, a real serve that does not fold raises no lower-back warning', () => {
  /*
   * Was KNOWN until N2.12: the fold's reading moves about ±10° between takes
   * of one real serve from behind, it was named at 29°, and the noisiest takes
   * reached 28–30°, so 4 of 144 takes of real serves that do not fold raised
   * the warning. It closed the way this check asked, through the fault rather
   * than a second line of the warning's own: the level-5 band these takes are
   * graded at stopped carrying an uncited step stricter than the club band its
   * Bath motion was read inside, so the fault is named at 31° and no real take
   * from behind reaches it. The cost is the next check's.
   */
  const runs = realiseReal(REAL_SERVES, SEEDS, 50, 5, { bearing: 180, distance: 6 }).flat()
  const raised = runs.filter((r) => r.injuries.length)
  note(`the back fence: ${raised.length} of ${runs.length} real takes raised a warning`)
  assert(runs.length > 100, `only ${runs.length} takes were readable`)
  assert(raised.length === 0, `${raised.length} of ${runs.length} real takes raised a warning from behind: ${raised.map((r) => r.injuries.join('+')).join(', ')}`)
})

check('the clean rig serve raises none through the noise', () => {
  for (const cameraYaw of [82, 8]) {
    const runs = realise({ cameraYaw })
    const raised = runs.filter((r) => r.injuries.length)
    note(`clean rig at ${cameraYaw}°: ${raised.length} of ${runs.length}`)
    assert(raised.length === 0, `a clean serve at ${cameraYaw}° raised ${raised.map((r) => r.injuries.join('+')).join(', ')}`)
  }
})

check('a dialled tray and a dialled fold are still caught through the noise', () => {
  // Filmed where each can be read: the fold from behind the baseline. A 40°
  // fold reads 31–39° through the noise. Nearer the line it is caught less
  // often, as the noise floor intends.
  //
  // MEASURED TRADE, N2.12. The line was 29° while the level-5 band carried an
  // uncited step stricter than the club band, and a 40° fold cleared it on
  // every take. At the club band the line is 31°, the bottom of that fold's
  // spread, and it is caught on 88% of takes; in exchange no real serve that
  // does not fold is warned about from behind (the check above, 4 of 144
  // before). The fold this warns about is gross, and still caught nearly
  // nine times in ten.
  const tray = realise({ palmToSky: 80, trophyArmLayOver: 1, trophyForearmDrop: 0.25 })
  const fold = realise({ spineLean: 40, cameraYaw: 8 })
  const trayRate = rate(tray, 'wrist_strain_forced_pronation')
  const foldRate = rate(fold, 'lumbar_load_posture_collapse')
  note(`tray flagged on ${Math.round(trayRate * 100)}%, fold on ${Math.round(foldRate * 100)}%`)
  assert(trayRate >= 0.9, `a dialled tray was flagged on only ${Math.round(trayRate * 100)}% of takes`)
  assert(foldRate >= 0.85, `a dialled fold was flagged on only ${Math.round(foldRate * 100)}% of takes, under the 88% measured at the club band (N2.12)`)
})

check('a joint warning never stands on less than its own fault', () => {
  // Every warning raised in these ensembles has its fault named beside it.
  const pairs: [string, string][] = [
    ['wrist_strain_forced_pronation', 'waiters_tray'],
    ['lumbar_load_posture_collapse', 'posture_collapse'],
    ['shoulder_load_no_drop', 'shallow_drop'],
  ]
  const runs = [
    ...realise({ palmToSky: 80, trophyArmLayOver: 1, trophyForearmDrop: 0.25 }),
    ...realise({ spineLean: 34, cameraYaw: 8 }),
    ...realise({ dropBelowShoulder: -0.25 }),
  ]
  for (const r of runs) {
    for (const [flag, flaw] of pairs) {
      if (r.injuries.includes(flag as never)) {
        assert(r.named.has(flaw as FlawId), `${flag} was raised without ${flaw} named`)
      }
    }
  }
})

/* ========================================================= scrappy clips == */

heading('Clips as they actually arrive')

check('a phone-rate clip is still read', () => {
  const { result } = pipeline({}, PHONE_FPS)
  assert(result.status === 'ok', `a 30 fps clip was refused as ${result.reason}`)
  note(`${result.quality!.swing_samples} swing samples at ${PHONE_FPS} fps`)
})

check('the same serve gets the same verdict at every frame rate', () => {
  // The failure this guards against is subtle and was real: every window in the
  // engine used to be counted in frames, so an average taken over two frames
  // spanned 16 ms on a slow-motion clip and 66 ms on a phone. At the phone rate
  // that smeared the two ends of the pronation window into each other, and a
  // perfectly normal serve came back as a pushed contact — a fault the player
  // was told about for owning an ordinary camera.
  const verdicts = [24, 30, 50, 120].map((fps) => ({
    fps,
    flaw: pipeline({}, fps, 4).result.primary_flaw?.flaw ?? 'none',
  }))
  note(verdicts.map((v) => `${v.fps}: ${v.flaw}`).join(', '))
  const first = verdicts[0].flaw
  for (const v of verdicts) {
    assert(v.flaw === first, `${v.fps} fps reported ${v.flaw} against ${first} at 24 fps`)
  }
})

/*
 * The blur figure used to divide the filter's prediction error by `step`, the
 * distance the hand travelled between samples. `step` halves when the frame rate
 * doubles and a tracker's per-frame jitter does not, so the identical clip
 * scored 0.02 at 24 fps and 0.93 at 120 — and every single refusal in the
 * ensemble below came through that gate, on copy telling the player to refilm in
 * slow motion. These three pin the shape of what replaced it: the number means
 * the same thing at every rate, an ordinary phone clip is not hedged for it, and
 * a clip that has genuinely stopped describing a swing is still refused.
 */
check('the same jitter reads the same blur at every frame rate', () => {
  const blurAt = (fps: number) =>
    pipeline({ noise: 0.012, seed: 7 }, fps).resilience.blur
  const rates = [24, 30, 50, 120]
  const seen = rates.map(blurAt)
  note(rates.map((f, i) => `${f}: ${seen[i].toFixed(2)}`).join(', '))
  const spread = Math.max(...seen) - Math.min(...seen)
  assert(spread < 0.3, `blur moved ${spread.toFixed(2)} across frame rate on one clip`)
})

check('an ordinary phone clip is not called blurred', () => {
  // The rig's own figure for a well-lit clip from a modern phone.
  for (const fps of [30, 60, 120]) {
    const { resilience, result } = pipeline({ noise: 0.008, seed: 11 }, fps)
    assert(
      result.status === 'ok',
      `a typical phone clip at ${fps} fps was refused: ${result.reason}`,
    )
    assert(
      resilience.blur < LIMITS.blur,
      `a typical phone clip at ${fps} fps read blur ${resilience.blur}`,
    )
  }
})

check('a smeared swing is measured and hedged, not thrown away', () => {
  // Between the rig's figure for a poorly-lit clip and the point where the
  // engine starts naming faults the noise invented — the band that used to be
  // refused outright and now has to come back hedged instead.
  const noise = 0.025
  const frames = buildServe({ noise, seed: 5 }, PHONE_FPS)
  const skel = detectServe(frames, PHONE_FPS)
  const resilience = assessResilience(frames, skel)
  const result = triage(diagnose(frames, skel, { tier: 5 }), resilience)

  assert(result.status === 'ok', `a readable-but-smeared clip was refused: ${result.reason}`)
  assert(resilience.blur > 0.3, `blur read only ${resilience.blur} on a visibly smeared clip`)

  const quality = assessQuality(frames, skel, PHONE_FPS, resilience.blur)
  assert(
    quality.warnings.some((w) => w.includes('racket arm')),
    'a smeared swing was measured without telling the player it was smeared',
  )

  const ctx = {
    frames,
    skel,
    swingSamples: quality.swingSamples,
    view: quality.view,
    blur: resilience.blur,
  }
  // The smear is measured on the racket wrist, so it may only cost the readings
  // taken from it. A knee angle at the trophy is as readable as it ever was, and
  // hedging it would teach the player to ignore the hedges that matter.
  const swing = metricConfidence('contactHeight', ctx)
  const knee = metricConfidence('kneeBend', ctx)
  note(`contact height ${swing.toFixed(2)}, knee bend ${knee.toFixed(2)}`)
  assert(swing < knee, `the smeared swing (${swing}) was trusted as much as the knee (${knee})`)
  assert(knee > SOFT_MEASUREMENT, `a knee angle was hedged for a blurred racket hand (${knee})`)
})

check('a shaky, low-light, phone-rate clip does not crash and reports honestly', () => {
  const { result } = pipeline({ noise: 0.012, dropout: 0.2, seed: 31, cameraYaw: 58 }, PHONE_FPS)
  assert(result.schema === 1, 'the output lost its shape')
  if (result.status === 'rejected') {
    assert(Boolean(result.reason), 'refused with no reason')
    note(`refused: ${result.reason}`)
  } else {
    note(`read at confidence ${result.quality!.confidence}`)
    assert(result.quality!.confidence <= 1, 'confidence ran past its own scale')
  }
})

check('nothing in the ensemble of bad clips throws', () => {
  let refused = 0
  let hedged = 0
  // Of the clips jittered past the rig's poor-light figure (0.012), how many
  // were read with confidence anyway — the fourth category, by row.
  let roughButConfident = 0
  for (const seed of [2, 13, 29, 41, 57]) {
    for (const fps of [24, 30, 50]) {
      for (const dials of [
        { noise: 0.015, seed },
        { dropout: 0.35, seed },
        { noise: 0.01, dropout: 0.2, cameraYaw: 30, seed },
        { noise: 0.02, dropout: 0.3, cameraYaw: 88, seed },
      ]) {
        const { result } = pipeline(dials, fps)
        assert(result.schema === 1 && (result.status === 'ok' || result.status === 'rejected'), 'bad shape')
        assert(
          result.status === 'ok' || Boolean(result.reason),
          'a refusal came back with no reason',
        )
        if (result.status === 'rejected') refused++
        else if (result.quality!.confidence < 0.7) hedged++
        else if ((dials.noise ?? 0) > 0.012) roughButConfident++
      }
    }
  }
  // Both numbers, because the first on its own stopped meaning what it says.
  // Every one of these clips used to be refused or not on the blur gate alone,
  // and the gate was measuring frame rate as much as blur. The ensemble is
  // scrappy but readable — jitter up to the rig's poor-light figure and a bit
  // beyond — so the answer that should come back is a hedged report, not a dead
  // end. What must never grow is a fourth category: read, and read confidently.
  note(`${refused} of 60 scrappy clips refused, ${hedged} read at collapsed confidence`)
  /*
   * Per row rather than as a count, since the count went from 31 to exactly 30
   * when the rig's arm was re-posed on real motion. The rows that moved are the
   * two mildest: 35% of frames dropped, and a corner camera with jitter of
   * 0.01 — under the poor-light figure. Neither costs the score anything it can
   * see; the corner row's blur reads 0.08–0.18, and a dropped frame leaves the
   * swing with five samples or more. The guide's own placement caps every clip
   * at 0.75 on the depth hedge, which is why the dropped-frame row sits at 0.74
   * and the corner row above it. What the count was standing in for is that
   * no clip jittered past poor light is read as if it were clean — so that is
   * what is asserted, on every one of the thirty.
   */
  assert(
    roughButConfident === 0,
    `${roughButConfident} clips jittered past poor light were read at full confidence`,
  )
  assert(
    refused + hedged >= 30,
    `only ${refused + hedged} of 60 deliberately scrappy clips were either refused or hedged`,
  )
})

check('confidence falls as the clip gets worse', () => {
  const good = pipeline({}).result.quality!.confidence
  const rough = pipeline({ noise: 0.012, dropout: 0.2, seed: 31 }, PHONE_FPS).result.quality!.confidence
  assert(rough < good, `a rough clip scored ${rough} against a clean ${good}`)
  note(`confidence ${good} clean, ${rough} scrappy`)
})

check('a degenerate clip is refused rather than throwing', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const blind = frames.map((f) => ({
    ...f,
    image: f.image.map((p) => ({ ...p, visibility: 0 })),
  }))
  const out = triage(diagnose(blind, skel, { tier: 5 }), assessResilience(blind, skel))
  assert(out.status === 'rejected', 'a clip with no visible landmarks was analysed')
})

check('the output is still raw data, with no prose anywhere in it', () => {
  const { result } = pipeline({ palmToSky: 80, trophyArmLayOver: 1, trophyForearmDrop: 0.22 })
  const strings: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(result)
  for (const s of strings) assert(/^[a-z0-9_]+$/.test(s), `the output carries prose: "${s}"`)
  assert(
    JSON.stringify(JSON.parse(JSON.stringify(result))) === JSON.stringify(result),
    'the triage does not survive being stored as JSON',
  )
})


/* ---------------------------------------------------------------- helpers */

interface BaseOver {
  /** Spatial confidence, rather than the whole spatial read. */
  spatial?: number
  blur?: number
  swingSamples?: number
  visibility?: number
}

function base(over: BaseOver = {}): Resilience {
  return {
    spatial: {
      roll_deg: 0,
      yaw_deg: 60,
      court_yaw_deg: 30,
      court_yaw_from: 'stance',
      yaw_measured: true,
      depth_unreliable: false,
      confidence: over.spatial ?? 1,
      // With `depth_unreliable` false these two are the same number by
      // construction — `confidence` is the roll cost times a yaw cost of 1 — so
      // the stub says so rather than inventing a second dial nothing here tests.
      roll_confidence: over.spatial ?? 1,
    },
    blur: over.blur ?? 0,
    swingSamples: over.swingSamples ?? LIMITS.swingSamples + 2,
    visibility: over.visibility ?? 0.9,
  }
}

/** Rotate a clip about the middle of the frame, as a cocked phone would. */
function rollFrames(frames: ReturnType<typeof buildServe>, deg: number) {
  const theta = (deg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return frames.map((f) => ({
    ...f,
    image: f.image.map((p) => {
      const dx = p.x - 0.5
      const dy = p.y - 0.5
      return { ...p, x: 0.5 + dx * cos - dy * sin, y: 0.5 + dx * sin + dy * cos }
    }),
  }))
}

function range(lo: number, hi: number): number[] {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}

report()
