/**
 * Evidence on the frame (D4.6): every fault's still is rendered through the
 * same `keyframeOverlay` the analysis captures stills with, and either carries
 * the measurement or is listed with why one frame cannot.
 */
import { ballInFrame, keyframeOverlay } from '../analyze'
import { readContact } from '../contact'
import { diagnose } from '../diagnose'
import type { FlawId } from '../flaws'
import { measure } from '../metrics'
import { buildPhases, detectServe } from '../phases'
import { STILL_EVIDENCE } from '../stillEvidence'
import { buildServe, type ServeDials } from '../syntheticServe'
import type { PhaseId } from '../types'
import { ANNOTATIONS, ghostFor } from '../../pose/skeleton'
import { placeLine } from '../../tossPlaceCopy'
import { tossedBall } from './tossedBall'
import { assert, check, heading, note, report } from './harness'

const FPS = 50

/** What a canvas was asked to draw: the words and the number of strokes. */
function recorder() {
  const texts: string[] = []
  let strokes = 0
  const noop = () => {}
  const ctx = new Proxy(
    {
      fillText: (t: string) => texts.push(String(t)),
      measureText: (t: string) => ({ width: String(t).length * 7 }),
      stroke: () => {
        strokes++
      },
    } as Record<string, unknown>,
    { get: (target, key) => (key in target ? target[key as string] : noop), set: () => true },
  )
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, strokes: () => strokes }
}

/** A serve dialled with a fault, measured, and its stills drawn as the analysis draws them. */
function still(dials: Partial<ServeDials>, phase: PhaseId, opts: { ball?: boolean; rolled?: boolean } = {}) {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  const ball = opts.ball ? tossedBall(frames, skel, skel.times.contact + 0.02) : undefined
  // As the pipeline does: the ball followed to the racket is read at contact.
  const contact = ball ? readContact(frames, skel, ball) : undefined
  const fundamentals = measure(frames, skel, true, { ball, contact })
  const diagnosis = diagnose(frames, skel, { ball, aspect: 1 })
  const phases = buildPhases(frames, skel.keys, skel.times)
  const draw = keyframeOverlay({
    frames,
    ball,
    phases,
    aspect: 1,
    racket: skel.racket,
    bodyHeight: skel.bodyHeight,
    bands: {},
    evidence: {
      metrics: fundamentals.flatMap((f) => f.metrics),
      scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
      rolled: Boolean(opts.rolled),
      tossPlacement: diagnosis.tossPlacement,
    },
  })
  const rec = recorder()
  draw(rec.ctx, phases.findIndex((p) => p.id === phase), { w: 480, h: 640 })
  return { texts: rec.texts, strokes: rec.strokes(), diagnosis }
}

/** The fault dialled into the rig for each still that has something to show. */
const DIALS: Partial<Record<FlawId, Partial<ServeDials>>> = {
  low_contact: { contactReach: 1.0 },
  toss_height: {},
  collapsed_elbow: { dropElbowLift: -0.1 },
}

heading('Evidence on the frame')

check('every fault either shows its measurement on its still or says why one frame can’t', () => {
  for (const [flaw, evidence] of Object.entries(STILL_EVIDENCE) as [FlawId, (typeof STILL_EVIDENCE)[FlawId]][]) {
    if ('none' in evidence) {
      assert(evidence.none.length > 20, `${flaw} has no picture and no reason`)
      continue
    }
    const dials = DIALS[flaw]
    assert(dials !== undefined, `${flaw} shows ${evidence.shows} and nothing here dials it`)
    if (!dials) continue
    if (evidence.shows === 'target') {
      const { texts } = still(dials, evidence.phase)
      assert(texts.includes('Aim for'), `${flaw}'s ${evidence.phase} still carries no target`)
    } else if (evidence.shows === 'angle') {
      const { texts } = still(dials, evidence.phase)
      const label = ANNOTATIONS[evidence.phase]?.label
      assert(label !== undefined && texts.includes(label), `${flaw}'s ${evidence.phase} still carries no arc`)
    } else {
      const without = still(dials, evidence.phase).strokes
      const withBall = still(dials, evidence.phase, { ball: true }).strokes
      note(`${flaw}: ${without} strokes without the ball, ${withBall} with its flight`)
      assert(withBall > without, `${flaw}'s ${evidence.phase} still draws no flight`)
    }
  }
})

check('a contact inside its band carries no target, and a low one does', () => {
  assert(!still({}, 'contact').texts.includes('Aim for'), 'a clean contact was given a target to aim for')
  assert(still({ contactReach: 1.0 }, 'contact').texts.includes('Aim for'), 'a low contact was given none')
})

check('a low contact keeps its target when the ball was tracked, measured at the ball (L4.8)', () => {
  // With the ball followed to the racket the card swaps the hand's height for
  // the ball's, and the target used to vanish with the hand's row.
  const dials = { contactReach: 1.0 }
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  const ball = tossedBall(frames, skel, skel.times.contact + 0.02)
  const metrics = measure(frames, skel, true, { ball, contact: readContact(frames, skel, ball) }).flatMap((f) => f.metrics)
  assert(metrics.some((m) => m.id === 'ballContactHeight'), 'the ball wasn’t read at contact')
  assert(!metrics.some((m) => m.id === 'contactHeight'), "the hand's row stayed beside the ball's")
  const { texts } = still(dials, 'contact', { ball: true })
  assert(texts.includes('Aim for'), 'a low contact with a tracked ball carries no target')
  const t = frames[skel.keys.contact].t
  const at = ballInFrame(ball, t, 1)!
  const ghost = ghostFor({
    phase: 'contact',
    frame: frames[skel.keys.contact],
    metrics,
    racket: skel.racket,
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    ball: at,
  })
  assert(ghost !== undefined, 'no ghost from the ball')
  note(`measured at the ball (${at.x.toFixed(3)}, ${at.y.toFixed(3)}), band ${ghost!.label}`)
  assert(ghost!.from.x === at.x && ghost!.from.y === at.y, 'the ghost was measured from the hand, not the ball')
  const row = metrics.find((m) => m.id === 'ballContactHeight')!
  assert(ghost!.label === row.target, "the ghost wears a label other than the ball row's target")
})

check('the toss still says where the toss peaked, in the toss map\'s words', () => {
  const { texts, diagnosis } = still({}, 'toss', { ball: true })
  const p = diagnosis.tossPlacement
  assert(p?.ahead !== undefined, 'the rig serve had no toss placement from the side')
  const label = placeLine('ahead', p!.ahead!)
  note(`toss still reads "${label}"`)
  assert(texts.includes('Toss peak') && texts.includes(label), 'the toss still carries no placement')
  assert(!still({}, 'contact', { ball: true }).texts.includes('Toss peak'), 'the placement was drawn on another still')
  assert(!still({}, 'toss', { ball: true, rolled: true }).texts.includes('Toss peak'), 'a levelled clip was given a vertical line')
})

report()
