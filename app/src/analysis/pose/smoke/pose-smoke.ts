/**
 * Dev-only smoke page for MediaPipePoseSource (served by the Vite dev server, not part
 * of the production build). run-smoke.mjs calls window.poseSmoke.run() per config.
 * Frames are synthetic (gradients and moving shapes, no people): the check is that the
 * source initialises, falls back cleanly and returns "no person" without errors.
 */
import { LM, type Landmark, type PoseFrame } from '../../types.ts'
import { MediaPipePoseSource, type MediaPipePoseStats } from '../mediapipeSource.ts'
import type { Delegate, PoseModel, RunningMode } from '../mediapipeCore.ts'
import type { PoseInputFrame } from '../poseSource.ts'
import { buildServeFixture } from '../servePoseFixture.ts'

export interface SmokeConfig {
  model: PoseModel
  delegate: Delegate | 'auto'
  useWorker: boolean
  frames: number
  width: number
  height: number
  fps: number
  /** 'figure' draws a flat cartoon person from the kinematic fixture (front view). */
  imageKind: 'bitmap' | 'imagedata' | 'canvas' | 'figure'
  numPoses?: number
  /** Omitted: the source's default. */
  runningMode?: RunningMode
  /** Omitted: the source's default ('auto'). */
  roi?: 'auto' | 'off'
}

export interface SmokeResult {
  config: SmokeConfig
  ok: boolean
  error?: string
  wallInitMs: number
  wallRunMs: number
  framesOut: number
  framesWithLandmarks: number
  stats: MediaPipePoseStats
  webgl: string
  /** Cartoon-figure runs only: detected joints vs the drawn skeleton (wiring check, not accuracy). */
  figureCheck?: FigureCheck
}

export interface FigureCheck {
  framesCompared: number
  /** Joint error in body heights (drawn figure height), over shoulders..ankles. */
  medianErrorBH: number
  p90ErrorBH: number
  /** Fraction of left/right pairs whose labels match the drawn figure (no mirror errors). */
  leftRightAgreement: number
}

const CHECK_PAIRS: Array<[LM, LM]> = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER], [LM.LEFT_ELBOW, LM.RIGHT_ELBOW], [LM.LEFT_WRIST, LM.RIGHT_WRIST],
  [LM.LEFT_HIP, LM.RIGHT_HIP], [LM.LEFT_KNEE, LM.RIGHT_KNEE], [LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
]
const FIGURE_HEIGHT_HU = 0.8
const FIGURE_START_S = 1.2

function figureFixture(config: SmokeConfig) {
  return buildServeFixture({ view: 'rear', fps: config.fps, frameAspect: config.width / config.height, heightHU: FIGURE_HEIGHT_HU, floorY: 0.92 })
}

/** Drawn (front view, mirrored) landmark positions for smoke frame i. */
function figureTruth(fixture: ReturnType<typeof figureFixture>, config: SmokeConfig, i: number): Landmark[] {
  const lms = fixture.frames[Math.min(i + Math.round(FIGURE_START_S * config.fps), fixture.frames.length - 1)].landmarks!
  return lms.map((lm) => ({ ...lm, x: 1 - lm.x }))
}

function webglRenderer(): string {
  const canvas = new OffscreenCanvas(1, 1)
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  if (!gl) return 'no WebGL'
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
}

function drawFrame(ctx: OffscreenCanvasRenderingContext2D, i: number, width: number, height: number): void {
  const g = ctx.createLinearGradient(0, 0, width, height)
  g.addColorStop(0, `hsl(${(i * 7) % 360} 40% 35%)`)
  g.addColorStop(1, `hsl(${(i * 7 + 120) % 360} 40% 65%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#e9e25b'
  ctx.beginPath()
  ctx.arc(width * 0.5 + 200 * Math.sin(i / 5), height * 0.3, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, height * 0.8, width, 6) // a court line
}

/**
 * Flat cartoon person drawn over the fixture skeleton, mirrored to a front view so a
 * face is visible. Only used to see whether the landmark model runs at all; it says
 * nothing about accuracy on real people.
 */
function drawFigure(ctx: OffscreenCanvasRenderingContext2D, lms: readonly Landmark[], width: number, height: number): void {
  ctx.fillStyle = '#3f7d4e'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#9fc1a6'
  ctx.fillRect(0, height * 0.9, width, height * 0.1)
  const p = (i: LM) => ({ x: lms[i].x * width, y: lms[i].y * height })
  const limb = (a: LM, b: LM, colour: string, w: number) => {
    ctx.strokeStyle = colour
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(p(a).x, p(a).y)
    ctx.lineTo(p(b).x, p(b).y)
    ctx.stroke()
  }
  const unit = height * 0.8
  const skin = '#d9a27c'
  for (const [a, b, c] of [[LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE], [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE]] as const) {
    limb(a, b, '#1f2a44', unit * 0.075)
    limb(b, c, skin, unit * 0.055)
  }
  for (const [heel, toe] of [[LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX], [LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX]] as const) limb(heel, toe, '#f4f4f4', unit * 0.04)
  ctx.fillStyle = '#e8e8e8'
  ctx.beginPath()
  for (const i of [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.LEFT_HIP]) ctx.lineTo(p(i).x, p(i).y)
  ctx.closePath()
  ctx.fill()
  for (const [s, e, w] of [[LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST], [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST]] as const) {
    limb(s, e, '#e8e8e8', unit * 0.05)
    limb(e, w, skin, unit * 0.04)
  }
  const nose = p(LM.NOSE)
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.ellipse(nose.x, nose.y - unit * 0.02, unit * 0.055, unit * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3b2a1f'
  ctx.beginPath()
  ctx.ellipse(nose.x, nose.y - unit * 0.075, unit * 0.058, unit * 0.03, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  for (const eye of [LM.LEFT_EYE, LM.RIGHT_EYE]) {
    ctx.beginPath()
    ctx.arc(p(eye).x, p(eye).y, unit * 0.007, 0, Math.PI * 2)
    ctx.fill()
  }
  limb(LM.MOUTH_LEFT, LM.MOUTH_RIGHT, '#8a3d3d', unit * 0.006)
}

async function* syntheticFrames(config: SmokeConfig): AsyncGenerator<PoseInputFrame> {
  const canvas = new OffscreenCanvas(config.width, config.height)
  const ctx = canvas.getContext('2d')!
  const fixture = config.imageKind === 'figure' ? figureFixture(config) : null
  for (let i = 0; i < config.frames; i++) {
    if (fixture) drawFigure(ctx, figureTruth(fixture, config, i), config.width, config.height)
    else drawFrame(ctx, i, config.width, config.height)
    const tReal = i / config.fps
    if (config.imageKind === 'bitmap' || config.imageKind === 'figure') {
      const bitmap = await createImageBitmap(canvas)
      yield { frameIndex: i, tReal, image: bitmap }
      bitmap.close() // the source copies before asking for the next frame
    } else if (config.imageKind === 'imagedata') {
      yield { frameIndex: i, tReal, image: ctx.getImageData(0, 0, config.width, config.height) }
    } else {
      yield { frameIndex: i, tReal, image: canvas }
    }
  }
}

function checkFigure(outputs: readonly PoseFrame[], config: SmokeConfig): FigureCheck {
  const fixture = figureFixture(config)
  const aspect = config.width / config.height
  const errors: number[] = []
  let agree = 0
  let pairs = 0
  let compared = 0
  for (const frame of outputs) {
    if (!frame.landmarks) continue
    const truth = figureTruth(fixture, config, frame.frameIndex)
    const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y) / FIGURE_HEIGHT_HU
    const inFrame = (lm: Landmark) => lm.y > 0.02 && lm.y < 0.98
    compared++
    for (const [l, r] of CHECK_PAIRS) {
      if (!inFrame(truth[l]) || !inFrame(truth[r])) continue
      errors.push(dist(frame.landmarks[l], truth[l]), dist(frame.landmarks[r], truth[r]))
      pairs++
      if (dist(frame.landmarks[l], truth[l]) <= dist(frame.landmarks[l], truth[r])) agree++
    }
  }
  errors.sort((a, b) => a - b)
  const at = (q: number) => (errors.length ? errors[Math.min(errors.length - 1, Math.floor(q * errors.length))] : Number.NaN)
  return { framesCompared: compared, medianErrorBH: at(0.5), p90ErrorBH: at(0.9), leftRightAgreement: pairs ? agree / pairs : Number.NaN }
}

async function run(config: SmokeConfig): Promise<SmokeResult> {
  const source = new MediaPipePoseSource({
    model: config.model,
    delegate: config.delegate,
    useWorker: config.useWorker,
    numPoses: config.numPoses ?? 2,
    runningMode: config.runningMode,
    roi: config.roi,
  })
  const webgl = webglRenderer()
  const t0 = performance.now()
  let wallInitMs = 0
  let framesOut = 0
  let framesWithLandmarks = 0
  const outputs: PoseFrame[] = []
  try {
    await source.init()
    wallInitMs = performance.now() - t0
    const t1 = performance.now()
    for await (const frame of source.estimate(syntheticFrames(config))) {
      framesOut++
      if (frame.landmarks) framesWithLandmarks++
      outputs.push(frame)
    }
    const wallRunMs = performance.now() - t1
    const stats = source.stats()
    return {
      config,
      ok: stats.detectErrors.length === 0 && framesOut === config.frames,
      wallInitMs,
      wallRunMs,
      framesOut,
      framesWithLandmarks,
      stats,
      webgl,
      figureCheck: config.imageKind === 'figure' ? checkFigure(outputs, config) : undefined,
    }
  } catch (error) {
    return {
      config,
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      wallInitMs,
      wallRunMs: 0,
      framesOut,
      framesWithLandmarks,
      stats: source.stats(),
      webgl,
    }
  } finally {
    await source.dispose()
  }
}

/** PNG data URL of one cartoon-figure frame, so the runner can save it for inspection. */
async function figurePng(width: number, height: number, tReal: number): Promise<string> {
  const canvas = new OffscreenCanvas(width, height)
  const config = { fps: 30, width, height } as SmokeConfig
  const fixture = figureFixture(config)
  drawFigure(canvas.getContext('2d')!, figureTruth(fixture, config, Math.round((tReal - FIGURE_START_S) * 30)), width, height)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

declare global {
  interface Window {
    poseSmoke: { run: typeof run; figurePng: typeof figurePng; ready: boolean }
  }
}

window.poseSmoke = { run, figurePng, ready: true }
const status = document.getElementById('status')
if (status) status.textContent = 'Ready. Call window.poseSmoke.run(config).'
