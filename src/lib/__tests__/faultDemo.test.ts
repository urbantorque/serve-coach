/**
 * The fault demonstrations, held to what the engine itself would say and to
 * what a player could actually see.
 *
 * A picture labelled with a fault is a claim about that fault, so each one is
 * diagnosed exactly as a filmed serve would be: the fault body must be named
 * with the fault, and the fix must not. And a picture must show something: two
 * bodies that look the same under "this fault" and "the fix" are measured here
 * and fail, rather than reaching a report.
 */
import { DEMO_FPS, demoRig, faultDemo, type DemoServe, type FaultDemo } from '../faultDemo'
import { DEMOS, DEMO_MIN_DIFFERENCE, NO_DEMO, PART_NAME, VIEW_YAW, hasDemo, yawOf, type DemoPart } from '../faultDemoDials'
import { ballOn, highlightOf } from '../demoDraw'
import { diagnose } from '../analysis/diagnose'
import { buildPhases, detectServe } from '../analysis/phases'
import { CLEAN_SERVE, type ServeDials } from '../analysis/syntheticServe'
import { everyProgression } from '../analysis/progressions'
import { FLAWS, type FlawId } from '../analysis/flaws'
import { LM, sided } from '../analysis/geometry'
import type { Frame } from '../analysis/types'
import type { BallFlight } from '../vision/ballTrack'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

/** A club player, where the flaw suite dials these same faults. */
const TIER = 5

/** The rig's standing height in image units, so a difference reads as a share of the body. */
const RIG_BODY_HEIGHT = 0.54

const shown = Object.keys(DEMOS) as FlawId[]

/** The engine's verdict on a demo serve, read with the ball the picture draws. */
function finding(flaw: FlawId, rig: { frames: Frame[]; ball?: BallFlight } | undefined, racket: 'left' | 'right') {
  assert(rig !== undefined, `${flaw}: the rig serve could not be built`)
  const skel = detectServe(rig!.frames, DEMO_FPS, racket)
  return diagnose(rig!.frames, skel, { tier: TIER, ball: rig!.ball }).flaws.find((f) => f.flaw === flaw)
}

heading('Each fault is shown on a serve the engine names with it')

for (const racket of ['right', 'left'] as const) {
  for (const flaw of shown) {
    check(`${flaw}, ${racket}-handed: named on the fault, not on the fix`, () => {
      const spec = DEMOS[flaw]!
      // Under the camera the picture is drawn from (C1.2).
      const cameraYaw = yawOf(spec)
      const fault = finding(flaw, demoRig({ ...spec.dials, cameraYaw }, racket, spec.apex), racket)
      assert(fault?.detected === true, `${flaw}: the engine does not name it on the demo serve`)
      const clean = finding(flaw, demoRig({ ...CLEAN_SERVE, cameraYaw }, racket), racket)
      assert(clean?.detected !== true, `${flaw}: the fix is named with the fault too`)
    })
  }
}

heading('Each one shows a difference somebody can see')

/** The frame of a serve nearest a time measured from its contact. */
function nearest(s: DemoServe, fromContact: number): Frame {
  const want = s.contactT + fromContact
  return s.frames.reduce((a, b) => (Math.abs(b.t - want) < Math.abs(a.t - want) ? b : a))
}

type Pt = { x: number; y: number }

/**
 * Every point the picture draws on one instant of a serve, by name: the
 * landmarks, the racket head and the ball (L4.5) — a fault in the racket or
 * the toss is a difference in those, not in the body.
 */
function points(s: DemoServe, f: Frame): Map<string, Pt> {
  const out = new Map<string, Pt>()
  f.image.forEach((p, i) => out.set(String(i), p))
  if (f.racket) out.set('racketHead', f.racket.head)
  const ball = ballOn(s, f, 'right')
  if (ball) out.set('ball', ball)
  return out
}

/** Which named points belong to each part a demo can name, right-handed. */
const PART_POINTS: Record<Exclude<DemoPart, 'hips'>, string[]> = {
  racket: ['racketHead'],
  elbow: [String(sided('right').elbow)],
  tossingHand: [LM.leftWrist, LM.leftIndex, LM.leftPinky, LM.leftThumb].map(String),
  ball: ['ball'],
  trunk: [LM.nose, LM.leftShoulder, LM.rightShoulder].map(String),
}

/**
 * At the clean serve's own moment, both bodies on the same hips: how far each
 * drawn point moved, in body heights, widest first.
 */
function gapsAt(demo: FaultDemo): [string, number][] {
  const fixFrame = demo.fix.frames[demo.fix.phases.find((p) => p.id === demo.moment)!.frame]
  const faultFrame = nearest(demo.fault, fixFrame.t - demo.fix.contactT)
  const hip = (f: Frame) => ({
    x: (f.image[LM.leftHip].x + f.image[LM.rightHip].x) / 2,
    y: (f.image[LM.leftHip].y + f.image[LM.rightHip].y) / 2,
  })
  const ha = hip(faultFrame)
  const hb = hip(fixFrame)
  const a = points(demo.fault, faultFrame)
  const b = points(demo.fix, fixFrame)
  const rows: [string, number][] = []
  for (const [name, p] of a) {
    const q = b.get(name)
    if (q) rows.push([name, Math.hypot(p.x - ha.x - (q.x - hb.x), p.y - ha.y - (q.y - hb.y)) / RIG_BODY_HEIGHT])
  }
  return rows.sort((x, y) => y[1] - x[1])
}

/**
 * The hips' rise from the trophy to contact: the legs' fault is a travel, not
 * a pose, so no instant of it shows a tenth once both bodies stand on the same
 * hips. Read in picture height, which the fixed camera ties to the court —
 * not against the ankles, which leave the ground with the hips on a serve that
 * drives up. Difference between the two serves, in body heights.
 */
function hipTravelGap(demo: FaultDemo): number {
  const rise = (s: DemoServe) => {
    const at = (id: 'trophy' | 'contact') => s.frames[s.phases.find((p) => p.id === id)!.frame]
    const hipY = (f: Frame) => (f.image[LM.leftHip].y + f.image[LM.rightHip].y) / 2
    return hipY(at('trophy')) - hipY(at('contact'))
  }
  return Math.abs(rise(demo.fix) - rise(demo.fault)) / RIG_BODY_HEIGHT
}

for (const flaw of shown) {
  check(`${flaw}: the part it names is the widest difference, and at least a tenth`, () => {
    const demo = faultDemo(flaw, 'right')
    assert(demo !== undefined, `${flaw}: no demo`)
    if (demo!.part === 'hips') {
      const travel = hipTravelGap(demo!)
      note(`${flaw}: the hips rise ${travel.toFixed(3)} body heights less from the trophy to contact`)
      assert(travel >= DEMO_MIN_DIFFERENCE, `${flaw}: only ${travel.toFixed(3)}, under ${DEMO_MIN_DIFFERENCE}`)
      return
    }
    const rows = gapsAt(demo!)
    const own = Math.max(...rows.filter(([n]) => PART_POINTS[demo!.part as Exclude<DemoPart, 'hips'>].includes(n)).map(([, g]) => g))
    note(`${flaw} at ${demo!.moment}: ${PART_NAME[demo!.part]} ${own.toFixed(3)}; widest ${rows[0][0]} ${rows[0][1].toFixed(3)}`)
    assert(own >= DEMO_MIN_DIFFERENCE, `${flaw}: only ${own.toFixed(3)} apart, under ${DEMO_MIN_DIFFERENCE}`)
    assert(own >= rows[0][1] - 1e-9, `${flaw}: names ${PART_NAME[demo!.part]}, but ${rows[0][0]} moved more`)
  })
}

check('each demonstration paints what it names, and dashes the fix beside it', () => {
  for (const flaw of shown) {
    const demo = faultDemo(flaw, 'right')!
    const fixFrame = demo.fix.frames[demo.fix.phases.find((p) => p.id === demo.moment)!.frame]
    const faultFrame = nearest(demo.fault, fixFrame.t - demo.fix.contactT)
    const h = highlightOf(
      demo.part,
      'right',
      faultFrame,
      fixFrame,
      ballOn(demo.fault, faultFrame, 'right'),
      ballOn(demo.fix, fixFrame, 'right'),
    )
    const painted = (h.work?.length ?? 0) > 0 || h.workRacket === true || h.workBall === true
    assert(painted, `${flaw}: nothing painted for ${demo.part}`)
    assert(h.target.length > 0, `${flaw}: no dashed fix for ${demo.part}`)
  }
})

heading('The demonstration itself')

check('every demo builds, for either hand, with contact on both clocks', () => {
  for (const racket of ['right', 'left'] as const) {
    for (const flaw of shown) {
      const demo = faultDemo(flaw, racket)
      assert(demo !== undefined, `${flaw} ${racket}: no demo`)
      for (const side of [demo!.fault, demo!.fix]) {
        const contact = side.phases.find((p) => p.id === 'contact')
        assert(contact !== undefined, `${flaw} ${racket}: a serve with no contact`)
        const t = side.frames[contact!.frame].t
        assert(Math.abs(t - side.contactT) < 1e-9, `${flaw} ${racket}: contact frame and clock disagree`)
        assert(side.phases[0].frame === 0, `${flaw} ${racket}: the loop does not start at ready`)
      }
      assert(demo!.racket === racket, `${flaw}: built for the wrong hand`)
    }
  }
})

check('a left-hander sees the racket arm on their own side', () => {
  const up = (racket: 'left' | 'right') => {
    const { fault } = faultDemo('collapsed_elbow', racket)!
    const at = fault.frames[fault.phases.find((p) => p.id === 'contact')!.frame]
    return at.image[LM.rightWrist].y < at.image[LM.leftWrist].y ? 'right' : 'left'
  }
  assert(up('right') === 'right', 'right-hander: the right hand is not the one up at contact')
  assert(up('left') === 'left', 'left-hander: the left hand is not the one up at contact')
})

check('the pancake and the faults with no shape are not offered', () => {
  for (const flaw of ['pancake_contact' as FlawId, ...(Object.keys(NO_DEMO) as FlawId[])]) {
    assert(!hasDemo(flaw), `${flaw} is offered a demonstration it cannot show`)
  }
  assert(!hasDemo(undefined), 'a report with no named fault offered a demo')
  note(`demonstrated: ${FLAWS.filter((f) => hasDemo(f.flaw)).map((f) => f.flaw).join(', ')}`)
})

heading('Every drill is demonstrated, or measured to have nothing to show (C1.2)')

check("every ladder's fault has a demonstration, or a place in NO_DEMO", () => {
  const missing = everyProgression()
    .map(([flaw]) => flaw)
    .filter((flaw) => !hasDemo(flaw) && !NO_DEMO[flaw])
  assert(missing.length === 0, `ladders with no demonstration and no reason: ${missing.join(', ')}`)
  const shownLadders = everyProgression().filter(([flaw]) => hasDemo(flaw)).length
  note(`${shownLadders} of ${everyProgression().length} ladders demonstrated`)
})

/** The widest gap between a dialled serve and the clean one at any keyframe, under one camera, in body heights. */
function widestGap(dials: Partial<ServeDials>, cameraYaw: number): number {
  const build = (d: Partial<ServeDials>) => {
    const rig = demoRig({ ...d, cameraYaw }, 'right')!
    const skel = detectServe(rig.frames, DEMO_FPS, 'right')
    return { frames: rig.frames, phases: buildPhases(rig.frames, skel.keys), contactT: rig.frames[skel.keys.contact].t }
  }
  const fault = build(dials)
  const fix = build({ ...CLEAN_SERVE })
  let widest = 0
  for (const phase of fix.phases) {
    const demo = { moment: phase.id, fault, fix, racket: 'right', part: 'racket', view: 'side', fitBall: false } as FaultDemo
    widest = Math.max(widest, gapsAt(demo)[0][1])
  }
  return widest
}

for (const [flaw, entry] of Object.entries(NO_DEMO) as [FlawId, NonNullable<(typeof NO_DEMO)[FlawId]>][]) {
  check(`${flaw} has no shape from any camera: ${entry.why}`, () => {
    const views = { ...VIEW_YAW, corner: 45 }
    const gaps = Object.entries(views).map(([view, yaw]) => [view, widestGap(entry.dials, yaw)] as const)
    note(`${flaw}: ${gaps.map(([v, g]) => `${v} ${g.toFixed(3)}`).join(', ')}`)
    for (const [view, gap] of gaps) {
      assert(gap < DEMO_MIN_DIFFERENCE, `${flaw} shows ${gap.toFixed(3)} from ${view}: give it a demonstration`)
    }
  })
}

report()
