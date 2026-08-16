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
import { keyframePoses, poseFrameAt, readKeyframePoses, POSE_PRECISION } from '../poseTrack'
import { buildServe } from '../../analysis/syntheticServe'
import { detectServe } from '../../analysis/phases'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'
import type { Frame, Phase } from '../../analysis/types'

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

report()
