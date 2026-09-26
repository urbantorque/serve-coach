import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium, type Browser } from 'playwright'
import { WebSocketServer, type WebSocket } from 'ws'
import type { FrameData, SceneDescription } from './sceneTypes.ts'

/**
 * Renders frames in headless Edge (or Chrome) with WebGL. A local HTTP server hands the page the
 * scene and per-frame data; the page streams pixels back over a WebSocket (one binary message per
 * frame: uint32 LE frame index, then the pixel bytes in the scene's output format). The page keeps
 * at most a few frames in flight, and each is acknowledged only after onPixels resolves, so a slow
 * encoder applies backpressure all the way to the GPU.
 */
export interface RenderJob {
  scene: SceneDescription
  frameCount: number
  frame(i: number): FrameData
  onPixels(i: number, pixels: Buffer): Promise<void>
  onProgress?(done: number, total: number): void
  /** Called once with the page's timing breakdown when the job finishes. */
  onDone?(profile: RenderProfile | undefined): void
}

/** Page-side timing totals (ms) for one job. */
export interface RenderProfile {
  fetchMs: number
  renderMs: number
  sendWaitMs: number
  frames: number
}

interface ActiveJob {
  job: RenderJob
  resolve: () => void
  reject: (e: Error) => void
  received: number
  profile?: RenderProfile
  /** Serialises onPixels calls so frames reach the consumer in order. */
  chain: Promise<void>
  failed: boolean
}

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>serve-synth renderer</title>
<link rel="icon" href="data:,">
<style>html,body{margin:0;background:#000;color:#ccc;font:12px monospace}canvas{display:none}</style></head>
<body><div id="status">loading</div><script type="module" src="/renderer.js"></script></body></html>`

export class RenderService {
  private jobs = new Map<string, ActiveJob>()
  private nextId = 1
  private constructor(
    private readonly server: Server,
    private readonly wss: WebSocketServer,
    private readonly port: number,
    private readonly browser: Browser,
  ) {}

  static async start(opts: { channel?: 'msedge' | 'chrome'; headless?: boolean } = {}): Promise<RenderService> {
    const entry = fileURLToPath(new URL('./page/renderer.ts', import.meta.url))
    const bundle = await build({ entryPoints: [entry], bundle: true, format: 'esm', target: 'es2022', write: false, minify: false, logLevel: 'silent' })
    const js = bundle.outputFiles[0].text
    let service: RenderService | null = null
    const server = createServer((req, res) => {
      if (!service) {
        res.writeHead(503).end()
        return
      }
      service.handle(req, res, js).catch((e: unknown) => {
        if (!res.headersSent) res.writeHead(500)
        res.end(String(e))
      })
    })
    const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 * 1024 })
    server.on('upgrade', (req, socket, head) => {
      const m = /^\/job\/(\d+)\/ws$/.exec(new URL(req.url ?? '/', 'http://x').pathname)
      if (!m || !service) {
        socket.destroy()
        return
      }
      const id = m[1]
      wss.handleUpgrade(req, socket, head, (ws) => service!.attachSocket(id, ws))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw new Error('no server address')
    const browser = await chromium.launch({
      channel: opts.channel ?? 'msedge',
      headless: opts.headless ?? true,
      args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    })
    service = new RenderService(server, wss, addr.port, browser)
    return service
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  async render(job: RenderJob): Promise<void> {
    const id = String(this.nextId++)
    const done = new Promise<void>((resolve, reject) =>
      this.jobs.set(id, { job, resolve, reject, received: 0, chain: Promise.resolve(), failed: false }),
    )
    const page = await this.browser.newPage()
    const logs: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`)
    })
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
    try {
      await page.goto(`${this.baseUrl}/?job=${id}`)
      await done
    } catch (e) {
      const extra = logs.length ? `\nbrowser console:\n${logs.slice(-20).join('\n')}` : ''
      throw new Error(`${e instanceof Error ? e.message : String(e)}${extra}`)
    } finally {
      this.jobs.delete(id)
      await page.close()
    }
  }

  async close(): Promise<void> {
    await this.browser.close()
    this.wss.close()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  private attachSocket(id: string, ws: WebSocket): void {
    const active = this.jobs.get(id)
    if (!active) {
      ws.close()
      return
    }
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary || active.failed) return
      const i = data.readUInt32LE(0)
      const pixels = data.subarray(4)
      const expected = frameBytes(active.job.scene)
      active.chain = active.chain.then(async () => {
        if (active.failed) return
        try {
          if (pixels.length !== expected) throw new Error(`frame ${i}: got ${pixels.length} bytes, expected ${expected}`)
          await active.job.onPixels(i, pixels)
          active.received++
          active.job.onProgress?.(active.received, active.job.frameCount)
          ws.send(String(i))
        } catch (e) {
          active.failed = true
          active.reject(e instanceof Error ? e : new Error(String(e)))
          ws.close()
        }
      })
    })
  }

  private async handle(req: IncomingMessage, res: ServerResponse, js: string): Promise<void> {
    const url = new URL(req.url ?? '/', this.baseUrl)
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE_HTML)
      return
    }
    if (url.pathname === '/renderer.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' }).end(js)
      return
    }
    const m = /^\/job\/(\d+)\/(scene|frames|done|error)$/.exec(url.pathname)
    const active = m ? this.jobs.get(m[1]) : undefined
    if (!m || !active) {
      res.writeHead(404).end()
      return
    }
    const { job } = active
    switch (m[2]) {
      case 'scene':
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(job.scene))
        return
      case 'frames': {
        const from = Number(url.searchParams.get('from') ?? 0)
        const count = Number(url.searchParams.get('count') ?? 1)
        const frames: FrameData[] = []
        for (let i = from; i < Math.min(job.frameCount, from + count); i++) frames.push(job.frame(i))
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(frames))
        return
      }
      case 'done': {
        const body = await readBody(req)
        res.writeHead(200).end()
        if (body.length) active.profile = JSON.parse(body.toString('utf8')) as RenderProfile
        await active.chain
        job.onDone?.(active.profile)
        if (active.failed) return
        if (active.received !== job.frameCount) active.reject(new Error(`renderer finished after ${active.received}/${job.frameCount} frames`))
        else active.resolve()
        return
      }
      case 'error': {
        const body = await readBody(req)
        res.writeHead(200).end()
        active.failed = true
        active.reject(new Error(`renderer page error: ${body.toString('utf8')}`))
        return
      }
    }
  }
}

/** Bytes per frame for the scene's output format. */
export function frameBytes(scene: SceneDescription): number {
  return scene.output === 'yuv420p' ? (scene.width * scene.height * 3) / 2 : scene.width * scene.height * 4
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
