/**
 * The capture-time framing check, held to the two things that make it worth
 * shipping: it must never wave through a framing the analyser is about to
 * refuse, and it must never speak from a number nobody measured.
 *
 * WHAT THE RIG CAN AND CANNOT SHOW HERE. Every camera angle below is
 * `buildServe`'s, which projects a jointed body through one rotation about the
 * vertical and drops z. So these checks prove that `estimateYaw` inverts that
 * projection and that the ranking acts on the result. They prove nothing at all
 * about a phone: a real lens has distortion, a real player is not the rig's
 * shoulder-span ratio, and no recorded MediaPipe footage exists in this repo to
 * check either against. Where a number below comes from the rig, it says so.
 *
 * The frames are the first seven of a synthetic serve — the pre-roll, where the
 * player is standing still. That is deliberately the same part of a clip
 * `assessSpatial` reads, and it is the closest thing the rig has to somebody
 * standing in front of a propped phone waiting to be told where to move.
 */
import { blockingFramingIssue } from '../../analysis/analyze'
import { LM } from '../../analysis/geometry'
import { framingIssues } from '../../analysis/framingIssues'
import { DEPTH_YAW_RANGE, NOTABLE_ROLL, levelPivot, unlevelFrames } from '../../analysis/spatial'
import { buildServe } from '../../analysis/syntheticServe'
import type { Frame } from '../../analysis/types'
import { command, cueIssues, plain } from '../../analysis/voice'
import { assert, check, heading, note, report, within } from '../../analysis/__tests__/harness'
import {
  PREVIEW_WINDOW,
  everyFramingCue,
  framingRanking,
  judgeFraming,
  previewFrame,
  readFraming,
  standingHeight,
  type FramingCall,
  type FramingReading,
} from '../judge'

const FPS = 50

/**
 * A camera the judge has nothing to say about: it reads 45° to the court.
 *
 * Dialled at 27 rather than 45 because the reading is taken off the shoulders
 * at the ready, and since the rig was re-posed on the Bath serves those sit 15°
 * past the net axis — so the dial and the reading are no longer the same
 * number. The checks below that used to stand at 60 stood there for an angle
 * in the middle of the range; on this rig 60 is square to the shoulders, which
 * reads as dead side-on to the court.
 */
const CORNER = 27

/** Seven frames of the rig standing still, from whichever angle. */
const standing = (cameraYaw: number): Frame[] =>
  buildServe({ cameraYaw }, FPS).slice(0, PREVIEW_WINDOW)

/**
 * Landmarks the tracker placed but flagged unseen.
 *
 * The important half of the fake: the coordinates stay exactly where they were.
 * A landmark outside the frame is not one MediaPipe declines to place — it
 * places it near the edge and drops the visibility — which is the whole reason
 * `framingIssues` reads visibility rather than checking for missing points.
 */
const unseen = (frames: Frame[], ids: number[]): Frame[] =>
  frames.map((f) => ({
    ...f,
    image: f.image.map((p, i) => (ids.includes(i) ? { ...p, visibility: 0.1 } : p)),
  }))

const FEET = [LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel]
const HANDS = [LM.leftWrist, LM.rightWrist]

/** A reading assembled by hand, for the parts of the ranking that are pure logic. */
const reading = (over: Partial<FramingReading> = {}): FramingReading => ({
  issues: [],
  spatial: null,
  yaw_measured: false,
  samples: PREVIEW_WINDOW,
  ...over,
})

heading('The house voice, on the framing cues')

check('every cue a player can see passes the editor', () => {
  for (const text of everyFramingCue()) {
    const issues = cueIssues(text)
    assert(issues.length === 0, `"${plain(text)}" — ${issues.join('; ')}`)
  }
})

check('the filter has nothing left to do to them', () => {
  // `cue()` runs over these on the way out, so a cue that only passes *after*
  // filtering is a cue somebody wrote badly and the filter is quietly patching.
  for (const text of everyFramingCue()) {
    assert(command(text) === text, `the filter rewrote "${text}" as "${command(text)}"`)
  }
})

check('every cue names one thing to do with the phone or the body', () => {
  for (const text of everyFramingCue()) {
    assert(/\*\*[^*]+\*\*/.test(text), `no instruction marked in "${text}"`)
  }
})

heading('The ranking')

check('every call appears exactly once, and the two states are not in it', () => {
  const order = framingRanking()
  assert(new Set(order).size === order.length, `a call is ranked twice: ${order.join(', ')}`)
  assert(!order.includes('looking'), '"looking" is a state, not something that fires')
  assert(!order.includes('ready'), '"ready" is the absence of everything else')
})

check('the three the analyser refuses sit at the top, in its order', () => {
  // Not a restatement of `blockingFramingIssue` — a check that this table and
  // that function cannot drift apart. If somebody adds a fourth refusal there,
  // this fails here, which is the only way a viewfinder stays honest about what
  // the upload path will do with the clip it is greenlighting.
  const order = framingRanking()
  const top = order.slice(0, 3)
  assert(
    top.join(',') === 'no-player,body-cut,hands-unseen',
    `the top of the ranking is ${top.join(', ')}`,
  )
})

/** Every string `framingIssues` can emit, so the sweep below is exhaustive. */
const VOCABULARY = [
  'nobody-visible',
  'feet-cropped',
  'head-cropped',
  'body-unclear',
  'too-far-away',
  'hands-unseen',
]

check('nothing the analyser would refuse is ever graded as survivable', () => {
  let refusals = 0
  for (let mask = 0; mask < 1 << VOCABULARY.length; mask++) {
    const issues = VOCABULARY.filter((_, i) => mask & (1 << i))
    const verdict = judgeFraming(reading({ issues }))
    const refuses = blockingFramingIssue([...issues]) !== undefined

    assert(
      verdict.grade === 'refused' === refuses,
      `[${issues.join(',')}] graded ${verdict.grade} while the analyser ${refuses ? 'refuses' : 'accepts'} it`,
    )
    if (!refuses) continue
    refusals++
    assert(
      ['no-player', 'body-cut', 'hands-unseen'].includes(verdict.call),
      `[${issues.join(',')}] is refused but the player is told about ${verdict.call}`,
    )
  }
  note(`${refusals} of ${1 << VOCABULARY.length} issue combinations would be refused on upload`)
})

check('the worst thing wins and the rest are kept in order', () => {
  const verdict = judgeFraming(reading({ issues: ['too-far-away', 'body-unclear'] }))
  assert(verdict.call === 'body-unclear', `chose ${verdict.call} over an unreadable body`)
  assert(verdict.also.join(',') === 'too-far', `carried ${verdict.also.join(',')}`)

  const order = framingRanking()
  const rank = (c: FramingCall) => order.indexOf(c)
  const all = judgeFraming(reading({ issues: ['too-far-away', 'head-cropped', 'body-unclear'] }))
  const seen = [all.call, ...all.also]
  for (let i = 1; i < seen.length; i++) {
    assert(rank(seen[i - 1]) < rank(seen[i]), `${seen[i - 1]} was ranked after ${seen[i]}`)
  }
})

heading('Saying nothing until there is something to say')

check('a part-filled window is never judged', () => {
  for (let n = 0; n < PREVIEW_WINDOW; n++) {
    const frames = standing(CORNER).slice(0, n)
    const verdict = judgeFraming(readFraming(frames))
    // An empty preview is the exception: no pose at all is not a window still
    // filling up, it is the one call that is true from the first frame.
    const expected = n === 0 ? 'no-player' : 'looking'
    assert(verdict.call === expected, `${n} frames said ${verdict.call}`)
  }
  assert(judgeFraming(readFraming(standing(CORNER))).call === 'ready', 'a full clean window was not ready')
})

check('the window is the one assessSpatial reads', () => {
  // Stated as a check rather than a comment because the number is only correct
  // relative to spatial.ts. If that median window changes, this is the file that
  // should notice.
  assert(PREVIEW_WINDOW === 7, `the preview window is ${PREVIEW_WINDOW}`)
})

heading('Camera angle, through the rig')

check('the rig sweep lands where DEPTH_YAW_RANGE says it should', () => {
  // Recovered angle to the court, not dialled yaw — the number the judge acts
  // on (`collapsed`). It is read off the shoulders at the ready, which a real
  // server holds 15° past the net axis, so it peaks at 90 for a dial of about
  // 75 rather than 90, and saturates there: every dial from 60 to 90 comes back
  // as 90. That is a property of the estimator and this rig, not of any phone.
  const seen: string[] = []
  for (const dialled of [0, 10, 30, 45, 60, 82, 90]) {
    const r = readFraming(standing(dialled))
    assert(r.spatial !== null && r.yaw_measured, `no yaw recovered at a dialled ${dialled}`)
    const yaw = r.spatial!.court_yaw_deg
    const call = judgeFraming(r).call
    seen.push(`${dialled}→${yaw}:${call}`)

    if (yaw < DEPTH_YAW_RANGE[0]) assert(call === 'turn-off-square', `${yaw} said ${call}`)
    else if (yaw > DEPTH_YAW_RANGE[1]) assert(call === 'turn-off-side', `${yaw} said ${call}`)
    else assert(call === 'ready', `${yaw} said ${call}`)
  }
  note(`dialled→recovered:call — ${seen.join('  ')}`)
})

check('a corner camera is the one the check leaves alone', () => {
  for (const dialled of [10, 20, 30, 40, 50]) {
    const verdict = judgeFraming(readFraming(standing(dialled)))
    assert(verdict.call === 'ready', `a dialled ${dialled} was told to ${verdict.call}`)
  }
})

check('the guide angle and the engine window do not agree, and the check follows the engine', () => {
  // Worth pinning down rather than leaving as folklore. The filming guide's first
  // rule is "stand side-on"; the rig's own default camera is 82°, which comes
  // back as 90° to the court — pinned there, because a real server has their
  // back to that camera and the shoulders read square; and `DEPTH_YAW_RANGE`
  // stops accepting the lateral axis above 78°. So a player who follows the written instruction to the letter is told
  // here to move a step round. The check reports what the engine will actually
  // do with the clip. Reconciling the two sentences is a job for a person.
  const r = readFraming(standing(82))
  within(r.spatial!.court_yaw_deg, 80, 90, 'recovered angle to the court at the rig default')
  assert(judgeFraming(r).call === 'turn-off-side', 'dead side-on was waved through')
})

heading('A body that is not upright in the picture')

/**
 * A player leaning, on a phone that is perfectly level.
 *
 * Everything above the ankles is rotated about the ankle midpoint and the feet
 * are left where they are, which is the difference between this and
 * `unlevelFrames`: that one rotates the whole picture, this one rotates only
 * the body inside it. `estimateRoll` reads shoulder-mid over ankle-mid, so this
 * is the case that has to be told apart from a tilted phone — and cannot be.
 */
const leaning = (frames: Frame[], deg: number): Frame[] => {
  const theta = (deg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const planted = new Set<number>([...FEET, LM.leftToe, LM.rightToe])

  return frames.map((f) => {
    const cx = (f.image[LM.leftAnkle].x + f.image[LM.rightAnkle].x) / 2
    const cy = (f.image[LM.leftAnkle].y + f.image[LM.rightAnkle].y) / 2
    return {
      ...f,
      image: f.image.map((p, i) => {
        if (planted.has(i)) return p
        const dx = p.x - cx
        const dy = p.y - cy
        return { ...p, x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
      }),
    }
  })
}

check('roll is called out at exactly the angle spatial.ts corrects from', () => {
  for (const roll of [0, 2, NOTABLE_ROLL - 0.5, NOTABLE_ROLL, 12, 20]) {
    const base = standing(CORNER)
    const frames = unlevelFrames(base, { roll_deg: roll, ...levelPivot(base) })
    const r = readFraming(frames)
    const call = judgeFraming(r).call
    const expected = Math.abs(roll) >= NOTABLE_ROLL ? 'off-vertical' : 'ready'
    assert(call === expected, `a ${roll}° roll said ${call}`)
  }
})

check('a leaning player and a tilted phone are the same reading, and the cue admits it', () => {
  /*
   * The check the previous version of this file did not make, and the reason
   * the cue no longer names the phone.
   *
   * Both rows below are the rig at a camera reading 45°. One tilts the picture and
   * leaves the player upright in it; the other leaves the picture alone and
   * leans the player. `roll_deg` cannot separate them — it is one angle off
   * image vertical — so any cue that names either object as the thing to move
   * is wrong half the time, and wrong specifically for the player whose tripod
   * is already right.
   */
  for (const deg of [5, 8, 12]) {
    const base = standing(CORNER)
    const tilted = readFraming(unlevelFrames(base, { roll_deg: deg, ...levelPivot(base) }))
    const leant = readFraming(leaning(base, deg))

    within(leant.spatial!.roll_deg, deg - 1, deg + 1, `a ${deg}° lean read back`)
    assert(
      Math.abs(leant.spatial!.roll_deg - tilted.spatial!.roll_deg) < 0.6,
      `a ${deg}° lean read ${leant.spatial!.roll_deg}° against a ${deg}° phone tilt at ${tilted.spatial!.roll_deg}°`,
    )
    const verdict = judgeFraming(leant)
    assert(verdict.call === 'off-vertical', `a ${deg}° lean said ${verdict.call}`)
    assert(
      judgeFraming(tilted).cue === verdict.cue,
      'the two indistinguishable cases were told different things',
    )
  }
  // The honesty the ambiguity forces, pinned so it cannot be edited back out.
  const said = plain(judgeFraming(readFraming(leaning(standing(CORNER), 10))).cue)
  assert(/cannot tell/.test(said), `the cue picked a culprit it cannot see: "${said}"`)
})

check('roll never outranks something the camera cannot see past', () => {
  const base = standing(CORNER)
  const rolled = unlevelFrames(base, { roll_deg: 15, ...levelPivot(base) })
  const verdict = judgeFraming(readFraming(unseen(rolled, HANDS)))
  assert(verdict.call === 'hands-unseen', `a rolled phone with no hands said ${verdict.call}`)
  assert(verdict.also.includes('off-vertical'), 'the tilt was dropped rather than deferred')
})

heading('Cropping, and the ruler')

check('each crop reaches the player as the thing they can fix', () => {
  const base = standing(CORNER)
  const cases: [number[], FramingCall][] = [
    [FEET, 'feet-cropped'],
    [[LM.nose], 'head-cropped'],
    [[...FEET, LM.nose], 'body-cut'],
    [HANDS, 'hands-unseen'],
    [[LM.leftShoulder, LM.rightShoulder, LM.leftHip], 'body-unclear'],
  ]
  for (const [ids, expected] of cases) {
    const verdict = judgeFraming(readFraming(unseen(base, ids)))
    assert(verdict.call === expected, `hiding ${ids.join('/')} said ${verdict.call}`)
  }
})

check('both ends gone is a refusal, one end gone is not', () => {
  const base = standing(CORNER)
  assert(judgeFraming(readFraming(unseen(base, [...FEET, LM.nose]))).grade === 'refused', 'both ends survived')
  assert(judgeFraming(readFraming(unseen(base, FEET))).grade === 'hedged', 'cropped feet were refused')
  assert(judgeFraming(readFraming(unseen(base, [LM.nose]))).grade === 'hedged', 'a cropped head was refused')
})

check('the standing height is dropped, never guessed, when the feet are not in shot', () => {
  const base = standing(CORNER)
  const height = standingHeight(base)
  assert(height !== null && height > 0, 'no height from a clean window')
  // The rig stands the player 0.516 of the frame tall at every camera angle, so
  // this figure is the rig's framing and nothing else. What is being checked is
  // that the answer disappears rather than falling back to something plausible.
  note(`the rig frames its player ${height!.toFixed(3)} of the frame tall`)
  assert(standingHeight(unseen(base, FEET)) === null, 'a height was invented from unseen feet')
  assert(standingHeight([]) === null, 'a height was invented from nothing')
})

check('an unmeasurable yaw is never acted on', () => {
  // With the feet gone there is no standing height, so `estimateYaw` returns its
  // own 45° fallback. 45 sits inside DEPTH_YAW_RANGE and so happens to produce
  // no advice, which is exactly why this is worth pinning: the reading records
  // that the angle was not measured, and the ranking asks.
  const r = readFraming(unseen(standing(0), FEET))
  assert(!r.yaw_measured, 'a yaw with no height behind it was called measured')
  assert(r.spatial!.yaw_deg === 45, `the fallback moved to ${r.spatial!.yaw_deg}`)

  const forced = judgeFraming(reading({ spatial: r.spatial, yaw_measured: false, issues: [] }))
  assert(forced.call === 'ready', `an unmeasured angle produced ${forced.call}`)

  // And the same reading, with the flag set, does speak — so the flag is what is
  // doing the work rather than 45 being harmless.
  const face = readFraming(standing(0))
  assert(judgeFraming({ ...face, yaw_measured: false }).call === 'ready', 'the flag was ignored')
  assert(judgeFraming(face).call === 'turn-off-square', 'a face-on camera said nothing')
})

heading('Building a preview frame')

check('the aspect correction round-trips, and it changes the answer', () => {
  const aspect = 16 / 9
  const source = standing(CORNER)

  // Undo the correction to get back to what MediaPipe hands over, then rebuild.
  const raw = source.map((f) => f.image.map((p) => ({ ...p, x: p.x / aspect })))
  const rebuilt = source.map((f, i) => previewFrame(raw[i], f.world, aspect, i, f.t))
  for (const [i, f] of rebuilt.entries()) {
    for (const [k, p] of f.image.entries()) {
      assert(
        Math.abs(p.x - source[i].image[k].x) < 1e-9 && p.y === source[i].image[k].y,
        `landmark ${k} of frame ${i} did not round-trip`,
      )
    }
  }

  // The same landmarks read as if the preview were square. The shoulder span is
  // measured in image units, so leaving x on the wrong scale moves the recovered
  // camera angle — which is the whole reason this conversion is not inlined in
  // the component where nothing could test it.
  const flat = source.map((f, i) => previewFrame(raw[i], f.world, 1, i, f.t))
  const right = readFraming(rebuilt).spatial!.yaw_deg
  const wrong = readFraming(flat).spatial!.yaw_deg
  note(`a 16:9 preview read square recovers ${wrong}° where the corrected read gives ${right}°`)
  assert(wrong !== right, 'the aspect correction made no difference, so it is not being applied')
})

check('a missing visibility is trusted, not zeroed', () => {
  // MediaPipe omits the field on the world landmarks. Defaulting it to 0 would
  // make every preview frame look like a player nobody can see.
  const f = previewFrame([{ x: 0.5, y: 0.5, z: 0 }], [{ x: 0, y: 0, z: 0 }], 1, 0, 0)
  assert(f.image[0].visibility === 1, `an unstated visibility came through as ${f.image[0].visibility}`)
})

heading('The reading, end to end')

check('an empty preview says so and measures nothing', () => {
  const r = readFraming([])
  assert(r.issues.join(',') === framingIssues([]).join(','), 'the empty case disagrees with framingIssues')
  assert(r.spatial === null, 'a spatial read was produced from no frames')
  assert(!r.yaw_measured && r.samples === 0, 'an empty preview claimed a measurement')
})

report()
