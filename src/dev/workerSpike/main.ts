/**
 * M1.2 spike: the same frames read on the main thread and in a worker, timed,
 * and the landmarks compared. `?clip=` picks a bench clip; `?frames=` how many.
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { fetchStreamed } from '../../lib/engineDownload'

const out = document.getElementById('out')!
const log = (s: string) => (out.textContent += s + '\n')
const q = new URLSearchParams(location.search)
const clip = q.get('clip') ?? 'Saque_con_pelota.webm'
const N = Number(q.get('frames') ?? 30)
type Reply = { kind: string; message?: string; ms: number; image?: { x: number; y: number }[] }
const page = window as unknown as { __spike?: unknown }
const delegate = (q.get('delegate') ?? 'CPU') as 'CPU' | 'GPU'

async function run() {
  const model = await fetchStreamed('/models/pose_landmarker_full.task')
  const video = document.createElement('video')
  video.muted = true
  video.src = `/bench-data/clips/${clip}`
  await new Promise((r, j) => ((video.onloadeddata = r), (video.onerror = j)))
  const times = Array.from({ length: N }, (_, i) => (video.duration * (0.1 + (0.8 * i) / N)))
  const seek = (t: number) => new Promise<void>((r) => { video.onseeked = () => r(); video.currentTime = t })

  // The worker first, so the main-thread instance is not warm when it is timed.
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const reply = (kind: string) => new Promise<Reply>((r) => { const h = (e: MessageEvent) => { if (e.data.kind === kind || e.data.kind === 'error') { worker.removeEventListener('message', h); r(e.data) } }; worker.addEventListener('message', h) })
  const t0 = performance.now()
  worker.postMessage({ kind: 'init', model: model.buffer.slice(0), wasm: '/wasm', delegate })
  const ready = await reply('ready')
  if (ready.kind === 'error') { log('WORKER FAILED TO LOAD:\n' + ready.message); page.__spike = { ok: false, error: ready.message }; return }
  log(`worker ready in ${Math.round(performance.now() - t0)} ms`)

  const fileset = await FilesetResolver.forVisionTasks('/wasm')
  const main = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: model, delegate },
    runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  })

  let worst = 0, mainMs = 0, workerMs = 0, both = 0, longest = 0
  for (let i = 0; i < N; i++) {
    await seek(times[i])
    const ts = Math.round(times[i] * 1000) + 1
    const a = performance.now()
    const m = main.detectForVideo(video, ts).landmarks?.[0]
    const spent = performance.now() - a
    mainMs += spent
    longest = Math.max(longest, spent)
    const bitmap = await createImageBitmap(video)
    const pending = reply('pose')
    worker.postMessage({ kind: 'frame', i, ts, bitmap }, [bitmap])
    const w = await pending
    if (w.kind === 'error') { log('worker error: ' + w.message); break }
    workerMs += w.ms
    if (m && w.image) {
      both++
      for (let k = 0; k < m.length; k++) worst = Math.max(worst, Math.abs(m[k].x - w.image[k].x), Math.abs(m[k].y - w.image[k].y))
    }
  }
  const result = { ok: true, delegate, frames: N, both, worstDiff: worst, mainMsPerFrame: Math.round(mainMs / N), workerMsPerFrame: Math.round(workerMs / N), longestMainTaskMs: Math.round(longest) }
  ;page.__spike = result
  log(JSON.stringify(result, null, 2))
}
run().catch((e) => { log('FAILED: ' + (e?.stack ?? e)); page.__spike = { ok: false, error: String(e) } })
