/**
 * The target figure, and the one rule it lives or dies by.
 *
 * `targetShape.ts` draws a body at a number. The number is printed on the card
 * beside it, and the whole value of the picture rests on the two being the same
 * claim — a player who reads "aim for an athletic load", looks at a leg drawn
 * bent to some other depth, and eventually notices, has learned that the app's
 * pictures are decoration. So every figure is measured back through the ENGINE'S
 * OWN functions, not through a second copy of the trigonometry written in here,
 * and has to return the value it was built from.
 *
 * Four things are pinned:
 *
 *   - every drawn figure re-measures to its own value, swept across each
 *     measurement's whole printed axis rather than at one convenient angle,
 *   - the figure at the band's midpoint carries the exact phrase the card
 *     prints as the target, through `targetOf` — the same tie `ghostFor` makes,
 *   - the drawing moves monotonically with the number, so two figures side by
 *     side are a comparison rather than two pictures that happen to differ, and
 *   - a measurement with no shape gets no shape, and no value that is not a
 *     number ever produces one.
 */
import { readoutOf, targetOf } from '../anatomy'
import { METRICS } from '../coaching'
import { DRAWN, boundsOf, figureOf, pathOf, pointsIn, remeasure, viewOf } from '../targetShape'
import { assert, check, heading, near, note, report } from './harness'

/** The axis each measurement is printed against, walked in even steps. */
function sweep(id: string, steps = 21): number[] {
  const range = METRICS[id]?.range
  if (!range) throw new Error(`no coaching entry for "${id}", so there is no axis to sweep`)
  const [lo, hi] = range
  return Array.from({ length: steps }, (_, i) => lo + ((hi - lo) * i) / (steps - 1))
}

heading('The figure measures back to the number under it')

check('every drawn measurement re-measures to its own value across its whole axis', () => {
  /*
   * The ONE RULE, as arithmetic, for all eight at once.
   *
   * Swept rather than spot-checked because the failure this catches is a
   * convention error, and a convention error is invisible at the value somebody
   * happened to pick while writing the builder. `kneeBend` is stored as
   * `180 - jointAngle`; a figure built as though 50 meant fifty degrees at the
   * knee draws a squat as a nearly straight leg, and at exactly 90 the two
   * conventions agree and the bug hides.
   */
  for (const id of DRAWN) {
    for (const value of sweep(id)) {
      const fig = figureOf(id, value)
      assert(fig !== undefined, `${id} at ${value} produced no figure at all`)
      const back = remeasure(id, fig!)
      near(back, value, 1e-9, `${id} drawn at ${value.toFixed(2)} and measured back`)
    }
    const lo = sweep(id)[0]
    const hi = sweep(id).slice(-1)[0]
    note(`  ${id}: ${sweep(id).length} points across [${lo}, ${hi}] all within 1e-9`)
  }
})

check('the target figure carries the exact phrase the card prints', () => {
  /*
   * The tie `ghostFor` makes, made again here for the same reason.
   *
   * `targetOf` reads the printed target off the MIDDLE of the band, so the
   * midpoint is the one placement whose readout is guaranteed to be the words
   * already on the card. Drawing the figure at the near edge instead would ask
   * for less than the caption says and could land a whole rung away from its own
   * label — which is the same half-band error `Ghost.reachY` exists to keep off
   * the gap line.
   */
  for (const id of DRAWN) {
    const ideal = METRICS[id]?.ideal
    assert(ideal !== undefined, `${id} has no band, so there is nothing to aim the figure at`)
    const mid = (ideal![0] + ideal![1]) / 2
    const fig = figureOf(id, mid)
    assert(fig !== undefined, `${id} had no figure at the middle of its own band`)
    const drawn = remeasure(id, fig!)
    assert(
      readoutOf(id, drawn) === targetOf(id, ideal!),
      `${id}: the figure measures "${readoutOf(id, drawn)}" and the card says "${targetOf(id, ideal!)}"`,
    )
    note(`  ${id}: band [${ideal![0]}, ${ideal![1]}] → "${targetOf(id, ideal!)}"`)
  }
})

check('the number survives being written out as markup', () => {
  /*
   * The gap between "the figure is right" and "the picture is right", and it is
   * a real one — it opened, shipped and was found by measuring the live DOM.
   *
   * `figureOf` had always produced exact geometry and the check above had always
   * passed. What reached the browser went through a rounding step, and that step
   * was written when coordinates were scaled into a 168-unit box, where two
   * decimal places is far under a device pixel. When the box became the figure's
   * own bounding box — units of about half a standing height — the same two
   * places became a quantisation of roughly a quarter of the drawing. A 23°
   * shoulder tilt came out of the markup at 20°, under a caption that still said
   * 23. Nothing threw. Nothing looked obviously wrong. The picture and its
   * caption had simply stopped being the same claim, which is the one thing this
   * whole feature is not allowed to do.
   *
   * So the loop is closed here rather than in a browser: build it, write it out,
   * parse it back, re-measure. The rounding lives in `targetShape.ts` for
   * exactly this reason.
   */
  for (const id of DRAWN) {
    for (const value of sweep(id, 9)) {
      const fig = figureOf(id, value)!
      const back = pointsIn(pathOf(fig.lines))
      const flat = fig.lines.flat()
      assert(
        back.length === flat.length,
        `${id}: wrote ${flat.length} points and read back ${back.length}`,
      )
      for (let i = 0; i < flat.length; i++) {
        near(back[i].x, flat[i].x, Math.abs(flat[i].x) * 1e-5 + 1e-9, `${id} point ${i} x`)
        near(back[i].y, flat[i].y, Math.abs(flat[i].y) * 1e-5 + 1e-9, `${id} point ${i} y`)
      }

      /*
       * And the thing the rounding actually threatens: the DIRECTION of every
       * drawn line.
       *
       * Compared line by line against the figure's own, rather than reassembled
       * into each metric's reading, and deliberately so — this needs no
       * knowledge of which shape means what, so it covers all eight identically
       * and cannot quietly stop covering one when a convention changes. Every
       * measurement in this file is an angle between drawn lines or a position
       * along one, so a rounding that leaves every direction within a hundredth
       * of a degree cannot move any reading further than that either.
       *
       * A hundredth of a degree is the threshold because the failure was three
       * whole degrees. This is not a tight tolerance being defended; it is two
       * and a half orders of magnitude of clearance.
       */
      let seg = 0
      for (const line of fig.lines) {
        for (let k = 1; k < line.length; k++) {
          const want = (Math.atan2(line[k].y - line[k - 1].y, line[k].x - line[k - 1].x) * 180) / Math.PI
          const got =
            (Math.atan2(back[seg + k].y - back[seg + k - 1].y, back[seg + k].x - back[seg + k - 1].x) *
              180) /
            Math.PI
          near(got, want, 0.01, `${id} at ${value.toFixed(2)}: the direction of a drawn line`)
        }
        seg += line.length
      }
    }
  }
  note('  every drawn line re-measures within a hundredth of a degree of its own caption')
})

heading('The picture changes when — and only as much as — the number does')

check('a bigger number draws a visibly different shape, in one direction', () => {
  /*
   * What stops the pair of figures being two pictures that merely differ.
   *
   * A player compares them by eye and reads the DIFFERENCE as the correction.
   * That only works if the drawing moves one way as the number rises: a builder
   * that folded past a limit and came back would draw a 70° knee bend and a 110°
   * one identically, and the diagram would quietly say "you are already there"
   * to somebody who is not. Measured on the drawn geometry rather than on the
   * probe, because the drawing is what the player looks at.
   */
  for (const id of DRAWN) {
    const values = sweep(id, 15)
    // One scalar per figure, read off the drawn joints — the marks the player's
    // eye actually lands on — and chosen by how many there are, which is what
    // distinguishes the three constructions. Three joints is a limb, and how far
    // apart its two ends sit is how open the joint is. Two is a line across the
    // body, and what moves is one end against the other. One is a mark at a
    // height, and the height is the whole measurement.
    const openness = (v: number) => {
      const j = figureOf(id, v)!.joints
      if (j.length === 3) return Math.hypot(j[0].x - j[2].x, j[0].y - j[2].y)
      if (j.length === 2) return j[1].y - j[0].y
      return j[0].y
    }

    let travel = 0
    let direction = 0
    for (let i = 1; i < values.length; i++) {
      const step = openness(values[i]) - openness(values[i - 1])
      assert(Math.abs(step) > 1e-9, `${id}: the figure stopped moving between ${values[i - 1]} and ${values[i]}`)
      const sign = Math.sign(step)
      assert(
        direction === 0 || sign === direction,
        `${id}: the figure turned back on itself at ${values[i].toFixed(2)}, so two different ` +
          'numbers draw the same shape',
      )
      direction = sign
      travel += Math.abs(step)
    }
    assert(travel > 0.02, `${id}: the figure barely moves across its whole axis (${travel.toFixed(5)})`)
    note(`  ${id}: moves ${travel.toFixed(3)} standing heights across the axis, one way throughout`)
  }
})

check('both figures are fitted in one box, so the difference is to scale', () => {
  /*
   * The bug that makes an honest pair of figures lie.
   *
   * Fitted separately, contact at 1.0 and at 1.6 standing heights are each
   * drawn to fill their own box and come out looking identical — the
   * difference the player is meant to read is exactly what the independent
   * scaling removes. `boundsOf` takes
   * every figure at once for that reason, and this asserts the box it returns
   * genuinely contains all of them rather than the last one it saw.
   */
  const small = figureOf('contactHeight', 1.0)!
  const large = figureOf('contactHeight', 1.6)!
  const box = boundsOf([small, large])
  const own = boundsOf([large])
  assert(
    box.max.y >= own.max.y - 1e-12 && box.min.y <= own.min.y + 1e-12,
    'the shared box doesn’t contain the larger figure',
  )
  const alone = boundsOf([small])
  assert(
    box.max.y - box.min.y > alone.max.y - alone.min.y + 1e-6,
    'the shared box is no taller than the small figure alone — the two are being fitted separately',
  )
  note(
    `  1.0 spans ${(alone.max.y - alone.min.y).toFixed(3)}, 1.6 spans ` +
      `${(own.max.y - own.min.y).toFixed(3)}, shared box ${(box.max.y - box.min.y).toFixed(3)}`,
  )
})

heading('What is refused')

check('a measurement with no shape gets no shape', () => {
  /*
   * Absent is the ordinary answer. Roughly twenty measurements reach the report
   * and eight are drawable; the rest are timings and shares of a window, and a
   * pictogram invented for one of those would be the app illustrating something
   * it has not measured. The coil is shown ungraded, with no target to draw.
   */
  for (const id of ['dropToContact', 'loadRatio', 'tossPathWobble', 'syncAtRelease', 'hipShoulderSeparation', 'nonsense']) {
    assert(figureOf(id, 1) === undefined, `${id} was given a figure it has no construction for`)
    assert(viewOf(id) === undefined, `${id} was given a viewpoint caption with no figure under it`)
    assert(Number.isNaN(remeasure(id, figureOf('kneeBend', 40)!)), `${id} re-measured something`)
  }
  note(`  ${DRAWN.length} measurements drawn, everything else refused`)
})

check('a value that isn’t a number never becomes a picture', () => {
  /*
   * `metrics.ts` drops a measurement it could not take rather than flooring it
   * — the fabrication its `build()` docstring is written about. A figure
   * invented at a defaulted value would reintroduce exactly that, in the most
   * persuasive medium the app has.
   */
  for (const bad of [NaN, Infinity, -Infinity]) {
    for (const id of DRAWN) {
      assert(figureOf(id, bad) === undefined, `${id} drew a figure at ${bad}`)
    }
  }
})

check('every drawable measurement states the view it is drawn from', () => {
  /*
   * A diagram whose viewpoint is not stated invites the reader to assume it is
   * the camera's. The caption is not decoration; it is what stops the figure
   * being read as a photograph.
   */
  for (const id of DRAWN) {
    const v = viewOf(id)
    assert(v !== undefined, `${id} is drawn with no viewpoint stated`)
    assert(v!.view.length > 12, `${id}'s viewpoint caption is too terse to be one: "${v!.view}"`)
    assert(v!.ends[0] !== v!.ends[1], `${id} names both ends of the figure the same thing`)
  }
})

report()
