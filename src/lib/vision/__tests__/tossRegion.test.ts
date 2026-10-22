/** Reading the ball in a column above the tossing hand, at the video's own resolution. */
import {
  candidateToFrame,
  findCandidates,
  radiusLimitsIn,
  tossRegion,
  type Bitmap,
} from '../ballTrack'
import { assert, check, heading, near, note, report } from '../../analysis/__tests__/harness'

const W = 1280
const H = 720

/** A court-coloured frame with a little noise, and a ball of radius `r` at (bx, by). */
function frame(bx: number, by: number, r: number, seed: number): Bitmap {
  const data = new Uint8ClampedArray(W * H * 4)
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const n = rand() * 12
      const inBall = (x - bx) ** 2 + (y - by) ** 2 <= r * r
      data[i] = inBall ? 214 : 70 + n
      data[i + 1] = inBall ? 245 : 96 + n
      data[i + 2] = inBall ? 66 : 110 + n
      data[i + 3] = 255
    }
  }
  return { data, width: W, height: H }
}

/** Box-average down to `w` wide — what drawing the whole frame into a 256-px canvas does. */
function shrink(b: Bitmap, w: number): Bitmap {
  const k = b.width / w
  const h = Math.round(b.height / k)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0]
      let n = 0
      for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) {
        for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) {
          const i = (yy * b.width + xx) * 4
          acc[0] += b.data[i]
          acc[1] += b.data[i + 1]
          acc[2] += b.data[i + 2]
          n++
        }
      }
      const o = (y * w + x) * 4
      data[o] = acc[0] / n
      data[o + 1] = acc[1] / n
      data[o + 2] = acc[2] / n
      data[o + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

/** A region cut out of a bitmap at full resolution — what `readBitmaps` draws. */
function cut(b: Bitmap, r: { x: number; y: number; w: number; h: number }): Bitmap {
  const w = Math.round(r.w)
  const h = Math.round(r.h)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + Math.round(r.y)) * b.width + x + Math.round(r.x)) * 4
      data.set(b.data.subarray(i, i + 4), (y * w + x) * 4)
    }
  }
  return { data, width: w, height: h }
}

heading('The ball, read above the tossing hand')

check('the column is centred on the hand, a body and a half wide, and stops at the shoulders', () => {
  const r = tossRegion({ handX: 700, floorY: 260, bodyHeightPx: 215, frameWidth: W, frameHeight: H })!
  near(r.w, 1.4 * 215, 1e-9, 'width')
  near(r.x + r.w / 2, 700, 1e-9, 'centred on the hand')
  assert(r.y === 0 && r.h === 260, 'from the top of the frame to the shoulder line')
})

check('a player filling a portrait frame gets the band above the shoulders, full width, at a sharper read (N5.1)', () => {
  const r = tossRegion({ handX: 360, floorY: 500, bodyHeightPx: 1100, frameWidth: 720, frameHeight: 1280 })
  assert(r !== undefined && r.x === 0 && r.w === 720 && r.y === 0 && r.h === 500, `the band was ${JSON.stringify(r)}`)
  // Pixels across the ball, against the old whole frame shrunk to 256 px wide.
  const bandScale = Math.min(1, 384 / r!.w)
  const oldScale = 256 / 720
  assert(bandScale / oldScale >= 1.4, `the band reads the ball only ${(bandScale / oldScale).toFixed(2)}x as sharply`)
})

check('a candidate found in the column lands where it is in the frame', () => {
  const region = { x: 550, y: 0, w: 301, h: 260 }
  const c = candidateToFrame({ x: 0.5, y: 0.4, r: 0.02, score: 1 }, region, W, H)
  near(c.x, (550 + 150.5) / W, 1e-9, 'x')
  near(c.y, 104 / H, 1e-9, 'y')
  near(c.r, (0.02 * 260) / H, 1e-9, 'radius back in frame heights')
  const lim = radiusLimitsIn(region, H)
  near(lim.minRadius * region.h, 0.004 * H, 1e-9, 'the size floor is the same number of pixels')
})

check('a distant player’s ball is placed to the pixel in the column, and only roughly in the shrunk frame', () => {
  // A 215-px player in a 1280 × 720 landscape frame: the ball is ~9 px across.
  const [bx, by, r] = [705, 110, 4.5]
  const now = frame(bx, by, r, 1)
  const before = frame(bx, by + 12, r, 2)
  const region = tossRegion({ handX: 700, floorY: 260, bodyHeightPx: 215, frameWidth: W, frameHeight: H })!
  const inColumn = findCandidates(cut(now, region), cut(before, region), {
    belowY: 1,
    ...radiusLimitsIn(region, H),
  }).map((c) => candidateToFrame(c, region, W, H))
  const whole = findCandidates(shrink(now, 256), shrink(before, 256), { belowY: 260 / H })
  const miss = (cs: { x: number; y: number }[]) =>
    Math.min(...cs.map((c) => Math.hypot(c.x * W - bx, c.y * H - by)))
  note(`ball placed within ${miss(inColumn).toFixed(2)} px in the column, ${miss(whole).toFixed(2)} px from the 256-px frame`)
  assert(miss(inColumn) < 1, 'the column read did not place a ball it could see at full resolution')
  assert(miss(whole) > miss(inColumn) * 2, 'the shrunk frame placed the ball as sharply — the test is not testing anything')
})

report()
