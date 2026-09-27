/**
 * Measured pose noise on the synthetic corpus (METRICS §5.5): cleaned MediaPipe landmarks from the
 * app pipeline (`smoke.mjs --full` dumps) against the generator's truth landmarks, in body heights.
 * Also the left/right mirror rate before and after the engine's relabelling step.
 *
 *   app/node_modules/.bin/tsx tools/validate/metrics-eval.noise.ts
 * Output: validation/results/metrics/noise.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LM, type PoseFrame } from '../../app/src/analysis/types.ts'
import { cameraModel } from '../../app/src/analysis/serve/geometry.ts'
import { buildTrack, localQuadratic, lowestFootY, midHip, pt, velocityHalfWindow, type PoseTrack } from '../../app/src/analysis/serve/track.ts'
import { relabelSides } from '../../app/src/analysis/serve/relabel.ts'
import { truthToPoseFrames } from '../../app/src/analysis/pose/injected.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dumpDir = join(repoRoot, 'validation/results/metrics/pipeline/full')
const corpus = join(repoRoot, 'validation/synthetic/clips')

function sd(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
function med(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[s.length >> 1] : NaN
}
/** Random part: error minus its 0.5 s running median (removes slow bias). */
function highPass(ts: number[], es: number[]): number[] {
  return es.map((e, i) => e - med(es.filter((_, j) => Math.abs(ts[j] - ts[i]) <= 0.25)))
}

const out: Record<string, unknown>[] = []
const acc: Record<string, number[]> = {}
const push = (k: string, v: number) => {
  if (Number.isFinite(v)) (acc[k] ??= []).push(v)
}

for (const f of readdirSync(dumpDir).filter((x) => x.endsWith('.json'))) {
  const clip = f.replace('.json', '')
  if (!existsSync(join(corpus, clip, 'truth.json'))) continue
  const d = JSON.parse(readFileSync(join(dumpDir, f), 'utf8'))
  if (!d.ok) continue
  const t = JSON.parse(readFileSync(join(corpus, clip, 'truth.json'), 'utf8'))
  if (t.settings.view !== 'side' || t.serves.length !== 1) continue
  const R = t.settings.extrinsics.R
  const cam = cameraModel({ width: t.video.width, height: t.video.height }, {
    source: 'in-app-native', declaredView: 'side', serveSide: 'deuce', serveNumber: 1, handedness: t.player.handedness, playerHeightM: t.player.heightM,
    playerHeightSource: 'entered', hitSoundTiming: false, orientationSamples: [{ tMs: 0, pitchDeg: (Math.asin(R[8]) * 180) / Math.PI, rollDeg: 0 }],
  })
  const poses: PoseFrame[] = d.pose.clean.frames.map((p: { frameIndex: number; tReal: number; landmarks: number[][] | null }) => ({
    frameIndex: p.frameIndex, tReal: p.tReal, score: 1, source: 'mediapipe',
    landmarks: p.landmarks ? p.landmarks.map((r) => ({ x: r[0], y: r[1], z: r[2], visibility: r[3] })) : null,
  }))
  const truthFrames = truthToPoseFrames(t.frames.map((x: { frameIndex: number; tReal: number; landmarks: unknown }) => ({ frameIndex: x.frameIndex, tReal: x.tReal, landmarks: x.landmarks as never })), 1)
  const mp = buildTrack(poses, cam)
  const tr = buildTrack(truthFrames, cam)
  const byFrame = new Map<number, number>()
  for (let i = 0; i < tr.t.length; i++) byFrame.set(tr.frameIndex[i], i)
  const H = t.player.heightM
  const staturePx = (() => {
    // Truth standing height in HU from frame 5 truth landmarks is not exact; use the generator's stature via world z extents.
    return NaN
  })()
  void staturePx
  const ev = t.serves[0].events
  const rel = ev.tossRelease.tReal
  const contact = ev.contact.tReal
  // Body height in HU from truth: head top ≈ nose + 0.096 H is not exact; use the lowest-foot to (eyes − 0.066 H) median in setup.
  const bh = (() => {
    const hs: number[] = []
    for (let i = 0; i < tr.t.length; i++) {
      if (tr.t[i] > 0.6) break
      const fl = lowestFootY(tr, i, 0.1)
      const nose = pt(tr, i, LM.NOSE, 0)
      if (fl !== null && nose) hs.push(fl - nose.y)
    }
    return med(hs) / (1 - 0.096) // nose is ~9.6% of stature below the vertex
  })()
  const err = (track: PoseTrack, i: number, j: number, k: number) => {
    const a = pt(track, i, k, 0.3)
    const b = pt(tr, j, k, 0)
    return a && b ? { dx: ((a.x - b.x) * track.aspect) / bh, dy: (a.y - b.y) / bh } : null
  }
  // Mirror rate before relabelling (whole-body fit, labels vs mirrored).
  const mirrorRate = (track: PoseTrack) => {
    let m = 0
    let n = 0
    for (let i = 0; i < track.t.length; i++) {
      const j = byFrame.get(track.frameIndex[i])
      if (j === undefined) continue
      let id = 0
      let sw = 0
      for (const [a, b] of [[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28], [31, 32]]) {
        const pa = pt(track, i, a, 0)
        const pb = pt(track, i, b, 0)
        const ta = pt(tr, j, a, 0)
        const tb = pt(tr, j, b, 0)
        if (!pa || !pb || !ta || !tb) continue
        const dd = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot((p.x - q.x) * track.aspect, p.y - q.y)
        id += dd(pa, ta) + dd(pb, tb)
        sw += dd(pa, tb) + dd(pb, ta)
      }
      if (Math.abs(id - sw) < 0.02 * bh) continue
      n++
      if (sw < id) m++
    }
    return n ? m / n : NaN
  }
  const before = mirrorRate(mp)
  const netDir = t.player.handedness === 'right' ? 1 : -1
  relabelSides(mp, {
    handedness: t.player.handedness,
    netDir,
    view: 'side',
    bodyHeightHU: bh,
    toss: { tStart: rel - 0.35, tEnd: rel + 0.15 },
    contactT: contact,
    stance: { tStart: Math.max(0, rel - 1.2), tEnd: rel + 0.05 },
    from: 0,
    to: mp.t.length - 1,
  })
  const after = mirrorRate(mp)
  push('mirrorBefore', before)
  push('mirrorAfter', after)
  // Joint errors after relabelling.
  const series: Record<string, { t: number[]; e: number[] }> = {}
  const add = (k: string, tt: number, e: number) => {
    const s = (series[k] ??= { t: [], e: [] })
    s.t.push(tt)
    s.e.push(e)
  }
  for (let i = 0; i < mp.t.length; i++) {
    const j = byFrame.get(mp.frameIndex[i])
    if (j === undefined) continue
    const tt = mp.t[i]
    const mh = midHip(mp, i, 0.3)
    const th = midHip(tr, j, 0)
    if (mh && th) add('midHipY', tt, (mh.y - th.y) / bh)
    for (const [name, k] of [['toeL', LM.LEFT_FOOT_INDEX], ['toeR', LM.RIGHT_FOOT_INDEX], ['wristL', LM.LEFT_WRIST], ['wristR', LM.RIGHT_WRIST], ['shoulderL', LM.LEFT_SHOULDER], ['hipL', LM.LEFT_HIP]] as const) {
      const e = err(mp, i, j, k)
      if (e) {
        add(`${name}X`, tt, e.dx)
        add(`${name}Y`, tt, e.dy)
      }
    }
    const lf = lowestFootY(mp, i, 0.3)
    const lt = lowestFootY(tr, j, 0)
    if (lf !== null && lt !== null && tt < rel) add('lowestFootY(stance)', tt, (lf - lt) / bh)
  }
  const clipOut: Record<string, unknown> = { clip, mirrorBefore: before, mirrorAfter: after, bodyHeightHU: bh }
  for (const [k, s] of Object.entries(series)) {
    const hp = highPass(s.t, s.e)
    clipOut[k] = { bias: med(s.e), totalSd: sd(s.e), randomSd: sd(hp) }
    push(`${k}.bias`, med(s.e))
    push(`${k}.randomSd`, sd(hp))
    push(`${k}.totalSd`, sd(s.e))
  }
  // Smoothed speed noise of the mid-hip and a wrist in the still setup (first 0.5 s).
  const hw = velocityHalfWindow(mp)
  const vs: number[] = []
  const ws: number[] = []
  for (let i = 0; i < mp.t.length && mp.t[i] < 0.5; i++) {
    const f = localQuadratic(mp, (k) => midHip(mp, k, 0.3)?.y ?? null, mp.t[i], hw)
    if (f) vs.push(Math.abs(f.slope) / bh)
    const g = localQuadratic(mp, (k) => pt(mp, k, LM.LEFT_WRIST, 0.3)?.y ?? null, mp.t[i], hw)
    if (g) ws.push(Math.abs(g.slope) / bh)
  }
  clipOut.hipSpeedNoiseBHs = med(vs)
  clipOut.wristSpeedNoiseBHs = med(ws)
  push('hipSpeedNoiseBHs', med(vs))
  push('wristSpeedNoiseBHs', med(ws))
  void H
  out.push(clipOut)
}
const summary = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { median: med(v), n: v.length, p90: [...v].sort((a, b) => a - b)[Math.floor(0.9 * (v.length - 1))] }]))
writeFileSync(join(repoRoot, 'validation/results/metrics/noise.json'), JSON.stringify({ generated: new Date().toISOString(), note: 'Cleaned MediaPipe (app pipeline) vs truth landmarks, side-view single-serve clips, body heights (BH). randomSd = error minus its 0.5 s running median.', summary, clips: out }, null, 1))
console.log(JSON.stringify(summary, null, 1))
