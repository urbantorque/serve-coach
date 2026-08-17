/**
 * The outbound ball, read as a smear.
 *
 * Driven on drawn bitmaps rather than on footage, and the distinction matters
 * for what these checks are worth. A synthetic streak proves the geometry —
 * that a line at 30° reads as 30°, that a disc is not called a smear, that the
 * refusal fires on frames rather than on the estimate. It proves nothing about
 * whether a real ball against a real sky produces a region at all. That is
 * `RECORDED`'s job and it is 0 of 6.
 *
 * So every check here is about arithmetic the detector does *after* it has found
 * something, plus the one thing a drawn frame can honestly test about finding:
 * that an elongated region and a round one are told apart.
 */
import {
  HEADING_TOLERANCE_DEG,
  MIN_ELONGATION,
  OUTBOUND_FLOOR,
  findStreaks,
  readOutbound,
  type Streak,
} from '../../vision/outbound'
import { REJECTIONS } from '../triage'
import type { Bitmap } from '../../vision/ballTrack'
import { assert, check, heading, note, report } from './harness'

const W = 160
const H = 284

const blank = (): Bitmap => ({ data: new Uint8ClampedArray(W * H * 4), width: W, height: H })

/** A bright line of the given length and angle, drawn into a copy of `base`. */
function withStreak(
  base: Bitmap,
  opts: { cx: number; cy: number; lengthPx: number; angleDeg: number; widthPx?: number },
): Bitmap {
  const out: Bitmap = { data: new Uint8ClampedArray(base.data), width: W, height: H }
  const rad = (-opts.angleDeg * Math.PI) / 180
  const half = opts.lengthPx / 2
  const wide = opts.widthPx ?? 2
  for (let s = -half; s <= half; s += 0.25) {
    for (let n = -wide / 2; n <= wide / 2; n += 0.5) {
      const x = Math.round(opts.cx + s * Math.cos(rad) - n * Math.sin(rad))
      const y = Math.round(opts.cy + s * Math.sin(rad) + n * Math.cos(rad))
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      out.data[(y * W + x) * 4 + 1] = 255
    }
  }
  return out
}

/** A filled circle, which is what the existing tracker looks for. */
function withDisc(base: Bitmap, cx: number, cy: number, r: number): Bitmap {
  const out: Bitmap = { data: new Uint8ClampedArray(base.data), width: W, height: H }
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) out.data[(y * W + x) * 4 + 1] = 255
    }
  }
  return out
}

heading('Finding a smear rather than a ball')

check('a drawn streak reads back at the angle it was drawn', () => {
  for (const angle of [0, 15, 30, -20, 45, -45]) {
    const found = findStreaks(withStreak(blank(), { cx: 80, cy: 140, lengthPx: 60, angleDeg: angle }), blank())
    assert(found.length === 1, `${angle}°: found ${found.length} regions, expected 1`)
    assert(
      Math.abs(found[0].angleDeg - angle) < 4,
      `${angle}° read back as ${found[0].angleDeg.toFixed(1)}°`,
    )
  }
  const flat = findStreaks(withStreak(blank(), { cx: 80, cy: 140, lengthPx: 60, angleDeg: 30 }), blank())
  note(`a 60px streak at 30° reads ${flat[0].angleDeg.toFixed(1)}°, elongation ${flat[0].elongation.toFixed(1)}`)
})

check('a disc is not a smear, which is the whole reason this detector exists', () => {
  /*
   * The other half of R61·1's finding. `findCandidates` throws a smear out for
   * not being round; this must not accept a round thing for being bright, or
   * the two detectors would be measuring the same objects and disagreeing.
   */
  const disc = findStreaks(withDisc(blank(), 80, 140, 7), blank())
  assert(disc.length === 1, `a drawn disc produced ${disc.length} regions`)
  assert(
    disc[0].elongation < MIN_ELONGATION,
    `a circle measured ${disc[0].elongation.toFixed(2)} elongation, over the ${MIN_ELONGATION} bar`,
  )
  const streak = findStreaks(withStreak(blank(), { cx: 80, cy: 140, lengthPx: 60, angleDeg: 20 }), blank())
  assert(
    streak[0].elongation >= MIN_ELONGATION,
    `a 60px smear measured only ${streak[0].elongation.toFixed(2)}`,
  )
  note(`disc ${disc[0].elongation.toFixed(2)}, smear ${streak[0].elongation.toFixed(2)}`)
})

check('the first frame of a pass yields nothing rather than the whole frame', () => {
  // No previous frame means no difference. Treating the frame itself as
  // movement would report the player, the net and the fence as smears.
  const f = withStreak(blank(), { cx: 80, cy: 140, lengthPx: 60, angleDeg: 20 })
  assert(findStreaks(f, undefined).length === 0, 'the first frame produced streaks')
})

heading('What several frames add up to')

const streak = (angleDeg: number, lengthRatio = 0.2): Streak => ({
  x: 0.5,
  y: 0.4,
  lengthRatio,
  angleDeg,
  elongation: 8,
  pixels: 40,
})

check('frames that agree give the median heading', () => {
  const r = readOutbound([[streak(12)], [streak(16)], [streak(14)], [streak(15)]])
  assert(r.launchDeg === 14.5, `read ${r.launchDeg}° from 12, 14, 15, 16`)
  assert(r.frames === 4, `counted ${r.frames}`)
  assert(r.refusal === undefined, `refused anyway: ${r.refusal}`)
})

check('the refusal is keyed to frames counted, never to the angle it read', () => {
  /*
   * R61·3'S ONE HARD PART. The round asks for a refusal "above the speed where
   * the frames run out", and a refusal keyed to that speed is one the estimate
   * authorises for itself: the reading that fails hardest comes from the fewest
   * frames, so a bad enough estimate reads as slow and lets itself through.
   *
   * Checked by handing it two frames whose angle is perfectly ordinary. Nothing
   * about the number is suspicious; only the count is.
   */
  const r = readOutbound([[streak(14)], [streak(15)]])
  assert(r.launchDeg === undefined, `stated ${r.launchDeg}° from two frames`)
  assert(r.refusal === 'too_few_streaks', `refused as ${r.refusal}`)
  assert(r.frames === 2, `reported ${r.frames} frames`)
  assert(OUTBOUND_FLOOR === 3, 'the floor moved without this reasoning being revisited')
})

check('the frame count travels with a reading that was stated', () => {
  // It is the caveat, not just the refusal. A caller wanting to be stricter
  // than three has to be able to be.
  const r = readOutbound([[streak(20)], [streak(21)], [streak(19)]])
  assert(r.launchDeg !== undefined && r.frames === 3, `${JSON.stringify(r)}`)
})

check('streaks that do not agree refuse differently from streaks never found', () => {
  /*
   * Two failures that mean different things to whoever asks next. Found and
   * disagreeing is a scene with more than one fast thing in it — the ball and
   * the racket, a second player — which no better camera fixes. Never found is
   * a ball too fast for the frame rate, which is what a slower swing or a
   * higher frame rate would.
   */
  const spread = readOutbound([[streak(10)], [streak(60)], [streak(-40)]])
  assert(spread.refusal === 'disagreed', `three scattered headings refused as ${spread.refusal}`)
  const none = readOutbound([[], [], []])
  assert(none.refusal === 'no_streaks', `an empty pass refused as ${none.refusal}`)
  assert(none.frames === 0, `counted ${none.frames} from nothing`)
})

check('a lone false streak is left out of the heading and out of the count', () => {
  /*
   * A racket edge at 70° among four ball frames near 15°. It must not move the
   * angle and must not be counted toward the floor — the count is the caveat
   * that travels with the reading, so an outlier inflating it would overstate
   * how much was actually seen.
   *
   * This does NOT discriminate between the hypothesis search and a median-first
   * filter; canarying one against the other left it green. See `readOutbound`,
   * where that finding is recorded rather than the claim it disproved.
   */
  const r = readOutbound([[streak(14)], [streak(15)], [streak(70)], [streak(16)], [streak(15)]])
  assert(r.launchDeg !== undefined && Math.abs(r.launchDeg - 15) <= 1, `read ${r.launchDeg}°`)
  assert(r.frames === 4, `counted ${r.frames}, expected the four that agreed`)
})

check('a round thing in the frame is dropped before any of this', () => {
  // `readOutbound` filters on elongation itself rather than trusting its caller,
  // because the pass hands it whatever the frame produced.
  const r = readOutbound([
    [{ ...streak(14), elongation: 1.2 }],
    [{ ...streak(15), elongation: 1.1 }],
    [{ ...streak(16), elongation: 1.4 }],
  ])
  assert(r.refusal === 'no_streaks', `three discs were read as ${JSON.stringify(r)}`)
})

check('the tolerance is wide enough for one serve and tight enough for two objects', () => {
  // Stated as the constant rather than as 25, so moving it moves this.
  const justInside = readOutbound([
    [streak(0)],
    [streak(HEADING_TOLERANCE_DEG - 1)],
    [streak(HEADING_TOLERANCE_DEG - 2)],
  ])
  assert(justInside.launchDeg !== undefined, 'headings inside the tolerance were split apart')
  const justOutside = readOutbound([
    [streak(0)],
    [streak(HEADING_TOLERANCE_DEG + 1)],
    [streak(2 * HEADING_TOLERANCE_DEG + 2)],
  ])
  assert(justOutside.launchDeg === undefined, 'three mutually disagreeing headings were averaged')
})

check('nothing here is stated in miles per hour', () => {
  /*
   * The round's other explicit rule, as a check rather than a comment. A speed
   * needs a distance, a distance needs a scale, and the only scale this app has
   * is a body height measured at the baseline — on a ball travelling away from
   * the camera into a plane nothing calibrated. `serves.ts` refuses court lines
   * for this reason at a much easier distance.
   */
  const r = readOutbound([[streak(20)], [streak(21)], [streak(19)]])
  const keys = Object.keys(r).join(' ')
  assert(!/speed|mph|kmh|velocity/i.test(keys), `the reading carries a speed: ${keys}`)
})

/* -------------------------------------- and the word it is allowed to use */

check('an outbound refusal is not a word another refusal already owns', () => {
  /*
   * FOUND BY A BUNDLE PROBE, NOT BY READING. Round 49 grepped the built entry
   * chunk for this module's string literals — to confirm a detector with no
   * caller costs the critical path nothing — and `too_few_frames` came back
   * present. It was not this module's: `triage.ts` has owned that reason since
   * long before, meaning "the clip had too few swing samples". This one meant
   * "too few streaks agreed", which is a different subject entirely.
   *
   * Two enums with one value are indistinguishable the moment they meet — in a
   * log, a share card, a map from reason to sentence — and nothing about the
   * types stops it, because they are separate unions that never touch. It is
   * constraint 4's "never reuse a word the app owns", in the machine-readable
   * half of the app rather than in the copy.
   *
   * Read off `REJECTIONS` rather than restated, so a reason added there and
   * duplicated here goes red.
   */
  const mine: string[] = ['too_few_streaks', 'no_streaks', 'disagreed']
  const theirs = new Set<string>(REJECTIONS as readonly string[])
  const clash = mine.filter((m) => theirs.has(m))
  assert(clash.length === 0, `these refusals already mean something else: ${clash.join(', ')}`)
  // And the check has to be able to see the other list at all, or it passes by
  // measuring nothing — the failure mode of every text-matched gate here.
  assert(theirs.size > 3, `only ${theirs.size} triage reasons found to compare against`)
  note(`${mine.length} outbound refusals against ${theirs.size} triage reasons, no overlap`)
})

report()
