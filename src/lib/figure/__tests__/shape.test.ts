/**
 * The figure gives the tracked body mass and nothing else.
 *
 * What the player sees has to stay what the tracker saw: a body drawn over the
 * joints it was measured from, never a flattering version of them. These hold
 * that on real motion (the Bath serves) as well as on the rig, on every frame,
 * because a limb that wanders off its joint on one frame of a swing is the kind
 * of thing a player would read as their own arm.
 */
import fixture from '../../analysis/__tests__/fixtures/bath-serves.json'
import { LM, sided } from '../../analysis/geometry'
import { filmMocap, unpackMocap, type PackedMocapServe } from '../../analysis/mocapServe'
import { buildServe, CLEAN_SERVE } from '../../analysis/syntheticServe'
import type { Frame } from '../../analysis/types'
import { facingOf, nearSide, shapesOf, statureOf, type Pt } from '../shape'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const fromBase64 = (t: string) => {
  const bin = atob(t)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const bath = unpackMocap((fixture.serves as PackedMocapServe[])[2], fromBase64)
const real = filmMocap(bath, { fps: 60, aspect: 1, lead: 0 })
const rig = buildServe({ ...CLEAN_SERVE, noise: 0, dropout: 0 }, 60)

/** A frame on a canvas a thousand units tall. */
const placed = (f: Frame): Pt[] => f.image.map((p) => ({ x: p.x * 1000, y: p.y * 1000 }))

function inside(p: Pt, outline: readonly Pt[]): boolean {
  let hit = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i]
    const b = outline[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

heading('The figure gives the body mass and nothing else')

for (const [name, frames] of [
  ['a real serve', real],
  ['the rig', rig],
] as const) {
  check(`on ${name}, every limb runs through the joints it was measured from`, () => {
    for (const f of frames) {
      const p = placed(f)
      const shapes = shapesOf(p, { racket: 'right' })
      const solids = new Map(shapes.parts.flatMap((part) => part.solids).map((s) => [s.id, s]))
      for (const side of ['left', 'right'] as const) {
        const l = sided(side)
        for (const [solid, a, b] of [
          ['upper', l.shoulder, l.elbow],
          ['fore', l.elbow, l.wrist],
          ['thigh', l.hip, l.knee],
          ['shin', l.knee, l.ankle],
        ] as const) {
          const s = solids.get(`${side}-${solid}`)
          assert(s !== undefined, `no ${side} ${solid}`)
          assert(inside(p[a], s!.outline), `${side} ${solid} misses its first joint on frame ${f.index}`)
          assert(inside(p[b], s!.outline), `${side} ${solid} misses its second joint on frame ${f.index}`)
          // The drawn axis is the landmark, to the unit: no joint is moved.
          assert(s!.axis[0].x === p[a].x && s!.axis[1].y === p[b].y, `${side} ${solid} moved a joint`)
        }
      }
    }
  })

  check(`on ${name}, no coordinate of any shape is ever not a number`, () => {
    for (const f of frames) {
      const shapes = shapesOf(placed(f), { racket: 'right' })
      for (const part of shapes.parts) {
        for (const s of part.solids) {
          for (const q of [...s.outline, ...s.across]) {
            assert(Number.isFinite(q.x) && Number.isFinite(q.y), `${s.id} has a bad point on frame ${f.index}`)
          }
        }
      }
    }
  })
}

check('a body keeps its width through a serve, whatever the limbs are doing', () => {
  // The stature is taken over the clip so nothing swells or shrinks as it
  // moves; a frame's own reading is only the fallback for a single still.
  const statures = real.map((f) => statureOf(placed(f)))
  const most = Math.max(...statures)
  const least = Math.min(...statures)
  note(`stature read per frame runs ${least.toFixed(0)} to ${most.toFixed(0)}`)
  assert(least / most > 0.75, 'one frame reads the body far smaller than another')
  const held = shapesOf(placed(real[10]), { racket: 'right', stature: most })
  const other = shapesOf(placed(real[90]), { racket: 'right', stature: most })
  assert(held.u === other.u, 'the figure changed size between frames')
})

check('a player facing right shows the camera their right side, and left their left', () => {
  const right = placed(rig[20])
  const left = right.map((p) => ({ x: 1000 - p.x, y: p.y }))
  assert(facingOf(right) * facingOf(left) < 0, 'mirroring didn’t turn the player round')
  const near = nearSide(right)
  assert(near === (facingOf(right) >= 0 ? 'right' : 'left'), 'facing and the near side disagree')
})

check('world depth, where a frame has it, decides which side is nearer', () => {
  const f = rig[20]
  const p = placed(f)
  const world = f.world.map((w) => ({ ...w }))
  world[LM.leftShoulder].z = -1
  world[LM.leftHip].z = -1
  world[LM.rightShoulder].z = 1
  world[LM.rightHip].z = 1
  assert(nearSide(p, world) === 'left', 'the nearer side by depth wasn’t chosen')
})

check('the far limbs are painted before the trunk and the near arm after it', () => {
  const order = shapesOf(placed(rig[20]), { racket: 'right' }).parts.map((part) => part.id)
  assert(order.indexOf('farArm') < order.indexOf('torso'), 'the far arm paints over the trunk')
  assert(order.indexOf('nearArm') > order.indexOf('torso'), 'the near arm paints under the trunk')
})

report()
