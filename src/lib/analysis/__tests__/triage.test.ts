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
import type { FlawId } from '../flaws'
import { detectServe } from '../phases'
import { assessSpatial, levelFrames, NOTABLE_ROLL } from '../spatial'
import { stabilise } from '../kalman'
import {
  FLAW_DRILL,
  HIERARCHY,
  LIMITS,
  assessResilience,
  rejectionFor,
  triage,
  type Resilience,
} from '../triage'
import { buildServe, type ServeDials } from '../syntheticServe'
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

check('a small tilt is left alone rather than rotated on a noisy estimate', () => {
  const frames = buildServe({}, FPS)
  assert(
    levelFrames(frames, NOTABLE_ROLL - 1) === frames,
    'a negligible roll still cost a copy of every landmark',
  )
})

check('the camera angle is recovered from the shoulder line', () => {
  const sideOn = pipeline({ cameraYaw: 88 })
  const angled = pipeline({ cameraYaw: 45 })
  assert(
    sideOn.result.quality.yaw_deg > angled.result.quality.yaw_deg,
    `side-on read as ${sideOn.result.quality.yaw_deg}°, angled as ${angled.result.quality.yaw_deg}°`,
  )
  assert(sideOn.result.quality.depth_unreliable, 'a dead side-on camera claimed to see depth')
  assert(!angled.result.quality.depth_unreliable, 'a three-quarter view was called unreadable')
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

/* ============================================================= refusal ==== */

heading('Refusing a clip it cannot read')

check('a body nobody can see is refused before anything is measured', () => {
  const r: Resilience = base({ visibility: 0.2 })
  assert(rejectionFor(r) === 'body_not_visible', `got ${rejectionFor(r)}`)
})

check('too few frames through the swing is its own refusal', () => {
  assert(rejectionFor(base({ swingSamples: 1 })) === 'too_few_frames', 'a stuttering clip passed')
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
    trophyForearmDrop: 0.22,
    tossWobble: 0.09,
    spineLean: 26,
    dropBelowShoulder: 0.05,
    hipLead: -0.09,
    contactReach: 1.15,
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
    trophyForearmDrop: 0.22,
    dropBelowShoulder: 0.05,
    hipLead: -0.09,
  })
  assert(result.primary_flaw?.flaw === 'waiters_tray', `chose ${result.primary_flaw?.flaw}`)
  assert(result.primary_flaw?.group === 'grip', 'the grip was not reported as the grip')
})

check('a bad toss outranks the swing faults underneath it', () => {
  const { result } = pipeline({ tossWobble: 0.09, dropBelowShoulder: 0.05, hipLead: -0.09 })
  assert(result.primary_flaw?.group === 'toss', `chose ${result.primary_flaw?.group}`)
})

check('a player with a terrible toss is not lectured on sequencing', () => {
  const { result } = pipeline({ tossWobble: 0.09, spineLean: 26, hipLead: -0.09 })
  assert(
    result.primary_flaw?.flaw !== 'arming_the_ball',
    'sequencing was named while the toss was still wrong',
  )
})

check('a symptom is never chosen over the cause it was attributed to', () => {
  const { result } = pipeline({ dropBelowShoulder: 0.05 })
  assert(result.primary_flaw?.flaw !== 'shallow_drop', 'the symptom outranked its own cause')
  assert(result.primary_flaw?.flaw === 'collapsed_elbow', `chose ${result.primary_flaw?.flaw}`)
})

check('the swing is reached once the foundations are sound', () => {
  const { result } = pipeline({ hipLead: -0.09 })
  assert(result.primary_flaw?.group === 'sequence', `chose ${result.primary_flaw?.group}`)
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

check('a hard-rotated tray grip is flagged as a wrist risk', () => {
  const { result } = pipeline({ palmToSky: 80, trophyForearmDrop: 0.22 })
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
    trophyForearmDrop: 0.4,
    spineLean: 30,
    tossWobble: 0.09,
  })
  assert(result.primary_flaw?.group === 'grip', 'the grip did not win the hierarchy')
  assert(result.injury_risk.length > 0, 'the injury flag was suppressed along with its flaw')
})

/* ========================================================= scrappy clips == */

heading('Clips as they actually arrive')

check('a phone-rate clip is still read', () => {
  const { result } = pipeline({}, PHONE_FPS)
  assert(result.status === 'ok', `a 30 fps clip was refused as ${result.reason}`)
  note(`${result.quality.swing_samples} swing samples at ${PHONE_FPS} fps`)
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
    note(`read at confidence ${result.quality.confidence}`)
    assert(result.quality.confidence <= 1, 'confidence ran past its own scale')
  }
})

check('nothing in the ensemble of bad clips throws', () => {
  let refused = 0
  let hedged = 0
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
        else if (result.quality.confidence < 0.7) hedged++
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
  assert(
    refused + hedged > 30,
    `only ${refused + hedged} of 60 deliberately scrappy clips were either refused or hedged`,
  )
})

check('confidence falls as the clip gets worse', () => {
  const good = pipeline({}).result.quality.confidence
  const rough = pipeline({ noise: 0.012, dropout: 0.2, seed: 31 }, PHONE_FPS).result.quality.confidence
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
  const { result } = pipeline({ palmToSky: 80, trophyForearmDrop: 0.22 })
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

report()

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
      depth_unreliable: false,
      confidence: over.spatial ?? 1,
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
