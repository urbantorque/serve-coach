/**
 * The engine on real serve motion.
 *
 * Six serves from the Bath motion-capture set (`fixtures/bath-serves.json`,
 * CC BY 4.0 — attribution in the file and in `src/dev/mocap/bath.ts`), two of
 * each outcome, filmed by `filmMocap`'s virtual phone and read by the same pure
 * steps `runAnalysis` takes. No pose model runs, so nothing here is about
 * MediaPipe: a failure is the engine's rules, bands or camera model meeting a
 * body that a real person moved.
 *
 * Three kinds of check, kept apart:
 * - the data and the camera are what they claim to be;
 * - the engine's timing on real motion, against the 180 Hz capture;
 * - KNOWN — disagreements with reality this suite pins rather than hides. Each
 *   is a defect found by this data (ANALYSIS-REVIEW.md §9) and asserted as it
 *   stands, so the change that fixes it goes red here and has to say so. A fixed
 *   one becomes a check that real motion passes.
 *
 * The full 40-serve picture, every placement and rate, is `npm run bench:mocap`.
 */
import fixture from './fixtures/bath-serves.json'
import { runEngine } from '../../../dev/mocap/engine'
import {
  GUIDE_PHONE,
  filmMocap,
  mocapTruth,
  pointAt,
  swingCompleted,
  unpackMocap,
  type MocapPoint,
  type MocapServe,
  type PackedMocapServe,
} from '../mocapServe'
import { assert, check, heading, note, report, within } from './harness'

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
const SERVES: MocapServe[] = (fixture.serves as PackedMocapServe[]).map((p) => unpackMocap(p, fromBase64))

const distance = (s: MocapServe, a: MocapPoint, b: MocapPoint, f: number) => {
  const p = pointAt(s, a, f)
  const q = pointAt(s, b, f)
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
}
const spread = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}
const fmt = (xs: number[]) => xs.map((x) => x.toFixed(0)).join(' / ')

/** Every serve through the engine from one phone, with its truth beside it. */
function readAll(phone: Partial<typeof GUIDE_PHONE>) {
  const cam = { ...GUIDE_PHONE, ...phone }
  return SERVES.map((serve) => {
    const result = runEngine(filmMocap(serve, cam), cam.fps)
    if (!result.ok) throw new Error(`${serve.id} refused from bearing ${cam.bearing}: ${result.refusal}`)
    return { serve, truth: mocapTruth(serve), run: result.run, lead: cam.lead }
  })
}

heading('Real serve motion: the data')

check('the fixture holds six finished serves, two of each outcome', () => {
  assert(SERVES.length === 6, `${SERVES.length} serves`)
  for (const o of ['in', 'out', 'net'] as const) {
    assert(SERVES.filter((s) => s.outcome === o).length === 2, `two ${o}`)
  }
  for (const s of SERVES) assert(swingCompleted(s), `${s.id} finishes its swing`)
})

check('bones keep their length through the serve — the joint centres hold together', () => {
  // Joint centres come from markers on skin, which slides; a bone that grew or
  // shrank by more than a couple of centimetres would mean a marker read as the
  // wrong joint, and everything downstream would be measuring that.
  const bones: [MocapPoint, MocapPoint][] = [
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightWrist'],
    ['leftElbow', 'leftWrist'],
    ['rightHip', 'rightKnee'],
    ['rightKnee', 'rightAnkle'],
    ['leftKnee', 'leftAnkle'],
  ]
  for (const s of SERVES) {
    for (const [a, b] of bones) {
      const lengths = Array.from({ length: s.count }, (_, f) => distance(s, a, b, f))
      const sd = spread(lengths)
      assert(sd < 0.025, `${s.id} ${a}→${b} varies by ${(sd * 100).toFixed(1)} cm`)
    }
  }
})

check('the racket drops behind the back while the hand stays level with the shoulder', () => {
  // A fact about the data, checked against the literature rather than against
  // the engine: at the racket's low point a real serve is at maximum external
  // rotation, the upper arm at about shoulder height and the forearm laid back
  // (Fleisig 2003: 101° abduction, 104° elbow flexion). So the racket head is far
  // below the shoulder and the hand is not. The engine's drop band asks for the
  // opposite — see the KNOWN check below.
  const hand: number[] = []
  const head: number[] = []
  for (const s of SERVES) {
    const t = mocapTruth(s)
    const f = Math.round(t.racketBottom * s.rate)
    const shoulder = pointAt(s, 'rightShoulder', f).z
    hand.push((shoulder - pointAt(s, 'rightWrist', f).z) * 100)
    head.push((shoulder - pointAt(s, 'racket', f).z) * 100)
  }
  note(`hand below shoulder at the racket's low point, cm: ${fmt(hand)}`)
  note(`racket head below shoulder, cm: ${fmt(head)}`)
  for (const v of hand) within(v, -20, 10, 'hand against shoulder (cm)')
  for (const v of head) within(v, 25, 60, 'racket head below shoulder (cm)')
})

check('the wrist peaks before the racket head reaches its highest', () => {
  const lags = SERVES.map((s) => {
    const t = mocapTruth(s)
    return (t.racketTop - t.wristTop) * 1000
  })
  note(`wrist top to racket top, ms: ${fmt(lags)}`)
  for (const v of lags) within(v, 5, 45, 'racket top after wrist top (ms)')
})

heading('Real serve motion: the virtual phone')

check("a point at lens height straight ahead lands in the middle of the picture", () => {
  // A one-frame serve whose every point sits on the phone's own axis.
  const n = 24
  const xyz = new Float32Array(2 * n * 3)
  for (let i = 0; i < xyz.length; i += 3) {
    xyz[i] = 0
    xyz[i + 1] = 0
    xyz[i + 2] = GUIDE_PHONE.height
  }
  const still: MocapServe = { id: 'still', rate: 180, count: 2, xyz, hand: 'right' }
  const [frame] = filmMocap(still, { lead: 0 })
  within(frame.image[0].x, GUIDE_PHONE.aspect / 2 - 1e-6, GUIDE_PHONE.aspect / 2 + 1e-6, 'x')
  within(frame.image[0].y, 0.5 - 1e-6, 0.5 + 1e-6, 'y')
})

check("the guide's phone sees the net direction across the picture", () => {
  // `FilmingGuide.tsx` stands the phone on the baseline's line, so the racket
  // leaving contact towards the net travels across the frame, not into it.
  for (const s of SERVES) {
    const frames = filmMocap(s, { fps: 60 })
    const t = mocapTruth(s)
    const i = Math.round((t.racketTop + GUIDE_PHONE.lead) * 60)
    const before = frames[i].image[16]
    const after = frames[Math.min(frames.length - 1, i + 6)].image[16]
    const across = Math.abs(after.x - before.x)
    assert(across > 0.05, `${s.id}: racket wrist moved ${across.toFixed(3)} across the frame after contact`)
  }
})

heading('Real serve motion: timing against the capture')

for (const fps of [30, 60, 120]) {
  check(`at ${fps} fps the keyframes land where the 180 Hz capture puts them`, () => {
    const runs = readAll({ fps })
    const contact = runs.map(({ run, truth, lead }) => (run.skel.times.contact - lead - truth.wristTop) * 1000)
    const trophy = runs.map(({ run, truth, lead }) => (run.frames[run.skel.keys.trophy].t - lead - truth.kneeBottom) * 1000)
    const drop = runs.map(({ run, truth, lead }) => (run.skel.times.drop - lead - truth.dropPosture) * 1000)
    note(`contact ${fmt(contact)} ms · trophy ${fmt(trophy)} ms · drop ${fmt(drop)} ms`)
    for (const r of runs) assert(r.run.skel.racket === 'right', `${r.serve.id} read as ${r.run.skel.racket}-handed`)
    // Measured on all 40 finished serves (`npm run bench:mocap`): contact within
    // −9…+18 ms at 30 fps and −11…+1 at 120; trophy −41…+3; drop −8…+20.
    // Bounds sit a few milliseconds outside those, so a regression trips them
    // and an honest frame-rate wobble does not.
    const contactBound = fps >= 120 ? 15 : 25
    for (const v of contact) within(v, -contactBound, contactBound, 'contact error (ms)')
    for (const v of trophy) within(v, -50, 15, 'trophy error (ms)')
    for (const v of drop) within(v, -20, 30, 'drop error (ms)')
  })
}

heading('Real serve motion: KNOWN disagreements (ANALYSIS-REVIEW.md §9)')

check('a real racket drop is not called shallow, from any placement', () => {
  // Was pinned as KNOWN: all 40 Bath serves were told their drop was shallow,
  // because the bands wanted the hand down the back. Re-anchored to the hand
  // near the shoulder (`drop_depth_ratio`, `dropDepth`), so real drops pass —
  // and with room to spare, since a phone at an odd angle moves this reading.
  for (const bearing of [90, 180, 270, 135, 225]) {
    const runs = readAll({ bearing })
    for (const { serve, run } of runs) {
      const found = run.diagnosis.flaws.find((f) => f.flaw === 'shallow_drop')
      assert(found?.detected !== true, `${serve.id} from bearing ${bearing}: shallow_drop named`)
      const card = run.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'dropDepth')
      assert(card?.status === 'great' || card?.status === 'good', `${serve.id} drop card is ${card?.status}`)
    }
  }
})

check('the camera\'s angle to the court is read from the swing, from every placement', () => {
  /*
   * The second half of D7.2. The stance reading cannot tell the two sides of
   * a real server's shoulders apart, so it read the rear-oblique corners as
   * 23° and 63° — one end-on, one side-on — when both stand at 45°. The swing's
   * direction carries its own sign. Ten degrees either way is the bound: wider
   * than the 7.8° p90 the 24-placement sweep measured with depth noise, and
   * well inside the 25° that separates side-on from a corner.
   */
  const truth: [number, number][] = [
    [90, 90],
    [270, 90],
    [180, 0],
    [135, 45],
    [225, 45],
  ]
  for (const [bearing, angle] of truth) {
    const runs = readAll({ bearing })
    const read = runs.map((r) => r.run.resilience.spatial)
    note(`bearing ${bearing}: ${fmt(read.map((s) => s.court_yaw_deg))}° to the court, true ${angle}°`)
    for (const s of read) {
      assert(s.court_yaw_from === 'swing', `bearing ${bearing}: read from the ${s.court_yaw_from}, not the swing`)
      within(s.court_yaw_deg, angle - 10, angle + 10, `court angle from bearing ${bearing}`)
    }
  }
})

check("the guide's own placement is filed as side-on, and the back fence is not", () => {
  // Was pinned as KNOWN. A textbook stance points the shoulder line at the
  // net, so from the baseline, where `FilmingGuide.tsx` puts the phone, both
  // shoulders are spread across the picture and the shoulder-span reading comes
  // out near square. That reading used to be taken as the camera's angle to the
  // court, which filed the guide's own clip as angled and kept `contactAhead` —
  // the reading the guide says only a side view can see — off the card, while
  // the back fence was filed as side-on. The view is now read against the
  // court (`Spatial.court_yaw_deg`), and the rig stands the way these serves do.
  const guide = readAll({ bearing: 90 })
  const back = readAll({ bearing: 180, distance: 6 })
  note(`court angle from the guide's placement: ${fmt(guide.map((r) => r.run.resilience.spatial.court_yaw_deg))}°`)
  note(`court angle from the back fence: ${fmt(back.map((r) => r.run.resilience.spatial.court_yaw_deg))}°`)
  for (const r of guide) assert(r.run.quality.view === 'side', `${r.serve.id} guide view is ${r.run.quality.view}`)
  for (const r of back) assert(r.run.quality.view !== 'side', `${r.serve.id} back-fence view is side`)
  for (const r of guide) {
    const ahead = r.run.fundamentals.flatMap((f) => f.metrics).some((m) => m.id === 'contactAhead')
    assert(ahead, `${r.serve.id}: contactAhead is missing from the guide's placement`)
  }
})

check('KNOWN: the toss keyframe lands well after the tossing hand peaks', () => {
  // `phases.ts` takes the toss as the tossing wrist highest *above its own
  // shoulder*. The trunk keeps tilting after the hand peaks, so that comes
  // 90–210 ms later — after the ball has gone, though the keyframe's caption
  // says "ball released". Goes red when the toss is read from the hand itself.
  const runs = readAll({ fps: 60 })
  const late = runs.map(({ run, truth, lead }) => (run.frames[run.skel.keys.toss].t - lead - truth.tossTop) * 1000)
  note(`toss keyframe after the hand's peak, ms: ${fmt(late)}`)
  for (const v of late) assert(v > 60, `toss keyframe only ${v.toFixed(0)} ms after the hand's peak`)
})

report()
