/**
 * What every graded band stands on (D2.1).
 *
 * A band is graded only on one of two footings — published figures, or a
 * re-derivation on real serve motion with the fault it names dialled into the
 * rig — and a measurement with neither is shown as a reading, with no band.
 * The type makes `source` compulsory; this file checks what the type cannot:
 * that a motion-derived band really does hold the rig's fault outside it, and
 * that real serves really do read inside every graded band.
 */
import { runEngine } from '../../../dev/mocap/engine'
import { FUNDAMENTALS, METRICS, READINGS } from '../coaching'
import { diagnose } from '../diagnose'
import { FLAWS, type FlawId } from '../flaws'
import { CARD_SIGNAL, SIGNALS } from '../tiers'
import { measure } from '../metrics'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { REAL_SERVES } from './repeatability'
import { assert, check, heading, note, report } from './harness'

/** The fault each motion-derived band names, dialled into the rig, and the side of the band it lands on. */
const MOTION_FAULTS: Record<string, { dials: Partial<ServeDials>; side: 'low' | 'high'; sideView?: boolean }> = {
  tossArmHold: { dials: { tossArmHold: 0.2 }, side: 'low' },
  tossPathWobble: { dials: { tossWobble: 0.12 }, side: 'high' },
  // The coil is read from depth, so from a corner, where depth is read.
  hipShoulderSeparation: { dials: { cameraYaw: 30, shoulderYaw: 10 }, side: 'low', sideView: false },
  handUnderElbow: { dials: { dropBelowShoulder: -0.25 }, side: 'low' },
}

/**
 * Cited bands that real serves still fall outside of, and why. Each is a defect
 * in the measurement rather than the band, named with the roadmap item that
 * fixes it. The check below fails when one is fixed, so the entry goes with it.
 */
const KNOWN: Record<string, string> = {
  // Empty since D7.4 took the perspective out of the hand's height at contact,
  // which was the one entry here and flipped on its own.
}

const graded = (dials: Partial<ServeDials>, id: string, sideView: boolean) => {
  const frames = buildServe(dials, 50)
  return measure(frames, detectServe(frames, 50), sideView)
    .flatMap((f) => f.metrics)
    .find((m) => m.id === id)
}

heading('What every graded band stands on')

check('every graded band names its footing, and a motion-derived one names its fault', () => {
  for (const [id, copy] of Object.entries(METRICS)) {
    const footing = 'study' in copy.source ? copy.source.study : copy.source.motion
    assert(footing.trim().length > 20, `${id} says nothing about what its band stands on`)
    if ('study' in copy.source) {
      assert(/\b(19|20)\d\d\b/.test(copy.source.study), `${id} claims a study and names no year`)
    } else {
      assert(id in MOTION_FAULTS, `${id} is re-derived on real motion with no rig fault to hold outside it`)
    }
  }
  for (const id of Object.keys(MOTION_FAULTS)) {
    assert(id in METRICS && 'motion' in METRICS[id].source, `${id} has a rig fault here but is not a motion-derived band`)
  }
})

check('a measurement is graded or a reading, never both', () => {
  for (const id of Object.keys(READINGS)) assert(!(id in METRICS), `${id} is a reading and carries a band`)
  for (const [area, def] of Object.entries(FUNDAMENTALS)) {
    for (const id of def.metrics) assert(id in METRICS, `${area} grades ${id}, which has no band`)
    for (const id of def.readings ?? []) assert(id in READINGS, `${area} shows ${id} as a reading with no copy`)
  }
  const frames = buildServe({}, 50)
  const areas = measure(frames, detectServe(frames, 50), true)
  const shown = areas.flatMap((f) => (f.readings ?? []).map((r) => r.id))
  for (const id of Object.keys(READINGS)) assert(shown.includes(id), `${id} was not shown`)
  for (const m of areas.flatMap((f) => f.metrics)) assert(!(m.id in READINGS), `${m.id} was graded`)
})

check('a band re-derived on real motion holds the fault the rig dials outside it', () => {
  for (const [id, fault] of Object.entries(MOTION_FAULTS)) {
    const clean = graded({}, id, fault.sideView ?? true)
    const dialled = graded(fault.dials, id, fault.sideView ?? true)
    const [lo, hi] = METRICS[id].ideal
    assert(dialled !== undefined, `${id} was not read with its fault dialled`)
    const outside = fault.side === 'low' ? dialled!.value < lo : dialled!.value > hi
    note(`${id}: clean ${clean?.value.toFixed(2) ?? 'unread'}, dialled ${dialled!.value.toFixed(2)} against ${lo}–${hi}`)
    assert(outside, `${id} read ${dialled!.value.toFixed(2)} with its fault dialled, inside ${lo}–${hi}`)
    if (clean) assert(clean.value >= lo && clean.value <= hi, `${id} read the rig's clean serve outside its own band`)
  }
})

check('real serves read inside every graded band from the guide placement', () => {
  for (const fps of [30, 60]) {
    const out: Record<string, number> = {}
    const seen: Record<string, number> = {}
    for (const serve of REAL_SERVES) {
      const run = runEngine(filmMocap(serve, { fps }), fps)
      assert(run.ok, `a real serve was refused at ${fps} fps`)
      if (!run.ok) continue
      for (const m of run.run.fundamentals.flatMap((f) => f.metrics)) {
        seen[m.id] = (seen[m.id] ?? 0) + 1
        if (m.value < m.ideal[0] || m.value > m.ideal[1]) out[m.id] = (out[m.id] ?? 0) + 1
      }
    }
    note(`${fps} fps, out of band: ${Object.entries(out).map(([id, n]) => `${id} ${n}/${seen[id]}`).join(', ') || 'none'}`)
    for (const [id, n] of Object.entries(seen)) {
      // One in six is a real serve on the edge; two is a band calling a
      // competent server faulty.
      const wrong = (out[id] ?? 0) > Math.max(1, Math.floor(n / 6))
      if (id in KNOWN) assert(wrong, `${id} now holds on real serves: ${KNOWN[id].split(':')[0]} fixed it, so drop it from KNOWN`)
      else assert(!wrong, `${id} calls ${out[id]} of ${n} real serves out of band at ${fps} fps`)
    }
  }
})

/* ================================================= the diagnosis (L5.1) === */

heading('What every diagnosis band stands on (L5.1)')

/**
 * The fault each motion-derived signal names, dialled into the rig, the views
 * it is read from, and the flaw it feeds. Bath is filmed from the same views.
 */
const MOTION_SIGNALS: Record<string, { flaw: FlawId; dials: Partial<ServeDials>; bearings: number[]; yaw: number }> = {
  palm_to_sky_deg: { flaw: 'waiters_tray', dials: { palmToSky: 80, trophyArmLayOver: 1, trophyForearmDrop: 0.22 }, bearings: [90, 0, 180], yaw: 82 },
  spine_lean_deg: { flaw: 'posture_collapse', dials: { spineLean: 40 }, bearings: [0, 180], yaw: 8 },
  elbow_lift_ratio: { flaw: 'collapsed_elbow', dials: { dropBelowShoulder: 0.1, dropElbowLift: -1.5 }, bearings: [90, 0, 180], yaw: 82 },
}

check('every diagnosis signal names what its band stands on', () => {
  for (const [id, spec] of Object.entries(SIGNALS)) {
    const src = spec.source
    assert(src !== undefined, `${id} has no source`)
    if ('card' in src) {
      assert(CARD_SIGNAL[src.card] === id, `${id} claims ${src.card}'s band and is not paired with it`)
      const [lo, hi] = METRICS[src.card].ideal
      for (const tier of [3, 5, 7, 9] as const) {
        const [a, b] = spec.anchors[tier]
        assert(a === lo && b === hi, `${id} at rung ${tier} is not ${src.card}'s band`)
      }
    } else if ('study' in src) {
      assert(/\b(19|20)\d\d\b/.test(src.study), `${id} claims a study and names no year`)
    } else if ('motion' in src) {
      assert(id in MOTION_SIGNALS, `${id} is re-derived on real motion with no rig fault to hold outside it`)
    } else {
      const feeds = FLAWS.filter((f) => f.signal === id || f.sideOn === id)
      assert(feeds.length > 0 && feeds.every((f) => f.notNamed), `${id} is called unnamed and feeds a named fault`)
    }
  }
  // And every card pairing is a declared footing.
  for (const [card, signal] of Object.entries(CARD_SIGNAL)) {
    const src = SIGNALS[signal].source
    assert('card' in src && src.card === card, `${signal} reads ${card}'s number and does not say so`)
  }
})

check('a re-derived diagnosis band holds real serves in and the rig fault out', () => {
  for (const [id, sig] of Object.entries(MOTION_SIGNALS)) {
    const club = SIGNALS[id].anchors[5]
    const reads: number[] = []
    for (const fps of [30, 60]) {
      for (const bearing of sig.bearings) {
        for (const serve of REAL_SERVES) {
          const frames = filmMocap(serve, { fps, bearing })
          const skel = detectServe(frames, fps)
          const at9 = diagnose(frames, skel, { tier: 9 }).flaws.find((f) => f.flaw === sig.flaw)
          assert(!at9?.detected, `${id}: a Bath serve was named ${sig.flaw} at the strictest rung (${fps} fps, bearing ${bearing})`)
          const v = diagnose(frames, skel, { tier: 5 }).signals[id]
          if (Number.isFinite(v)) reads.push(v)
        }
      }
    }
    assert(reads.length >= REAL_SERVES.length, `${id} was read on too few Bath takes`)
    const outside = reads.filter((v) => v < club[0] || v > club[1])
    assert(outside.length === 0, `${id}: Bath read ${outside.join(', ')} outside the club band ${club.join(' to ')}`)
    const rig = (dials: Partial<ServeDials>, tier: number) => {
      const frames = buildServe({ ...dials, cameraYaw: sig.yaw }, 50)
      return diagnose(frames, detectServe(frames, 50), { tier }).flaws.find((f) => f.flaw === sig.flaw)
    }
    const fault = rig(sig.dials, 3)
    note(`${id}: Bath ${Math.min(...reads).toFixed(3)} to ${Math.max(...reads).toFixed(3)} against ${club.join(' to ')}; rig fault ${fault?.value}`)
    assert(fault?.detected === true, `${id}: the rig's ${sig.flaw} is not named at the most lenient rung`)
    assert(!rig({}, 9)?.detected, `${id}: the rig's clean serve is named at the strictest rung`)
  }
})

report()
