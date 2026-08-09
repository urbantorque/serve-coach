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
import { evaluateFlaws, MIN_EVIDENCE, type FlawId } from '../flaws'
import { detectServe } from '../phases'
import {
  MAX_TIER,
  SIGNALS,
  bandFor,
  inferTier,
  insideBand,
  nextTier,
  severityOf,
  targetFor,
} from '../tiers'
import type { BallFlight } from '../../vision/ballTrack'
import { buildServe, type ServeDials } from '../syntheticServe'
import { assert, check, heading, near, note, report } from './harness'

const FPS = 50

function run(dials: Partial<ServeDials> = {}, tier?: number, ball?: BallFlight) {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  return { frames, skel, diagnosis: diagnose(frames, skel, { tier, ball }) }
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

  const tray = run({ palmToSky: 80, trophyForearmDrop: 0.22 }, 5).diagnosis
  assert(flagged(tray).includes('waiters_tray'), `tray missed: ${flagged(tray).join(', ')}`)
  assert(!tray.grip.continental_grip_detected, 'a palm-up hand still read as continental')
  note(`palm elevation ${clean.grip.palm_to_sky_deg} clean, ${tray.grip.palm_to_sky_deg} tray`)
})

check('arming the ball is caught from the order the two lines fire in', () => {
  const clean = run({}, 5).diagnosis
  assert(clean.sequence.lead_ms > 0, `hips did not lead on a clean serve: ${clean.sequence.lead_ms}`)

  const armed = run({ hipLead: -0.09 }, 5).diagnosis
  assert(armed.sequence.lead_ms < 0, 'the shoulders firing first was not seen')
  assert(flagged(armed).includes('arming_the_ball'), `arming missed: ${flagged(armed).join(', ')}`)
  note(`lead ${clean.sequence.lead_ms}ms clean, ${armed.sequence.lead_ms}ms armed`)
})

check('both rotation peaks land before contact, where the swing is', () => {
  const { sequence } = run({}, 5).diagnosis
  assert(sequence.hip_peak_ms <= 0, `hips peaked after contact: ${sequence.hip_peak_ms}`)
  assert(sequence.shoulder_peak_ms <= 0, `shoulders peaked after contact`)
})

check('a trunk with no coil left at the trophy is caught', () => {
  const flat = run({ shoulderYaw: 60, hipYaw: 56 }, 5).diagnosis
  assert(
    flagged(flat).includes('early_shoulder_rotation'),
    `early rotation missed: ${flagged(flat).join(', ')}`,
  )
})

check('posture collapse is caught, and a shallow drop is told from a real one', () => {
  const collapsed = run({ spineLean: 26, tossWobble: 0.09 }, 5).diagnosis
  assert(flagged(collapsed).includes('posture_collapse'), 'collapse missed')

  const shallow = run({ dropBelowShoulder: 0.05 }, 5).diagnosis
  assert(flagged(shallow).includes('shallow_drop'), 'a hand that never fell was read as a drop')
  const deep = run({}, 5).diagnosis
  assert(!flagged(deep).includes('shallow_drop'), 'a real drop was called shallow')
})

check('a pancake is told from a snap', () => {
  const pancake = run({ pronation: 8 }, 5).diagnosis
  assert(flagged(pancake).includes('pancake_contact'), 'a pushed contact was not caught')
  const snap = run({}, 5).diagnosis
  assert(!flagged(snap).includes('pancake_contact'), 'a rotating forearm was called a pancake')
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
  const { diagnosis } = run({ contactReach: 1.15 }, 5, ball)
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

check('a low contact off a good toss is left as a contact fault', () => {
  const { diagnosis } = run({ contactReach: 1.15 }, 5)
  const contact = findingFor(diagnosis, 'low_contact')
  assert(Boolean(contact?.detected), 'a low contact was not caught')
  assert(!contact?.caused_by, 'a contact fault was blamed on a toss nobody measured')
})

check('a collapsing spine is traced to the toss that caused it', () => {
  const { diagnosis } = run({ spineLean: 26, tossWobble: 0.09 }, 5)
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
  const { diagnosis } = run({ shoulderYaw: 60, hipYaw: 56, hipLead: -0.05 }, 5)
  const order = diagnosis.flaws.filter((f) => f.detected).map((f) => f.flaw)
  const cause = order.indexOf('early_shoulder_rotation')
  const symptom = order.indexOf('arming_the_ball')
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
  const dropAtFour = findingFor(four, 'shallow_drop')!.target[0]
  const dropAtNine = findingFor(nine, 'shallow_drop')!.target[0]
  assert(dropAtNine > dropAtFour, 'the racket drop asked of a 9 was no deeper than for a 4')
  note(`drop target ${dropAtFour.toFixed(2)} at tier 4, ${dropAtNine.toFixed(2)} at tier 9`)
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
  for (const seed of [3, 19, 47]) {
    const noisy = flagged(run({ palmToSky: 80, trophyForearmDrop: 0.22, noise: 0.006, seed }, 5).diagnosis)
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

report()
