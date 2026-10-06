/**
 * Reading a slow-motion stretch off the ball's fall, and deciding when to
 * believe it.
 *
 * The tosses are synthetic tracks of ball centroids — the same shape the flight
 * suite feeds `trackBall` — filmed at a 30 fps file of a serve captured at one,
 * two, four and eight times that, so each one's gravity in file seconds is a
 * quarter, a sixteenth or a sixty-fourth of the real thing.
 */
import { chooseStretch, motionAgrees, stretchFromBall, STRETCHES } from '../slowMotion'
import { assert, check, heading, near, note, report } from './harness'

/** The player's height in frame units, and real gravity at that scale (`findBall`'s formula). */
const BODY = 0.5
const GRAVITY = (9.81 * BODY) / 1.78
const PIXEL = 1 / 720

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const normal = (rand: () => number) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand())

/**
 * A toss as a 30 fps file sees it: from `before` seconds ahead of the apex to
 * `after` seconds past it, in real time, then stretched by `factor`.
 */
function toss(factor: number, seed: number, opts: { noisePx?: number; before?: number; after?: number } = {}) {
  const rand = seeded(seed)
  const sigma = (opts.noisePx ?? 1) * PIXEL
  const before = opts.before ?? 0.35
  const after = opts.after ?? 0.38
  const fileFps = 30
  const frames: { t: number; candidates: { x: number; y: number; r: number; score: number }[] }[] = []
  for (let i = 0; i <= Math.round((before + after) * factor * fileFps); i++) {
    const fileT = i / fileFps
    const realT = fileT / factor - before
    const y = 0.2 + 0.5 * GRAVITY * realT * realT + normal(rand) * sigma
    const x = 0.5 + 0.02 * realT + normal(rand) * sigma
    frames.push({ t: fileT, candidates: [{ x, y, r: 0.008, score: 1 }] })
  }
  return frames
}

heading('The ball’s fall gives away the stretch')

for (const factor of STRETCHES) {
  check(`a toss filmed at ${factor}× reads as ${factor}×`, () => {
    let right = 0
    const trials = 8
    for (let s = 1; s <= trials; s++) {
      const read = stretchFromBall(toss(factor, s * 7919), GRAVITY)
      if (read?.factor === factor) right++
    }
    note(`${factor}×: ${right} of ${trials} read correctly`)
    assert(right >= trials - 1, `${factor}×: only ${right} of ${trials}`)
  })
}

check('a real-time toss is never read as slowed down', () => {
  for (let s = 1; s <= 12; s++) {
    const read = stretchFromBall(toss(1, s * 104729, { noisePx: 2 }), GRAVITY)
    assert(read === undefined || read.factor === 1, `seed ${s}: a real-time toss read as ${read?.factor}×`)
  }
})

check('decoys in every frame and a rougher centroid do not change the answer', () => {
  // Two blobs per frame that are not the ball — a bright shirt, a sign — moving
  // nowhere in particular, and twice the centroid noise.
  for (const factor of [1, 4] as const) {
    let right = 0
    for (let s = 1; s <= 6; s++) {
      const rand = seeded(s * 31)
      const frames = toss(factor, s * 613, { noisePx: 2 }).map((f) => ({
        t: f.t,
        candidates: [
          ...f.candidates,
          { x: 0.2 + rand() * 0.6, y: 0.1 + rand() * 0.3, r: 0.008, score: 0.6 },
          { x: 0.2 + rand() * 0.6, y: 0.1 + rand() * 0.3, r: 0.008, score: 0.6 },
        ],
      }))
      if (stretchFromBall(frames, GRAVITY)?.factor === factor) right++
    }
    note(`${factor}× with decoys: ${right} of 6`)
    assert(right >= 5, `${factor}× with decoys: only ${right} of 6`)
  }
})

check('the implied stretch sits near the one it rounded to', () => {
  const read = stretchFromBall(toss(4, 31337), GRAVITY)!
  near(read.implied, 4, 0.5, 'implied stretch')
})

check('a player of a different height is read at their own gravity', () => {
  // The scale comes from the player's height in the frame; a toss at that scale
  // still reads its stretch when the caller's gravity carries the same scale.
  const read = stretchFromBall(toss(2, 4242), GRAVITY)
  assert(read?.factor === 2, `read ${read?.factor}×`)
})

heading('The motion has to agree')

check('a serve at human speed passes only at its own stretch', () => {
  // Real time: swing 0.14 s, motion 1.2 s.
  assert(motionAgrees(0.14, 1.2, 1), 'a real-time serve failed at one')
  assert(!motionAgrees(0.14, 1.2, 4), 'a real-time serve passed at four')
  // Four times stretched: swing 0.56 s, motion 4.8 s of file.
  assert(motionAgrees(0.56, 4.8, 4), 'a four-times clip failed at four')
  assert(!motionAgrees(0.56, 4.8, 1), 'a four-times clip passed at one')
})

check('a slow club swing still passes at one', () => {
  assert(motionAgrees(0.3, 1.8, 1), 'a slow, deliberate real-time serve was refused')
})

heading('Which evidence wins')

check('the file wins when it speaks, whatever the ball says', () => {
  const ball = stretchFromBall(toss(2, 99), GRAVITY)
  const pick = chooseStretch({ container: 4, ball, swing: 0.56, motion: 4.8 })
  assert(pick.factor === 4 && pick.source === 'file', `chose ${pick.factor} from ${pick.source}`)
})

check('the ball decides only when the motion agrees', () => {
  const ball = stretchFromBall(toss(4, 77), GRAVITY)!
  assert(ball.factor === 4, 'setup: the ball did not read four')
  const agreed = chooseStretch({ ball, swing: 0.56, motion: 4.8 })
  assert(agreed.factor === 4 && agreed.source === 'ball', `chose ${agreed.factor} from ${agreed.source}`)
  const human = chooseStretch({ ball, swing: 0.14, motion: 1.2 })
  assert(human.factor === 1 && human.source === 'none', 'a real-time motion was stretched on the ball alone')
  const unknown = chooseStretch({ ball })
  assert(unknown.factor === 1, 'a stretch was taken with no motion to check it against')
})

check('nothing to go on leaves the clip at one', () => {
  const pick = chooseStretch({})
  assert(pick.factor === 1 && pick.source === 'none', `chose ${pick.factor}`)
  const realTime = chooseStretch({ ball: stretchFromBall(toss(1, 5), GRAVITY), swing: 0.14, motion: 1.2 })
  assert(realTime.factor === 1, 'a real-time ball stretched the clip')
})

report()
