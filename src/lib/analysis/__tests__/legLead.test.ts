/**
 * How far the legs led the arm, at the frame rate an ordinary clip has: the
 * rig's dial and real serves with the legs planted late, read at 30 fps and on
 * the app's own 32 Hz read of a file, under the tracker noise fitted to
 * MediaPipe, against the noise table and the things that must stop it.
 *
 * The forty-serve table, every placement and rate, and the peak-finders that
 * lost to this one are `npm run bench:mocap -- --chain`.
 */
import { CHAIN_NOISE_SD } from '../cardNoise'
import { diagnose } from '../diagnose'
import { LEG_LEAD_SLACK, LEG_LEAD_MIN_RISE, type LegLead } from '../legLead'
import { lateLegs, mocapTruth, trackedTake } from '../mocapServe'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { MEDIAPIPE_FIT, RTMPOSE_FIT } from '../trackerNoise'
import { legLeadLine } from '../verdict'
import { cueIssues } from '../voice'
import { REAL_SERVES, seeds } from './repeatability'
import { assert, check, heading, note, report } from './harness'

const read = (dials: Partial<ServeDials>, fps: number) => {
  const frames = buildServe(dials, fps)
  return diagnose(frames, detectServe(frames, fps))
}

/** The rates a side-on clip reaches this engine at. */
const CLIPS = [
  { name: '30 fps', fps: 30 },
  { name: 'a 30 fps file on the 32 Hz read', fps: 30, grid: 32 },
  { name: '60 fps', fps: 60 },
]

const takeOf = (serve: (typeof REAL_SERVES)[number], clip: (typeof CLIPS)[number], seed: number, fit = MEDIAPIPE_FIT) => {
  const frames = trackedTake(serve, { fps: clip.fps, grid: clip.grid, fit, seed })
  return diagnose(frames, detectServe(frames, clip.grid ?? clip.fps))
}

const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

heading('How far the legs led the arm')

check('the rig’s late legs close the gap and turn it, at 30 fps', () => {
  const row = [0, 0.5, 0.75, 1].map((lateLegDrive) => read({ lateLegDrive }, 30).legLead)
  note(`late legs 0 / 0.5 / 0.75 / 1: ${row.map((l) => `${l?.ms} ms ${l?.order}`).join(', ')}`)
  assert(row[0]?.order === 'legs_first', 'a clean serve did not read legs first')
  assert(row[2]?.order === 'level', 'a dead heat was called')
  assert(row[3]?.order === 'arm_first', 'legs after the elbow were not read')
  for (let i = 1; i < row.length; i++) assert(row[i]!.ms < row[i - 1]!.ms, 'the gap did not close as the legs came later')
})

check('real serves read legs first on every take, at every rate an ordinary clip has', () => {
  for (const clip of CLIPS) {
    for (const [name, fit] of [
      ['MediaPipe', MEDIAPIPE_FIT],
      ['RTMPose', RTMPOSE_FIT],
    ] as const) {
      const leads = REAL_SERVES.flatMap((s) => seeds(8).map((seed) => takeOf(s, clip, seed, fit).legLead))
      const wrong = leads.filter((l) => l?.order !== 'legs_first')
      note(`${clip.name}, ${name}: ${leads.length - wrong.length} of ${leads.length} legs first`)
      assert(wrong.length === 0, `${clip.name}, ${name}: ${JSON.stringify(wrong[0])}`)
    }
  }
})

check('real serves with the legs run late are read that way, and a tie is not called', () => {
  // By how far the legs are planted late, and what that leaves between the
  // legs and the elbow in 3D on these serves: about 85 ms less the delay.
  const calls = (delay: number, clip: (typeof CLIPS)[number]) => {
    const leads = REAL_SERVES.flatMap((s) =>
      seeds(6).map((seed) => {
        const frames = trackedTake(lateLegs(s, delay), { fps: clip.fps, grid: clip.grid, fit: MEDIAPIPE_FIT, seed })
        return diagnose(frames, detectServe(frames, clip.grid ?? clip.fps)).legLead
      }),
    ).filter((l): l is LegLead => l !== undefined)
    const of = (order: LegLead['order']) => leads.filter((l) => l.order === order).length / Math.max(1, leads.length)
    return { first: of('legs_first'), level: of('level'), arm: of('arm_first'), n: leads.length }
  }
  for (const clip of CLIPS) {
    const tie = calls(0.1, clip)
    const late = calls(0.16, clip)
    const pct = (x: number) => `${Math.round(x * 100)}%`
    note(`${clip.name}: 100 ms late ${pct(tie.level)} level, 160 ms late ${pct(late.arm)} arm first`)
    // At most a stray one: the serves' own gaps run to 120 ms, so 100 ms late
    // leaves one of them 20 ms apart in 3D, which is a tie on average and not a
    // tie on every take.
    assert(tie.first <= 0.05, `${clip.name}: legs 100 ms late read legs first ${pct(tie.first)}`)
    assert(tie.level >= 0.8, `${clip.name}: a tie read level only ${pct(tie.level)}`)
    assert(late.first === 0, `${clip.name}: legs 160 ms late read legs first ${pct(late.first)}`)
    // Not all of them. At about 75 ms past the elbow a read is still inside two
    // deviations of the slack, and the honest miss is a `level`.
    assert(late.arm >= 0.7, `${clip.name}: legs 160 ms late read arm first only ${pct(late.arm)}`)
  }
})

check('the camera moves the gap and the two links no further than the table says', () => {
  for (const id of Object.keys(CHAIN_NOISE_SD)) {
    let worst = 0
    for (const clip of CLIPS) {
      for (const s of REAL_SERVES) {
        const values = seeds(24)
          .map((seed) => {
            const d = takeOf(s, clip, seed)
            return id === 'leg_lead_ms' ? d.legLead?.ms : id === 'legs_peak_ms' ? d.chain.legs.ms : d.chain.elbow.ms
          })
          .filter((v): v is number => typeof v === 'number')
        worst = Math.max(worst, sd(values))
      }
    }
    note(`${id}: ${worst.toFixed(1)} ms at worst, table ${CHAIN_NOISE_SD[id]}`)
    assert(worst <= CHAIN_NOISE_SD[id] * 1.01, `${id} now moves ${worst.toFixed(1)} ms between takes`)
  }
})

check('the call stands off zero by twice that noise', () => {
  assert(LEG_LEAD_SLACK >= 2 * CHAIN_NOISE_SD.leg_lead_ms, `slack ${LEG_LEAD_SLACK} against noise ${CHAIN_NOISE_SD.leg_lead_ms}`)
})

check('planting the legs late leaves the arm where it was', () => {
  // The planted test above is only about the legs if this holds.
  const s = REAL_SERVES[0]
  const before = mocapTruth(s)
  const after = mocapTruth(lateLegs(s, 0.16))
  assert(Math.abs(after.wristTop - before.wristTop) < 0.002, 'planting the legs moved contact')
})

check('a serve whose hips barely rise is not timed', () => {
  // Under this rise the peak of it is tracker noise: the gap's spread goes past
  // 40 ms and readings start to land on the arm's side of zero.
  for (const [trophyKneeAngle, contactHipHeight] of [
    [175, 0.93],
    [165, 0.95],
  ]) {
    const d = read({ trophyKneeAngle, contactHipHeight, noise: 0.004, seed: 5 }, 30)
    note(`knee ${trophyKneeAngle}: rise ${d.legDrive.rise?.toFixed(3)}, read ${JSON.stringify(d.legLead)}`)
    assert((d.legDrive.rise ?? 0) < LEG_LEAD_MIN_RISE && d.legLead === undefined, 'a rise too small to time was timed')
  }
})

check('from behind and from a corner it is not read, because the elbow’s speed there is half depth', () => {
  for (const cameraYaw of [8, 45]) {
    assert(read({ cameraYaw }, 30).legLead === undefined, `read at camera yaw ${cameraYaw}`)
  }
  for (const s of REAL_SERVES) {
    const frames = trackedTake(s, { fps: 30, fit: MEDIAPIPE_FIT, seed: 11, phone: { bearing: 180, distance: 6 } })
    assert(diagnose(frames, detectServe(frames, 30)).legLead === undefined, `${s.id} read from behind`)
  }
})

check('each order has a line in the house voice, with no number and no coach’s word in it', () => {
  for (const order of ['legs_first', 'level', 'arm_first'] as const) {
    const line = legLeadLine({ order })
    note(line)
    assert(cueIssues(line).length === 0, `${order}: ${cueIssues(line).join(', ')}`)
    assert(!/\d/.test(line), `${order} carries a number: ${line}`)
    assert(!/\b(kinetic|chain|windmill|sequence|proximal)\b/i.test(line), `${order} carries jargon: ${line}`)
  }
})

report()
