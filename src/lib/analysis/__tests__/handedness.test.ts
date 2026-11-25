/**
 * The same serve, hit with the other hand, read the same way.
 *
 * THE GAP THIS COVERS. The engine has two completely separate paths through a
 * serve depending on which arm holds the racket — `sided()` picks the landmarks,
 * `detectHandedness` decides which side that is, every keyframe after the toss
 * is found on the racket arm's own series, and `trunkCoilReading` recovers the
 * sign of the coil from the direction the shoulders sweep rather than from the
 * racket side. About half of that code has never been run against a left-handed
 * serve by anything: the synthetic rig builds right-handers only (the racket
 * motion is written to `LM.rightWrist` outright) and `RECORDED` is empty.
 *
 * A left-hander is not a rare case. It is one player in ten, and the failure
 * mode is not a wrong number — it is the report describing the tossing arm as
 * the swing, which produces a serve with no racket drop in it and a refusal that
 * says "that does not look like a serve" to somebody who has just hit one.
 *
 * WHAT IS AND IS NOT PROVED. `mirror.ts` says this at length and it is worth
 * repeating where the assertions are: reflecting landmarks cannot say anything
 * about how MediaPipe behaves on a real left arm, and does not pretend to. It
 * says that everything downstream of the model is chirally symmetric. A
 * hard-coded landmark index, a coil sign taken from the racket side, a metric
 * that assumes the toss comes from the left — each of those fails here and
 * nothing else in this suite would catch any of them.
 *
 * TOLERANCE. Exact, not approximate, for everything but the two trunk readings.
 * A reflection is an exact operation on floating-point coordinates and the
 * engine's arithmetic is the same either way round, so a difference is a bug
 * rather than noise. The coil and the tilt are signed quantities read through
 * `Math.asin`/`atan2` and are compared as magnitudes with a small allowance, for
 * the reason the sign convention exists at all — see `trunkCoilReading`.
 */
import { detectServe } from '../phases'
import { measure } from '../metrics'
import { diagnose } from '../diagnose'
import { assessResilience, triage } from '../triage'
import { mirrorFrames } from '../mirror'
import { buildServe, CLEAN_SERVE, type ServeDials } from '../syntheticServe'
import { assert, check, heading, near, report } from './harness'

const FPS = 50
/** The rig builds in a space where image x and y already share a unit. */
const ASPECT = 1

/** A serve and its reflection, both read by the real engine. */
function bothHands(dials: Partial<ServeDials> = {}) {
  const right = buildServe({ ...CLEAN_SERVE, ...dials }, FPS)
  const left = mirrorFrames(right, ASPECT)
  return {
    right: { frames: right, skel: detectServe(right, FPS) },
    left: { frames: left, skel: detectServe(left, FPS) },
  }
}

heading('A left-handed serve, read as one')

const clean = bothHands()

check('the rig builds a right-hander, so there is something to reflect', () => {
  assert(
    clean.right.skel.racket === 'right',
    `the reference serve was read as ${clean.right.skel.racket}-handed`,
  )
})

check('the reflection is detected as left-handed, without being told', () => {
  // No `forceRacket` anywhere above: this is `detectHandedness` reading the
  // clip, which is what a real left-hander gets on their first analysis.
  assert(
    clean.left.skel.racket === 'left',
    `a reflected serve was read as ${clean.left.skel.racket}-handed`,
  )
})

check('and with the same confidence, since it is the same motion', () => {
  near(
    clean.left.skel.handednessConfidence,
    clean.right.skel.handednessConfidence,
    1e-9,
    'handedness confidence',
  )
})

check('the six keyframes land on the same frames', () => {
  const r = clean.right.skel.keys
  const l = clean.left.skel.keys
  for (const k of Object.keys(r) as (keyof typeof r)[]) {
    assert(r[k] === l[k], `keyframe ${k}: right ${r[k]}, left ${l[k]}`)
  }
})

check('the scale references are identical', () => {
  near(clean.left.skel.bodyHeight, clean.right.skel.bodyHeight, 1e-9, 'standing height')
  near(clean.left.skel.groundY, clean.right.skel.groundY, 1e-9, 'ground line')
  near(clean.left.skel.shoulderWidth, clean.right.skel.shoulderWidth, 1e-9, 'shoulder span')
})

check('every measurement comes out the same, to the last decimal', () => {
  // The whole measurement pass, both hands, compared metric by metric. Signed
  // trunk readings are compared as magnitudes — a reflection reverses the
  // rotational sense of the body, and `trunkCoilReading` recovers its sign from
  // that sense, so the coil of a mirrored serve is legitimately the negative of
  // the original while describing the same posture.
  const SIGNED = new Set(['hipShoulderSeparation', 'shoulderTilt', 'tossDrift', 'contactAhead'])

  const of = (side: 'left' | 'right') => {
    const { frames, skel } = clean[side]
    return new Map(
      measure(frames, skel, true).flatMap((f) => f.metrics.map((m) => [m.id, m.value] as const)),
    )
  }
  const r = of('right')
  const l = of('left')

  assert(r.size > 10, `only ${r.size} measurements came out of the reference serve`)
  assert(
    [...r.keys()].join() === [...l.keys()].join(),
    `the two hands produced different measurements:\n      right: ${[...r.keys()].join(', ')}\n      left:  ${[...l.keys()].join(', ')}`,
  )

  const off: string[] = []
  for (const [id, value] of r) {
    const mirrored = l.get(id)!
    const same = SIGNED.has(id)
      ? Math.abs(Math.abs(mirrored) - Math.abs(value)) < 0.5
      : Math.abs(mirrored - value) < 1e-6
    if (!same) off.push(`${id}: right ${value.toFixed(4)}, left ${mirrored.toFixed(4)}`)
  }
  assert(off.length === 0, `${off.length} measurements differ by hand:\n      ${off.join('\n      ')}`)
})

check('the same faults are found, and the same one is named first', () => {
  const verdict = (side: 'left' | 'right') => {
    const { frames, skel } = clean[side]
    const d = diagnose(frames, skel, {})
    return {
      t: triage(d, assessResilience(frames, skel)),
      detected: d.flaws.filter((f) => f.detected).map((f) => f.flaw).sort().join(','),
    }
  }
  const r = verdict('right')
  const l = verdict('left')
  assert(r.t.status === l.t.status, `status: right ${r.t.status}, left ${l.t.status}`)
  assert(
    r.detected === l.detected,
    `different faults found:\n      right: ${r.detected || '(none)'}\n      left:  ${l.detected || '(none)'}`,
  )
  assert(
    r.t.primary_flaw?.flaw === l.t.primary_flaw?.flaw,
    `named a different fault: right ${r.t.primary_flaw?.flaw}, left ${l.t.primary_flaw?.flaw}`,
  )
})

heading('And a faulty one, so the symmetry isn’t only true of a clean serve')

const faulty = bothHands({
  trophyKneeAngle: 166,
  dropBelowShoulder: 0.04,
  contactReach: 1.14,
  tossElbow: 138,
})

check('a club-level serve is read as left-handed too', () => {
  assert(
    faulty.left.skel.racket === 'left' && faulty.right.skel.racket === 'right',
    `read as ${faulty.right.skel.racket} / ${faulty.left.skel.racket}`,
  )
})

check('and lands on the same keyframes', () => {
  const r = faulty.right.skel.keys
  const l = faulty.left.skel.keys
  for (const k of Object.keys(r) as (keyof typeof r)[]) {
    assert(r[k] === l[k], `keyframe ${k}: right ${r[k]}, left ${l[k]}`)
  }
})

check('a left-hander is never told their serve isn’t a serve', () => {
  // `assertPlausible` measures the swing off the racket arm and rescues a clip
  // where the *other* arm swung. Reading the wrong arm on a left-hander is
  // exactly the state it exists to catch, so it must not fire on one that was
  // read correctly.
  let threw: string | undefined
  try {
    detectServe(faulty.left.frames, FPS)
  } catch (err) {
    threw = (err as Error).message
  }
  assert(threw === undefined, `a left-handed serve was refused: "${threw}"`)
})

report()
