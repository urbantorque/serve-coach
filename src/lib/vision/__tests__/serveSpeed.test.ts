/**
 * Serve speed, off the ball (`vision/serveSpeed.ts`).
 *
 * The struck ball is launched from where a real racket was at impact — the six
 * Bath serves in `fixtures/bath-serves.json`, CC BY 4.0, the racket head's
 * position at its fastest — and filmed by virtual phones round the guide's
 * placement: four to six metres away, side-on give or take thirty-five
 * degrees, upright and on its side, at slow-motion frame rates. The ball flies
 * with drag and gravity towards a service box up to fifteen degrees either
 * side of straight; the toss that came before it drifts and drags too, and is
 * sampled at the rate the pose pass reads frames. Then the reading is held to
 * what it claims: the true launch speed inside the stated range.
 *
 * What this cannot prove is that the detector finds the ball in a real clip:
 * every candidate here is handed over as a centre, not found in pixels. The
 * check from rendered pixels through the real detector is N2.4's, still to
 * come. What it does prove is that when the ball is found, the number and its
 * range mean what they say.
 */
import fixture from '../../analysis/__tests__/fixtures/bath-serves.json'
import { mocapTruth, pointAt, unpackMocap, swingCompleted, type MocapServe, type PackedMocapServe } from '../../analysis/mocapServe'
import {
  BALL_DRAG,
  GRAVITY,
  MAX_SPREAD,
  measureServeSpeed,
  scaleAt,
  tossPath,
  type SpeedSetting,
  type StruckFrame,
  type StruckSample,
} from '../serveSpeed'
import { assert, check, heading, near, note, report } from '../../analysis/__tests__/harness'

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
const SERVES: MocapServe[] = (fixture.serves as PackedMocapServe[])
  .map((p) => unpackMocap(p, fromBase64))
  .filter(swingCompleted)

/* --------------------------------------------------------------- the world */

interface V {
  x: number
  y: number
  z: number
}
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const unit = (a: V) => scale(a, 1 / Math.hypot(a.x, a.y, a.z))

function seeded(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const gauss = () => {
    let t = 0
    for (let i = 0; i < 6; i++) t += next()
    return (t - 3) * Math.SQRT2
  }
  return { next, gauss }
}

/** Where a Bath serve's racket was at its fastest near the top — impact, as near as the capture has it. */
function impactOf(serve: MocapServe) {
  const top = Math.round(mocapTruth(serve).racketTop * serve.rate)
  const at = (f: number) => pointAt(serve, 'racket', Math.max(0, Math.min(serve.count - 1, f)))
  let best = top
  let bestV = 0
  for (let f = top - 30; f <= top + 5; f++) {
    const v = Math.hypot(...(['x', 'y', 'z'] as const).map((k) => at(f + 1)[k] - at(f - 1)[k]))
    if (v > bestV) {
      bestV = v
      best = f
    }
  }
  const l = pointAt(serve, 'leftAnkle', 0)
  const r = pointAt(serve, 'rightAnkle', 0)
  return {
    p0: at(best),
    /** The racket head after impact, for the decoy that travels beside the ball. */
    racket: (t: number) => at(best + Math.round(t * serve.rate)),
    feet: { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2, z: 0 },
    nose: pointAt(serve, 'nose', 0),
  }
}

interface Phone {
  bearing: number
  distance: number
  height: number
  /** The long side's focal length, in units of the long side. */
  focalLong: number
  aspect: number
  /** Where the lens's axis really meets the picture, off its middle. */
  pp: { x: number; y: number }
}

/** A pinhole phone aimed level at the server's feet, as `mocapServe.ts`'s is. */
function phoneAt(c: Phone, target: V) {
  const b = (c.bearing * Math.PI) / 180
  const toPhone = { x: Math.cos(b), y: Math.sin(b), z: 0 }
  const eye = { x: target.x + toPhone.x * c.distance, y: target.y + toPhone.y * c.distance, z: c.height }
  const forward = unit({ x: -toPhone.x, y: -toPhone.y, z: 0 })
  const right = unit(cross(forward, { x: 0, y: 0, z: 1 }))
  const down = { x: 0, y: 0, z: -1 }
  // Frame heights: the long side's focal length, over the long side in frame heights.
  const focal = c.focalLong * Math.max(c.aspect, 1)
  const project = (p: V) => {
    const r = sub(p, eye)
    const d = dot(r, forward)
    return { x: c.aspect / 2 + c.pp.x + (focal * dot(r, right)) / d, y: 0.5 + c.pp.y + (focal * dot(r, down)) / d }
  }
  const inFrame = (q: { x: number; y: number }) => q.x >= 0 && q.x <= c.aspect && q.y >= 0 && q.y <= 1
  /** Frame heights per metre at a point's distance — the ruler the toss should recover. */
  const ruler = (p: V) => focal / dot(sub(p, eye), forward)
  return { project, inFrame, ruler }
}

/** A struck ball's flight, with drag and gravity, on a fine grid. */
function flight(p0: V, v0: V): (t: number) => V {
  const dt = 1e-4
  const out: V[] = [p0]
  let p = { ...p0 }
  let v = { ...v0 }
  for (let i = 0; i < 2500; i++) {
    const s = Math.hypot(v.x, v.y, v.z)
    v = add(v, scale(v, -BALL_DRAG * s * dt))
    v.z -= GRAVITY * dt
    p = add(p, scale(v, dt))
    out.push(p)
  }
  return (t: number) => out[Math.max(0, Math.min(out.length - 1, Math.round(t / dt)))]
}

/**
 * The toss's height above impact at time t (impact at 0), with drag: up to its
 * top `fall` above, and down to impact.
 */
function tossHeights(fall: number): (t: number) => number | undefined {
  const dt = 2e-4
  const down: number[] = []
  let z = fall
  let v = 0
  while (z > 0) {
    v += (-GRAVITY - BALL_DRAG * Math.abs(v) * v) * dt
    z += v * dt
    down.push(z)
  }
  const tFall = down.length * dt
  const up: number[] = []
  z = fall
  v = 0
  for (let k = 0; k < 4500 && z > -1.2; k++) {
    const a = -GRAVITY - BALL_DRAG * Math.abs(v) * v
    v -= a * dt
    z -= v * dt
    up.push(z)
  }
  return (t: number) => {
    const s = t + tFall
    if (s >= 0) return s / dt < down.length ? down[Math.floor(s / dt)] : undefined
    const k = Math.floor(-s / dt)
    return k < up.length ? up[k] : undefined
  }
}

interface Trial {
  setting: SpeedSetting | undefined
  frames: StruckFrame[]
  truth: number
  /** Frame heights per metre at the ball at impact. */
  ruler: number
}

/**
 * One serve, one phone, one launch. `decoys` puts the racket head on half the
 * frames beside the ball, a stationary yellow ball in shot and a stray blob now
 * and then — what a colour-and-motion detector really hands over.
 */
function trial(
  serve: MocapServe,
  opts: {
    fps: number
    bearing: number
    portrait: boolean
    seed: number
    decoys: boolean
    noisePx?: number
    ball?: boolean
    /** The phone's distance, metres: the guide's four to six unless given. */
    near?: number
    far?: number
    /** How far towards the net the phone looks past the player, metres. */
    lead?: number
  },
): Trial {
  const r = seeded(opts.seed)
  const imp = impactOf(serve)
  const aspect = opts.portrait ? 9 / 16 : 16 / 9
  const cam = phoneAt(
    {
      bearing: opts.bearing + r.gauss() * 2,
      distance: (opts.near ?? 4) + r.next() * ((opts.far ?? 6) - (opts.near ?? 4)),
      height: 0.8 + r.next() * 0.7,
      focalLong: 0.8 * (1 + (r.next() * 2 - 1) * 0.15),
      aspect,
      pp: { x: r.gauss() * 0.01, y: r.gauss() * 0.01 },
    },
    { ...imp.feet, x: imp.feet.x + (opts.lead ?? 0) },
  )
  // About a pixel on a 1080-line read.
  const noise = (opts.noisePx ?? 1.2) / 1080

  const psi = ((r.next() * 30 - 15) * Math.PI) / 180
  const el = ((r.next() * 15 - 12) * Math.PI) / 180
  const truth = 30 + r.next() * 25
  const dir = { x: Math.cos(el) * Math.cos(psi), y: Math.cos(el) * Math.sin(psi), z: Math.sin(el) }
  const path = flight(imp.p0, scale(dir, truth))

  // The engine's contact runs 3–30 ms ahead of impact, give or take its own jitter.
  const contactT = -(0.003 + r.next() * 0.027) + r.gauss() * 0.004
  const phase = r.next() / opts.fps

  // The toss: drifting up to 0.4 m/s, with drag, read at the pose pass's rate
  // — every frame of a stretched slow-motion clip, which is what this is.
  const fall = 0.3 + r.next() * 0.4
  const heights = tossHeights(fall)
  const driftA = r.next() * 2 * Math.PI
  const driftM = 0.4 * r.next()
  const toss: StruckSample[] = []
  for (let t = -1.4 + phase; t < -0.5 / opts.fps; t += 1 / opts.fps) {
    const h = heights(t)
    if (h === undefined || r.next() < 0.2) continue
    const q = cam.project({
      x: imp.p0.x + Math.cos(driftA) * driftM * t,
      y: imp.p0.y + Math.sin(driftA) * driftM * t,
      z: imp.p0.z + h,
    })
    if (cam.inFrame(q)) toss.push({ t, x: q.x + r.gauss() * noise, y: q.y + r.gauss() * noise })
  }
  const tossFit = tossPath(toss, { noise, aspect, t0: contactT })

  const still = { x: r.next() * aspect, y: r.next() * 0.5 }
  const frames: StruckFrame[] = []
  for (let t = phase - 0.06; t < 0.22; t += 1 / opts.fps) {
    const candidates: { x: number; y: number }[] = []
    if (t > 0 && opts.ball !== false) {
      const q = cam.project(path(t))
      if (cam.inFrame(q) && r.next() > 0.15) candidates.push({ x: q.x + r.gauss() * noise, y: q.y + r.gauss() * noise })
    }
    if (opts.decoys) {
      if (r.next() < 0.5) {
        const q = cam.project(imp.racket(t))
        candidates.push({ x: q.x + r.gauss() * noise, y: q.y + r.gauss() * noise })
      }
      if (r.next() < 0.5) candidates.push({ x: still.x + r.gauss() * noise, y: still.y + r.gauss() * noise })
      if (r.next() < 0.2) candidates.push({ x: r.next() * aspect, y: r.next() })
    }
    candidates.sort(() => r.next() - 0.5)
    frames.push({ t, candidates })
  }

  const nose = cam.project(imp.nose)
  const feet = cam.project(imp.feet)
  const across = cam.project(add(imp.feet, { x: 1, y: 0, z: 1.5 })).x - cam.project({ ...imp.feet, z: 1.5 }).x
  const setting: SpeedSetting | undefined = tossFit && {
    contactT,
    bodyHeight: (feet.y - nose.y) / 0.936,
    netSide: across > 0 ? 1 : -1,
    aspect,
    toss: tossFit,
    noise,
  }
  return { setting, frames, truth, ruler: cam.ruler(imp.p0) }
}

type Outcome = { truth: number; ms?: number; low?: number; high?: number; miss?: string; portrait: boolean; fps: number; pinned?: boolean }

function run(fps: number[], opts: { decoys: boolean; reps: number; seed: number; near?: number; far?: number; lead?: number }): Outcome[] {
  const out: Outcome[] = []
  let seed = opts.seed
  for (const serve of SERVES) {
    for (const f of fps) {
      for (const portrait of [false, true]) {
        for (const bearing of [60, 75, 90, 105, 120]) {
          for (let k = 0; k < opts.reps; k++) {
            const t = trial(serve, { fps: f, bearing, portrait, seed: seed++, decoys: opts.decoys, near: opts.near, far: opts.far, lead: opts.lead })
            if (!t.setting) {
              out.push({ truth: t.truth, miss: 'no_toss', portrait, fps: f })
              continue
            }
            const r = measureServeSpeed(t.frames, t.setting)
            out.push(
              'speed' in r
                ? { truth: t.truth, ms: r.speed.ms, low: r.speed.low, high: r.speed.high, portrait, fps: f, pinned: r.speed.pinned }
                : { truth: t.truth, miss: r.miss, portrait, fps: f },
            )
          }
        }
      }
    }
  }
  return out
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : Number.NaN
}

/* ------------------------------------------------------------------ checks */

heading('Serve speed, read off the ball')

check('the fixture holds six finished serves to launch from', () => {
  assert(SERVES.length === 6, `${SERVES.length} serves`)
})

check('the drag constant is a tennis ball in air', () => {
  // ½ρC_dA/m with C_d 0.507, 6.7 cm, 57.7 g, 1.2 kg/m³: a 45 m/s ball loses
  // about 38 m/s² to drag, roughly four times g.
  near(BALL_DRAG, 0.01859, 0.0001, 'drag per metre')
  near(BALL_DRAG * 45 * 45, 37.6, 0.5, 'deceleration at 45 m/s')
})

check('the toss gives the ruler at the ball, through drift and drag', () => {
  // Against the truth — the lens's focal length over the ball's distance at
  // impact — first with no noise, which is the model's own error, then with
  // a pixel of it, where the fitted standard error has to account for the gap.
  const clean: { err: number; scaleError: number }[] = []
  const pulls: number[] = []
  for (let k = 0; k < 60; k++) {
    const serve = SERVES[k % SERVES.length]
    const at = { fps: 240, bearing: 60 + (k % 5) * 15, portrait: k % 2 === 0, seed: 900 + k, decoys: false }
    const quiet = trial(serve, { ...at, noisePx: 0.01 })
    if (quiet.setting) {
      clean.push({
        err: Math.abs(scaleAt(quiet.setting.toss, quiet.setting.contactT) / quiet.ruler - 1),
        scaleError: quiet.setting.toss.scaleError,
      })
    }
    const noisy = trial(serve, at)
    if (noisy.setting) {
      const err = scaleAt(noisy.setting.toss, noisy.setting.contactT) / noisy.ruler - 1
      pulls.push(Math.abs(err) / noisy.setting.toss.scaleError)
    }
  }
  assert(clean.length >= 40 && pulls.length >= 40, `${clean.length} / ${pulls.length} tosses fitted`)
  note(`ruler error, noise-free: median ${(pct(clean.map((c) => c.err), 0.5) * 100).toFixed(2)}%, worst ${(Math.max(...clean.map((c) => c.err)) * 100).toFixed(2)}%`)
  // Read at contact, the truth at impact: up to 30 ms of drift apart, which is
  // well under a percent on a typical toss.
  assert(pct(clean.map((c) => c.err), 0.5) < 0.005, 'the typical noise-free ruler is more than half a percent off')
  // And never further off than the range a speed built on it allows for: two
  // of its own standard errors, plus the half percent of drift. A toss the
  // model fits badly (one caught mostly rising, with a hard drift towards the
  // lens) can be far off, but it says so: one here read 80% off with a stated
  // error of 69%, and a ruler that unsure gives no speed at all.
  for (const c of clean) {
    assert(c.err <= 2 * c.scaleError + 0.005, `a ruler ${(c.err * 100).toFixed(1)}% off claimed ±${(c.scaleError * 100).toFixed(1)}%`)
  }
  const usable = clean.filter((c) => 2 * c.scaleError <= MAX_SPREAD)
  assert(usable.length >= 40, `only ${usable.length} rulers sure enough to carry a speed`)
  assert(Math.max(...usable.map((c) => c.err)) < 0.03, 'a ruler sure enough to carry a speed was 3% or more off')
  // With noise, the error in standard errors: about one, and rarely past three.
  note(`with a pixel of noise, error in its own standard errors: median ${pct(pulls, 0.5).toFixed(2)}, 95th ${pct(pulls, 0.95).toFixed(2)}`)
  assert(pct(pulls, 0.95) < 3, 'the ruler is less sure than it says')
})

check('a clean track reads its launch speed, wherever the ball flew relative to the lens', () => {
  // Noise-free and no decoys: the perspective model's own accuracy. A straight
  // line through the same points is what the picture alone gives — and it is
  // off by more than ten percent at the edges of the side-on band.
  let worst = 0
  let flatWorst = 0
  let read = 0
  for (let k = 0; k < 60; k++) {
    const serve = SERVES[k % SERVES.length]
    const t = trial(serve, { fps: 240, bearing: 60 + (k % 5) * 15, portrait: false, seed: 1200 + k, decoys: false, noisePx: 0.01 })
    if (!t.setting) continue
    const r = measureServeSpeed(t.frames, t.setting)
    if (!('speed' in r)) continue
    read++
    // Within thirty degrees of the picture the model's own accuracy is what
    // is measured. Further out, up to half the speed runs along the lens, and
    // that half leans on a focal length each phone here gets wrong by up to
    // 15%: clean tracks at 45 degrees read up to 9% off, inside their range.
    if (r.speed.depthAngle <= 30) worst = Math.max(worst, Math.abs(r.speed.ms / t.truth - 1))
    assert(t.truth >= r.speed.low && t.truth <= r.speed.high, `a clean track's range missed the truth: ${t.truth.toFixed(1)} outside ${r.speed.low.toFixed(1)}–${r.speed.high.toFixed(1)}`)
    // The straight line: least-squares speed through the same detections, at the toss's ruler.
    const pts = t.frames.flatMap((f) => f.candidates.map((c) => ({ t: f.t, ...c }))).filter((p) => p.t > 0)
    const n = pts.length
    const mt = pts.reduce((s, p) => s + p.t, 0) / n
    const mx = pts.reduce((s, p) => s + p.x, 0) / n
    const my = pts.reduce((s, p) => s + p.y, 0) / n
    let tt = 0
    let tx = 0
    let ty = 0
    for (const p of pts) {
      tt += (p.t - mt) ** 2
      tx += (p.t - mt) * (p.x - mx)
      ty += (p.t - mt) * (p.y - my)
    }
    const flat = Math.hypot(tx / tt, ty / tt) / t.setting.toss.unitsPerMetre
    flatWorst = Math.max(flatWorst, Math.abs(flat / t.truth - 1))
  }
  assert(read >= 40, `only ${read} of 60 clean landscape tracks read`)
  note(`worst error within 30° of the picture: ${(worst * 100).toFixed(1)}% with the depth fitted, ${(flatWorst * 100).toFixed(1)}% from the picture alone`)
  assert(worst < 0.05, `a clean track read ${(worst * 100).toFixed(1)}% off`)
  assert(flatWorst > 0.1, 'the flat reading was never far out — then the depth model is not earning its keep')
})

check('the stated range holds the true speed, with decoys in every frame', () => {
  const out = run([120, 240], { decoys: true, reps: 2, seed: 4000 })
  const read = out.filter((o) => o.ms !== undefined)
  const covered = read.filter((o) => o.truth >= o.low! && o.truth <= o.high!)
  const errs = read.map((o) => o.ms! / o.truth - 1)
  const abs = errs.map(Math.abs)
  const mean = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length)
  const half = read.map((o) => (o.high! - o.low!) / 2 / o.ms!)
  const landscape = out.filter((o) => !o.portrait)
  const landRead = landscape.filter((o) => o.ms !== undefined).length / landscape.length
  note(
    `${read.length} of ${out.length} read (${(landRead * 100).toFixed(0)}% landscape, ` +
      `${((read.filter((o) => o.portrait).length / out.filter((o) => o.portrait).length) * 100).toFixed(0)}% portrait); ` +
      `range holds the truth ${((covered.length / read.length) * 100).toFixed(1)}%; ` +
      `|error| p95 ${(pct(abs, 0.95) * 100).toFixed(1)}%, worst ${(Math.max(...abs) * 100).toFixed(1)}%; ` +
      `mean ${(mean * 100).toFixed(2)}%; typical range ±${(pct(half, 0.5) * 100).toFixed(1)}%`,
  )
  // Most of these come from landscape. Upright, the ball crosses the narrow
  // side of the picture in a few frames, and the range that leaves is honestly
  // wider than the cap: about one upright serve in twenty is read at 240 fps
  // with a pixel of noise. The landscape share is held below.
  assert(read.length >= 60, `only ${read.length} readings — the gates are refusing what they should read`)
  assert(covered.length / read.length >= 0.95, `the range held the truth only ${((covered.length / read.length) * 100).toFixed(1)}% of the time`)
  assert(pct(abs, 0.95) <= 0.07, `95th-percentile error ${(pct(abs, 0.95) * 100).toFixed(1)}%`)
  assert(Math.max(...abs) <= 0.15, `a reading was ${(Math.max(...abs) * 100).toFixed(1)}% out`)
  assert(Math.abs(mean) <= 0.02, `readings lean ${(mean * 100).toFixed(2)}% one way`)
  assert(Math.max(...half) <= MAX_SPREAD + 1e-9, 'a reading was given with a range wider than the cap')
  assert(landRead >= 0.3, `landscape slow motion read only ${(landRead * 100).toFixed(0)}% of serves`)
})

check('from the guide placement, thirty frames a second reads almost nothing, and says film in slow motion', () => {
  // Centred in the picture at four to six metres, a 150 km/h serve crosses
  // what is left of it in one or two frames at 30 fps, and is rarely seen
  // three times clear of the racket.
  const out = run([30], { decoys: true, reps: 1, seed: 7000 })
  const read = out.filter((o) => o.ms !== undefined)
  const covered = read.filter((o) => o.truth >= o.low! && o.truth <= o.high!)
  note(`${out.length} serves at 30 fps, ${read.length} read; otherwise ${[...new Set(out.filter((o) => !o.ms).map((o) => o.miss))].join(', ')}`)
  assert(read.length <= out.length * 0.1, `${read.length} readings at 30 fps from the guide placement`)
  assert(covered.length === read.length, 'a 30 fps reading missed the truth')
  // And it says why in the one way a player can act on: film in slow motion.
  const why = out.filter((o) => !o.ms && o.miss !== 'no_toss')
  assert(why.every((o) => o.miss === 'frame_rate'), `30 fps refused as ${[...new Set(why.map((o) => o.miss))].join(', ')}`)
})

check('from the speed placement, a short track pinned to the toss reads real-time clips, and its range holds the truth', () => {
  // SPEED_PLACEMENT: six to seven metres back, the phone looking a metre and a
  // half past the player towards the net. The ball stays in the picture for
  // longer, and three sightings pinned to the toss are enough.
  const out = run([30, 60], { decoys: true, reps: 2, seed: 7400, near: 6, far: 7, lead: 1.5 })
  const land = out.filter((o) => !o.portrait)
  const rate = (fps: number) => {
    const at = land.filter((o) => o.fps === fps)
    return at.filter((o) => o.ms !== undefined).length / at.length
  }
  const read = out.filter((o) => o.ms !== undefined)
  const pinned = read.filter((o) => o.pinned)
  const covered = read.filter((o) => o.truth >= o.low! && o.truth <= o.high!)
  const abs = read.map((o) => Math.abs(o.ms! / o.truth - 1))
  const half = read.map((o) => (o.high! - o.low!) / 2 / o.ms!)
  note(
    `landscape read ${(rate(30) * 100).toFixed(0)}% at 30 fps, ${(rate(60) * 100).toFixed(0)}% at 60; ${pinned.length} of ${read.length} pinned; ` +
      `range holds the truth ${((covered.length / read.length) * 100).toFixed(1)}%; |error| p95 ${(pct(abs, 0.95) * 100).toFixed(1)}%, ` +
      `worst ${(Math.max(...abs) * 100).toFixed(1)}%; typical range ±${(pct(half, 0.5) * 100).toFixed(1)}%`,
  )
  assert(rate(30) >= 0.25, `30 fps read only ${(rate(30) * 100).toFixed(0)}%`)
  assert(rate(60) >= 0.5, `60 fps read only ${(rate(60) * 100).toFixed(0)}%`)
  assert(pinned.length > 0, 'no reading came from a pinned track')
  assert(covered.length / read.length >= 0.95, `the range held the truth only ${((covered.length / read.length) * 100).toFixed(1)}%`)
  assert(pct(abs, 0.95) <= 0.08, `95th-percentile error ${(pct(abs, 0.95) * 100).toFixed(1)}%`)
  assert(Math.max(...abs) <= 0.15, `a reading was ${(Math.max(...abs) * 100).toFixed(1)}% out`)
  assert(Math.max(...half) <= MAX_SPREAD + 1e-9, 'a reading was given with a range wider than the cap')
})

check('every reason for no speed can be reached, so each one is a sentence a player sees (N0.7)', () => {
  const serve = SERVES[0]
  const t = trial(serve, { fps: 240, bearing: 90, portrait: false, seed: 31, decoys: false })
  assert(Boolean(t.setting), 'the base trial fitted no toss')
  const s = t.setting!
  const miss = (frames: StruckFrame[], setting: Parameters<typeof measureServeSpeed>[1] = s) => {
    const r = measureServeSpeed(frames, setting)
    return 'miss' in r ? r.miss : 'read'
  }
  const seen = new Set<string>()
  // A clock that repeats itself: the browser would not say when frames were taken.
  seen.add(miss(t.frames.map((f, k) => ({ ...f, t: k < 4 ? t.frames[0].t : f.t }))))
  // Thirty frames a second.
  seen.add(miss(trial(serve, { fps: 30, bearing: 90, portrait: false, seed: 31, decoys: false }).frames))
  // No toss to take metres from.
  seen.add(miss(t.frames, { ...s, toss: undefined }))
  // No ball after contact.
  seen.add(miss(t.frames.map((f) => ({ ...f, candidates: [] }))))
  // Filmed from behind the baseline: the ball flies along the lens.
  for (let k = 0; k < 40 && !seen.has('view'); k++) {
    for (const bearing of [0, 10, 170, 180]) {
      const end = trial(SERVES[k % SERVES.length], { fps: 240, bearing, portrait: false, seed: 500 + k, decoys: false })
      if (end.setting) seen.add(miss(end.frames, end.setting))
    }
  }
  // A track too scattered to stand behind.
  for (let k = 0; k < 40 && !seen.has('unsure'); k++) {
    const rough = trial(SERVES[k % SERVES.length], { fps: 120, bearing: 90, portrait: true, seed: 600 + k, decoys: false, noisePx: 3 })
    if (rough.setting) seen.add(miss(rough.frames, rough.setting))
  }
  for (const reason of ['timing', 'frame_rate', 'no_toss', 'not_found', 'view', 'unsure']) {
    assert(seen.has(reason), `"${reason}" was never reached: saw ${[...seen].join(', ')}`)
  }
})

check('decoys alone are never read as a serve', () => {
  // The racket leaving the toss, a ball lying still and stray blobs on every
  // frame, and no ball. Nothing here is a serve, and nothing is read.
  let readings = 0
  let trials = 0
  for (let k = 0; k < 120; k++) {
    const at = { fps: [240, 60, 30][k % 3], bearing: 60 + (k % 5) * 15, portrait: k % 2 === 1, seed: 8000 + k, decoys: true, ball: false, near: k % 4 < 2 ? 4 : 6, far: k % 4 < 2 ? 6 : 7, lead: k % 4 < 2 ? 0 : 1.5 }
    const t = trial(SERVES[k % SERVES.length], at)
    if (!t.setting) continue
    trials++
    if ('speed' in measureServeSpeed(t.frames, t.setting)) readings++
  }
  assert(trials >= 80, `${trials} trials`)
  assert(readings === 0, `${readings} of ${trials} decoy-only clips gave a speed`)
})

report()
