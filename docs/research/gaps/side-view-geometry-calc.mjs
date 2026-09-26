// Geometry checks for docs/research/gaps/side-view-geometry-contradictions.md
// Run: node side-view-geometry-calc.mjs            (sections 1-6)
//      node side-view-geometry-calc.mjs 1b | 4b    (extra sections: tilt framing, two-level knee band)
// Sections: 1 framing, 1b tilt framing, 2 tilt error, 3 toss out of plane, 4 knee Monte Carlo,
//           4b two-level knee band, 5 trunk projections, 6 audio flight-time Monte Carlo.
// Seeded RNG, so results are reproducible. All inputs that are assumptions are named in the doc.
// Coordinates: x along the baseline towards the hitting-arm sideline (the D1 camera side for a
// right-hander), y towards the net, z up. Origin: centre mark on the ground.
const D2R = Math.PI / 180, R2D = 180 / Math.PI
const deg = (r) => r * R2D

// ---------- seeded RNG ----------
let seed = 20260927
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
function randn() { let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
const N = (m, s) => m + s * randn()
const U = (a, b) => a + (b - a) * rand()
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) }

// ---------- vectors ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => Math.hypot(a[0], a[1], a[2])
const unit = (a) => mul(a, 1 / norm(a))
// rotate v about unit axis k by angle t (Rodrigues)
const rot = (v, k, t) => add(add(mul(v, Math.cos(t)), mul(cross(k, v), Math.sin(t))), mul(k, dot(k, v) * (1 - Math.cos(t))))

// ---------- 1. Field of view and framing ----------
// 35 mm equivalent is defined on the 43.27 mm diagonal of the 4:3 still frame; 16:9 video
// assumed to use the full sensor width (the app must read videoFieldOfView at runtime).
const W43 = 43.27 * 4 / 5, H169 = W43 * 9 / 16
const lens = { '24 mm (1x, Pro)': 24, '26 mm (1x, 17/16e/17e)': 26, '13 mm (0.5x)': 13 }
function fov(f) { return { vHalf: Math.atan(H169 / 2 / f), hHalf: Math.atan(W43 / 2 / f) } }

function section1() {
  console.log('\n=== 1. FOV and framing (level phone) ===')
  for (const [name, f] of Object.entries(lens)) {
    const { vHalf, hHalf } = fov(f)
    console.log(`${name}: vertical FOV ${(2 * deg(vHalf)).toFixed(1)} deg, horizontal ${(2 * deg(hHalf)).toFixed(1)} deg, tan(vHalf)=${Math.tan(vHalf).toFixed(4)}`)
  }
  // D1 short/low corner check: camera 6 m from centre mark, 1.2 m high.
  console.log('\nFrame top in the ball plane, camera 6 m from the centre mark at 1.2 m:')
  for (const [name, f] of Object.entries(lens)) {
    const t = Math.tan(fov(f).vHalf)
    for (const xs of [0, 0.5, 1.0]) {
      const Db = 6 - xs - 0.3 // server offset towards camera, toss/contact 0.3 m further towards camera
      console.log(`  ${name}, server ${xs} m towards camera: ball plane ${Db.toFixed(2)} m, top ${(1.2 + Db * t).toFixed(2)} m, bottom at feet ${(1.2 - (Db + 0.3) * t).toFixed(2)} m`)
    }
  }
  // Minimum ball-plane distance for a given frame top, then camera distance from centre mark.
  console.log('\nMinimum camera distance from the centre mark (level phone). Camera-side court: server 1.0 m towards camera (worst case), toss/contact 0.3 m towards camera.')
  console.log('Far-side court: server 0.5 m away from camera. Columns: h | top 4.3 m | top 4.5 m | top 4.7 m (camera-side court; far-side court in brackets)')
  for (const [name, f] of Object.entries(lens)) {
    const t = Math.tan(fov(f).vHalf)
    console.log(` ${name}`)
    for (const h of [1.2, 1.4, 1.6, 1.8, 2.0, 2.2]) {
      const cells = [4.3, 4.5, 4.7].map((top) => {
        const DbTop = (top - h) / t
        const DbFeet = (h + 0.1) / t - 0.3 // feet (at ball plane + 0.3 m) must be above the frame bottom by 0.1 m
        const Db = Math.max(DbTop, DbFeet)
        const feetOk = DbTop >= DbFeet
        const camSide = Db + 1.0 + 0.3
        const farSide = Db - 0.5 + 0.3
        return `${camSide.toFixed(1)} (${farSide.toFixed(1)})${feetOk ? '' : '*'}`
      })
      console.log(`   h ${h.toFixed(1)} m | ${cells.join(' | ')}`)
    }
  }
  // Best height for a level phone: centre of the envelope -0.1..top
  console.log('\nOptimal level-phone height = centre of envelope (-0.1 m .. top):')
  for (const top of [4.5, 4.7]) {
    const h = (top - 0.1) / 2
    for (const [name, f] of Object.entries(lens)) {
      const t = Math.tan(fov(f).vHalf)
      const Db = (top - h) / t
      console.log(`  top ${top}: h ${h.toFixed(2)} m, ${name}: ball plane ${Db.toFixed(2)} m, camera from centre mark ${(Db + 1.3).toFixed(1)} m (camera-side court)`)
    }
  }
  // pixel density at the player for 1080p and 4K
  console.log('\nPixels per metre at the player (1080p / 2160p) for a given camera-to-player distance:')
  for (const [name, f] of Object.entries(lens)) {
    const t = Math.tan(fov(f).vHalf)
    const row = [5, 6, 7, 8, 9, 10].map((D) => `${D} m: ${(540 / (D * t)).toFixed(0)}/${(1080 / (D * t)).toFixed(0)}`)
    console.log(`  ${name}: ${row.join(', ')}`)
  }
}

// ---------- 2. Upward tilt corrected in software ----------
function section2() {
  console.log('\n=== 2. Upward tilt ===')
  // Heights are measured relative to the feet in the same frame. With rectification by the
  // known pitch, rays are exact; residual error comes only from the pitch estimate error d.
  for (const D of [5, 6, 7]) for (const h of [1.2, 1.5]) {
    const eA = Math.atan((3.6 - h) / D), eF = Math.atan((0 - h) / D), eC = Math.atan((2.6 - h) / D)
    for (const dDeg of [0.5, 1.0]) {
      const d = dDeg * D2R
      const relApex = D * (Math.tan(eA + d) - Math.tan(eF + d)) - D * (Math.tan(eA) - Math.tan(eF))
      const relContact = D * (Math.tan(eC + d) - Math.tan(eF + d)) - D * (Math.tan(eC) - Math.tan(eF))
      console.log(`  D ${D} m, h ${h} m, pitch error ${dDeg} deg: apex-above-feet error ${(relApex * 100).toFixed(1)} cm, contact-above-feet ${(relContact * 100).toFixed(1)} cm`)
    }
  }
  // Uncorrected tilt (treat tilted image as level; linear scale from feet-to-head of standing player)
  console.log('  Uncorrected tilt, linear scale from standing player (1.75 m), apex at 3.6 m, contact 2.6 m, camera 6 m, h 1.4 m:')
  for (const tau of [5, 10]) {
    const D = 6, h = 1.4, t = tau * D2R
    const p = (z) => Math.tan(Math.atan((z - h) / D) - t)
    const scale = 1.75 / (p(1.75) - p(0))
    const apex = (p(3.6) - p(0)) * scale, contact = (p(2.6) - p(0)) * scale
    console.log(`   tilt ${tau} deg: apex ${apex.toFixed(3)} m (error ${((apex - 3.6) * 100).toFixed(1)} cm), contact ${contact.toFixed(3)} m (error ${((contact - 2.6) * 100).toFixed(1)} cm)`)
  }
}

// ---------- 3. Ball out of the scale plane ----------
function section3() {
  console.log('\n=== 3. Ball offset towards the camera (scale plane = body plane) ===')
  for (const h of [1.2, 1.5, 2.0]) for (const D of [6, 7, 8]) {
    const e = (z, dx) => (z - h) * dx / (D - dx)
    console.log(`  h ${h} m, D ${D} m: apex 3.4 m bias for 0.3 m offset ${(e(3.4, 0.3) * 100).toFixed(1)} cm; contact 2.6 m ${(e(2.6, 0.3) * 100).toFixed(1)} cm; spurious apex spread for 0.10 m lateral toss SD ${(e(3.4, 0.1) * 100).toFixed(1)} cm`)
  }
}

// ---------- camera model ----------
function makeCam(P, target, fPx) {
  const fwd = unit(sub(target, P))
  const right = unit(cross(fwd, [0, 0, 1]))
  const down = cross(fwd, right)
  return { P, fwd, right, down, f: fPx }
}
function levelCam(P, fwd, fPx) {
  const right = unit(cross(fwd, [0, 0, 1]))
  const down = cross(fwd, right)
  return { P, fwd, right, down, f: fPx }
}
function project(cam, X) {
  const d = sub(X, cam.P)
  const zc = dot(d, cam.fwd)
  return [cam.f * dot(d, cam.right) / zc, cam.f * dot(d, cam.down) / zc, zc]
}
function angle2D(a, b, c) { // interior angle at b, degrees
  const ba = [a[0] - b[0], a[1] - b[1]], bc = [c[0] - b[0], c[1] - b[1]]
  const cos = (ba[0] * bc[0] + ba[1] * bc[1]) / (Math.hypot(...ba) * Math.hypot(...bc))
  return deg(Math.acos(clamp(cos, -1, 1)))
}

// ---------- 4. Knee-band Monte Carlo ----------
function band(phi) { return phi < 20 ? 0 : phi < 45 ? 1 : 2 }
function section4() {
  console.log('\n=== 4. Knee flexion band (little <20, moderate 20-45, deep >=45 deg) ===')
  const H = 1.75, L1 = 0.245 * H, L2 = 0.246 * H, ankleZ = 0.039 * H
  const f24 = 540 / Math.tan(fov(24).vHalf)
  const side = levelCam([8.0, 0, 1.4], [-1, 0, 0], f24) // server ~7.2 m away
  const rear = makeCam([0.75, -6.0, 2.8], [0.75, 0, 0.9], f24)
  const ankles = { front: [0.75, 0.0, ankleZ], back: [0.93, -0.26, ankleZ] }

  function simulate({ muFront, muBack, sigAz, leanMu, leanSd, noise, n = 20000, fixedPhi = null }) {
    const res = {}
    for (const leg of ['front', 'back']) {
      const out = { E1: [], E2: [], E3: [], E4: [], E4c: [] }
      for (let i = 0; i < n; i++) {
        const phi = fixedPhi ?? U(5, 85)
        const r = U(0.4, 0.6)
        const b2 = phi * r * D2R, b1 = phi * (1 - r) * D2R
        const az = (leg === 'front' ? N(muFront, sigAz) : N(muBack, sigAz * 0.8)) * D2R
        const u = [Math.cos(az), Math.sin(az), 0]
        const A = ankles[leg]
        let K = add(A, add(mul(u, L2 * Math.sin(b2)), [0, 0, L2 * Math.cos(b2)]))
        let Hp = add(K, add(mul(u, -L1 * Math.sin(b1)), [0, 0, L1 * Math.cos(b1)]))
        const g = N(leanMu, leanSd) * D2R // leg-line lean towards the net
        K = add(A, rot(sub(K, A), [1, 0, 0], -g))
        Hp = add(A, rot(sub(Hp, A), [1, 0, 0], -g))
        // keypoint noise (metres at subject), systematic + averaged random
        const occl = leg === 'front' ? 2.0 : 1.0 // rear view: back leg in front of front leg
        const sig = { hip: noise * 0.02, knee: noise * 0.015, ankle: noise * 0.015 }
        const jitter = (X, s) => add(X, [N(0, s), N(0, s), N(0, s)])
        const obs = (cam, occ) => {
          const pts = [[Hp, sig.hip], [K, sig.knee], [A, sig.ankle]].map(([X, s]) => project(cam, jitter(X, s * occ)))
          return pts
        }
        const [h1, k1, a1] = obs(side, 1)
        const [h2, k2, a2] = obs(rear, occl)
        const e1 = 180 - angle2D(h1, k1, a1)
        const e2 = 180 - angle2D(h2, k2, a2)
        // E3: deproject D1 with an estimated plane angle (90 - azimuth), error 12 deg
        const psiEst = clamp(90 - deg(az) + N(0, 12), 0, 70) * D2R
        const e3 = 2 * R2D * Math.atan(Math.tan(e1 * D2R / 2) / Math.cos(psiEst))
        // E4: view-invariant segment inclinations from vertical extents in D1 (scale at ankle depth)
        const depth = h1[2] > 0 ? project(side, A)[2] : 7
        const toZ = (p) => side.P[2] - p[1] * depth / side.f
        const toY = (p) => p[0] * depth / side.f
        const L1e = L1 * (1 + N(0, 0.01)), L2e = L2 * (1 + N(0, 0.01))
        const zH = toZ(h1), zK = toZ(k1), zA = toZ(a1)
        const e4 = R2D * (Math.acos(clamp((zH - zK) / L1e, -1, 1)) + Math.acos(clamp((zK - zA) / L2e, -1, 1)))
        // E4c: remove the in-plane lean of the hip-ankle line first
        const yH = toY(h1), yK = toY(k1), yA = toY(a1)
        const lean = Math.atan2(yH - yA, zH - zA)
        const rz = (y, z) => -Math.sin(lean) * y + Math.cos(lean) * z
        const e4c = R2D * (Math.acos(clamp((rz(yH, zH) - rz(yK, zK)) / L1e, -1, 1)) + Math.acos(clamp((rz(yK, zK) - rz(yA, zA)) / L2e, -1, 1)))
        for (const [k, v] of [['E1', e1], ['E2', e2], ['E3', e3], ['E4', e4], ['E4c', e4c]]) out[k].push([phi, v])
      }
      res[leg] = out
    }
    return res
  }
  const summarise = (pairs) => {
    let mis = 0, gross = 0
    for (const [t, e] of pairs) { const bt = band(t), be = band(e); if (bt !== be) mis++; if (Math.abs(bt - be) === 2) gross++ }
    const err = pairs.map(([t, e]) => e - t)
    return { mis: (100 * mis / pairs.length).toFixed(0) + '%', gross: (100 * gross / pairs.length).toFixed(1) + '%', bias: mean(err).toFixed(1), sd: sd(err).toFixed(1) }
  }
  const scenarios = [
    { name: 'Base: front knee azimuth 25+-15 deg from baseline, back 10 deg, lean 8+-6, noise x1', muFront: 25, muBack: 10, sigAz: 15, leanMu: 8, leanSd: 6, noise: 1 },
    { name: 'Knee follows front foot (Fett 2021 foot angle ~35 deg), back 10', muFront: 35, muBack: 10, sigAz: 17, leanMu: 8, leanSd: 6, noise: 1 },
    { name: 'Coaching cue: front foot/knee at 45 deg (net post), back 20', muFront: 45, muBack: 20, sigAz: 15, leanMu: 8, leanSd: 6, noise: 1 },
    { name: 'Knee follows pelvis (side-on, ~5 deg), back 0', muFront: 5, muBack: 0, sigAz: 12, leanMu: 8, leanSd: 6, noise: 1 },
    { name: 'Base with doubled keypoint noise', muFront: 25, muBack: 10, sigAz: 15, leanMu: 8, leanSd: 6, noise: 2 },
  ]
  for (const s of scenarios) {
    const r = simulate(s)
    console.log(`\n ${s.name}`)
    for (const leg of ['front', 'back']) for (const k of ['E1', 'E2', 'E3', 'E4', 'E4c']) {
      const x = summarise(r[leg][k])
      console.log(`   ${leg.padEnd(5)} ${k.padEnd(3)} misclassified ${x.mis.padStart(4)}, little<->deep ${x.gross.padStart(5)}, bias ${x.bias.padStart(6)} deg, SD ${x.sd.padStart(5)} deg`)
    }
  }
  // Conditional: fixed true angles, base scenario
  console.log('\n Conditional results, base scenario (true flexion fixed):')
  for (const phi of [10, 30, 60]) {
    const r = simulate({ ...scenarios[0], fixedPhi: phi, n: 10000 })
    for (const leg of ['front', 'back']) {
      const line = ['E1', 'E2', 'E3', 'E4'].map((k) => {
        const pairs = r[leg][k]; const est = pairs.map((p) => p[1])
        const wrong = pairs.filter(([t, e]) => band(t) !== band(e)).length / pairs.length
        return `${k}: median ${pct(est, 0.5).toFixed(0)} [${pct(est, 0.05).toFixed(0)}..${pct(est, 0.95).toFixed(0)}], wrong band ${(100 * wrong).toFixed(0)}%`
      })
      console.log(`   true ${phi} deg, ${leg}: ${line.join(' | ')}`)
    }
  }
}

// ---------- 5. Trunk projections ----------
function trunkFrame(fettDeg) {
  // Fett 2021: shoulder vector vs global x (their +x points left along the baseline, -y towards the net),
  // CCW positive from overhead. Their frame is ours rotated 180 deg about z.
  const a = (fettDeg + 180) * D2R
  const L = [Math.cos(a), Math.sin(a), 0] // right shoulder -> left shoulder
  const S = [0, 0, 1]
  const A = cross(L, S) // chest direction
  return { L, S, A }
}
function bend({ L, S, A }, lateralDeg, forwardDeg) {
  // lateral bend about A: positive = towards the left shoulder (right shoulder goes up)
  const l = lateralDeg * D2R
  let S1 = rot(S, A, -l), L1 = rot(L, A, -l)
  // sign check: we want S1 to tilt towards +L for positive l
  if (dot(S1, L) * Math.sign(lateralDeg || 1) < 0) { S1 = rot(S, A, l); L1 = rot(L, A, l) }
  const A1 = cross(L1, S1)
  const w = forwardDeg * D2R
  let S2 = rot(S1, L1, w)
  if (dot(S2, A1) * Math.sign(forwardDeg || 1) < 0) S2 = rot(S1, L1, -w)
  return { L: L1, S: S2, A: cross(L1, S2) }
}
function section5() {
  console.log('\n=== 5. Trunk angles seen by each view ===')
  // D1: orthographic onto (y,z) plane. Rear (level, looking +y): onto (x,z).
  const d1 = (v) => ({ ang: deg(Math.atan2(v[1], v[2])), len: Math.hypot(v[1], v[2]) })
  const rearA = (v) => ({ ang: deg(Math.atan2(-v[0], v[2])), len: Math.hypot(v[0], v[2]) })
  const lineTilt2D = (v, horizIdx) => deg(Math.atan2(v[2], Math.abs(v[horizIdx]))) // elevation of a line in a plane
  console.log(' Trophy: shoulder line yaw per Fett 2021 (deuce -105.6, ad -120.5). Lateral lean away from net (front shoulder up) 30 deg, back-arch/forward lean 0 or 10 deg')
  for (const [court, yaw] of [['deuce', -105.6], ['ad', -120.5]]) for (const fwd of [0, -10, 10]) {
    const fr = trunkFrame(yaw)
    const b = bend(fr, -30, fwd) // negative lateral = towards right shoulder (away from net at trophy)
    const t = d1(b.S), r = rearA(b.S)
    const trueTilt = deg(Math.asin(Math.abs(b.L[2])))
    console.log(`  ${court}, fwd ${fwd}: 3D trunk axis from vertical ${deg(Math.acos(b.S[2])).toFixed(1)}; D1 2D trunk angle ${t.ang.toFixed(1)} (from vertical); rear 2D ${r.ang.toFixed(1)}; shoulder-line 3D elevation ${trueTilt.toFixed(1)}, D1 2D ${lineTilt2D(b.L, 1).toFixed(1)} (visible length ${Math.hypot(b.L[1], b.L[2]).toFixed(2)}), rear 2D ${lineTilt2D(b.L, 0).toFixed(1)} (visible length ${Math.hypot(b.L[0], b.L[2]).toFixed(2)})`)
  }
  console.log(' Separation at trophy: thorax lateral bend 30, pelvis obliquity 10 (same direction), pelvis yaw 20 deg less rotated than thorax')
  for (const [court, yaw] of [['deuce', -105.6], ['ad', -120.5]]) {
    const th = bend(trunkFrame(yaw), -30, 0), pv = bend(trunkFrame(yaw + 20), -10, 0)
    const d1Line = (v) => deg(Math.atan2(v[2], v[1]))
    const sep2D = d1Line(th.L) - d1Line(pv.L)
    console.log(`  ${court}: true frontal separation ~20 deg; D1 2D shoulder-line minus hip-line ${sep2D.toFixed(1)} deg; hip line visible length ${Math.hypot(pv.L[1], pv.L[2]).toFixed(2)}`)
  }
  console.log(' Impact: shoulder yaw per Fett 2021 (deuce +24.9, ad +6.2). Shoulder-over-shoulder (lateral) 48 deg, forward lean 20 deg')
  for (const [court, yaw] of [['deuce', 24.9], ['ad', 6.2]]) for (const lat of [0, 30, 48]) {
    const b = bend(trunkFrame(yaw), lat, 20)
    const t = d1(b.S), r = rearA(b.S)
    console.log(`  ${court}, lateral ${lat}: D1 2D trunk angle ${t.ang.toFixed(1)} (true forward 20); rear 2D ${r.ang.toFixed(1)}; shoulder-line 3D elevation ${deg(Math.asin(Math.abs(b.L[2]))).toFixed(1)}, rear 2D ${lineTilt2D(b.L, 0).toFixed(1)} (len ${Math.hypot(b.L[0], b.L[2]).toFixed(2)}), D1 2D ${lineTilt2D(b.L, 1).toFixed(1)} (len ${Math.hypot(b.L[1], b.L[2]).toFixed(2)})`)
  }
}

// ---------- 6. Audio flight-time speed ----------
function section6() {
  console.log('\n=== 6. Audio contact-to-bounce speed, D1 camera ===')
  const cam = [7.5, 0, 1.4]
  const cTrue = () => 331.3 + 0.606 * U(10, 38) // outdoor air 10-38 C
  const zones = { T: [-1.372, 0], body: [-2.743, -1.372], wide: [-4.115, -2.743] }
  // Off-axis angle of the target box from the D1 optical axis (-x direction)
  const offAxis = (x, y) => deg(Math.atan2(y, cam[0] - x))
  console.log(`  Off-axis angle of bounce points: T corner ${offAxis(0, 18.285).toFixed(0)} deg, box centre ${offAxis(-2.06, 15.1).toFixed(0)}, wide/short ${offAxis(-4.1, 12.5).toFixed(0)}; horizontal half-FOV 24 mm ${deg(fov(24).hHalf).toFixed(1)}, 13 mm ${deg(fov(13).hHalf).toFixed(1)}`)
  function run({ knowZone, knowDepth, bounceSigma, label }) {
    const errs = []
    for (let i = 0; i < 40000; i++) {
      const Cc = [U(0.4, 1.0), U(0, 0.6), U(2.3, 2.8)]
      const zoneName = ['T', 'body', 'wide'][Math.floor(rand() * 3)]
      const [x0, x1] = zones[zoneName]
      const B = [U(x0, x1), U(12.9, 18.2), 0]
      const Lp = norm(sub(B, Cc)) * U(1.005, 1.02) // arc slightly longer than the chord
      const v0 = U(90, 160) / 3.6
      const Ld = U(36, 55)
      const T = Ld * Math.expm1(Lp / Ld) / v0
      const c = cTrue()
      const heard = T + (norm(sub(B, cam)) - norm(sub(Cc, cam))) / c + N(0, 0.001) - N(0, bounceSigma)
      // estimation
      const CcE = [0.7, 0.3, 2.55]
      let BE
      if (knowDepth === 'half') BE = [(x0 + x1) / 2, B[1] < 15.55 ? 14.2 : 16.9, 0]
      else if (knowDepth) BE = [B[0] + N(0, 0.1), B[1] + N(0, 0.3), 0]
      else if (knowZone) BE = [(x0 + x1) / 2, 15.6, 0]
      else BE = [-2.06, 15.6, 0]
      const cE = 347
      const TE = heard - (norm(sub(BE, cam)) - norm(sub(CcE, cam))) / cE
      const LpE = norm(sub(BE, CcE)) * 1.012
      const v0E = 45.5 * Math.expm1(LpE / 45.5) / TE
      errs.push(v0E / v0 - 1)
    }
    const abs = errs.map(Math.abs)
    console.log(`  ${label}: median |error| ${(100 * pct(abs, 0.5)).toFixed(1)}%, 90th pct |error| ${(100 * pct(abs, 0.9)).toFixed(1)}%, bias ${(100 * mean(errs)).toFixed(1)}%, 90% interval ${(100 * pct(errs, 0.05)).toFixed(0)}..${(100 * pct(errs, 0.95)).toFixed(0)}%`)
  }
  run({ knowZone: false, knowDepth: false, bounceSigma: 0.005, label: 'D1, no target tag (whole box)' })
  run({ knowZone: true, knowDepth: false, bounceSigma: 0.005, label: 'D1, player target tag T/body/wide, depth unknown' })
  run({ knowZone: true, knowDepth: 'half', bounceSigma: 0.005, label: 'D1, target tag plus player-tagged depth half (short/deep)' })
  run({ knowZone: true, knowDepth: true, bounceSigma: 0.005, label: 'Bounce located in video (rear view, +-0.3 m depth)' })
  run({ knowZone: true, knowDepth: true, bounceSigma: 0.010, label: 'Bounce located in video, bounce onset sigma 10 ms' })
  // share of the error from depth vs sound delay
  const dd = (y) => norm(sub([-2.06, y, 0], [0.7, 0.3, 2.55]))
  console.log(`  Path length for bounce depth 12.9 / 15.6 / 18.2 m: ${dd(12.9).toFixed(1)} / ${dd(15.6).toFixed(1)} / ${dd(18.2).toFixed(1)} m`)
  const sdel = (y) => (norm(sub([-2.06, y, 0], cam)) - norm(sub([0.7, 0.3, 2.55], cam))) / 343
  console.log(`  Sound-delay correction for the same depths: ${(1000 * sdel(12.9)).toFixed(0)} / ${(1000 * sdel(15.6)).toFixed(0)} / ${(1000 * sdel(18.2)).toFixed(0)} ms`)
  for (const kmh of [100, 130, 160]) {
    const T = 45.5 * Math.expm1(dd(15.6) / 45.5) / (kmh / 3.6)
    console.log(`  Flight time at ${kmh} km/h launch over ${dd(15.6).toFixed(1)} m: ${(T * 1000).toFixed(0)} ms`)
  }
  console.log(`  Distance phone-to-bounce: ${norm(sub([-2.06, 15.6, 0], cam)).toFixed(1)} m; phone-to-contact ${norm(sub([0.7, 0.3, 2.55], cam)).toFixed(1)} m; inverse-square level drop bounce vs a bounce 5 m away: ${(20 * Math.log10(norm(sub([-2.06, 15.6, 0], cam)) / 5)).toFixed(1)} dB`)
}

const which = process.argv[2]
if (!which || which === '1') section1()
if (!which || which === '2') section2()
if (!which || which === '3') section3()
if (!which || which === '4') section4()
if (!which || which === '5') section5()
if (!which || which === '6') section6()

// ---------- 4b. Two-level band (deep >= 45 vs not) ----------
if (process.argv[2] === '4b') {
  // reuse section4 internals by re-running a light copy
  const H = 1.75, L1 = 0.245 * H, L2 = 0.246 * H, ankleZ = 0.039 * H
  const f24 = 540 / Math.tan(fov(24).vHalf)
  const sideC = levelCam([8.0, 0, 1.4], [-1, 0, 0], f24)
  const rearC = makeCam([0.75, -6.0, 2.8], [0.75, 0, 0.9], f24)
  const ankles = { front: [0.75, 0.0, ankleZ], back: [0.93, -0.26, ankleZ] }
  for (const [muF, muB] of [[25, 10], [45, 20], [5, 0]]) {
    const stats = {}
    for (const leg of ['front', 'back']) for (const k of ['E1', 'E2', 'E4']) stats[leg + k] = { wrong: 0, n: 0 }
    for (let i = 0; i < 30000; i++) {
      const phi = U(5, 85)
      const r = U(0.4, 0.6)
      const b2 = phi * r * D2R, b1 = phi * (1 - r) * D2R
      for (const leg of ['front', 'back']) {
        const az = (leg === 'front' ? N(muF, 15) : N(muB, 12)) * D2R
        const u = [Math.cos(az), Math.sin(az), 0]
        const A = ankles[leg]
        let K = add(A, add(mul(u, L2 * Math.sin(b2)), [0, 0, L2 * Math.cos(b2)]))
        let Hp = add(K, add(mul(u, -L1 * Math.sin(b1)), [0, 0, L1 * Math.cos(b1)]))
        const g = N(8, 6) * D2R
        K = add(A, rot(sub(K, A), [1, 0, 0], -g)); Hp = add(A, rot(sub(Hp, A), [1, 0, 0], -g))
        const occl = leg === 'front' ? 2 : 1
        const j = (X, s) => add(X, [N(0, s), N(0, s), N(0, s)])
        const o1 = [[Hp, 0.02], [K, 0.015], [A, 0.015]].map(([X, s]) => project(sideC, j(X, s)))
        const o2 = [[Hp, 0.02 * occl], [K, 0.015 * occl], [A, 0.015 * occl]].map(([X, s]) => project(rearC, j(X, s)))
        const e1 = 180 - angle2D(...o1), e2 = 180 - angle2D(...o2)
        const depth = project(sideC, A)[2]
        const toZ = (p) => sideC.P[2] - p[1] * depth / sideC.f
        const e4 = R2D * (Math.acos(clamp((toZ(o1[0]) - toZ(o1[1])) / (L1 * (1 + N(0, 0.01))), -1, 1)) + Math.acos(clamp((toZ(o1[1]) - toZ(o1[2])) / (L2 * (1 + N(0, 0.01))), -1, 1)))
        for (const [k, e] of [['E1', e1], ['E2', e2], ['E4', e4]]) { const s = stats[leg + k]; s.n++; if ((phi >= 45) !== (e >= 45)) s.wrong++ }
      }
    }
    console.log(`Two-level band (deep >= 45 vs not), front knee azimuth ${muF}, back ${muB}: ` + Object.entries(stats).map(([k, s]) => `${k} ${(100 * s.wrong / s.n).toFixed(0)}%`).join(', '))
  }
}

// ---------- 1b. Minimum distance with the best upward tilt (envelope must fit the vertical FOV) ----------
if (process.argv[2] === '1b') {
  console.log('Min camera distance from centre mark (camera-side court: +1.3 m) with optimal tilt; envelope -0.1..top; tilt needed')
  for (const [name, f] of Object.entries(lens)) {
    const vh = fov(f).vHalf
    for (const top of [4.3, 4.5, 4.7]) {
      const cells = []
      for (const h of [1.2, 1.4, 1.6]) {
        let D = 1
        while (Math.atan((top - h) / D) + Math.atan((h + 0.1) / (D + 0.3)) > 2 * vh) D += 0.01
        const tilt = Math.atan((top - h) / D) - vh
        cells.push(`h ${h}: ${(D + 1.3).toFixed(1)} m (tilt ${deg(tilt).toFixed(1)} deg)`)
      }
      console.log(`  ${name}, top ${top}: ${cells.join('; ')}`)
    }
  }
  // Tilt needed at fixed camera positions
  console.log('Tilt needed for a 4.5 m top (and max before feet leave frame) at camera 7.3 m (between courts) and 8.5 m (TA club minimum side run-off), camera-side court:')
  for (const [name, f] of Object.entries(lens)) {
    const vh = fov(f).vHalf
    for (const Dc of [7.3, 8.5]) for (const h of [1.2, 1.4, 1.6]) {
      const Db = Dc - 1.3
      const need = deg(Math.atan((4.5 - h) / Db) - vh), max = deg(vh - Math.atan((h + 0.1) / (Db + 0.3)))
      console.log(`  ${name}, camera ${Dc} m, h ${h}: tilt needed ${need.toFixed(1)} deg, max ${max.toFixed(1)} deg${need > max ? '  -> NOT FEASIBLE' : ''}`)
    }
  }
}
