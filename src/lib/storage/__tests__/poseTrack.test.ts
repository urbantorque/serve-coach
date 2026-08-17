/**
 * The six keyframes kept as a body, and what has to be true of them.
 *
 * Two things can go wrong here and neither throws. A row that lines up with the
 * wrong keyframe captions a trophy position as a contact, which is worse than
 * showing nothing at all — the picture would be confidently mislabelled, which
 * is this codebase's founding failure aimed at a drawing. And a malformed row
 * read out of storage produces a canvas full of `NaN`: no exception, no boundary,
 * just a wrong body nothing reports. So most of what follows is about position
 * and about junk, rather than about the encoding being small.
 */
import {
  filmstripPoses,
  keyframePoses,
  keyframesFromTrack,
  phaseSamples,
  poseFrameAt,
  readKeyframePoses,
  readSwingTrack,
  replayFrom,
  swingTrack,
  trackFrameAt,
  POSE_PRECISION,
  REPLAY_ASSUMED_STEP,
} from '../poseTrack'
import { buildServe } from '../../analysis/syntheticServe'
import { detectServe } from '../../analysis/phases'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'
import type { Analysis, Frame, Phase } from '../../analysis/types'

const frames: Frame[] = buildServe({ noise: 0.006, seed: 7000 }, 30)
const skel = detectServe(frames, 30)
const K = skel.keys

/** Phases shaped like the report's own, pointing at real keyframes. */
const phases = [
  { frame: K.ready },
  { frame: K.toss },
  { frame: K.trophy },
  { frame: K.drop },
  { frame: K.contact },
  { frame: K.finish },
] as Pick<Phase, 'frame'>[]

const ASPECT = 9 / 16

heading('Keeping the keyframes as a body')

check('every keyframe gets a row, in the order the report renders them', () => {
  const poses = keyframePoses(frames, phases, ASPECT)
  assert(poses !== undefined, 'nothing was encoded from a clean serve')
  assert(poses!.rows.length === phases.length, `${poses!.rows.length} rows for ${phases.length} phases`)
  assert(poses!.rows.every(Boolean), 'a keyframe of a clean serve produced no row')
})

check('a row is the pose of the frame that keyframe points at, not a neighbour', () => {
  /*
   * The check that matters most. An off-by-one here draws the trophy under a
   * caption reading "Contact" and nothing anywhere would notice — the picture
   * looks like a serve, because it is one, just the wrong instant of it.
   */
  const poses = keyframePoses(frames, phases, ASPECT)!
  for (const [i, p] of phases.entries()) {
    const rebuilt = poseFrameAt(poses, i)!
    const source = frames[p.frame]
    for (let k = 0; k < source.image.length; k++) {
      const dx = Math.abs(rebuilt.image[k].x - source.image[k].x)
      const dy = Math.abs(rebuilt.image[k].y - source.image[k].y)
      const step = 10 ** -POSE_PRECISION
      assert(dx <= step && dy <= step, `row ${i}, landmark ${k} is not the frame it came from`)
    }
  }
})

check('a keyframe pointing outside the clip produces no row rather than a wrong one', () => {
  const poses = keyframePoses(frames, [{ frame: 9999 }, { frame: K.contact }] as Pick<Phase, 'frame'>[], ASPECT)
  assert(poses !== undefined, 'one unreadable keyframe threw the other away')
  assert(poses!.rows[0] === null, 'a frame that does not exist produced a row')
  assert(poses!.rows[1] !== null, 'the readable keyframe lost its row')
})

check('nothing readable at all produces nothing, not an empty shell', () => {
  const none = keyframePoses(frames, [{ frame: 9999 }] as Pick<Phase, 'frame'>[], ASPECT)
  assert(none === undefined, 'an all-null encoding was returned rather than dropped')
  assert(keyframePoses([], phases, ASPECT) === undefined, 'no frames produced a track')
  assert(keyframePoses(frames, [], ASPECT) === undefined, 'no phases produced a track')
  assert(keyframePoses(frames, phases, 0) === undefined, 'an aspect of zero produced a track')
})

check('what does not survive comes back absent, never fabricated', () => {
  // A stored pose has no world landmarks and no timestamp. Returning a plausible
  // zero for either would let something downstream measure a joint angle off a
  // body that has no depth, which is the whole reason only image landmarks are
  // kept — see the module comment.
  const rebuilt = poseFrameAt(keyframePoses(frames, phases, ASPECT), 2)!
  assert(rebuilt.world.length === 0, 'world landmarks were invented on the way back')
  assert(rebuilt.t === 0, 'a timestamp was invented')
})

heading('Read back out of storage')

check('junk in a row is dropped rather than drawn', () => {
  const good = keyframePoses(frames, phases, ASPECT)!
  const mangled = {
    aspect: good.aspect,
    rows: [
      good.rows[0],
      'not an array',
      [1, 2],
      [1, 2, 'three', 4, 5, 6],
      null,
      good.rows[5],
    ],
  }
  const read = readKeyframePoses(mangled)
  assert(read !== undefined, 'two good rows among four bad ones threw the lot away')
  assert(read!.rows[0] !== null && read!.rows[5] !== null, 'a good row was dropped')
  assert(
    read!.rows.slice(1, 5).every((r) => r === null),
    'a row that was not an array, was the wrong length, or held a string survived',
  )
})

check('a shape that cannot be drawn at all reads as absent', () => {
  const good = keyframePoses(frames, phases, ASPECT)!
  assert(readKeyframePoses(undefined) === undefined, 'undefined produced a track')
  assert(readKeyframePoses('a string') === undefined, 'a string produced a track')
  assert(readKeyframePoses({ rows: good.rows }) === undefined, 'a track with no aspect was accepted')
  assert(readKeyframePoses({ aspect: 0, rows: good.rows }) === undefined, 'an aspect of zero was accepted')
  assert(readKeyframePoses({ aspect: 0.5, rows: 'nope' }) === undefined, 'rows that are not an array were accepted')
  assert(
    readKeyframePoses({ aspect: 0.5, rows: [null, [1, 2]] }) === undefined,
    'a track with no usable row at all was accepted',
  )
})

check('a wrong-length row is refused on the way out too, not only on the way in', () => {
  // Both doors, because a row can reach the drawing loop without passing through
  // `readKeyframePoses` — the live analysis hands its own poses straight to the
  // report without a round trip through storage.
  assert(poseFrameAt({ aspect: 0.5, rows: [[1, 2]] }, 0) === undefined, 'a two-value row was rebuilt')
  assert(poseFrameAt({ aspect: 0.5, rows: [[]] }, 0) === undefined, 'an empty row was rebuilt')
  assert(poseFrameAt(undefined, 0) === undefined, 'no track produced a frame')
  assert(poseFrameAt({ aspect: 0.5, rows: [null] }, 7) === undefined, 'an index past the end produced a frame')
})

heading('What it costs')

check('six poses are far cheaper than the six pictures they stand in for', () => {
  const poses = keyframePoses(frames, phases, ASPECT)!
  const kb = new TextEncoder().encode(JSON.stringify(poses)).length / 1024
  // Six keyframe JPEGs are 24–48 kB of base64. This has to stay a fraction of
  // that or it is not worth surviving the prune the pictures do not.
  assert(kb < 4, `six poses came to ${kb.toFixed(1)} kB — the argument for keeping them was 15–30× cheaper`)
  note(`six keyframe poses: ${kb.toFixed(2)} kB, against 24–48 kB of stills`)
})

heading('The whole swing, and the keyframes still inside it')

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length

check('the six keyframes come back out of a track byte for byte', () => {
  /*
   * The property the whole design rests on, checked against both real functions
   * rather than against a restatement of either. A track is stored *instead of*
   * the poses, so if this ever stopped holding, a report would draw one filmstrip
   * before the prune ladder downgraded it and a different one afterwards.
   */
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)
  assert(track !== undefined, 'a clean serve produced no track')
  const lifted = keyframesFromTrack(track, phases)
  const stored = keyframePoses(frames, phases, ASPECT)
  assert(
    JSON.stringify(lifted) === JSON.stringify(stored),
    'the keyframes lifted out of a track are not the ones the report would have stored',
  )
  note(`track ${(bytes(track) / 1024).toFixed(1)} kB carries the ${(bytes(stored) / 1024).toFixed(1)} kB of keyframes inside it`)
})

check('a frame the tracker lost keeps its place, so later keyframes still line up', () => {
  /*
   * Rows are found by subtracting `from`, so a lost frame has to become a `null`
   * row rather than be left out. Dropping it would shift every later frame by
   * one and caption the drop as the contact — silently, because the picture
   * still looks like a serve.
   *
   * The hole is put between two keyframes on purpose: if the encoder compacted,
   * every phase after it would move and this would fail on five of six rows.
   */
  const holed = frames.map((f) => ({ ...f }))
  const hole = K.trophy + 1
  assert(!phases.some((p) => p.frame === hole), 'the hole landed on a keyframe — pick another frame')
  holed[hole] = { ...holed[hole], image: [] }

  const track = swingTrack(holed, K.ready, K.finish, ASPECT)!
  assert(track.rows[hole - track.from] === null, 'the lost frame was compacted away rather than kept as a hole')
  assert(
    JSON.stringify(keyframesFromTrack(track, phases)) ===
      JSON.stringify(keyframePoses(holed, phases, ASPECT)),
    'a hole in the track moved the keyframes off their own frames',
  )
})

check('a keyframe outside the stored span produces no row, not the nearest one', () => {
  // A track spans the swing, not the clip. Anything asked for outside it has to
  // come back absent — the alternative is a body drawn under a caption it never
  // belonged to, which is the one failure worse than a grey box.
  const track = swingTrack(frames, K.trophy, K.contact, ASPECT)!
  const lifted = keyframesFromTrack(track, phases)!
  assert(lifted.rows[0] === null, 'a keyframe before the span was given a row')
  assert(lifted.rows[5] === null, 'a keyframe after the span was given a row')
  assert(lifted.rows[2] !== null, 'a keyframe inside the span lost its row')
})

check('times are one per row and read off the frames, not stepped', () => {
  /*
   * Sampling is not evenly spaced — `seekTo` files a frame under the time the
   * seek actually reached — so a replay built on a fixed step would drift. Kept
   * parallel to the rows rather than inside them, which is what leaves a row
   * identical to a keyframe row.
   */
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)!
  assert(track.times.length === track.rows.length, 'one timestamp per row is not what was written')
  for (let i = 0; i < track.rows.length; i++) {
    const t = frames[track.from + i].t
    assert(Math.abs(track.times[i] - t) <= 0.001, `time ${i} is not the frame's own`)
  }
  assert(
    track.times.every((t, i) => i === 0 || t >= track.times[i - 1]),
    'the timestamps do not run forwards',
  )
})

check('nothing worth drawing produces no track at all', () => {
  const blank = frames.slice(K.ready, K.finish + 1).map((f) => ({ ...f, image: [] }))
  assert(swingTrack(blank, 0, blank.length - 1, ASPECT) === undefined, 'a track of empty rows was written')
  assert(swingTrack(frames, K.ready, K.finish, 0) === undefined, 'an aspect of zero produced a track')
  assert(swingTrack(frames, K.finish, K.ready, ASPECT) === undefined, 'a backwards span produced a track')
  assert(swingTrack([], 0, 5, ASPECT) === undefined, 'no frames produced a track')
})

check('junk is refused on the way back out of storage', () => {
  const good = swingTrack(frames, K.ready, K.finish, ASPECT)!
  assert(readSwingTrack(JSON.parse(JSON.stringify(good))) !== undefined, 'a real track was refused')
  assert(readSwingTrack(undefined) === undefined, 'nothing read as a track')
  assert(readSwingTrack({ ...good, aspect: 0 }) === undefined, 'an aspect of zero survived the door')
  assert(readSwingTrack({ ...good, from: -1 }) === undefined, 'a negative offset survived the door')
  assert(readSwingTrack({ ...good, rows: 'rows' }) === undefined, 'rows that are not an array survived')
  assert(readSwingTrack({ ...good, rows: [[1, 2], null] }) === undefined, 'a track of only junk rows survived')
  // A missing timestamp costs a replay its spacing; a row is still worth drawing
  // without one, so `times` is repaired to the row count rather than refused with it.
  const short = readSwingTrack({ ...good, times: [] })!
  assert(short.times.length === short.rows.length, 'a short times array was not repaired to the rows')
})

check('the report reads whichever form it is carrying', () => {
  /*
   * Three real states in a real store: a fresh report with a track, one the quota
   * ladder downgraded to keyframes, and one written before either existed. The
   * screen must not have to know which it is holding.
   */
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)
  const poses = keyframePoses(frames, phases, ASPECT)
  const shell = { phases } as unknown as Analysis
  assert(
    JSON.stringify(filmstripPoses({ ...shell, track, poses: undefined })) === JSON.stringify(poses),
    'a report carrying only a track drew nothing',
  )
  assert(
    JSON.stringify(filmstripPoses({ ...shell, track: undefined, poses })) === JSON.stringify(poses),
    'a downgraded report drew nothing',
  )
  assert(
    filmstripPoses({ ...shell, track: undefined, poses: undefined }) === undefined,
    'a report with neither form invented one',
  )
})

heading('Playing a stored swing back as motion')

/** The report's own phases, with the ids `phaseSamples` keys on. */
const namedPhases = (['ready', 'toss', 'trophy', 'drop', 'contact', 'finish'] as const).map(
  (id, i) => ({ id, frame: phases[i].frame }),
) as Pick<Phase, 'id' | 'frame'>[]

check('a replay is the tracked rows, timed by the sampler rather than a guess', () => {
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)!
  const replay = replayFrom(track)!
  assert(replay.samples.length === track.rows.length, 'a clean swing lost samples')
  assert(!replay.assumedSpacing, 'a swing with real timestamps was replayed at an assumed cadence')
  assert(replay.samples[0].at === 0, 'the replay does not start at zero')
  /*
   * Relative to the first sample, not to the clip. There is no clip left to be
   * absolute against — the video is gone, and an elapsed time counted from a
   * walk-up nobody can watch is a number with nothing behind it.
   */
  const span = frames[K.finish].t - frames[K.ready].t
  assert(Math.abs(replay.duration - span) <= 0.002, `duration ${replay.duration} is not the swing's own`)
  assert(
    replay.samples.every((s, i) => i === 0 || s.at >= replay.samples[i - 1].at),
    'the replay does not run forwards',
  )
})

check('a frame the tracker lost is not a sample, and takes its time with it', () => {
  /*
   * A row with no body cannot be drawn, and blanking the canvas for an instant
   * reads as the app faulting rather than as a gap in what a phone could see.
   * Dropping the sample leaves its time out of the sequence too, so the swing
   * simply holds still for exactly as long as the tracking was missing.
   */
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)!
  const holed = { ...track, rows: track.rows.map((r, i) => (i === 4 || i === 5 ? null : r)) }
  const replay = replayFrom(holed)!
  assert(replay.samples.length === track.rows.length - 2, 'a lost frame was replayed as a sample')
  assert(
    replay.samples.every((s) => holed.rows[s.row] !== null),
    'a sample points at a row with no body in it',
  )
  const gap = replay.samples[4].at - replay.samples[3].at
  const step = replay.samples[2].at - replay.samples[1].at
  assert(gap > step * 2, `the two-frame hole replayed as a ${gap.toFixed(3)}s step, the same as any other`)
})

check('one pose is not motion', () => {
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)!
  const single = { ...track, rows: track.rows.map((r, i) => (i === 3 ? r : null)) }
  assert(replayFrom(single) === undefined, 'a single pose was offered as a replay')
  assert(replayFrom(undefined) === undefined, 'nothing was offered as a replay')
})

check('timestamps that cannot be trusted fall back to a cadence, and say so', () => {
  /*
   * `readSwingTrack` repairs a missing timestamp to zero rather than refusing
   * the row it belongs to, which is the right trade for a filmstrip and the
   * wrong one for a clock: a run of zeroes would play a whole swing in an
   * instant. The fallback is never faster than life — a serve shown quicker
   * than it happened is the one error that makes a player misjudge their timing.
   */
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)!
  const repaired = replayFrom({ ...track, times: track.times.map(() => 0) })!
  assert(repaired.assumedSpacing, 'a run of zeroed timestamps was treated as measured')
  assert(
    Math.abs(repaired.samples[1].at - REPLAY_ASSUMED_STEP) <= 0.001,
    'the assumed cadence is not the constant it is documented as',
  )
  assert(repaired.duration > 0, 'a repaired replay has no duration to loop over')

  const backwards = track.times.slice()
  backwards[6] = backwards[5] - 0.5
  const jumbled = replayFrom({ ...track, times: backwards })!
  assert(jumbled.assumedSpacing, 'timestamps that run backwards were played as measured')

  const real = replayFrom(track)!
  assert(!real.assumedSpacing, 'the real thing was mistaken for a repair')
})

check('a row rebuilds as the frame it came from, carrying its own clip index and time', () => {
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)!
  for (const row of [0, 7, track.rows.length - 1]) {
    const rebuilt = trackFrameAt(track, row)!
    const source = frames[track.from + row]
    assert(rebuilt.index === track.from + row, `row ${row} rebuilt under the wrong clip frame`)
    assert(Math.abs(rebuilt.t - source.t) <= 0.001, `row ${row} rebuilt with the wrong time`)
    const step = 10 ** -POSE_PRECISION
    for (let k = 0; k < source.image.length; k++) {
      assert(
        Math.abs(rebuilt.image[k].x - source.image[k].x) <= step &&
          Math.abs(rebuilt.image[k].y - source.image[k].y) <= step,
        `row ${row}, landmark ${k} is not the frame it came from`,
      )
    }
  }
  assert(trackFrameAt(track, -1) === undefined, 'a row before the track rebuilt as a body')
  assert(trackFrameAt(track, 9999) === undefined, 'a row past the track rebuilt as a body')
  assert(trackFrameAt(undefined, 0) === undefined, 'no track rebuilt as a body')
})

check('a keyframe lands on its own sample, and the replay draws what the strip draws', () => {
  /*
   * The alignment check, aimed at the player instead of the strip. The pill
   * reading Contact parks the replay somewhere and the caption names it, so a
   * pill that stopped one frame early would caption the wrong instant with a
   * picture that still looks entirely like a serve.
   *
   * Asserted against `keyframesFromTrack` rather than against the phase index,
   * so the two readers of the same track are held to each other: whatever the
   * filmstrip draws for Contact is what the replay must park on for Contact.
   */
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)!
  const replay = replayFrom(track)!
  const marks = phaseSamples(replay, track, namedPhases)
  const strip = keyframesFromTrack(track, namedPhases)!

  assert(marks.size === namedPhases.length, `${marks.size} of six keyframes are reachable in a clean swing`)
  for (const [i, p] of namedPhases.entries()) {
    const sample = replay.samples[marks.get(p.id)!]
    const fromReplay = trackFrameAt(track, sample.row)!
    const fromStrip = poseFrameAt(strip, i)!
    assert(
      JSON.stringify(fromReplay.image) === JSON.stringify(fromStrip.image),
      `the replay parks ${p.id} on a different body from the one the filmstrip draws`,
    )
  }
})

check('a keyframe with no row of its own gets no control rather than its neighbour', () => {
  const track = swingTrack(frames, K.ready, K.finish, ASPECT)!
  const contactRow = K.contact - track.from
  const holed = { ...track, rows: track.rows.map((r, i) => (i === contactRow ? null : r)) }
  const marks = phaseSamples(replayFrom(holed)!, holed, namedPhases)
  assert(!marks.has('contact'), 'a keyframe the tracker lost was mapped to a neighbouring frame')
  assert(marks.has('trophy') && marks.has('finish'), 'one lost keyframe took the others with it')

  // And a phase pointing outside the stored span — a downgraded or truncated
  // track — is absent for the same reason rather than clamped to an end.
  const outside = phaseSamples(replayFrom(track)!, track, [
    { id: 'ready', frame: track.from - 3 },
    { id: 'contact', frame: 99999 },
  ] as Pick<Phase, 'id' | 'frame'>[])
  assert(outside.size === 0, 'a phase outside the stored swing was mapped into it')
  assert(phaseSamples(undefined, track, namedPhases).size === 0, 'no replay produced marks anyway')
})

note(
  `A stored swing replays as ${replayFrom(swingTrack(frames, K.ready, K.finish, ASPECT))!.samples.length} samples over ${replayFrom(swingTrack(frames, K.ready, K.finish, ASPECT))!.duration.toFixed(2)}s`,
)

report()
