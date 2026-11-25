/**
 * The ball's fall from its top, from the clock (L5.6): ½·g·t² from the apex
 * to contact, which needs no scale and has no perspective in it. Held to the
 * rig's ball at every toss placement and from five places to stand, and to the
 * two things that cost every height read off the picture its trust — a camera
 * that drifts, and a standing height guessed from the torso.
 */
import { measure } from '../metrics'
import { detectServe } from '../phases'
import { readContact } from '../contact'
import { buildServe, rigBall, type RigToss, type ServeDials } from '../syntheticServe'
import { LM } from '../geometry'
import { SOFT_MEASUREMENT } from '../confidence'
import { assessQuality } from '../analyze'
import { ballFallMetres } from '../../vision/ballTrack'
import type { Frame } from '../types'
import { assert, check, heading, note, report } from './harness'

const FPS = 50

function fall(toss: RigToss, dials: Partial<ServeDials> = {}, mutate?: (f: Frame[]) => Frame[]) {
  const built = buildServe(dials, FPS)
  const frames = mutate ? mutate(built) : built
  const skel = detectServe(frames, FPS)
  // The ball's flight from the camera held still: the rig finds the toss's
  // release from the picture, which a drifting camera would move, and the
  // question here is what the engine makes of one flight under each camera.
  const still = { ...dials, cameraZoom: 0, cameraTilt: 0 }
  const ball = rigBall(buildServe(still, FPS), toss, still)
  const contact = readContact(frames, skel, ball)
  const quality = assessQuality(frames, skel, FPS)
  const rows = measure(frames, skel, quality.view === 'side', {
    ball,
    contact,
    confidence: { frames, skel, swingSamples: quality.swingSamples, view: quality.view, ballConfidence: ball.confidence },
  }).flatMap((f) => f.metrics)
  const row = (id: string) => rows.find((m) => m.id === id)
  return { fall: row('contactBelowPeak'), height: row('tossPeakHeight'), ball, contactT: contact.ball ?? frames[skel.keys.contact].t }
}

heading("The ball's fall, from the clock")

check('the fall is ½·g·t² from the apex to contact, the same from every place to stand', () => {
  const rows: string[] = []
  for (const toss of [
    { forward: 0, sideways: 0 },
    { forward: 0.3, sideways: 0 },
    { forward: 0.6, sideways: 0.2 },
    { forward: 0.3, sideways: -0.2 },
  ]) {
    const falls = [82, 60, 45, 30, 8].map((cameraYaw) => fall(toss, { cameraYaw }))
    for (const f of falls) {
      assert(f.fall !== undefined, 'no fall read')
      const expected = ballFallMetres(f.ball, f.contactT)
      assert(Math.abs(f.fall!.value - expected) < 1e-9, 'the reading isn’t ½·g·t²')
    }
    const values = falls.map((f) => f.fall!.value)
    const spread = Math.max(...values) - Math.min(...values)
    rows.push(`${toss.forward}/${toss.sideways}: ${values[0].toFixed(2)} m, spread ${(spread * 100).toFixed(1)} cm`)
    assert(spread < 0.02, `five cameras disagree by ${(spread * 100).toFixed(1)} cm on one fall`)
  }
  note(rows.join(' · '))
})

check('the card prints the fall in metres, and a model fall reads as the studies’ own', () => {
  const f = fall({ forward: 0.3, sideways: 0 })
  note(`${f.fall!.display} — ${f.fall!.readout}`)
  assert(/^\d\.\d\d m$/.test(f.fall!.display), `the card prints "${f.fall!.display}", not metres`)
  // The rig drops its ball 0.56 m, the bottom of the published 0.56–0.94 m.
  assert(f.fall!.value > 0.5 && f.fall!.value <= 1, 'the model fall is outside the band')
  assert(f.fall!.readout === 'Struck as the ball falls', `a model fall reads "${f.fall!.readout}"`)
})

// The rig zooms the body and not its ball, so the moment the two meet moves
// under the zoom; the value is held across cameras by the check above, and
// this one is the price: what a moved camera costs the fall, which is nothing.
check('a camera that drifts hedges the picture heights and not the fall', () => {
  const toss = { forward: 0.3, sideways: 0 }
  const still = fall(toss)
  const zoomed = fall(toss, { cameraZoom: 0.2 })
  note(`fall ${still.fall!.value.toFixed(3)} → ${zoomed.fall!.value.toFixed(3)} m; toss peak confidence ${still.height!.confidence.toFixed(2)} → ${zoomed.height!.confidence.toFixed(2)}`)
  assert(Math.abs(zoomed.fall!.value - ballFallMetres(zoomed.ball, zoomed.contactT)) < 1e-9, 'the reading under the zoom isn’t ½·g·t²')
  assert(zoomed.fall!.confidence >= SOFT_MEASUREMENT, 'the fall was hedged for a camera it doesn’t depend on')
  assert(zoomed.height!.confidence < SOFT_MEASUREMENT, 'the picture height wasn’t hedged under the zoom')
})

check('feet out of frame guess the standing height, and the fall needs none', () => {
  const cropFeet = (frames: Frame[]) =>
    frames.map((f) => ({
      ...f,
      image: f.image.map((l, i) =>
        ([LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe] as number[]).includes(i) ? { ...l, visibility: 0.05 } : l,
      ),
    }))
  const toss = { forward: 0.3, sideways: 0 }
  const whole = fall(toss)
  const cropped = fall(toss, {}, cropFeet)
  assert(cropped.fall !== undefined && Math.abs(cropped.fall.value - whole.fall!.value) < 0.02, 'cropping the feet moved the fall')
  assert(cropped.fall!.confidence >= SOFT_MEASUREMENT, 'the fall paid for a standing height it never used')
})

report()
