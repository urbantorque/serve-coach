/**
 * DEV ONLY. Seeds playback sessions built from real engine output on synthetic clips, so Serve detail
 * and Tagging can be developed and screenshotted with real video, poses, ball tracks and key frames.
 * Opening /sessions/dev-upright/serves/dev-upright-serve-01 (or any `dev-` session below) loads them.
 * The clips come from the dev server's /__synthetic/ corpus; key frames are grabbed from the clip in
 * the browser. Every record is flagged as sample data (isDemo), so the sample banner shows and nothing
 * reaches Progress or exports. Imported only behind `import.meta.env.DEV`.
 */
import type { KeyFrameEvent, ServeOutcome } from '../../../../analysis/types.ts'
import type { ServeAnalysis } from '../../../../data/domain.ts'
import {
  addVideo,
  createSession,
  getSession,
  putDecision,
  putServesWithTracksAndFrames,
  putStats,
  setTag,
} from '../../../../data/index.ts'
import type { CoachingRecord, KeyFrameRecord, TrackRecord } from '../../../../data/records.ts'
import { EVENT_KEY } from '../../../components/video/keyFrames.ts'
import { fixtureServe, fixtureSession, fixtureStats, fixtureVideo, type PlaybackFixture } from './harnessFixture.ts'

type Clip = 'baseline-s1' | 'baseline-s2' | 'fence9-s1'

const LOADERS: Record<Clip, () => Promise<{ default: string }>> = {
  'baseline-s1': () => import('./fixtures/baseline-s1.json?raw'),
  'baseline-s2': () => import('./fixtures/baseline-s2.json?raw'),
  'fence9-s1': () => import('./fixtures/fence9-s1.json?raw'),
}

interface DevSessionSpec {
  id: string
  label: string
  startedAt: string
  clips: Clip[]
  storage?: 'idb' | 'deleted'
  tags?: Record<number, ServeOutcome>
  focus?: boolean
}

export const DEV_SESSIONS: DevSessionSpec[] = [
  { id: 'dev-upright', label: 'Dev: upright beside the court', startedAt: '2026-09-26T08:10:00+10:00', clips: ['baseline-s1', 'baseline-s2'], tags: { 2: 'in' }, focus: true },
  { id: 'dev-upright-earlier', label: 'Dev: upright, a week earlier', startedAt: '2026-09-19T08:10:00+10:00', clips: ['baseline-s2'], tags: { 1: 'in' } },
  { id: 'dev-fence', label: 'Dev: sideways at the fence', startedAt: '2026-09-26T09:00:00+10:00', clips: ['fence9-s1'] },
  { id: 'dev-deleted', label: 'Dev: video deleted after 30 days', startedAt: '2026-08-20T08:10:00+10:00', clips: ['baseline-s1'], storage: 'deleted' },
]

export const isDevSessionId = (id: string | undefined): boolean => Boolean(id && DEV_SESSIONS.some((s) => s.id === id))

const KEY_EVENTS: KeyFrameEvent[] = ['setup', 'release', 'apex', 'trophy', 'lowestHip', 'contact', 'landing', 'recovery']

function waitFor(el: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      el.removeEventListener(event, ok)
      el.removeEventListener('error', bad)
      resolve()
    }
    const bad = () => {
      el.removeEventListener(event, ok)
      el.removeEventListener('error', bad)
      reject(new Error(`video ${event} failed`))
    }
    el.addEventListener(event, ok)
    el.addEventListener('error', bad)
  })
}

const toJpeg = (canvas: HTMLCanvasElement, q = 0.82) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', q))

/**
 * Grabs full-frame thumbnails at the pipeline's size (480 px long side, analysis/pipeline/keyFrames.ts,
 * so the strip's player crop has the same pixels to work with) and 540 px evidence frames.
 */
async function grabKeyFrames(blob: Blob, serve: ServeAnalysis, fps: number, now: string): Promise<KeyFrameRecord[]> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await waitFor(video, 'loadeddata')
    const w = video.videoWidth
    const h = video.videoHeight
    const portrait = h > w
    const thumb = document.createElement('canvas')
    thumb.width = portrait ? Math.round((480 * w) / h) : 480
    thumb.height = portrait ? 480 : Math.round((480 * h) / w)
    const full = document.createElement('canvas')
    full.width = portrait ? 540 : 960
    full.height = Math.round((full.width * h) / w)
    const out: KeyFrameRecord[] = []
    for (const event of KEY_EVENTS) {
      const e = serve.events[EVENT_KEY[event]]
      if (!e || e.confidence < 0.5) continue
      video.currentTime = (e.frameIndex + 0.5) / fps
      await waitFor(video, 'seeked')
      const base = { serveId: serve.id, sessionId: serve.sessionId, event, frameIndex: e.frameIndex, tReal: e.tReal, createdAt: now }
      const tctx = thumb.getContext('2d')!
      // Cover-crop the frame into the thumbnail box.
      const s = Math.max(thumb.width / w, thumb.height / h)
      tctx.drawImage(video, (thumb.width - w * s) / 2, (thumb.height - h * s) / 2, w * s, h * s)
      out.push({ ...base, id: `${serve.id}:${event}:thumb`, role: 'thumb', width: thumb.width, height: thumb.height, blob: await toJpeg(thumb) })
      full.getContext('2d')!.drawImage(video, 0, 0, full.width, full.height)
      out.push({ ...base, id: `${serve.id}:${event}:evidence-full`, role: 'evidence-full', width: full.width, height: full.height, blob: await toJpeg(full, 0.8) })
    }
    return out
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

async function seed(spec: DevSessionSpec): Promise<void> {
  if (await getSession(spec.id)) return
  const now = new Date().toISOString()
  const serves: ServeAnalysis[] = []
  const tracks: TrackRecord[] = []
  const frames: KeyFrameRecord[] = []
  const videoIds: string[] = []
  let first: PlaybackFixture | null = null
  for (const [i, clip] of spec.clips.entries()) {
    const f = JSON.parse((await LOADERS[clip]()).default) as PlaybackFixture
    first ??= f
    const blob = await (await fetch(f.clipUrl)).blob()
    const videoId = `${spec.id}-video-${i + 1}`
    videoIds.push(videoId)
    const { serve, track } = fixtureServe(f, { sessionId: spec.id, index: i + 1, videoId, analysedAt: now })
    serves.push(serve)
    tracks.push(track)
    frames.push(...(await grabKeyFrames(blob, serve, f.meta.nominalFps, now)))
    const storage = spec.storage ?? 'idb'
    await addVideo(fixtureVideo(f, { id: videoId, sessionId: spec.id, importedAt: spec.startedAt, sizeBytes: blob.size, storage }), storage === 'idb' ? blob : undefined)
  }
  if (!first) return
  const serveIds = serves.map((s) => s.id)
  await createSession(fixtureSession(first, { id: spec.id, startedAt: spec.startedAt, label: spec.label, videoIds, serveIds }))
  for (const s of serves) s.keyFrames = Object.fromEntries(frames.filter((k) => k.serveId === s.id && k.role === 'thumb').map((k) => [k.event, { thumbId: k.id }]))
  await putServesWithTracksAndFrames(serves, tracks, frames)
  const tagged = Object.entries(spec.tags ?? {})
  const best = tagged.find(([, o]) => o === 'in')
  await putStats(fixtureStats(spec.id, serveIds, now, best ? serveIds[Number(best[0]) - 1] : undefined))
  for (const [index, outcome] of tagged) {
    await setTag(serveIds[Number(index) - 1], spec.id, { outcome, outcomeSource: 'player', serveNumber: 1, side: 'deuce', via: 'review' })
  }
  if (spec.focus) {
    const decision: CoachingRecord = {
      id: `${spec.id}-decision`,
      sessionId: spec.id,
      createdAt: now,
      libraryVersion: 'dev-fixture',
      engineVersion: '0.0.0-dev-fixture',
      gate: 'ok',
      focus: { faultId: 'toss-height-inconsistent', title: 'Steady toss height', phase: 'toss', evidenceTier: 'coach-recommended', whyChosen: 'Dev fixture focus.' },
      evidence: { event: 'apex', keyFrameId: `${serveIds[0]}:apex:thumb`, metricIds: ['toss-height-spread', 'toss-apex-height'], sentences: [] },
      alternatives: [],
      trace: [],
      phrasing: { source: 'template' },
      isDemo: 1,
    }
    await putDecision(decision)
  }
}

let inflight: Promise<void> | null = null

/** Seeds every dev playback session once per page load (idempotent across reloads). */
export function ensureDevFixtures(): Promise<void> {
  inflight ??= (async () => {
    for (const spec of DEV_SESSIONS) await seed(spec)
  })()
  return inflight
}
