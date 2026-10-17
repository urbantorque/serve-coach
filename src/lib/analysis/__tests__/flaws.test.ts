/**
 * The flaw engine, against serves with known faults dialled into them.
 *
 * Two things are being checked here and they are easy to confuse. One is
 * detection: a serve built with a waiter's tray in it comes back naming the
 * waiter's tray, and a serve built clean comes back naming nothing. The other is
 * *scaling*: the same serve produces different targets for a 4 and an 8, always
 * exactly one rung above where the player is, and never a number nobody at that
 * level could reach. The second is the harder property and most of this file is
 * about it — a detector that flags everything for everybody is not a coach.
 */
import { diagnose } from '../diagnose'
import { evaluateFlaws, MIN_EVIDENCE, TRAY_ABDUCTION_MAX, type FlawId } from '../flaws'
import { filmMocap } from '../mocapServe'
import { HIERARCHY, type Triage } from '../triage'
import { causalPlan } from '../verdict'
import { REAL_SERVES } from './repeatability'
import { detectServe } from '../phases'
import {
  CARD_SIGNAL,
  MAX_TIER,
  MIN_TIER,
  SERVE_TYPE_SHIFT,
  SIGNALS,
  bandFor,
  inferTier,
  insideBand,
  nextTier,
  severityOf,
  targetFor,
} from '../tiers'
import type { BallFlight } from '../../vision/ballTrack'
import type { ServeType } from '../../storage/prefs'
import { METRICS, SERVE_TYPES, metricCopy } from '../coaching'
import { measure } from '../metrics'
import { buildServe, type ServeDials } from '../syntheticServe'
import { tossedBall } from './tossedBall'
import { assert, check, heading, near, note, report } from './harness'

const FPS = 50

function run(dials: Partial<ServeDials> = {}, tier?: number, ball?: BallFlight, serveType?: ServeType) {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  return { frames, skel, diagnosis: diagnose(frames, skel, { tier, ball, serveType }) }
}

const flagged = (d: ReturnType<typeof run>['diagnosis']): FlawId[] =>
  d.flaws.filter((f) => f.detected).map((f) => f.flaw)

const findingFor = (d: ReturnType<typeof run>['diagnosis'], flaw: FlawId) =>
  d.flaws.find((f) => f.flaw === flaw)

/* ========================================================== the ladder ==== */

heading('Targets one rung above the player')

check('the target is always exactly one tier up', () => {
  for (let t = 1; t < MAX_TIER; t++) {
    assert(nextTier(t) === t + 1, `a ${t} was aimed at ${nextTier(t)}`)
  }
  // Nobody is handed a rung that does not exist. A player at the ceiling stays
  // there rather than being given an invented eleventh level.
  assert(nextTier(MAX_TIER) === MAX_TIER, 'invented a tier above the top of the ladder')
  assert(nextTier(MAX_TIER + 5) === MAX_TIER, 'a rating past the ladder was not clamped')
})

check('a club player is never handed a strong sectional target', () => {
  for (const id of Object.keys(SIGNALS)) {
    const forFour = targetFor(id, 4)
    const forEight = targetFor(id, 8)
    const spec = SIGNALS[id]
    // Whatever the axis, what a 4 is asked for must be easier than what an 8 is.
    const easier =
      spec.direction === 'higher'
        ? forFour[0] <= forEight[0]
        : spec.direction === 'lower'
          ? forFour[1] >= forEight[1]
          : forFour[0] <= forEight[0] && forFour[1] >= forEight[1]
    assert(easier, `${id}: a 4 is asked for ${forFour} while an 8 gets ${forEight}`)
  }
})

check('every step up the ladder is a step, not a leap', () => {
  for (const id of Object.keys(SIGNALS)) {
    const spec = SIGNALS[id]
    for (let t = 3; t <= 8; t++) {
      const here = bandFor(id, t)
      const oneUp = bandFor(id, t + 1)
      const twoUp = bandFor(id, t + 2)
      // The rung above sits between where you are and two rungs up: monotonic,
      // and never skipping the intervening level.
      const edge = (b: [number, number]) => (spec.direction === 'lower' ? b[1] : b[0])
      const step = Math.abs(edge(oneUp) - edge(here))
      const leap = Math.abs(edge(twoUp) - edge(here))
      assert(step <= leap + 1e-9, `${id}: tier ${t + 1} overshoots tier ${t + 2}`)
      assert(
        step <= spec.seriousMiss * 1.5,
        `${id}: one rung asks for ${step.toFixed(3)}, more than a serious miss`,
      )
    }
  }
})

check('the bands interpolate between the anchors rather than jumping at them', () => {
  const at5 = bandFor('separation_deg', 5)[0]
  const at6 = bandFor('separation_deg', 6)[0]
  const at7 = bandFor('separation_deg', 7)[0]
  near(at6, (at5 + at7) / 2, 1e-6, 'tier 6 is not between its anchors')
})

check('no rung of any flexibility band asks for a tour-level body', () => {
  // The engine coaches recreational players. These ceilings are the ones a fit
  // amateur can reach without forcing a joint, and a future edit that quietly
  // raises them should fail here rather than in somebody's shoulder.
  assert(bandFor('separation_deg', MAX_TIER)[0] <= 30, 'top rung demands tour-level coil')
  assert(bandFor('drop_depth_ratio', MAX_TIER)[0] <= 0.26, 'top rung demands a tour racket drop')
  assert(bandFor('contact_height_ratio', MAX_TIER)[0] <= 1.36, 'top rung demands tour reach')
})

check('a rating the player gives is used, and one they do not is inferred', () => {
  const stated = run({}, 4).diagnosis
  assert(stated.tier.source === 'stated' && stated.tier.current === 4, 'a stated rating was ignored')

  const inferred = run({}).diagnosis
  assert(inferred.tier.source === 'inferred', 'a missing rating was not inferred')
  assert(
    inferred.tier.target === inferred.tier.current + 1,
    'an inferred rating left the player with no rung above them',
  )
  note(`clean rig inferred as ${inferred.tier.current}`)
})

check('a serve with nothing to read falls back rather than guessing high', () => {
  assert(inferTier({}) <= 4, 'an empty read was rated above club level')
})

/* ========================================================== detection ===== */

heading('Naming the breakdown')

check('a clean serve at its own level is not told to fix anything', () => {
  const { diagnosis } = run({}, 4)
  assert(flagged(diagnosis).length === 0, `clean serve flagged: ${flagged(diagnosis).join(', ')}`)
})

check('the waiter’s tray is caught, and the grip flag follows it', () => {
  const clean = run({}, 5).diagnosis
  assert(clean.grip.continental_grip_detected, 'a neutral hand was not read as continental')

  const tray = run({ palmToSky: 80, trophyArmLayOver: 1, trophyForearmDrop: 0.22 }, 5).diagnosis
  assert(flagged(tray).includes('waiters_tray'), `tray missed: ${flagged(tray).join(', ')}`)
  assert(!tray.grip.continental_grip_detected, 'a palm-up hand still read as continental')
  note(`palm elevation ${clean.grip.palm_to_sky_deg} clean, ${tray.grip.palm_to_sky_deg} tray`)
})

check('the order the two lines fire in is measured, and no longer named', () => {
  // Retired as a named fault on the research — see `arming_the_ball` in
  // flaws.ts. The measurement still has to work: it is data, and it is shown.
  const clean = run({}, 5).diagnosis
  assert(clean.sequence.lead_ms > 0, `hips did not lead on a clean serve: ${clean.sequence.lead_ms}`)

  const armed = run({ hipLead: -0.09 }, 5).diagnosis
  assert(armed.sequence.lead_ms < 0, 'the shoulders firing first was not seen')
  assert(!flagged(armed).includes('arming_the_ball'), 'the retired fault was named')
  note(`lead ${clean.sequence.lead_ms}ms clean, ${armed.sequence.lead_ms}ms armed`)
})

check('legs that never lift the body are caught from the hips', () => {
  const clean = run({}, 5).diagnosis
  assert(!flagged(clean).includes('no_leg_drive'), 'a driving serve was told its legs sat out')
  const straight = run({ trophyKneeAngle: 170, contactHipHeight: 0.95 }, 5).diagnosis
  assert(flagged(straight).includes('no_leg_drive'), `straight legs missed: ${flagged(straight).join(', ')}`)
  // A full extension with both feet down is a drive, if not a jump (L3.9).
  const planted = run({ contactHipHeight: 0.95 }, 5).diagnosis
  assert(!flagged(planted).includes('no_leg_drive'), 'a full extension with no jump was told its legs sat out')
  note(`rise ${clean.signals.leg_drive_rise_ratio} driving, ${planted.signals.leg_drive_rise_ratio} planted, ${straight.signals.leg_drive_rise_ratio} straight`)
})

check('both rotation peaks land before contact, where the swing is', () => {
  const { sequence } = run({}, 5).diagnosis
  assert(sequence.hip_peak_ms <= 0, `hips peaked after contact: ${sequence.hip_peak_ms}`)
  assert(sequence.shoulder_peak_ms <= 0, `shoulders peaked after contact`)
})

check('a chest already open at the trophy is caught, and a level one no longer is', () => {
  // From a corner. The rig's default camera is the guide's own placement, and a
  // real server has their back to it at the ready — shoulders square to the
  // lens, the turn happening towards and away from it — so the coil is hedged
  // there and the fault cannot be named from it, which is the hedge working
  // (`engine.test.ts`, `CORNER`).
  //
  // Shoulders turned past the hips is named. Shoulders and hips turned level —
  // no coil left, but not open — was, until real motion showed the camera
  // naming that on its own (`UNDER_RESOLVED.separation_deg`): the floor that
  // names no real serve from the noise is above it.
  const open = run({ shoulderYaw: 82, hipYaw: 108, cameraYaw: 45 }, 5).diagnosis
  assert(
    flagged(open).includes('early_shoulder_rotation'),
    `early rotation missed: ${flagged(open).join(', ')}`,
  )
  const level = run({ shoulderYaw: 60, hipYaw: 56, cameraYaw: 45 }, 5).diagnosis
  assert(
    !flagged(level).includes('early_shoulder_rotation'),
    'a level trunk was named, under the floor real motion set',
  )
})

check('posture collapse is caught, and a shallow drop is told from a real one', () => {
  // 34°, not 26°: real motion raised the lean's floor to 10 (`NOISE_FLOOR`),
  // and a 26° lean reads a 6° miss.
  //
  // From behind the baseline (L1.2). By contact the hips face the net, so from
  // the side the sideways lean runs along the lens and is a guess at depth:
  // hedged under `MIN_EVIDENCE` there, and `angleReach.ts` sends the player
  // behind the baseline to check it.
  const collapsed = run({ spineLean: 34, tossWobble: 0.09, cameraYaw: 8 }, 5).diagnosis
  assert(flagged(collapsed).includes('posture_collapse'), 'collapse missed')
  const fromTheSide = run({ spineLean: 34, tossWobble: 0.09 }, 5).diagnosis
  assert(!flagged(fromTheSide).includes('posture_collapse'), 'a lean read along the lens was named from the side')
  assert(fromTheSide.signals.spine_lean_deg === undefined, 'a lean read along the lens reached the signals')

  // A hand left 25 cm above the shoulder: the racket never lays back. A hand
  // that stops level with the shoulder is a full drop on real motion
  // (ANALYSIS-REVIEW.md §9), so that is no longer the pose for this.
  const shallow = run({ dropBelowShoulder: -0.25 }, 5).diagnosis
  assert(flagged(shallow).includes('shallow_drop'), 'a hand that never fell was read as a drop')
  const level = run({ dropBelowShoulder: -0.1 }, 5).diagnosis
  assert(!flagged(level).includes('shallow_drop'), 'a hand stopping near the shoulder was called shallow')
  const deep = run({}, 5).diagnosis
  assert(!flagged(deep).includes('shallow_drop'), 'a real drop was called shallow')
})

check('a pancake is measured and never named', () => {
  /*
   * This used to assert that a pushed contact was caught and a snapping forearm
   * was not. It is not caught any more, on purpose: `pancake_contact` carries
   * `notNamed`, because the pronation estimate's own deviation is 20.2° against
   * a 16° serious miss, and measured over the ensemble the detector fired on 10%
   * of serves with 95° of real rotation and 35% of serves with none — a coin the
   * camera flips, spending the report's one instruction as it goes.
   *
   * So the assertion inverts, and it has to check both halves or `notNamed`
   * means nothing: the player never hears it, and the number is still measured
   * and still outside its band. The rate evidence lives in `depth.test.ts`; this
   * is the wiring.
   */
  const pancake = run({ pronation: 8 }, 5).diagnosis
  assert(!flagged(pancake).includes('pancake_contact'), 'a suppressed flaw was named to a player')

  const finding = findingFor(pancake, 'pancake_contact')
  assert(finding !== undefined, 'the pancake finding vanished rather than being suppressed')
  assert(finding!.detected === false, 'a notNamed flaw came back detected')
  assert(
    finding!.miss > 0,
    `the flaw was suppressed by losing the measurement, not by declining to name it: miss ${finding!.miss}`,
  )
})

/* ======================================================== root causes ===== */

heading('Symptoms attributed to their cause')

check('a low contact off a low toss is blamed on the toss', () => {
  const ball: BallFlight = {
    coefficients: [0, 0, 0],
    // Apex barely above the player's own reach: the ball never got there.
    apex: { t: 0, x: 0.5, y: 0.95 - 1.05 * 0.54 },
    samples: [],
    confidence: 0.9,
  }
  const { diagnosis } = run({ contactReach: 1.0 }, 5, ball)
  const contact = findingFor(diagnosis, 'low_contact')
  assert(Boolean(contact?.detected), 'a low contact was not caught')
  assert(
    Boolean(findingFor(diagnosis, 'toss_height')?.detected),
    'a toss that never reached contact height was not caught',
  )
  assert(
    contact?.caused_by === 'toss_height',
    `the contact fault was not traced to the toss: ${contact?.caused_by ?? 'nothing'}`,
  )
})

check('a kick toss the card calls fine is not the fault a flat serve would be told', () => {
  // D2.4. The card lets a kick toss peak at racket reach, 0.18 lower than a
  // flat one, and the diagnosis reads the same number — so the same toss, at
  // a height a kick is hit from, is a fault only when the serve was flat.
  const ball: BallFlight = {
    coefficients: [0, 0, 0],
    apex: { t: 0, x: 0.5, y: 0.95 - 1.22 * 0.54 },
    samples: [],
    confidence: 0.9,
  }
  const flat = run({}, 4, ball, 'flat').diagnosis
  const kick = run({}, 4, ball, 'kick').diagnosis
  note(`toss peak ${flat.signals.toss_peak_ratio}: flat ${flagged(flat).join(', ') || 'nothing'}, kick ${flagged(kick).join(', ') || 'nothing'}`)
  assert(flagged(flat).includes('toss_height'), 'a flat serve tossed to racket reach was not told')
  assert(!flagged(kick).includes('toss_height'), 'a kick tossed where a kick is hit from was told to toss higher')
  // And nothing else moved: the serve type touches only the toss band.
  const others = (d: typeof flat) => flagged(d).filter((f) => f !== 'toss_height').join(',')
  assert(others(flat) === others(kick), `the serve type moved other verdicts: ${others(flat)} / ${others(kick)}`)
})

check('the serve type moves a diagnosis band exactly where it moves the card', () => {
  // The two tables live apart — the card's in coaching.ts, the ladder's in
  // tiers.ts — and read the same numbers, so they are held to each other here.
  const shared: Record<string, string> = { contactHeight: 'contact_height_ratio', tossPeakHeight: 'toss_peak_ratio' }
  for (const type of Object.keys(SERVE_TYPES) as ServeType[]) {
    for (const [card, signal] of Object.entries(shared)) {
      const base = METRICS[card].ideal
      const moved = SERVE_TYPES[type].overrides[card] ?? base
      const want: [number, number] = [moved[0] - base[0], moved[1] - base[1]]
      const have = SERVE_TYPE_SHIFT[type][signal] ?? [0, 0]
      assert(
        Math.abs(want[0] - have[0]) < 1e-9 && Math.abs(want[1] - have[1]) < 1e-9,
        `${type} moves the card's ${card} by ${want} and the diagnosis's ${signal} by ${have}`,
      )
    }
  }
})

heading('One serve, judged once')

check('a card row and its diagnosis signal read one band, at every rung and serve type', () => {
  for (const [card, signal] of Object.entries(CARD_SIGNAL)) {
    for (const type of Object.keys(SERVE_TYPES) as ServeType[]) {
      const want = metricCopy(card, type).ideal
      for (let tier = MIN_TIER; tier <= MAX_TIER; tier++) {
        const have = targetFor(signal, tier, type)
        assert(
          Math.abs(want[0] - have[0]) < 1e-9 && Math.abs(want[1] - have[1]) < 1e-9,
          `${card} on a ${type} serve at rung ${tier}: the card reads ${want}, the diagnosis ${have}`,
        )
      }
    }
  }
})

check('every card row that carries a diagnosis signal is listed as sharing its band', () => {
  // Found by reading, not by name: every card row and every signal off rig
  // serves from the side and from a corner, with the ball followed. A pair whose
  // numbers agree on every serve, to the rounding `diagnose` applies, is one
  // quantity measured twice, and two bands on it would judge one serve twice.
  const serves: [Partial<ServeDials>, boolean][] = [
    [{}, true],
    [{ trophyKneeAngle: 150, contactReach: 1.05, seed: 3, noise: 0.004 }, true],
    [{ cameraYaw: 30, shoulderYaw: 10 }, false],
    [{ cameraYaw: 45, shoulderYaw: 35, spineLean: 26 }, false],
    [{ cameraYaw: 60, shoulderYaw: 20 }, false],
  ]
  const rows = serves.map(([dials, side]) => {
    const { frames, skel } = run(dials)
    const ball = tossedBall(frames, skel, frames[skel.keys.contact].t)
    const card = Object.fromEntries(measure(frames, skel, side, { ball }).flatMap((f) => f.metrics.map((m) => [m.id, m.value])))
    const signals = diagnose(frames, skel, { ball }).signals
    return { card, signals }
  })
  const found: string[] = []
  for (const card of Object.keys(METRICS)) {
    for (const signal of Object.keys(SIGNALS)) {
      const both = rows.filter((r) => Number.isFinite(r.card[card]) && Number.isFinite(r.signals[signal]))
      const same = both.every((r) => Math.abs(r.card[card] - r.signals[signal]) <= (Math.abs(r.signals[signal]) >= 10 ? 0.5 : 5e-4))
      if (both.length >= 2 && same) found.push(`${card}=${signal}`)
    }
  }
  note(`shared: ${found.join(', ')}`)
  const listed = Object.entries(CARD_SIGNAL).map(([card, signal]) => `${card}=${signal}`)
  for (const pair of found) assert(listed.includes(pair), `${pair} carry one number and are not in CARD_SIGNAL`)
  for (const pair of listed) assert(found.includes(pair), `${pair} is listed but the two did not read the same number`)
})

check('a low contact off a good toss is left as a contact fault', () => {
  const { diagnosis } = run({ contactReach: 1.0 }, 5)
  const contact = findingFor(diagnosis, 'low_contact')
  assert(Boolean(contact?.detected), 'a low contact was not caught')
  assert(!contact?.caused_by, 'a contact fault was blamed on a toss nobody measured')
})

check('a collapsing spine is traced to the toss that caused it', () => {
  // From behind, where both the lean and a sideways toss are read (L1.2).
  // 0.15 since L5.1: the drift reads the card's spread against the card's
  // band, and 0.09 now sits inside it.
  const { diagnosis } = run({ spineLean: 34, tossWobbleLateral: 0.15, cameraYaw: 8 }, 5)
  assert(
    findingFor(diagnosis, 'posture_collapse')?.caused_by === 'toss_drift',
    'a spine chasing a drifting toss was reported as a posture problem on its own',
  )
})

check('a cause is only named when it was itself detected', () => {
  const { diagnosis } = run({ dropBelowShoulder: 0.05 }, 3)
  for (const f of diagnosis.flaws) {
    if (!f.caused_by) continue
    assert(
      diagnosis.flaws.some((c) => c.flaw === f.caused_by && c.detected),
      `${f.flaw} was blamed on ${f.caused_by}, which was not detected`,
    )
  }
})

check('root causes are listed ahead of the symptoms they explain', () => {
  // The hip lead is dialled to -90 ms rather than the -50 this used to use.
  // `hip_lead_ms`'s floor is the one its own repeatability asks for, and a 50 ms
  // dial reads as a miss of 79 — which was under the 85 ms floor of the day, so
  // `arming_the_ball` was correctly not named and the pair under test never both
  // fired. The ordering being checked is unrelated to the size of the fault, so
  // the honest fix was to dial a fault this engine can actually resolve.
  //
  // The floor has since come down to 76 and a 50 ms dial would now clear it, by
  // three milliseconds. -90 is kept anyway: a fixture sitting that close to a
  // floor is one re-derivation away from testing the floor instead of the
  // ordering it is here for.
  // The pair used to be early rotation and arming the ball; arming is no
  // longer named, so the elbow and the drop stood in. They cannot any more: a
  // shallow drop is now a hand left high, and the rig solves its elbow from the
  // hand, so it cannot drop the elbow and hold the hand up in the same serve.
  // The drifting toss and the spine that chases it are the same kind of link,
  // posed together above.
  //
  // The toss drifts 0.2 here (0.15 before L5.1, 0.09 before that). The ordering holds at equal
  // severity, and since real motion put the lean's floor level with its serious
  // miss (`NOISE_FLOOR.spine_lean_deg`) a named collapse is always 'high', so
  // the toss has to be a serious miss too or the sort is by severity instead.
  //
  // From behind with a sideways toss since L1.2, for the reason given at the
  // posture check above.
  const { diagnosis } = run({ spineLean: 34, tossWobbleLateral: 0.2, cameraYaw: 8 }, 5)
  const order = diagnosis.flaws.filter((f) => f.detected).map((f) => f.flaw)
  const cause = order.indexOf('toss_drift')
  const symptom = order.indexOf('posture_collapse')
  assert(cause >= 0 && symptom >= 0, 'the pair under test did not both fire')
  assert(cause < symptom, 'the symptom was listed ahead of its own cause')
})

/* ====================================================== the same serve ==== */

heading('One serve, different levels')

check('the same serve is asked for more at each level up', () => {
  const four = run({}, 4).diagnosis
  const nine = run({}, 9).diagnosis
  assert(
    flagged(nine).length >= flagged(four).length,
    'a stronger player was asked for no more than a beginner',
  )
  // The palm's turn, which still climbs. The toss's drift carried this check
  // until L5.1, contact height until D2.3 and the racket drop before that; all
  // three bands are the same at every rung on purpose now — the drop because
  // hand depth does not separate levels on real motion, contact and the toss
  // because each shares its card row's one band (`CARD_SIGNAL` in tiers.ts).
  const palmAtFour = findingFor(four, 'waiters_tray')!.target[1]
  const palmAtNine = findingFor(nine, 'waiters_tray')!.target[1]
  assert(palmAtNine < palmAtFour, 'the grip asked of a 9 was no stricter than for a 4')
  note(`palm target ${palmAtFour.toFixed(0)}° at tier 4, ${palmAtNine.toFixed(0)}° at tier 9`)
  for (const flat of ['shallow_drop', 'low_contact', 'toss_drift'] as FlawId[]) {
    assert(findingFor(nine, flat)!.target[0] === findingFor(four, flat)!.target[0], `the ${flat} band moved with the level again`)
  }
})

check('every finding carries the tier its target came from', () => {
  const { diagnosis } = run({}, 6)
  for (const f of diagnosis.flaws) {
    assert(f.target_tier === 7, `${f.flaw} was judged against tier ${f.target_tier}, not 7`)
  }
})

check('severity grows with how far outside the band the serve is', () => {
  const band: [number, number] = [0, 30]
  assert(severityOf('palm_to_sky_deg', 20, band) === 'none', 'inside the band was graded a fault')
  const near = severityOf('palm_to_sky_deg', 36, band)
  const far = severityOf('palm_to_sky_deg', 70, band)
  const rank = { none: 0, low: 1, medium: 2, high: 3 } as const
  assert(rank[far] > rank[near], `a big miss (${far}) did not outrank a small one (${near})`)
})

/* ===================================================== evidence and cost == */

heading('Evidence, jitter and cost')

check('a signal the tracker could not see does not name a flaw', () => {
  const findings = evaluateFlaws(
    {
      palm_to_sky_deg: { value: 85, confidence: MIN_EVIDENCE - 0.01 },
      drop_depth_ratio: { value: 0.02, confidence: 0.9 },
    },
    5,
  )
  assert(
    !findings.some((f) => f.flaw === 'waiters_tray'),
    'a grip fault was named from landmarks nobody could see',
  )
  assert(findings.some((f) => f.flaw === 'shallow_drop'), 'a well-seen fault was dropped too')
})

check('a hand that was never visible does not certify a grip either', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  for (const f of frames) {
    for (const lm of [15, 16, 17, 18, 19, 20]) f.image[lm] = { ...f.image[lm], visibility: 0.05 }
  }
  const d = diagnose(frames, skel, { tier: 5 })
  assert(
    !d.grip.continental_grip_detected,
    'an unseen hand was certified as holding a continental grip',
  )
})

check('tracker jitter does not change what is reported', () => {
  const clean = new Set(flagged(run({ noise: 0.006, seed: 11 }, 5).diagnosis))
  for (const seed of [3, 19, 47, 101]) {
    const noisy = flagged(run({ noise: 0.006, seed }, 5).diagnosis)
    assert(
      noisy.length === clean.size && noisy.every((f) => clean.has(f)),
      `seed ${seed} reported ${noisy.join(', ') || 'nothing'} against ${[...clean].join(', ') || 'nothing'}`,
    )
  }
})

check('a dialled fault survives the jitter that hides it', () => {
  /*
   * Read at tier 7 rather than tier 5, and the reason is worth more than the one
   * line it takes. `palm_to_sky_deg`'s floor moved from 10 to the 11 its own
   * repeatability asks for, and at tier 5 the three seeds here miss their band by
   * 10 to 13 — straddling the floor, so one seed's tray disappeared. At tier 7
   * the same serve misses by 21 to 23 and all three clear it comfortably.
   *
   * The uncomfortable part, which belongs here rather than in a report nobody
   * reads: the rig's `palmToSky` dial SATURATES. 80, 90 and 100 all read back as
   * 49–51°, so the most extreme waiter's tray this rig can build was clearing a
   * tier-5 band by half a degree, against a signal whose own deviation is 6.8°.
   * `waiters_tray` sits at the top of the triage hierarchy. Moving the tier is
   * the honest way to keep this check meaningful; widening the dial is not
   * available, and that is a finding about the rig — see the handoff in
   * `syntheticServe.ts`'s `palmToSky` comment.
   */
  for (const seed of [3, 19, 47]) {
    const noisy = flagged(run({ palmToSky: 80, trophyArmLayOver: 1, trophyForearmDrop: 0.22, noise: 0.006, seed }, 7).diagnosis)
    assert(noisy.includes('waiters_tray'), `seed ${seed} lost the tray: ${noisy.join(', ')}`)
  }
})

check('the pass costs a fraction of the budget on a phone', () => {
  const { diagnosis } = run({}, 5)
  // The whole analysis has a three-second budget and pose detection spends
  // nearly all of it. This is the arithmetic afterwards and has no business
  // taking a measurable share.
  assert(diagnosis.cost.ms < 250, `the diagnosis took ${diagnosis.cost.ms}ms`)
  note(`${diagnosis.cost.ms}ms over ${diagnosis.cost.frames} frames`)
})

check('nothing but numbers comes back, so a stored report cannot pin the clip', () => {
  const { diagnosis } = run({}, 5)
  const round = JSON.parse(JSON.stringify(diagnosis))
  assert(
    JSON.stringify(round) === JSON.stringify(diagnosis),
    'the diagnosis does not survive being stored as JSON',
  )
  const text = JSON.stringify(diagnosis)
  assert(!text.includes('"visibility"'), 'a landmark was carried out inside the diagnosis')
  assert(!text.includes('"world"') && !text.includes('"image"'), 'a frame escaped in the output')
})

check('the output carries no prose for anything to render', () => {
  const { diagnosis } = run({}, 5)
  // Every string in the payload must be an identifier or an enum — never a
  // sentence. This phase produces data; saying it is somebody else's job.
  const strings: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(diagnosis)
  for (const s of strings) {
    assert(/^[a-z0-9_]+$/.test(s), `the output carries prose: "${s}"`)
  }
})

check('a signal band and its reading always agree about direction', () => {
  // A guard against an anchor being typed in backwards: whatever the axis, a
  // value sitting on the good side of the band has to read as inside it.
  for (const id of Object.keys(SIGNALS)) {
    const spec = SIGNALS[id]
    const band = bandFor(id, 5)
    const good = spec.direction === 'lower' ? band[0] : spec.direction === 'higher' ? band[1] : (band[0] + band[1]) / 2
    assert(insideBand(id, good, band), `${id}: the good end of its own band reads as a fault`)
  }
})

heading('A racket that never fell')

check('a drop that never happened is named, whatever the depth reads', () => {
  // The depth proxy cannot see this one. `drop_depth_ratio` asks how far under
  // the shoulder the hand got at its lowest, and on a serve with no drop that is
  // answered by the trophy: the arm is already cocked, the hand already sits a
  // little under the shoulder, and the reading clears the band's floor without
  // the racket having moved. Two real clips came in at 0.157 and 0.104 against a
  // floor of 0.08 — both scored as a sound drop, on serves whose racket provably
  // never fell.
  const inBand = { value: 0.157, confidence: 0.95 }
  const readings = { drop_depth_ratio: inBand }

  const measured = evaluateFlaws(readings, 2).find((f) => f.flaw === 'shallow_drop')!
  assert(!measured.detected, 'the premise is gone: this value is now a fault on its own')
  assert(measured.severity === 'none', `expected no fault from the band, got ${measured.severity}`)

  const structural = evaluateFlaws(readings, 2, { racketNeverFell: true }).find(
    (f) => f.flaw === 'shallow_drop',
  )!
  assert(structural.detected, 'a racket that never fell was reported as a sound drop')
  assert(
    structural.severity !== 'none',
    'named as a fault and graded as no fault, which are two answers to one question',
  )
  // Reported as measured, not rewritten: the number was never wrong, it was
  // answering the question next to the one being asked.
  assert(structural.value === 0.157, `the measurement was overwritten: ${structural.value}`)
  note(`band says none, structure says ${structural.severity}`)
})

check('a real drop is left alone', () => {
  const deep = { drop_depth_ratio: { value: 0.35, confidence: 0.95 } }
  const finding = evaluateFlaws(deep, 2, { racketNeverFell: false }).find(
    (f) => f.flaw === 'shallow_drop',
  )!
  assert(!finding.detected, 'a healthy drop was called shallow')
})

/* ================================================= the tray's witness ==== */

heading('A tray needs its arm as well as its palm (L5.2)')

check('the palm alone, the arm alone and both: only both are named, at every rung', () => {
  const palm = { palmToSky: 80, trophyForearmDrop: 0.22 }
  const arm = { trophyArmLayOver: 1 }
  for (const tier of [3, 9]) {
    const tray = (dials: Partial<ServeDials>) => run(dials, tier).diagnosis.flaws.find((f) => f.flaw === 'waiters_tray')!
    const palmOnly = tray(palm)
    const armOnly = tray(arm)
    const both = tray({ ...palm, ...arm })
    note(`rung ${tier}: palm alone ${palmOnly.value}° on an arm at ${palmOnly.witness?.abductionDeg}°, arm alone ${armOnly.witness?.abductionDeg}°, both ${both.value}° at ${both.witness?.abductionDeg}°`)
    assert(!palmOnly.detected && palmOnly.severity === 'none', `rung ${tier}: a palm on a high arm was named a tray`)
    assert(palmOnly.witness!.abductionDeg >= TRAY_ABDUCTION_MAX, 'the palm-only arm was not cocked high')
    assert(!armOnly.detected, `rung ${tier}: a laid-over arm with a sound palm was named a tray`)
    assert(both.detected && both.witness!.abductionDeg < TRAY_ABDUCTION_MAX, `rung ${tier}: the tray with its arm was not named`)
  }
})

check('no Bath serve is named a tray, from any side, and every one cocks above the line', () => {
  const arms: number[] = []
  for (const fps of [30, 60]) {
    for (const bearing of [90, 0, 180]) {
      for (const serve of REAL_SERVES) {
        const frames = filmMocap(serve, { fps, bearing })
        const tray = diagnose(frames, detectServe(frames, fps), { tier: 9 }).flaws.find((f) => f.flaw === 'waiters_tray')!
        assert(!tray.detected, `a Bath serve was named a tray at ${fps} fps from ${bearing}°`)
        assert(tray.witness !== undefined, 'a Bath arm was not read')
        arms.push(tray.witness!.abductionDeg)
      }
    }
  }
  note(`Bath cocks at ${Math.min(...arms)}–${Math.max(...arms)}° against the ${TRAY_ABDUCTION_MAX}° line`)
  assert(Math.min(...arms) > TRAY_ABDUCTION_MAX + 15, 'a Bath arm cocked near the line')
})

check('an arm nobody saw leaves the tray unnamed, whatever the palm says', () => {
  const readings = { palm_to_sky_deg: { value: 80, confidence: 0.95 } }
  assert(!evaluateFlaws(readings, 5).find((f) => f.flaw === 'waiters_tray')!.detected, 'a tray was named with no arm read')
  assert(evaluateFlaws(readings, 5, { cockingAbductionDeg: 55 }).find((f) => f.flaw === 'waiters_tray')!.detected, 'a tray with its arm read low was not named')
})


/* ================================================== contact behind (L5.3) === */

heading('A ball met over the head, named (L5.3)')

/** The report's own sentence for a fault, read through the plan as the report reads it. */
const FLAW_COPY_FOR = (flaw: FlawId) =>
  causalPlan(
    {
      status: 'ok',
      primary_flaw: { flaw, group: 'toss', signal: 'x', value: 0, unit: 'pct', target: [8, 40], target_tier: 5, severity: 'high' },
      injury_risk: [],
      suppressed_count: 0,
    } as unknown as Triage,
    undefined,
  )[0]?.why ?? ''

const behindFinding = (dials: Partial<ServeDials>, serveType: ServeType = 'flat', tier = 5) =>
  run(dials, tier, undefined, serveType).diagnosis.flaws.find((f) => f.flaw === 'contact_behind')

check('the rig met 0.25 m back is named on a flat serve and not a kick; 0.35 m on both; clean on neither', () => {
  const clean = behindFinding({})
  const flat25 = behindFinding({ contactBehind: 0.25 })
  const kick25 = behindFinding({ contactBehind: 0.25 }, 'kick')
  const flat35 = behindFinding({ contactBehind: 0.35 })
  const kick35 = behindFinding({ contactBehind: 0.35 }, 'kick')
  note(`clean ${clean?.value}, 0.25 m back ${flat25?.value} (kick floor ${kick25?.target[0]}), 0.35 m back ${flat35?.value}`)
  assert(clean !== undefined && !clean.detected, 'the clean serve was named or not read')
  assert(flat25?.detected === true, 'a flat serve met 0.25 m back was not named')
  assert(kick25?.detected === false && kick25.target[0] === 0, 'a kick met over the head was named against a floor above 0')
  assert(flat35?.detected === true && kick35?.detected === true, 'a ball met behind the head was not named')
})

check('read from the side only, filed with the toss, and its copy names the toss', () => {
  const behind = run({ contactBehind: 0.35, cameraYaw: 8 }).diagnosis.flaws.find((f) => f.flaw === 'contact_behind')
  assert(behind === undefined, 'contact in front was read from behind the baseline')
  assert(HIERARCHY.find((h) => h.group === 'toss')!.flaws.includes('contact_behind'), 'not in the toss group')
  assert(/toss/.test(FLAW_COPY_FOR('contact_behind')), 'the copy does not say where it starts')
})

check('no Bath serve is named, and each reads inside the cited band', () => {
  const reads: number[] = []
  for (const fps of [30, 60]) {
    for (const serve of REAL_SERVES) {
      const frames = filmMocap(serve, { fps })
      const f = diagnose(frames, detectServe(frames, fps), { tier: 9 }).flaws.find((x) => x.flaw === 'contact_behind')!
      assert(f !== undefined && !f.detected, `a Bath serve was named at ${fps} fps`)
      reads.push(f.value)
    }
  }
  note(`Bath meets the ball ${Math.min(...reads).toFixed(1)}–${Math.max(...reads).toFixed(1)}% of height in front of the hips`)
  assert(Math.min(...reads) >= 8 && Math.max(...reads) <= 40, 'a Bath serve read outside the cited band')
})

report()
