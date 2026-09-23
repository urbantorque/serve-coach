/**
 * The pose benchmark: several back-ends over 500 labelled serve frames.
 *
 * Dev only — `bench.html`, which the production build never bundles. Open
 * `/bench.html` on the dev server after `npm run setup:bench`; `?n=50` runs a
 * quick subset. Results render as a table and are left on `window.__bench` so
 * a script can read them.
 *
 * The variants answer ANALYSIS-REVIEW.md's Tier 0 question — does a different
 * pose model, or the same one read differently, get the serving arm right more
 * often — on real smartphone serve frames rather than on the synthetic rig:
 *
 *   mp-full         what the app does today: MediaPipe full, whole frame
 *   mp-heavy        MediaPipe's larger model, whole frame
 *   mp-full-crop    MediaPipe full again on an upscaled crop round its own find
 *   rtm-s, rtm-m    RTMPose (Apache-2.0) on the crop MediaPipe found
 *   rtm-m-oracle    RTMPose-m on the labelled box: the ceiling, not a product
 *   det-*           the same, on the box the app's own EfficientDet-Lite0 (COCO
 *                   'person') finds — the tallest person, since the server is
 *                   the one nearest the phone
 */
import { FilesetResolver, ObjectDetector, PoseLandmarker } from '@mediapipe/tasks-vision'
import * as ort from 'onnxruntime-web'
import {
  COCO_JOINTS,
  MEDIAPIPE_TO_COCO,
  RTM_INPUT,
  boxOf,
  decodeSimcc,
  rtmCrop,
  summarise,
  truthFrom,
  type Prediction,
  type Pt,
  type Truth,
  type VariantSummary,
} from './score'

const DATA = '/bench-data/tennis-player-actions'
const params = new URLSearchParams(location.search)
const LIMIT = Number(params.get('n')) || Infinity
const out = document.getElementById('out')!
const log = (s: string) => {
  out.textContent += s + '\n'
}

interface CocoFile {
  images: { id: number; file_name: string; width: number; height: number }[]
  annotations: { image_id: number; keypoints: number[]; bbox: number[] }[]
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  await img.decode()
  return img
}

/* ------------------------------------------------------------------ MediaPipe */

async function mediapipe(model: string): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks('/wasm')
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: model, delegate: 'GPU' },
    runningMode: 'IMAGE',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

function mpToCoco(lm: PoseLandmarker, src: CanvasImageSource & { width: number; height: number }): Prediction {
  const r = lm.detect(src as HTMLImageElement)
  const pose = r.landmarks[0]
  if (!pose) return undefined
  return MEDIAPIPE_TO_COCO.map((i) => ({ x: pose[i].x * src.width, y: pose[i].y * src.height }))
}

/** MediaPipe on an upscaled crop round a first find, mapped back to the frame. */
function mpOnCrop(lm: PoseLandmarker, img: HTMLImageElement, around: Pt[], canvas: HTMLCanvasElement): Prediction {
  const [bx, by, bw, bh] = boxOf(around)
  const side = Math.max(bw, bh) * 1.6
  const cx = bx + bw / 2
  const cy = by + bh / 2
  const x0 = cx - side / 2
  const y0 = cy - side / 2
  const size = 512
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, x0, y0, side, side, 0, 0, size, size)
  const p = mpToCoco(lm, canvas)
  return p?.map((q) => ({ x: x0 + (q.x / size) * side, y: y0 + (q.y / size) * side }))
}

/* ----------------------------------------------------------- person detector */

async function personDetector(): Promise<ObjectDetector> {
  const fileset = await FilesetResolver.forVisionTasks('/wasm')
  return ObjectDetector.createFromOptions(fileset, {
    // CPU and no allowlist: with either the GPU delegate or `categoryAllowlist`
    // this returned nothing on every frame, silently — the failure
    // `objectEngine.ts` warns about. Filtered by name below instead.
    baseOptions: { modelAssetPath: '/models/efficientdet_lite0.tflite', delegate: 'CPU' },
    runningMode: 'IMAGE',
    scoreThreshold: 0.2,
    maxResults: 10,
  })
}

/** The tallest person the detector found, as [x, y, w, h] in pixels. */
function tallestPerson(det: ObjectDetector, img: HTMLImageElement): [number, number, number, number] | undefined {
  const boxes = det
    .detect(img)
    .detections.filter((d) => d.categories[0]?.categoryName === 'person')
    .map((d) => d.boundingBox!)
    .filter(Boolean)
  if (!boxes.length) return undefined
  const b = boxes.reduce((a, c) => (c.height > a.height ? c : a))
  return [b.originX, b.originY, b.width, b.height]
}

const cornersOf = (b: [number, number, number, number]): Pt[] => [
  { x: b[0], y: b[1] },
  { x: b[0] + b[2], y: b[1] + b[3] },
]

/* ------------------------------------------------------------------- RTMPose */

async function rtmpose(model: string): Promise<ort.InferenceSession> {
  ort.env.wasm.wasmPaths = '/bench-data/ort/'
  const providers: ort.InferenceSession.SessionOptions['executionProviders'][] = [['webgpu'], ['wasm']]
  for (const executionProviders of providers) {
    try {
      const s = await ort.InferenceSession.create(model, { executionProviders })
      log(`  ${model.split('/').pop()} on ${executionProviders![0]}`)
      return s
    } catch (e) {
      log(`  ${String(executionProviders![0])} unavailable: ${(e as Error).message.slice(0, 80)}`)
    }
  }
  throw new Error('no execution provider')
}

const MEAN = [123.675, 116.28, 103.53]
const STD = [58.395, 57.12, 57.375]

async function rtmOnBox(
  session: ort.InferenceSession,
  img: HTMLImageElement,
  box: [number, number, number, number],
  canvas: HTMLCanvasElement,
): Promise<Prediction> {
  const crop = rtmCrop(box)
  const { w, h } = RTM_INPUT
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  const input = new Float32Array(3 * w * h)
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) input[c * w * h + i] = (px[i * 4 + c] - MEAN[c]) / STD[c]
  }
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, h, w]) }
  const res = await session.run(feeds)
  const [xName, yName] = session.outputNames
  const sx = res[xName].data as Float32Array
  const sy = res[yName].data as Float32Array
  return decodeSimcc(sx, sy, COCO_JOINTS.length, crop).points
}

/* ---------------------------------------------------------------------- run */

type Runner = (img: HTMLImageElement, truth: Truth, first: Prediction) => Promise<Prediction> | Prediction

async function main() {
  const coco: CocoFile = await (await fetch(`${DATA}/serve.json`)).json()
  const byImage = new Map(coco.annotations.map((a) => [a.image_id, a]))
  const items = coco.images
    .filter((im) => byImage.has(im.id))
    .sort((a, b) => a.file_name.localeCompare(b.file_name))
    .slice(0, LIMIT)
  log(`${items.length} labelled serve frames`)

  log('loading models…')
  const mpFull = await mediapipe('/models/pose_landmarker_full.task')
  const mpHeavy = await mediapipe('/bench-data/models/pose_landmarker_heavy.task')
  const rtmS = await rtmpose('/bench-data/models/onnx/rtmpose-s.onnx')
  const rtmM = await rtmpose('/bench-data/models/onnx/rtmpose-m.onnx')
  const det = await personDetector()
  const canvas = document.createElement('canvas')
  const boxFor = new Map<HTMLImageElement, [number, number, number, number] | undefined>()
  const personBox = (img: HTMLImageElement) => {
    if (!boxFor.has(img)) boxFor.set(img, tallestPerson(det, img))
    return boxFor.get(img)
  }

  const variants: Record<string, Runner> = {
    'mp-full': (img) => mpToCoco(mpFull, img),
    'mp-heavy': (img) => mpToCoco(mpHeavy, img),
    'mp-full-crop': (img, _t, first) => (first ? mpOnCrop(mpFull, img, first, canvas) : undefined),
    'rtm-s': (img, _t, first) => (first ? rtmOnBox(rtmS, img, boxOf(first), canvas) : undefined),
    'rtm-m': (img, _t, first) => (first ? rtmOnBox(rtmM, img, boxOf(first), canvas) : undefined),
    'rtm-m-oracle': (img, t) => rtmOnBox(rtmM, img, t.bbox, canvas),
    'det-mp-crop': (img) => {
      const b = personBox(img)
      return b ? mpOnCrop(mpFull, img, cornersOf(b), canvas) : undefined
    },
    'det-rtm-s': (img) => {
      const b = personBox(img)
      return b ? rtmOnBox(rtmS, img, b, canvas) : undefined
    },
    'det-rtm-m': (img) => {
      const b = personBox(img)
      return b ? rtmOnBox(rtmM, img, b, canvas) : undefined
    },
  }
  const results: Record<string, { pred: Prediction; truth: Truth; ms: number }[]> = Object.fromEntries(
    Object.keys(variants).map((k) => [k, []]),
  )

  // One warm-up pass each, so first-call shader compiles do not land in the timings.
  const warm = await loadImage(`${DATA}/serve/${items[0].file_name}`)
  const warmTruth = truthFrom(items[0].file_name, byImage.get(items[0].id)!.keypoints, byImage.get(items[0].id)!.bbox)
  const warmFirst = mpToCoco(mpFull, warm)
  for (const run of Object.values(variants)) await run(warm, warmTruth, warmFirst)

  for (let n = 0; n < items.length; n++) {
    const im = items[n]
    const ann = byImage.get(im.id)!
    const truth = truthFrom(im.file_name, ann.keypoints, ann.bbox)
    const img = await loadImage(`${DATA}/serve/${im.file_name}`)
    let first: Prediction
    for (const [name, run] of Object.entries(variants)) {
      const t0 = performance.now()
      const pred = await run(img, truth, first)
      const ms = performance.now() - t0
      if (name === 'mp-full') first = pred
      results[name].push({ pred, truth, ms })
    }
    if (n % 50 === 49) log(`  ${n + 1} / ${items.length}`)
  }

  const summaries: Record<string, VariantSummary> = Object.fromEntries(
    Object.entries(results).map(([k, r]) => [k, summarise(r)]),
  )
  ;(window as unknown as { __bench: unknown }).__bench = {
    summaries,
    perImage: Object.fromEntries(
      Object.entries(results).map(([k, r]) => [k, r.map((x) => ({ file: x.truth.file, pred: x.pred, ms: x.ms }))]),
    ),
  }
  render(summaries)
}

function render(s: Record<string, VariantSummary>) {
  const groups = Object.keys(Object.values(s)[0].medianError)
  const rows = Object.entries(s).map(
    ([k, v]) =>
      `<tr><th>${k}</th><td>${v.missed}</td><td>${v.wrongPerson}</td><td>${v.swapped}</td>` +
      groups.map((g) => `<td>${v.medianError[g].toFixed(1)} / ${(v.pck05[g] * 100).toFixed(0)}%</td>`).join('') +
      `<td>${v.msPerImage.toFixed(0)}</td></tr>`,
  )
  document.getElementById('table')!.innerHTML =
    `<table><tr><th>variant</th><th>missed</th><th>wrong person</th><th>L/R swapped</th>` +
    groups.map((g) => `<th>${g}<br><small>median % ht / PCK@5%</small></th>`).join('') +
    `<th>ms</th></tr>${rows.join('')}</table>`
  log('done')
}

main().catch((e) => log(`FAILED: ${(e as Error).stack ?? e}`))
