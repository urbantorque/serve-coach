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
import { DEMO_FPS, demoFrames, faultDemo, type DemoServe } from '../faultDemo'
import { DEMOS, DEMO_MIN_DIFFERENCE, hasDemo } from '../faultDemoDials'
import { diagnose } from '../analysis/diagnose'
import { detectServe } from '../analysis/phases'
import { CLEAN_SERVE } from '../analysis/syntheticServe'
import { FLAWS, type FlawId } from '../analysis/flaws'
import { LM } from '../analysis/geometry'
import type { Frame } from '../analysis/types'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

/** A club player, where the flaw suite dials these same faults. */
const TIER = 5

/** The rig's standing height in image units, so a difference reads as a share of the body. */
const RIG_BODY_HEIGHT = 0.54

const shown = Object.keys(DEMOS) as FlawId[]

function finding(flaw: FlawId, frames: Frame[] | undefined, racket: 'left' | 'right') {
  assert(frames !== undefined, `${flaw}: the rig serve could not be built`)
  const skel = detectServe(frames!, DEMO_FPS, racket)
  return diagnose(frames!, skel, { tier: TIER }).flaws.find((f) => f.flaw === flaw)
}

heading('Each fault is shown on a serve the engine names with it')

for (const racket of ['right', 'left'] as const) {
  for (const flaw of shown) {
    check(`${flaw}, ${racket}-handed: named on the fault, not on the fix`, () => {
      const fault = finding(flaw, demoFrames(DEMOS[flaw]!.dials, racket), racket)
      assert(fault?.detected === true, `${flaw}: the engine does not name it on the demo serve`)
      const clean = finding(flaw, demoFrames({ ...CLEAN_SERVE }, racket), racket)
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

/** The landmark that moved most, once both bodies stand on the same hips. */
function widestGap(a: Frame, b: Frame): number {
  const hip = (f: Frame) => ({
    x: (f.image[LM.leftHip].x + f.image[LM.rightHip].x) / 2,
    y: (f.image[LM.leftHip].y + f.image[LM.rightHip].y) / 2,
  })
  const ha = hip(a)
  const hb = hip(b)
  let most = 0
  for (let i = 0; i < a.image.length; i++) {
    const dx = a.image[i].x - ha.x - (b.image[i].x - hb.x)
    const dy = a.image[i].y - ha.y - (b.image[i].y - hb.y)
    most = Math.max(most, Math.hypot(dx, dy))
  }
  return most / RIG_BODY_HEIGHT
}

for (const flaw of shown) {
  check(`${flaw}: the two bodies differ at the moment it is read`, () => {
    const demo = faultDemo(flaw, 'right')
    assert(demo !== undefined, `${flaw}: no demo`)
    const at = demo!.fault.phases.find((p) => p.id === demo!.moment)!
    const fromContact = demo!.fault.frames[at.frame].t - demo!.fault.contactT
    const gap = widestGap(demo!.fault.frames[at.frame], nearest(demo!.fix, fromContact))
    note(`${flaw} at ${demo!.moment}: ${gap.toFixed(3)} body heights apart`)
    assert(gap >= DEMO_MIN_DIFFERENCE, `${flaw}: only ${gap.toFixed(3)} apart, under ${DEMO_MIN_DIFFERENCE}`)
  })
}

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

check('the ball, the pancake and the faults with no shape are not offered', () => {
  for (const flaw of ['toss_height', 'pancake_contact', 'arming_the_ball', 'early_shoulder_rotation', 'toss_drift', 'shallow_drop'] as const) {
    assert(!hasDemo(flaw), `${flaw} is offered a demonstration it cannot show`)
  }
  assert(!hasDemo(undefined), 'a report with no named fault offered a demo')
  note(`demonstrated: ${FLAWS.filter((f) => hasDemo(f.flaw)).map((f) => f.flaw).join(', ')}`)
})

report()
