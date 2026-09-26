import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'

/**
 * Runs MediaPipe Pose Landmarker (the app's bundled copy and model) in headless Edge on image files.
 * Google usage-logging requests from tasks-vision are blocked at the network layer.
 */

const REPO = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const TASKS_VISION = join(REPO, 'app', 'node_modules', '@mediapipe', 'tasks-vision')
const MODELS = join(REPO, 'app', 'public', 'models')

export interface DetectItem {
  /** Absolute path of a PNG/JPEG file. */
  file: string
  /** Optional crop in normalised coords [x0,y0,x1,y1]; landmarks are returned in full-frame coords. */
  crop?: [number, number, number, number]
}

export interface DetectResult {
  detected: boolean
  /** 33 landmarks in full-frame normalised coords (x,y) plus visibility. */
  landmarks: { x: number; y: number; visibility: number }[] | null
  ms: number
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>pose feasibility</title></head><body>
<div id="status">loading</div>
<script type="module">
import { FilesetResolver, PoseLandmarker } from '/mp/vision_bundle.mjs'
const status = document.getElementById('status')
let landmarker = null
let mode = null
async function ensure(model, runningMode, delegate) {
  if (landmarker && mode === model + runningMode + delegate) return
  const vision = await FilesetResolver.forVisionTasks('/mp/wasm')
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: '/models/' + model, delegate },
    runningMode, numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  })
  mode = model + runningMode + delegate
}
function load(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url }) }
window.runDetection = async (items, model, runningMode, delegate, fps) => {
  await ensure(model, runningMode, delegate)
  const out = []
  let ts = 0
  for (const it of items) {
    const img = await load(it.url)
    let src = img
    let crop = it.crop ?? [0, 0, 1, 1]
    if (it.crop) {
      const c = document.createElement('canvas')
      const sx = Math.round(crop[0] * img.width), sy = Math.round(crop[1] * img.height)
      const sw = Math.round((crop[2] - crop[0]) * img.width), sh = Math.round((crop[3] - crop[1]) * img.height)
      c.width = sw; c.height = sh
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      crop = [sx / img.width, sy / img.height, (sx + sw) / img.width, (sy + sh) / img.height]
      src = c
    }
    const t0 = performance.now()
    ts += 1000 / fps
    const r = runningMode === 'VIDEO' ? landmarker.detectForVideo(src, Math.round(ts)) : landmarker.detect(src)
    const ms = performance.now() - t0
    const lm = r.landmarks && r.landmarks[0]
    out.push({
      detected: !!lm,
      ms,
      landmarks: lm ? lm.map((p) => ({ x: crop[0] + p.x * (crop[2] - crop[0]), y: crop[1] + p.y * (crop[3] - crop[1]), visibility: p.visibility ?? 0 })) : null,
    })
  }
  status.textContent = 'ok'
  return out
}
status.textContent = 'ready'
</script></body></html>`

const MIME: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.task': 'application/octet-stream',
  '.html': 'text/html',
}

export class PoseDetector {
  private constructor(
    private readonly server: Server,
    readonly port: number,
    private readonly browser: Browser,
    private readonly page: Page,
    private readonly files: Map<string, string>,
  ) {}

  static async start(channel: 'msedge' | 'chrome' = 'msedge'): Promise<PoseDetector> {
    if (!existsSync(join(TASKS_VISION, 'vision_bundle.mjs'))) throw new Error(`tasks-vision not found at ${TASKS_VISION}`)
    const files = new Map<string, string>()
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      let path: string | undefined
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE)
        return
      }
      if (url.pathname.startsWith('/mp/')) path = safeJoin(TASKS_VISION, url.pathname.slice(4))
      else if (url.pathname.startsWith('/models/')) path = safeJoin(MODELS, url.pathname.slice(8))
      else if (url.pathname.startsWith('/img/')) path = files.get(url.pathname.slice(5))
      if (!path || !existsSync(path) || !statSync(path).isFile()) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' })
      createReadStream(path).pipe(res)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no address')
    const browser = await chromium.launch({ channel, headless: true, args: ['--ignore-gpu-blocklist'] })
    const page = await browser.newPage()
    // tasks-vision posts usage logs to Google; block every non-local request.
    await page.route('**/*', (route) => {
      const u = route.request().url()
      if (u.startsWith(`http://127.0.0.1:${addr.port}/`)) void route.continue()
      else void route.abort()
    })
    await page.goto(`http://127.0.0.1:${addr.port}/`)
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready')
    return new PoseDetector(server, addr.port, browser, page, files)
  }

  async detect(
    items: DetectItem[],
    opts: { model?: 'pose_landmarker_full.task' | 'pose_landmarker_lite.task'; runningMode?: 'IMAGE' | 'VIDEO'; delegate?: 'CPU' | 'GPU'; fps?: number } = {},
  ): Promise<DetectResult[]> {
    const payload = items.map((it) => {
      const key = `${this.files.size}${extname(it.file)}`
      this.files.set(key, it.file)
      return { url: `/img/${key}`, crop: it.crop }
    })
    return (await this.page.evaluate(
      ([p, model, mode, delegate, fps]) =>
        (window as unknown as { runDetection: (...a: unknown[]) => Promise<DetectResult[]> }).runDetection(p, model, mode, delegate, fps),
      [payload, opts.model ?? 'pose_landmarker_full.task', opts.runningMode ?? 'IMAGE', opts.delegate ?? 'GPU', opts.fps ?? 30] as const,
    )) as DetectResult[]
  }

  async close(): Promise<void> {
    await this.browser.close()
    await new Promise<void>((r) => this.server.close(() => r()))
  }
}

function safeJoin(root: string, rel: string): string | undefined {
  const p = normalize(join(root, decodeURIComponent(rel)))
  return p.startsWith(root) ? p : undefined
}

/** Body joints used for error scoring: shoulders, elbows, wrists, hips, knees, ankles. */
export const SCORED_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
const SWAP: Record<number, number> = { 11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15, 23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27 }

export interface PoseScore {
  /** Mean joint error / player height in the image (both in pixels). */
  meanErrOverHeight: number
  /** Fraction of scored joints within 10% of the player height. */
  pck10: number
  /** True when swapping left/right labels gave the better match. */
  leftRightSwapped: boolean
}

/** Compare detected landmarks with truth (both normalised); errors measured in pixels. */
export function scorePose(pred: { x: number; y: number }[], truth: [number, number][], widthPx: number, heightPx: number): PoseScore {
  const ys = truth.map((p) => p[1] * heightPx)
  const heightImg = Math.max(...ys) - Math.min(...ys)
  const errs = (swap: boolean) =>
    SCORED_JOINTS.map((j) => {
      const pj = pred[swap ? SWAP[j] : j]
      return Math.hypot((pj.x - truth[j][0]) * widthPx, (pj.y - truth[j][1]) * heightPx) / heightImg
    })
  const a = errs(false)
  const b = errs(true)
  const mean = (e: number[]) => e.reduce((s, x) => s + x, 0) / e.length
  const swapped = mean(b) < mean(a)
  const e = swapped ? b : a
  return { meanErrOverHeight: mean(e), pck10: e.filter((x) => x < 0.1).length / e.length, leftRightSwapped: swapped }
}
