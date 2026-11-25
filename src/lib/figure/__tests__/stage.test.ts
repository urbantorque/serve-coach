/**
 * Where a swing sits in its box.
 *
 * Two bodies side by side are only comparable at one size, and a crop that asks
 * the video for pixels past its edge draws nothing where the player's head was.
 */
import fixture from '../../analysis/__tests__/fixtures/bath-serves.json'
import { filmMocap, unpackMocap, type PackedMocapServe } from '../../analysis/mocapServe'
import { buildServe, CLEAN_SERVE } from '../../analysis/syntheticServe'
import { cropOn, placeSwing } from '../stage'
import { statureOf } from '../shape'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

const fromBase64 = (t: string) => {
  const bin = atob(t)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const real = filmMocap(unpackMocap((fixture.serves as PackedMocapServe[])[2], fromBase64), { fps: 60, aspect: 1, lead: 0 })
const rig = buildServe({ ...CLEAN_SERVE, noise: 0, dropout: 0 }, 60)
const swings = [
  ['a real serve', real],
  ['the rig', rig],
] as const

heading('Placing a swing')

check('asked for a height, the body is that share of the box, whatever the footage', () => {
  for (const [name, s] of swings) {
    const at = placeSwing(s, 390, 600, { height: 0.6 })
    assert(Math.abs(at.stature - 360) < 1, `${name} stood ${at.stature.toFixed(1)} of 360`)
  }
})

check('two swings placed the same way stand the same size', () => {
  const a = placeSwing(real, 195, 300, { height: 0.6 })
  const b = placeSwing(rig, 195, 300, { height: 0.6 })
  assert(Math.abs(a.stature - b.stature) < 0.5, `${a.stature} against ${b.stature}`)
})

check('the feet sit on the line asked for, and the floor is where they are', () => {
  for (const [name, s] of swings) {
    const at = placeSwing(s, 390, 600, { height: 0.6, feet: 0.9 })
    assert(at.floor <= 600 && at.floor > 300, `${name}'s floor is at ${at.floor}`)
  }
})

check('without a height, the whole swing fits the box', () => {
  for (const [name, s] of swings) {
    const at = placeSwing(s, 390, 600)
    for (const f of s) {
      for (const p of f.image) {
        const q = at.place(p)
        assert(q.x >= -1 && q.x <= 391 && q.y >= -1 && q.y <= 601, `${name} left the box at ${q.x},${q.y}`)
      }
    }
  }
})

check('placing changes a body\'s size, never its shape', () => {
  const at = placeSwing(rig, 390, 600, { height: 0.6 })
  const f = rig[20]
  const raw = statureOf(f.image.map((p) => ({ x: p.x * at.scale, y: p.y * at.scale })))
  assert(Math.abs(statureOf(f.image.map(at.place)) - raw) < 1e-6, 'placing bent the body')
})

heading('Cropping footage')

check('a crop stays inside the frame, keeps the stage\'s shape, and holds the body', () => {
  for (const aspect of [9 / 16, 3 / 4, 1, 16 / 9]) {
    for (const stage of [0.75, 1, 1.4]) {
      const crop = cropOn(real, stage, aspect)
      assert(crop.x >= -1e-9 && crop.y >= -1e-9, 'a crop started outside the frame')
      assert(crop.x + crop.w <= Math.max(aspect, crop.w) + 1e-9 && crop.y + crop.h <= 1 + 1e-9, 'a crop ran past the frame')
      assert(Math.abs(crop.w / crop.h - stage) < 1e-9, 'the crop isn’t the stage\'s shape')
    }
  }
})

check('a small player is brought up, a filling one is left alone', () => {
  const small = real.map((f) => ({ ...f, image: f.image.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * 0.4, y: 0.5 + (p.y - 0.5) * 0.4 })) }))
  assert(cropOn(small, 1, 1).h < cropOn(real, 1, 1).h, 'a small player wasn’t brought up')
})

report()
