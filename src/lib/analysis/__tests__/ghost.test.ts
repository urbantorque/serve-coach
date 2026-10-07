/**
 * The target pose drawn over the player, and the four ways it could lie.
 *
 * This overlay is the most persuasive thing the app draws. A sentence saying
 * "struck below full reach" is hedged, argued with and forgotten; a crisp
 * dashed outline over somebody's own body is believed on sight and remembered.
 * So every claim it makes has to be a claim the engine actually measured, and
 * this file exists because for one round none of them were checked at all.
 *
 * The reason they were not is worth recording, because it was structural rather
 * than an oversight: `scripts/run-tests.mjs` discovers exactly one directory,
 * `src/lib/analysis/__tests__`, and the ghost lives in `src/lib/pose`. The
 * author of it could not put a test anywhere the runner would find, and said so
 * in a handoff. Nothing stops a test in THIS directory importing across, which
 * is what this does — and `drawing.test.ts` next door already proves the pattern
 * by exercising `drawSkeleton`.
 *
 * Four things are pinned here, one per way the picture could disagree with the
 * report underneath it:
 *
 *   - the ghost's own readout is character-identical to its printed caption,
 *   - the gap line is the player's real shortfall and not half a band more,
 *   - nothing is drawn below the hips, because a rigid translation puts the
 *     feet above the court and that is a claim about leg drive, and
 *   - the trophy keyframe is refused for the reason that is true rather than
 *     for the one that was written down.
 */
import { readoutOf } from '../anatomy'
import { LM } from '../geometry'
import { measure } from '../metrics'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { ghostFor } from '../../pose/skeleton'
import type { Frame, Metric } from '../types'
import { assert, check, heading, near, note, report } from './harness'

const FPS = 50

/** One serve, measured exactly as the report measures it. */
function serve(dials: Partial<ServeDials> = {}) {
  const frames = buildServe({ noise: 0, ...dials }, FPS)
  const skel = detectServe(frames, FPS)
  const fundamentals = measure(frames, skel, true)
  const metrics: Metric[] = fundamentals.flatMap((f) => f.metrics)
  return {
    frames,
    skel,
    metrics,
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    frameAt: (i: number): Frame => frames[i],
  }
}

const ghostAtContact = (dials: Partial<ServeDials> = {}) => {
  const s = serve(dials)
  return {
    ...s,
    metric: s.metrics.find((m) => m.id === 'contactHeight'),
    ghost: ghostFor({
      phase: 'contact',
      frame: s.frameAt(s.skel.keys.contact),
      metrics: s.metrics,
      racket: s.skel.racket,
      scale: s.scale,
    }),
  }
}

/**
 * A serve struck low enough to be outside the band, so there is a ghost at all.
 *
 * Found by sweeping rather than asserted at one dial, because `contactReach` is
 * a dial on the rig and `contactHeight` is what the engine measures from the
 * pixels — the two are related and are not the same number, and hard-coding a
 * dial that happens to land outside the band today is how this test starts
 * silently passing on a serve that needs no correction.
 */
function lowServe() {
  for (const contactReach of [1.0, 1.04, 1.06, 1.08, 1.1, 1.12]) {
    const g = ghostAtContact({ contactReach })
    if (g.ghost && g.metric) return { ...g, contactReach }
  }
  throw new Error('no dial in the sweep produced a contact height outside its band')
}

heading('The ghost says only what the card says')

check('the ghost re-measures to the exact words on its own caption', () => {
  /*
   * The ONE RULE, as arithmetic.
   *
   * The ghost is placed at the midpoint of the target band because `targetOf`
   * reads the printed phrase off that midpoint. So measuring the ghost's own
   * anchor back through the identical formula the metric came from —
   * `(groundY - y) / bodyHeight` — and putting the answer through `readoutOf`
   * has to return the string already on the plate. A ghost whose caption and
   * position disagree is worse than no ghost: the player reads one claim and
   * looks at another, and rightly stops believing both.
   */
  const { ghost, metric, scale } = lowServe()
  const g = ghost!
  const remeasured = (scale.groundY - g.image[g.anchor].y) / scale.bodyHeight
  const [lo, hi] = metric!.ideal

  near(remeasured, (lo + hi) / 2, 1e-9, 'the ghost anchor re-measured against the band midpoint')
  assert(
    readoutOf('contactHeight', remeasured) === g.label,
    `the ghost measures "${readoutOf('contactHeight', remeasured)}" and its plate says "${g.label}"`,
  )
  assert(g.label === metric!.target, 'the plate is not the card’s own target phrase')
  note(
    `  measured ${metric!.value.toFixed(4)} against [${lo}, ${hi}] · ` +
      `ghost re-measures ${remeasured.toFixed(6)} · plate "${g.label}"`,
  )
})

check('the gap line is the miss, not the miss plus half a band', () => {
  /*
   * The one mark on this overlay that carries a magnitude.
   *
   * The body stands at the band's midpoint, which the check above requires. The
   * gap line is a different claim — "you were here, you needed to be there" —
   * and what the player needed was to reach the band, not its middle. Drawing
   * the line to the dashed hand overstated the correction by up to half a band
   * however small the real miss was: on the serve below the shortfall is a few
   * centimetres and the line drawn was several times it.
   *
   * So `reachY` is the near edge, and this asserts it is the near edge and not
   * the midpoint — including the direction, since a player over the band has to
   * come down to `hi` rather than up to `lo`.
   */
  const { ghost, metric, scale } = lowServe()
  const g = ghost!
  const [lo, hi] = metric!.ideal

  const reach = (scale.groundY - g.reachY) / scale.bodyHeight
  const target = (scale.groundY - g.image[g.anchor].y) / scale.bodyHeight

  near(reach, metric!.value < lo ? lo : hi, 1e-9, 'the gap line ends at the near edge of the band')
  const shortfall = Math.abs(reach - metric!.value)
  const toMidpoint = Math.abs(target - metric!.value)
  assert(
    shortfall <= toMidpoint + 1e-9,
    `the gap line draws ${shortfall.toFixed(4)} where the ghost body sits ${toMidpoint.toFixed(4)} away`,
  )

  /*
   * And the case that matters most, which is the near miss.
   *
   * The overstatement is a fixed half-band, so it is worst where the fault is
   * smallest — the player who was a few centimetres short is the one the old
   * drawing exaggerated by the largest multiple. Swept upwards towards the band
   * so the ratio is on the record rather than argued about.
   */
  let worst = 0
  for (const contactReach of [1.0, 1.06, 1.1, 1.11, 1.115]) {
    const g2 = ghostAtContact({ contactReach })
    if (!g2.ghost || !g2.metric) continue
    const near2 = (g2.scale.groundY - g2.ghost.reachY) / g2.scale.bodyHeight
    const mid2 =
      (g2.scale.groundY - g2.ghost.image[g2.ghost.anchor].y) / g2.scale.bodyHeight
    const miss = Math.abs(near2 - g2.metric.value)
    const drew = Math.abs(mid2 - g2.metric.value)
    worst = Math.max(worst, drew / Math.max(1e-9, miss))
    note(
      `  reach dial ${contactReach}: measured ${g2.metric.value.toFixed(4)}, miss ${miss.toFixed(4)}, ` +
        `midpoint would have drawn ${drew.toFixed(4)} (${(drew / Math.max(1e-9, miss)).toFixed(1)}x)`,
    )
  }
  assert(
    worst > 2,
    `the sweep never found a near miss — the largest overstatement was ${worst.toFixed(1)}x, ` +
      'so this check is no longer exercising the failure it was written for',
  )
})

check('the gap line starts where the hand was measured, not where it is now', () => {
  /*
   * What lets `PosePlayer` stop pinning the ghost to one exact sample index.
   *
   * `Ghost.from` is the anchor landmark on the keyframe the measurement came
   * from. Carried on the ghost, the line is the gap on the card whichever frame
   * is on screen; read off the live frame, it would run from a hand that was
   * never measured the moment the player scrubbed one sample past contact.
   */
  const { ghost, skel, frameAt } = lowServe()
  const g = ghost!
  const measured = frameAt(skel.keys.contact).image[g.anchor]
  near(g.from.x, measured.x, 1e-12, 'the recorded x of the measured hand')
  near(g.from.y, measured.y, 1e-12, 'the recorded y of the measured hand')

  // And it is the raw tracked point, not the ghost's own translated copy —
  // otherwise the gap line would have zero length by construction.
  assert(
    Math.abs(g.from.y - g.image[g.anchor].y) > 1e-6,
    'the gap line starts and ends in the same place',
  )
})

check('a player already inside the band gets no ghost', () => {
  /*
   * `FundamentalCard` withholds "Aim for" on exactly this test. A ghost sitting
   * on top of somebody’s own body is a correction with no content, and a dashed
   * second skeleton over a serve that was fine is the app inventing a fault.
   */
  const g = ghostAtContact({ contactReach: 1.4 })
  const m = g.metric!
  assert(
    m.value < m.ideal[0] || m.value > m.ideal[1] || g.ghost === undefined,
    `a contact height of ${m.value.toFixed(3)} inside [${m.ideal}] still drew a target`,
  )
  note(`  contact height ${m.value.toFixed(3)} against [${m.ideal}] · ghost ${g.ghost ? 'drawn' : 'withheld'}`)
})

heading('What the ghost refuses to draw, and why')

check('nothing is drawn below the hips', () => {
  /*
   * The ghost is a rigid translation along image y, so every joint angle is
   * identical and the only way its hand reaches higher is if its feet leave the
   * court. Drawn feet in the air are a claim, and the claim is "jump higher" —
   * a cause the report scores on its own card, with its own band, beside this
   * picture. Measured: the implied `bodyExtension` runs 0.21 to 0.30 against
   * this serve's real 0.086 and a top rung, 'Big jump', at 0.16.
   *
   * The landmarks are all still in `image` — a translated pose is a pose — so
   * what is asserted is that the ghost's ankles are NOT where a drawn leg would
   * put them, by checking the one place the decision lives: which bones the
   * drawing walks. That is `GHOST_BONES`, which is private, so this asserts the
   * consequence instead: the ankle in the ghost's own frame has been lifted off
   * the court, which is exactly the claim nothing may draw.
   */
  const { ghost, scale, skel, frameAt } = lowServe()
  const g = ghost!
  const ankle = skel.racket === 'left' ? LM.leftAnkle : LM.rightAnkle
  const tracked = frameAt(skel.keys.contact).image[ankle]

  const trackedAbove = (scale.groundY - tracked.y) / scale.bodyHeight
  const ghostAbove = (scale.groundY - g.image[ankle].y) / scale.bodyHeight
  assert(
    ghostAbove > trackedAbove,
    'the translation did not lift the ghost off the court — this test no longer proves anything',
  )
  note(
    `  tracked ankle ${trackedAbove.toFixed(3)} above the court, ghost ankle ${ghostAbove.toFixed(3)} — ` +
      `which is why the legs are not in GHOST_BONES`,
  )
})

check('the trophy keyframe is refused, and the knee argument for it was backwards', () => {
  /*
   * The reversal this file exists to pin.
   *
   * The trophy ghost was withdrawn on a stated measurement: a 70° knee bend
   * projecting as a 168.9° leg at 82° of yaw and a dead-straight 180.0° at 90°,
   * because "front-to-back is the axis a side-on camera cannot see". Both
   * figures reproduce exactly and the sentence attached to them is the inverse
   * of the truth. `syntheticServe.ts` bends the knee purely in world z, and on
   * this rig world z is the axis ACROSS the player — the one that collapses
   * side-on. A knee bent the way a knee bends, in world x, survives side-on
   * almost perfectly.
   *
   * The refusal itself is correct and stands, for a reason nothing about
   * cameras: `kneeBend` is a world 3-D angle and this ghost has only image
   * coordinates, and the one motion it can make — sliding a body along image y
   * — changes no angle anywhere.
   *
   * Both halves are asserted, so neither the refusal nor the corrected reason
   * can drift back.
   */
  const s = serve({ trophyKneeAngle: 110 })
  assert(
    ghostFor({
      phase: 'trophy',
      frame: s.frameAt(s.skel.keys.trophy),
      metrics: s.metrics,
      racket: s.skel.racket,
      scale: s.scale,
    }) === undefined,
    'a knee-bend target was drawn, and there is no image-space construction for one',
  )

  // Which axis the rig actually bends. If this ever moves, the paragraph in
  // skeleton.ts about it is stale and so is this test. The world landmarks now
  // come in the camera's frame, as MediaPipe's do, so at the rig's 82° the
  // court's sideways bend reads as camera depth with a sliver of x (8° worth)
  // rather than as depth alone.
  const f = s.frameAt(s.skel.keys.trophy)
  const hip = f.world[LM.rightHip]
  const knee = f.world[LM.rightKnee]
  assert(
    Math.abs(knee.x - hip.x) < 0.2 * Math.abs(knee.z - hip.z) && Math.abs(knee.z - hip.z) > 0.05,
    `the rig's thigh now moves dx ${(knee.x - hip.x).toFixed(4)} dz ${(knee.z - hip.z).toFixed(4)} — ` +
      'it used to bend purely in world z, which is what made the old projection figures a rig artefact',
  )
  note(
    `  trophy ghost withheld · rig thigh dx ${(knee.x - hip.x).toFixed(4)} dz ${(knee.z - hip.z).toFixed(4)} ` +
      '(world z is across the player, the axis that collapses side-on)',
  )
})

check('a soft or absent measurement draws nothing at all', () => {
  /*
   * The gate the whole feature turns on. `confidence.ts` softens every height
   * ratio at once when the feet are cropped and standing height falls back to a
   * torso estimate — which is precisely what `groundY` and `bodyHeight` are, so
   * a low-confidence ghost would be a crisp line drawn from two guessed
   * numbers. The card beside it already says "approximate"; the picture must
   * not say otherwise.
   */
  const s = lowServe()
  const soften = (patch: Partial<Metric>) =>
    ghostFor({
      phase: 'contact',
      frame: s.frameAt(s.skel.keys.contact),
      metrics: s.metrics.map((m) => (m.id === 'contactHeight' ? { ...m, ...patch } : m)),
      racket: s.skel.racket,
      scale: s.scale,
    })

  assert(soften({ confidence: 0.4 }) === undefined, 'a soft measurement still drew a crisp target')
  assert(
    soften({ softness: 'approximate' }) === undefined,
    'a measurement flagged soft still drew a crisp target',
  )
  assert(
    ghostFor({
      phase: 'contact',
      frame: s.frameAt(s.skel.keys.contact),
      metrics: s.metrics.filter((m) => m.id !== 'contactHeight'),
      racket: s.skel.racket,
      scale: s.scale,
    }) === undefined,
    'an absent measurement was defaulted into a target',
  )
  // And a rolled clip, which has no point-level unlevel to place a ghost with.
  assert(
    ghostFor({
      phase: 'contact',
      frame: s.frameAt(s.skel.keys.contact),
      metrics: s.metrics,
      racket: s.skel.racket,
      scale: s.scale,
      rolled: true,
    }) === undefined,
    'a roll-corrected clip drew a ghost off a groundY from the other space',
  )
})

report()
