/**
 * The real pipeline scored against truth (N2.8): the Bath serves drawn as a
 * body, filmed into a video, read by the app, and every card reading set
 * against the same reading taken off the true markers.
 *
 * Dev only (`pipeline.html`, never bundled). Run by `node scripts/pipeline.mjs`.
 *
 * HOW. Each Bath serve (42 serves, 3D markers at 180 Hz, `src/dev/mocap/bath.ts`)
 * is filmed by the virtual phone at the filming guide's placement
 * (`filmMocap`: 4.5 m to the server's left, lens at 1 m, upright 9:16, 30 fps),
 * which gives every MediaPipe landmark where the real joint was. The app's own
 * lit figure (`paintPose`) is painted on those landmarks into each frame, with
 * the captured racket, on a plain court. The frames go through the browser's
 * video encoder on exact timestamps (`webm.ts`) and the file is read by
 * `analyzeServe`, the app's whole path: the framing check, the person crop,
 * MediaPipe, the swap guard, RTMPose's refine, levelling, keyframes, measure,
 * diagnose and triage. The ball, the racket boxes, the speed and the stills are
 * skipped: there is no ball in the picture and the truth has none either.
 *
 * THE TRUTH READ. The same engine, on the true landmarks of exactly the frames
 * the pipeline sampled, filed under the same times (`readEngine`, which follows
 * `runAnalysis` step for step with nothing to refine and no ball). So the only
 * difference between the two reads is what the pose models made of the
 * picture. A reading that is wrong in both is the engine's, or the camera's,
 * and is not counted here: the mocap bench measures that.
 *
 * AROUND IT. Where the framing check refuses, the file is read once more past
 * it, as a basket sweep reads, so the rest of the path is measured on every
 * serve. The same engine steps are run on MediaPipe's own frames, which must
 * agree with the pipeline's first keyframe search. And two reads the app does
 * not make (`WHAT_IFS`): RTMPose on every frame before the keyframes.
 * docs/next/LEDGER.md, N2.8, has what all of it found.
 *
 * THE DOMAIN GAP, said plainly. A painted mannequin is not a person in a phone
 * video: it has no face, no hair, no clothes that fold, no skin, no motion blur,
 * no compression smear of a real phone, no other people and no busy court
 * behind it, and its limbs are smooth tapers centred exactly on the joints. A
 * model may find it easier than a person (clean edges, joints where the
 * landmarks are) or harder (it was never trained on anything like it, and its
 * person detector leans on the face). So this measures the pipeline on one
 * kind of picture with known truth, not its accuracy on players.
 */
import { analyzeServe, assessQuality, pickFocus } from '../../lib/analysis/analyze'
import { overallOf } from '../../lib/analysis/coaching'
import { detectWithContact } from '../../lib/analysis/contact'
import { VISIBLE_FLOOR } from '../../lib/analysis/framingIssues'
import { diagnose } from '../../lib/analysis/diagnose'
import { jointAngle, keyVisibility, LM, signedElevationFromHorizontal, type Side } from '../../lib/analysis/geometry'
import { bridgeDetectionGaps, type PoseSample } from '../../lib/analysis/kalman'
import { measure } from '../../lib/analysis/metrics'
import { filmMocap, swingCompleted, type MocapServe } from '../../lib/analysis/mocapServe'
import { buildPhases, detectServe, type Skeleton } from '../../lib/analysis/phases'
import { assessSpatial, levelFrames, levelPivot, levelled, turnedPicture } from '../../lib/analysis/spatial'
import { unswapFrames } from '../../lib/analysis/swapGuard'
import { assessResilience, triage } from '../../lib/analysis/triage'
import { NotAServeError, type Analysis, type Frame, type Fundamental, type Landmark } from '../../lib/analysis/types'
import { causalFocus } from '../../lib/analysis/verdict'
import type { Material } from '../../lib/figure/athlete'
import { paintPose, type Placement } from '../../lib/figure/stage'
import { statureOf } from '../../lib/figure/shape'
import { loadEngine, nextVideoTimestamp } from '../../lib/pose/poseEngine'
import { poseDetector } from '../../lib/pose/poseDetect'
import { loadRefineEngine, readPose } from '../../lib/pose/refineEngine'
import { boxFromFrame, refineFrame } from '../../lib/pose/rtmpose'
import { bathServe } from '../mocap/bath'
import { readMat } from '../mocap/mat'
import { compareReadings, formatSummary, summarise, type PipelineReading, type ServeRow, type WhatIf } from './pipelineScore'
import { muxWebm, type WebmFrame } from './webm'

const params = new URLSearchParams(location.search)
/** The fixture's six by default: the spread `bench-mocap.mjs` chose. */
const SERVES = (params.get('serves') ?? '1,6,39,57,63,112').split(',').filter(Boolean)
const LOOK = params.get('look') ?? 'court'
const FPS = Number(params.get('fps') ?? 30)
/** Seconds of the first captured pose before the motion: a clip filmed as the guide asks starts a second before the toss. */
const LEAD = 1.0
/** Seconds of the last pose held after the capture ends, so the clip does not stop on the follow-through. */
const TAIL = 0.4
/** The picture: upright, 9:16, as the guide's phone. */
const H = 1280
const W = 720
/** Past this a read is abandoned, so one stuck serve cannot hold the batch. */
const READ_LIMIT_MS = 300_000

const out = document.getElementById('out')!
const log = (s: string) => {
  out.textContent += s + '\n'
  console.log(s)
}

/* ------------------------------------------------------------------ data */

const inflate = async (b: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([new Uint8Array(b)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())

const NEED = new Error('inflate first')

/**
 * `readMat` inflates synchronously, as Node can; a browser cannot. So it is run
 * until it asks for a compressed element, that element is inflated, and it is
 * run again with the answer to hand.
 */
async function readMatAsync(file: Uint8Array) {
  const done = new Map<string, Uint8Array>()
  for (let tries = 0; tries < 16; tries++) {
    let wanted: Uint8Array | undefined
    try {
      return readMat(file, (b) => {
        const got = done.get(`${b.byteOffset}:${b.length}`)
        if (got) return got
        wanted = b
        throw NEED
      })
    } catch (e) {
      if (e !== NEED || !wanted) throw e
    }
    done.set(`${wanted.byteOffset}:${wanted.length}`, await inflate(wanted))
  }
  throw new Error('too many compressed elements')
}

async function loadServe(n: string): Promise<MocapServe> {
  // Same origin: the dev server hands over `bench-data/`, fetched beforehand by `npm run setup:bench`.
  const res = await fetch(`/bench-data/bath-serve/4D_${n}.mat`)
  if (!res.ok) throw new Error(`4D_${n}.mat: ${res.status}`)
  const [array] = await readMatAsync(new Uint8Array(await res.arrayBuffer()))
  return bathServe(array.data, { id: `bath-${n}` })
}

/* --------------------------------------------------------------- picture */

interface Look {
  material: Material
  paint: (ctx: CanvasRenderingContext2D) => void
}

/** A blue hard court under a dark green fence, the baseline running away from the lens through the server's feet. */
function court(ctx: CanvasRenderingContext2D) {
  const horizon = H * 0.5
  ctx.fillStyle = '#8fa9bd'
  ctx.fillRect(0, 0, W, H * 0.14)
  ctx.fillStyle = '#21402f'
  ctx.fillRect(0, H * 0.14, W, horizon - H * 0.14)
  const g = ctx.createLinearGradient(0, horizon, 0, H)
  g.addColorStop(0, '#2f5f8c')
  g.addColorStop(1, '#3f78ad')
  ctx.fillStyle = g
  ctx.fillRect(0, horizon, W, H - horizon)
  // The guide's phone stands on the baseline's line, so the baseline is a
  // wedge from the bottom of the picture to the vanishing point.
  ctx.fillStyle = '#e8edf2'
  ctx.beginPath()
  ctx.moveTo(W / 2 - 1, horizon)
  ctx.lineTo(W / 2 + 1, horizon)
  ctx.lineTo(W / 2 + 16, H)
  ctx.lineTo(W / 2 - 16, H)
  ctx.closePath()
  ctx.fill()
}

/** The app's own dark stage, as the report draws the figure. */
function stage(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#0a0c10'
  ctx.fillRect(0, 0, W, H)
  const g = ctx.createRadialGradient(W * 0.45, H * 0.4, 0, W * 0.45, H * 0.4, H * 0.6)
  g.addColorStop(0, 'rgba(120, 140, 170, 0.34)')
  g.addColorStop(1, 'rgba(10, 12, 16, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

const plain = (colour: string) => (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, W, H)
}

const LOOKS: Record<string, Look> = {
  court: { material: 'silver', paint: court },
  stage: { material: 'graphite', paint: stage },
  light: { material: 'graphite', paint: plain('#c9ced6') },
}

/** The filmed serve with its lead and a held tail, one frame per file frame. */
function filmed(serve: MocapServe): Frame[] {
  const frames = filmMocap(serve, { fps: FPS, lead: LEAD })
  const last = frames[frames.length - 1]
  for (let i = 1; i <= Math.round(TAIL * FPS); i++) {
    frames.push({ ...last, index: last.index + i, t: last.t + i / FPS })
  }
  return frames
}

/** Landmarks are in frame heights, x already times the aspect, so a frame height is the canvas height. */
function placementFor(frames: Frame[]): Placement {
  const place = (p: { x: number; y: number }) => ({ x: p.x * H, y: p.y * H })
  let stature = 0
  let floor = 0
  for (const f of frames) {
    const placed = f.image.map(place)
    stature = Math.max(stature, statureOf(placed))
    for (const k of [LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe]) floor = Math.max(floor, placed[k].y)
  }
  return { place, scale: H, ox: 0, oy: 0, stature, floor }
}

function paintFrame(ctx: CanvasRenderingContext2D, look: Look, frame: Frame, at: Placement, hand: Side) {
  look.paint(ctx)
  paintPose(ctx, frame, at, { racket: hand, material: look.material, ground: 1, still: false })
}

/** The serve as a WebM, each frame on the instant it was drawn for. */
async function renderClip(frames: Frame[], look: Look, hand: Side): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const at = placementFor(frames)
  const chunks: WebmFrame[] = []
  let failed: Error | undefined
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      chunks.push({ timestamp: chunk.timestamp, key: chunk.type === 'key', data })
    },
    error: (e) => (failed = e as Error),
  })
  encoder.configure({ codec: 'vp8', width: W, height: H, bitrate: 6_000_000, framerate: FPS })
  for (let i = 0; i < frames.length; i++) {
    paintFrame(ctx, look, frames[i], at, hand)
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
    encoder.encode(frame, { keyFrame: i % FPS === 0 })
    frame.close()
    // Keep the encoder's queue short, so a slow machine does not pile frames up in memory.
    while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 5))
  }
  await encoder.flush()
  encoder.close()
  if (failed) throw failed
  chunks.sort((a, b) => a.timestamp - b.timestamp)
  const bytes = muxWebm({ codec: 'V_VP8', width: W, height: H, fps: FPS }, chunks)
  return new Blob([new Uint8Array(bytes)], { type: 'video/webm' })
}

/** How long the browser says a file is, or 0 when it will not say. */
async function lengthOf(url: string): Promise<number> {
  const v = document.createElement('video')
  v.muted = true
  v.src = url
  await new Promise<void>((resolve) => {
    v.onloadedmetadata = () => resolve()
    v.onerror = () => resolve()
  })
  const d = Number.isFinite(v.duration) ? v.duration : 0
  v.removeAttribute('src')
  v.load()
  return d
}

/* ----------------------------------------------------------------- reads */

function readingOf(o: {
  outcome: string
  fundamentals: Fundamental[]
  overall?: number
  focus?: string
  flaws: string[]
  hand?: string
  view?: string
  swingSamples?: number
  phases?: Record<string, number>
}): PipelineReading {
  const metrics: Record<string, number> = {}
  const units: Record<string, string> = {}
  for (const f of o.fundamentals)
    for (const m of f.metrics) {
      metrics[m.id] = m.value
      units[m.id] = m.unit
    }
  return { outcome: o.outcome, overall: o.overall, focus: o.focus, flaws: o.flaws, metrics, units, hand: o.hand, view: o.view, swingSamples: o.swingSamples, phases: o.phases }
}

const phasesOf = (phases: { id: string; t: number }[]) => Object.fromEntries(phases.map((p) => [p.id, Math.round(p.t * 1000) / 1000]))

function pipelineReading(a: Analysis): PipelineReading {
  return readingOf({
    outcome: a.triage?.status === 'rejected' ? `refused: ${a.triage.reason}` : 'measured',
    fundamentals: a.fundamentals,
    overall: a.overall,
    focus: a.focus?.title,
    flaws: (a.diagnosis?.flaws ?? []).filter((f) => f.detected).map((f) => f.flaw).sort(),
    hand: a.handedness,
    view: a.quality.view,
    swingSamples: a.quality.swingSamples,
    phases: phasesOf(a.phases),
  })
}

/**
 * `runAnalysis`'s steps after the pose models, on frames that need no model:
 * the swap guard, the keyframes (the other hand once, if the detector names
 * it), levelling, contact without a ball, the camera, the quality, measure,
 * diagnose and triage, with the same arguments. Kept in step by hand, like
 * `src/dev/mocap/engine.ts`.
 */
function readEngine(input: Frame[], fps: number, aspect: number): { reading?: PipelineReading; refusal?: string } {
  let frames = unswapFrames(input).frames
  for (const f of frames) f.visibility = keyVisibility(f)
  const turned = turnedPicture(frames)
  if (turned) return { refusal: turned.message }
  const detect = (): Skeleton => {
    try {
      return detectServe(frames, fps)
    } catch (err) {
      if (err instanceof NotAServeError && err.suggestedHand) return detectServe(frames, fps, err.suggestedHand)
      throw err
    }
  }
  try {
    let skel = detect()
    const tilt = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
    if (levelled(tilt.roll_deg) !== 0) {
      frames = levelFrames(frames, tilt.roll_deg, levelPivot(frames))
      for (const f of frames) f.visibility = keyVisibility(f)
      skel = detect()
    }
    const fused = detectWithContact(frames, fps, skel.racket !== skel.detectedRacket ? skel.racket : undefined, undefined, skel)
    skel = fused.skel
    const contact = fused.contact
    const resilience = assessResilience(frames, skel)
    const quality = assessQuality(frames, skel, fps, resilience.blur)
    const fundamentals = measure(frames, skel, quality.view === 'side', {
      serveType: 'flat',
      contact,
      confidence: {
        frames,
        skel,
        swingSamples: quality.swingSamples,
        view: quality.view,
        contactAgreement: contact.agreement,
        depthUnreliable: resilience.spatial.depth_unreliable,
        blur: resilience.blur,
      },
    })
    const diagnosis = diagnose(frames, skel, { serveType: 'flat', aspect, blur: resilience.blur, contactAgreement: contact.agreement })
    const verdict = triage(diagnosis, resilience)
    return {
      reading: readingOf({
        outcome: verdict.status === 'rejected' ? `refused: ${verdict.reason}` : 'measured',
        fundamentals,
        overall: overallOf(fundamentals),
        focus: (causalFocus(verdict) ?? pickFocus(fundamentals))?.title,
        flaws: diagnosis.flaws.filter((f) => f.detected).map((f) => f.flaw).sort(),
        hand: skel.racket,
        view: quality.view,
        swingSamples: quality.swingSamples,
        phases: phasesOf(buildPhases(frames, skel.keys, skel.times)),
      }),
    }
  } catch (err) {
    if (err instanceof NotAServeError) return { refusal: err.message }
    throw err
  }
}

const copyFrame = (f: Frame): Frame => ({ ...f, image: f.image.map((p) => ({ ...p })), world: f.world.map((p) => ({ ...p })) })

type Box = [number, number, number, number]

/**
 * Where RTMPose is pointed, for the two reads the app does not make. Both from
 * MediaPipe's landmarks only, never the truth.
 * - `own box`: each frame's own body box (`boxFromFrame`), as the app's refine
 *   points it, but on every frame and before the keyframes are looked for.
 * - `whole-read box`: one box round everything MediaPipe placed across the
 *   read, so a hand MediaPipe lost on one frame is still inside the crop.
 */
const WHAT_IFS: Record<string, (frames: Frame[], height: number) => (f: Frame) => Box> = {
  'RTMPose on every frame, its own box': (_frames, height) => (f) => boxFromFrame(f, height),
  'RTMPose on every frame, one box for the whole read': (frames, height) => {
    const boxes = frames.map((f) => boxFromFrame(f, height))
    const x0 = Math.min(...boxes.map((b) => b[0]))
    const y0 = Math.min(...boxes.map((b) => b[1]))
    const x1 = Math.max(...boxes.map((b) => b[0] + b[2]))
    const y1 = Math.max(...boxes.map((b) => b[1] + b[3]))
    return () => [x0, y0, x1 - x0, y1 - y0]
  },
}

/**
 * RTMPose on every frame of `frames`, read off the decoded video at each
 * frame's time, pointed by `boxOf`, folded in joint by joint as the app's
 * refine does (`refineFrame`). Undefined when the model will not load.
 */
async function refineEveryFrame(url: string, frames: Frame[], boxOf: (frames: Frame[], height: number) => (f: Frame) => Box): Promise<Frame[] | undefined> {
  let sess: Awaited<ReturnType<typeof loadRefineEngine>>
  try {
    sess = await loadRefineEngine()
  } catch {
    return undefined
  }
  const video = document.createElement('video')
  video.muted = true
  video.src = url
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('decode'))
  })
  const canvas = document.createElement('canvas')
  const out: Frame[] = []
  const box = boxOf(frames, video.videoHeight)
  try {
    for (const f of frames) {
      video.currentTime = f.t
      await new Promise((r) => (video.onseeked = r))
      const { points, scores } = await readPose(sess, video, box(f), canvas)
      out.push(refineFrame(copyFrame(f), points, scores, video.videoHeight))
    }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
  return out
}

/** The filmed frame on screen at `t`: frame k shows from k/fps, and the read samples frame middles. */
const frameAt = (film: Frame[], t: number) => film[Math.max(0, Math.min(film.length - 1, Math.floor(t * FPS + 1e-6)))]

/** The true frames for the moments the pipeline sampled, filed under the same times. */
const truthFrames = (film: Frame[], times: number[]): Frame[] =>
  times.map((t, i) => {
    const f = frameAt(film, t)
    return { ...f, index: i, t, image: f.image.map((p) => ({ ...p })), world: f.world.map((p) => ({ ...p })) }
  })

const JOINTS: Record<string, [number, number]> = {
  shoulder: [LM.leftShoulder, LM.rightShoulder],
  elbow: [LM.leftElbow, LM.rightElbow],
  wrist: [LM.leftWrist, LM.rightWrist],
  hip: [LM.leftHip, LM.rightHip],
  knee: [LM.leftKnee, LM.rightKnee],
  ankle: [LM.leftAnkle, LM.rightAnkle],
}

/** Body height in the picture, from the true landmarks, as `mocapServe` measures it. */
const heightIn = (truth: Landmark[]) => (Math.max(truth[LM.leftAnkle].y, truth[LM.rightAnkle].y) - truth[LM.nose].y) / 0.93

/**
 * Each joint's image error on one frame, as a share of body height. Read both
 * ways round and the nearer kept, as the swap guard would: a model that put
 * the left knee on the right one found the body.
 */
function jointErrors(seen: Landmark[], truth: Landmark[]): Record<string, number> {
  const tall = heightIn(truth)
  const d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y) / tall
  const direct: Record<string, number> = {}
  const crossed: Record<string, number> = {}
  for (const [name, [l, r]] of Object.entries(JOINTS)) {
    direct[name] = (d(seen[l], truth[l]) + d(seen[r], truth[r])) / 2
    crossed[name] = (d(seen[l], truth[r]) + d(seen[r], truth[l])) / 2
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
  return sum(crossed) < sum(direct) ? crossed : direct
}

function medianJoints(pairs: { seen: Landmark[]; truth: Landmark[] }[]): Record<string, number> | undefined {
  if (!pairs.length) return undefined
  const by: Record<string, number[]> = {}
  for (const p of pairs) for (const [j, v] of Object.entries(jointErrors(p.seen, p.truth))) (by[j] ??= []).push(v)
  return Object.fromEntries(
    Object.entries(by).map(([j, v]) => {
      const s = v.sort((a, b) => a - b)
      return [j, Math.round(s[Math.floor(s.length / 2)] * 10000) / 10000]
    }),
  )
}

/** A joint swapped side for side, when the model read the body crossed (as the swap guard would put it back). */
function sided(seen: Landmark[], truth: Landmark[]): (k: number) => number {
  const d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)
  let direct = 0
  let crossed = 0
  const swap: Record<number, number> = {}
  for (const [l, r] of Object.values(JOINTS)) {
    direct += d(seen[l], truth[l]) + d(seen[r], truth[r])
    crossed += d(seen[l], truth[r]) + d(seen[r], truth[l])
    swap[l] = r
    swap[r] = l
  }
  return crossed < direct ? (k) => swap[k] ?? k : (k) => k
}

const flat = (l: Landmark): Landmark => ({ ...l, z: 0 })

/**
 * The model's joint angles minus the truth's on one frame, degrees: in 3D off
 * the world landmarks, which knee bend, shoulder tilt and the elbow readings
 * use, and flat off the picture, which RTMPose refines and the heights use.
 * The knee is both legs' mean; the elbow is the racket arm's.
 */
function angleErrors(seen: { image: Landmark[]; world: Landmark[] }, truth: Frame, hand: Side): Record<string, number> {
  const k = sided(seen.image, truth.image)
  const knee = (p: Landmark[], f: (l: Landmark) => Landmark, s: (i: number) => number) =>
    (jointAngle(f(p[s(LM.leftHip)]), f(p[s(LM.leftKnee)]), f(p[s(LM.leftAnkle)])) +
      jointAngle(f(p[s(LM.rightHip)]), f(p[s(LM.rightKnee)]), f(p[s(LM.rightAnkle)]))) /
    2
  const arm = hand === 'left' ? [LM.leftShoulder, LM.leftElbow, LM.leftWrist] : [LM.rightShoulder, LM.rightElbow, LM.rightWrist]
  const elbow = (p: Landmark[], f: (l: Landmark) => Landmark, s: (i: number) => number) => jointAngle(f(p[s(arm[0])]), f(p[s(arm[1])]), f(p[s(arm[2])]))
  const tilt = (p: Landmark[], f: (l: Landmark) => Landmark, s: (i: number) => number) =>
    signedElevationFromHorizontal(f(p[s(hand === 'left' ? LM.rightShoulder : LM.leftShoulder)]), f(p[s(arm[0])]))
  const same = (i: number) => i
  const id = (l: Landmark) => l
  return {
    kneeWorld: knee(seen.world, id, k) - knee(truth.world, id, same),
    kneeImage: knee(seen.image, flat, k) - knee(truth.image, flat, same),
    elbowWorld: elbow(seen.world, id, k) - elbow(truth.world, id, same),
    elbowImage: elbow(seen.image, flat, k) - elbow(truth.image, flat, same),
    shoulderTiltWorld: tilt(seen.world, id, k) - tilt(truth.world, id, same),
  }
}

/** Each angle's median error over the frames, degrees. */
/**
 * The elbow and the shoulder tilt as each angle's median error over the frames,
 * degrees; the knee at the deepest true load the read sampled, where knee bend
 * is graded (a median over a serve that is mostly standing hides it), with the
 * true and the model's world angle there.
 */
function angleCheck(pairs: { seen: { image: Landmark[]; world: Landmark[] }; truth: Frame }[], hand: Side): Record<string, number> | undefined {
  if (!pairs.length) return undefined
  const r1 = (v: number) => Math.round(v * 10) / 10
  const by: Record<string, number[]> = {}
  for (const p of pairs) for (const [a, v] of Object.entries(angleErrors(p.seen, p.truth, hand))) (by[a] ??= []).push(v)
  const out: Record<string, number> = {}
  for (const a of ['elbowWorld', 'elbowImage', 'shoulderTiltWorld']) {
    const s = by[a].sort((x, y) => x - y)
    out[a] = r1(s[Math.floor(s.length / 2)])
  }
  const kneeOf = (w: Landmark[]) =>
    (jointAngle(w[LM.leftHip], w[LM.leftKnee], w[LM.leftAnkle]) + jointAngle(w[LM.rightHip], w[LM.rightKnee], w[LM.rightAnkle])) / 2
  const load = pairs.reduce((a, b) => (kneeOf(b.truth.world) < kneeOf(a.truth.world) ? b : a))
  const at = angleErrors(load.seen, load.truth, hand)
  out.kneeTrueAtLoad = r1(kneeOf(load.truth.world))
  out.kneeWorldAtLoad = r1(at.kneeWorld)
  out.kneeImageAtLoad = r1(at.kneeImage)
  return out
}

/** Within a fifth of a body height on every key joint: the model found this body. */
const onFigure = (seen: Landmark[], truth: Landmark[]) => Object.values(jointErrors(seen, truth)).every((e) => e < 0.2)

/** Either wrist past the visibility the framing check counts as seen (`VISIBLE_FLOOR`). */
const wristSeen = (seen: Landmark[]) => Math.max(seen[LM.leftWrist].visibility, seen[LM.rightWrist].visibility) > VISIBLE_FLOOR

/* ------------------------------------------------------------------- run */

const rows: ServeRow[] = []
const win = window as unknown as { __pipeline: ServeRow[]; __pipelineDone?: boolean; __pipelineStill?: string }
win.__pipeline = rows

/** One picture of the serve as the models saw it: four moments side by side, for the ledger. */
function still(film: Frame[], look: Look, hand: Side, times: number[]): string {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const at = placementFor(film)
  const sheet = document.createElement('canvas')
  // The band the body and the racket move through, not the empty court below.
  const top = 0.16 * H
  const band = 0.58 * H
  const cell = 300
  sheet.width = cell * times.length
  sheet.height = Math.round((cell * band) / W)
  const sctx = sheet.getContext('2d')!
  times.forEach((t, i) => {
    paintFrame(ctx, look, frameAt(film, t), at, hand)
    sctx.drawImage(canvas, 0, top, W, band, i * cell, 0, cell, sheet.height)
  })
  document.getElementById('still')!.append(sheet)
  return sheet.toDataURL('image/jpeg', 0.82)
}

interface ClipRead {
  analysis?: Analysis
  /** Every sample of the dense read, as the pipeline took it, a body or none. */
  samples: PoseSample[]
  outcome: 'measured' | 'refused' | 'failed'
  detail?: string
  /**
   * Whether the first keyframe search, on MediaPipe's frames alone, passed:
   * the read went on to a step after "Finding the key positions" (the refine,
   * or measuring). A refusal after that came from a later search.
   */
  firstSearch?: 'passed' | 'refused'
}

/** The app's whole read of the file, bounded in time, with the dense read's samples kept. */
async function readClip(url: string, id: string, pastFramingCheck: boolean): Promise<ClipRead> {
  const samples: PoseSample[] = []
  let furthest = 0
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), READ_LIMIT_MS)
  try {
    const analysis = await analyzeServe({
      videoUrl: url,
      fileName: `${id}.webm`,
      // The file's rate, as a phone's MP4 tells the app through its container.
      knownFileFps: FPS,
      skipBall: true,
      skipSpeed: true,
      skipThumbnails: true,
      skipRacketBoxes: true,
      waitForRefine: true,
      skipFramingCheck: pastFramingCheck,
      skipPlayerCrop: params.get('crop') === 'off',
      signal: stop.signal,
      onPose: (s) => samples.push(s),
      onProgress: (p) => {
        if (p.step === 'measuring') furthest = Math.max(furthest, p.ratio)
      },
    })
    return { analysis, samples, outcome: 'measured', firstSearch: 'passed' }
  } catch (e) {
    // A refusal (the framing check's included) is a `NotAServeError`; anything else broke.
    return { samples, outcome: e instanceof NotAServeError ? 'refused' : 'failed', detail: (e as Error).message.slice(0, 160), firstSearch: furthest > 0.2 ? 'passed' : furthest > 0 ? 'refused' : undefined }
  } finally {
    clearTimeout(timer)
  }
}

async function benchServe(n: string, look: Look): Promise<ServeRow> {
  const started = performance.now()
  const serve = await loadServe(n)
  const row: ServeRow = { serve: serve.id, look: LOOK, gate: 'on', outcome: 'failed', frames: 0, found: 0, onFigure: 0, wristSeen: 0, refined: 0 }
  if (!swingCompleted(serve)) return { ...row, outcome: 'not a swing', detail: 'the capture stops before the racket comes over' }
  const film = filmed(serve)
  const blob = await renderClip(film, look, serve.hand)
  const url = URL.createObjectURL(blob)
  try {
    const want = film.length / FPS
    const got = await lengthOf(url)
    if (Math.abs(got - want) > 1.5 / FPS) return { ...row, outcome: 'unreadable file', detail: `the browser reads ${got.toFixed(3)} s of ${want.toFixed(3)} s` }

    // As shipped first. The framing check reads before the dense read starts,
    // so a refusal with no sample taken is the check's: then once more past
    // it, as a basket sweep reads, so the rest of the path is measured too.
    let read = await readClip(url, serve.id, false)
    row.framingCheck = read.samples.length || read.analysis ? 'passed' : (read.detail ?? read.outcome)
    if (!read.samples.length && !read.analysis && read.outcome === 'refused') {
      read = await readClip(url, serve.id, true)
      row.gate = 'off'
    }
    const { samples, analysis } = read
    row.firstSearch = read.firstSearch
    if (!analysis) {
      row.outcome = read.outcome
      row.detail = read.detail
    }

    // What the dense read asked for, and what came back.
    row.frames = samples.length
    const seen = samples.filter((s) => s.pose)
    row.found = seen.length
    row.onFigure = seen.filter((s) => onFigure(s.pose!.image, frameAt(film, s.t).image)).length
    row.wristSeen = seen.filter((s) => wristSeen(s.pose!.image)).length
    // `?debug=1`: every sample's wrists (height in the frame, then the truth's,
    // then visibility) and world knee angle beside the truth's, which is how
    // the lost arm at contact and the straight 3D knee were found.
    if (params.get('debug')) {
      for (const s of samples) {
        const tr = frameAt(film, s.t).image
        const p = s.pose?.image
        const f = (v: number | undefined) => (v === undefined ? '  -  ' : v.toFixed(3))
        const tw = frameAt(film, s.t).world
        const knee = (w: Landmark[]) =>
          ((jointAngle(w[LM.leftHip], w[LM.leftKnee], w[LM.leftAnkle]) + jointAngle(w[LM.rightHip], w[LM.rightKnee], w[LM.rightAnkle])) / 2).toFixed(0)
        log(
          `  ${s.t.toFixed(3)} R ${f(p?.[LM.rightWrist].y)} (${f(tr[LM.rightWrist].y)}) v${f(p?.[LM.rightWrist].visibility)}  L ${f(p?.[LM.leftWrist].y)} (${f(tr[LM.leftWrist].y)}) v${f(p?.[LM.leftWrist].visibility)}` +
            `  knee ${s.pose ? knee(s.pose.world) : '-'} (${knee(tw)})`,
        )
      }
    }
    row.joints = medianJoints(seen.map((s) => ({ seen: s.pose!.image, truth: frameAt(film, s.t).image })))
    row.angles = angleCheck(seen.map((s) => ({ seen: s.pose!, truth: frameAt(film, s.t) })), serve.hand)

    // The truth, on the moments the pipeline sampled: or, where it never got
    // that far, on the moments a whole read of this file would have taken.
    const times = samples.length ? samples.map((s) => s.t) : film.map((_, k) => (k + 0.5) / FPS)
    const steps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
    const fps = steps.length ? Math.round(100 / steps[Math.floor(steps.length / 2)]) / 100 : FPS
    const truth = readEngine(truthFrames(film, times), fps, W / H)
    row.truth = truth.reading

    if (analysis) {
      row.pipeline = pipelineReading(analysis)
      row.refined = analysis.cost?.refined ?? 0
      row.levelled = Boolean(analysis.tilt)
      if (!analysis.tilt) row.jointsFinal = medianJoints(analysis.frames.map((f) => ({ seen: f.image, truth: frameAt(film, f.t).image })))
      if (!truth.reading) {
        row.outcome = 'truth refused'
        row.detail = truth.refusal
      } else if (row.pipeline.outcome !== 'measured') {
        row.outcome = 'refused'
        row.detail = row.pipeline.outcome
      } else if (truth.reading.outcome !== 'measured') {
        row.outcome = 'truth refused'
        row.detail = truth.reading.outcome
      } else {
        row.outcome = 'measured'
        row.errors = compareReadings(row.pipeline, truth.reading)
      }
    } else if (!truth.reading || truth.reading.outcome !== 'measured') {
      row.detail = `${row.detail ?? ''}; the truth: ${truth.refusal ?? truth.reading?.outcome}`
      row.outcome = 'truth refused'
    }

    const contactT = truth.reading?.phases?.contact
    const racketWrist = serve.hand === 'left' ? LM.leftWrist : LM.rightWrist
    /** The racket wrist's worst error within 0.1 s of the true contact, by whichever wrist the model put nearer. */
    const contactWrist = (frames: { t: number; image: Landmark[] }[]) => {
      if (contactT === undefined) return undefined
      const near = frames.filter((f) => Math.abs(f.t - contactT) <= 0.1)
      if (!near.length) return undefined
      const errs = near.map((f) => {
        const tr = frameAt(film, f.t).image
        const d = (k: number) => Math.hypot(f.image[k].x - tr[racketWrist].x, f.image[k].y - tr[racketWrist].y)
        return Math.min(d(LM.leftWrist), d(LM.rightWrist)) / heightIn(tr)
      })
      return Math.round(Math.max(...errs) * 10000) / 10000
    }
    row.contactWrist = contactWrist(seen.map((s) => ({ t: s.t, image: s.pose!.image })))

    // MediaPipe's own frames as the pipeline's first keyframe search had them:
    // the dense read with its short gaps bridged. Two more reads of them.
    const mp = samples.some((s) => s.pose) ? bridgeDetectionGaps(samples) : []
    if (mp.length >= 8) {
      // The bench's copy of the engine on them must come to what the pipeline
      // came to, or the truth read above is not the app's engine.
      const tail = readEngine(mp.map(copyFrame), fps, W / H)
      row.tail = tail.reading ? tail.reading.outcome : tail.refusal

      // Not the app's path: RTMPose re-reading every frame before the
      // keyframes are looked for (`WHAT_IFS`). The app refines only once
      // MediaPipe's keyframes are found, from the toss to just past contact.
      row.whatIf = {}
      for (const [name, boxOf] of Object.entries(WHAT_IFS)) {
        const all = await refineEveryFrame(url, mp, boxOf)
        if (!all) continue
        const r = readEngine(all.map(copyFrame), fps, W / H)
        const read: WhatIf = {
          outcome: r.reading ? r.reading.outcome : (r.refusal ?? 'none'),
          reading: r.reading,
          joints: medianJoints(all.map((f) => ({ seen: f.image, truth: frameAt(film, f.t).image }))),
          contactWrist: contactWrist(all),
        }
        if (r.reading?.outcome === 'measured' && truth.reading?.outcome === 'measured') read.errors = compareReadings(r.reading, truth.reading)
        row.whatIf[name] = read
      }
    }

    // Where the pipeline gave up before reading, MediaPipe alone on every
    // third picture, whole frame: did it see a body at all?
    if (!samples.length) {
      const lm = await loadEngine()
      const detect = await poseDetector(lm)
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!
      const at = placementFor(film)
      for (let k = 0; k < film.length; k += 3) {
        paintFrame(ctx, look, film[k], at, serve.hand)
        const res = await detect(canvas, nextVideoTimestamp(lm, k / FPS))
        row.frames++
        const image = res.landmarks?.[0]?.map((l) => ({ x: l.x * (W / H), y: l.y, z: l.z, visibility: l.visibility ?? 1 }))
        if (image) {
          row.found++
          if (onFigure(image, film[k].image)) row.onFigure++
          if (wristSeen(image)) row.wristSeen++
        }
      }
      row.detail = `${row.detail ?? ''} (frames: MediaPipe alone on every third picture)`.trim()
    }

    if (!win.__pipelineStill && truth.reading?.phases) {
      const p = truth.reading.phases
      // The contact and the frame after it, where the models lose the racket arm.
      win.__pipelineStill = still(film, look, serve.hand, [p.ready, p.trophy, p.drop, p.contact, p.contact + 1 / FPS].filter((t) => Number.isFinite(t)))
    }
    return row
  } finally {
    URL.revokeObjectURL(url)
    row.ms = Math.round(performance.now() - started)
  }
}

async function run() {
  const look = LOOKS[LOOK] ?? LOOKS.court
  log(`look ${LOOK}, ${FPS} fps, serves ${SERVES.join(' ')}`)
  for (const n of SERVES) {
    let row: ServeRow
    try {
      row = await benchServe(n, look)
    } catch (e) {
      row = { serve: `bath-${n}`, look: LOOK, gate: 'on', outcome: 'failed', detail: (e as Error).message.slice(0, 160), frames: 0, found: 0, onFigure: 0, wristSeen: 0, refined: 0 }
    }
    rows.push(row)
    const errs = row.errors ? Object.entries(row.errors).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ') : ''
    log(
      `${row.serve}: framing check ${row.framingCheck ?? "-"}; read ${row.gate === "off" ? "past it" : "as shipped"}: ${row.outcome}${row.detail ? ` (${row.detail})` : ""}; body on ${row.found}/${row.frames} frames, on the figure ${row.onFigure}, a wrist seen ${row.wristSeen}; refined ${row.refined}; ${row.ms} ms` +
        (row.pipeline && row.truth ? `; score ${row.pipeline.overall} vs ${row.truth.overall}, faults ${row.pipeline.flaws.join(' ') || 'none'} vs ${row.truth.flaws.join(' ') || 'none'}` : '') +
        (errs ? `\n  ${errs}` : '') +
        `\n  engine steps on MediaPipe's frames: ${row.tail ?? '-'}; racket wrist near contact ${row.contactWrist ?? '-'}` +
        Object.entries(row.whatIf ?? {})
          .map(
            ([name, w]) =>
              `\n  ${name}: ${w.outcome}; racket wrist near contact ${w.contactWrist ?? '-'}` +
              (w.errors ? `\n    ${Object.entries(w.errors).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ')}` : ''),
          )
          .join(''),
    )
  }
  log('\n' + formatSummary(summarise(rows)))
  log('done')
  win.__pipelineDone = true
}

void run()
