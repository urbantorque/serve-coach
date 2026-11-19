/**
 * Test-retest on real footage (N2.1): does a reading stay put when the same
 * serve reaches the app a little differently?
 *
 * Dev only (`retest.html`, never bundled). There are no labels for these
 * clips, so this cannot say a reading is right. It can say whether it is
 * stable: a player who films the same serve twice, once at dusk and once a
 * step further back, should not be told two different things. Every graded
 * reading has a stated take-to-take noise (`CARD_NOISE_SD`, measured on the
 * rig); here it is held to that on openly licensed amateur clips.
 *
 * How. The serve's own window is found on the original file, then that stretch
 * is drawn frame by frame onto a canvas and recorded back to WebM in the
 * browser, once as it is (the control: the same re-encode with nothing else
 * changed) and once for each change below. Every copy is read whole by
 * `analyzeServe`, and each reading is compared with the control's.
 *
 * A difference of two independent reads has a spread of about 1.4 times one
 * read's, so a reading moves "past its noise" when it moves more than
 * 2 x 1.41 = 2.83 of its stated noise: about a 1-in-200 event if the table is
 * right. The table is a floor (STATUS.md), so some of that is expected.
 */
import { analyzeServe } from '../../lib/analysis/analyze'
import { CARD_NOISE_SD } from '../../lib/analysis/cardNoise'
import type { Analysis } from '../../lib/analysis/types'

const params = new URLSearchParams(location.search)
const CLIPS = (params.get('clips') ?? 'Saque_con_pelota.webm,0SAQUE.webm,Saque_reves.webm').split(',')

/** How the same serve can reach the app differently. */
interface Change {
  id: string
  what: string
  scale?: number
  crop?: number
  filter?: string
  /** Seconds trimmed off the front: the frames fall in different places. */
  late?: number
}

const CHANGES: Change[] = [
  { id: 'control', what: 'the same stretch, re-encoded, nothing else changed' },
  { id: 'darker', what: 'dusk: 60% brightness, a little less contrast', filter: 'brightness(0.6) contrast(0.9)' },
  { id: 'further', what: 'a step further back: 8% cropped off each side, scaled back up', crop: 0.08 },
  { id: 'smaller', what: 'a lower-resolution phone: 60% of the pixels each way', scale: 0.6 },
  { id: 'late', what: 'started 1/40 s later, so every frame falls elsewhere', late: 0.025 },
]

const out = document.getElementById('out')!
const log = (s: string) => {
  out.textContent += s + '\n'
  console.log(s)
}

/** Records `[from, to]` of a clip through a canvas, changed by `change`. */
async function record(url: string, from: number, to: number, change: Change): Promise<string> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.src = url
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('decode'))
  })
  const scale = change.scale ?? 1
  const w = Math.round((video.videoWidth * scale) / 2) * 2
  const h = Math.round((video.videoHeight * scale) / 2) * 2
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const crop = change.crop ?? 0
  const sx = video.videoWidth * crop
  const sy = video.videoHeight * crop
  const sw = video.videoWidth * (1 - 2 * crop)
  const sh = video.videoHeight * (1 - 2 * crop)
  const draw = () => {
    ctx.filter = change.filter ?? 'none'
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h)
  }

  video.currentTime = from + (change.late ?? 0)
  await new Promise((r) => (video.onseeked = r))
  draw()
  const stream = canvas.captureStream(60)
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (recorder.onstop = () => r()))
  recorder.start()

  await new Promise<void>((resolve) => {
    const step = () => {
      draw()
      if (video.currentTime >= to || video.ended) {
        video.pause()
        resolve()
        return
      }
      video.requestVideoFrameCallback(step)
    }
    video.requestVideoFrameCallback(step)
    void video.play()
  })
  recorder.stop()
  await done
  return URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
}

/** How long a recorded copy really is, as the browser reads it back. */
async function lengthOf(url: string): Promise<number> {
  const v = document.createElement('video')
  v.muted = true
  v.src = url
  await new Promise<void>((resolve) => {
    v.onloadedmetadata = () => resolve()
    v.onerror = () => resolve()
  })
  return Number.isFinite(v.duration) ? v.duration : 0
}

/**
 * Record a copy and check it came out whole (N2.4). A copy recorded while the
 * machine was busy can come out a fraction of a second long: on 2026-11-19 the
 * copies the bench had blamed for collapsed swings and flipped refusals were
 * each 18 KB, about 0.17 s of video. Up to three tries; a copy still short is
 * reported as short, never read as though it were the serve.
 */
async function recordWhole(url: string, from: number, to: number, change: Change): Promise<{ copy: string; seconds: number; tries: number }> {
  const want = to - from - (change.late ?? 0)
  let last = { copy: '', seconds: 0, tries: 0 }
  for (let tries = 1; tries <= 3; tries++) {
    const copy = await record(url, from, to, change)
    const seconds = await lengthOf(copy)
    last = { copy, seconds, tries }
    if (seconds >= 0.9 * want) return last
    log(`  ${change.id}: recording came out ${seconds.toFixed(2)} s of ${want.toFixed(2)}, again`)
    URL.revokeObjectURL(copy)
  }
  return last
}

interface Reading {
  outcome: string
  overall?: number
  focus?: string
  flaws: string[]
  metrics: Record<string, number>
  speedKmh?: number
  /** What the refusal gates read (`triage.ts` `LIMITS`): how close each copy came to them. */
  blur?: number
  swingSamples?: number
  /** Where each phase landed, in seconds into the copy. */
  phases?: Record<string, number>
}

function read(a: Analysis): Reading {
  const metrics: Record<string, number> = {}
  for (const f of a.fundamentals) for (const m of f.metrics) metrics[m.id] = m.value
  const speed = a.speed && 'speed' in a.speed ? a.speed.speed.ms * 3.6 : undefined
  return {
    outcome: a.triage?.status === 'rejected' ? `refused: ${a.triage.reason}` : 'measured',
    overall: a.overall,
    focus: a.focus?.title,
    flaws: (a.diagnosis?.flaws ?? []).filter((f) => f.detected).map((f) => f.flaw).sort(),
    metrics,
    speedKmh: speed,
    blur: a.triage?.quality ? Math.round(a.triage.quality.blur * 1000) / 1000 : undefined,
    swingSamples: a.triage?.quality?.swing_samples,
    phases: Object.fromEntries(a.phases.map((p) => [p.id, Math.round(p.t * 1000) / 1000])),
  }
}

async function analyse(url: string, fileName: string): Promise<{ reading?: Reading; window?: [number, number]; error?: string }> {
  try {
    const a = await analyzeServe({ videoUrl: url, fileName, skipThumbnails: true })
    return { reading: read(a), window: [a.window.start, a.window.end] }
  } catch (e) {
    return { error: (e as Error).message.slice(0, 120) }
  }
}

export interface RetestRow {
  clip: string
  change: string
  outcome: string
  blur?: number
  swingSamples?: number
  overall?: number
  overallMove?: number
  /**
   * Both this copy and the control were measured. Where one was refused, its
   * headline comes from a different path, so a changed fix says more about the
   * gate than about the reading (N2.1).
   */
  bothMeasured?: boolean
  focusSame?: boolean
  flawsSame?: boolean
  /** Each graded reading's move from the control, in units of its stated noise. */
  moves: Record<string, number>
  pastNoise: string[]
  speedMoveKmh?: number
}

const PAST = 2 * Math.SQRT2

/** Copies whose swing window collapsed, kept so they can be saved and replayed. */
const cases: { name: string; url: string; phases?: Record<string, number>; error?: string }[] = []
;(window as unknown as { __retestCases: typeof cases }).__retestCases = cases

/**
 * `?file=name.webm`: read one saved copy from `bench-data/retest-cases/` three
 * times and log where its phases landed, to see whether a failure is the
 * file's or the read's.
 */
async function single(file: string) {
  const runs: unknown[] = []
  // `&before=clip.webm`: read another clip first, to see whether what the
  // engine read last changes what it reads next.
  const before = params.get('before')
  if (before) {
    const b = await analyse(before.includes('/') ? before : `/bench-data/clips/${before}`, before)
    log(`before: ${before} ${b.error ?? b.reading?.outcome}`)
  }
  for (let i = 0; i < 3; i++) {
    const got = await analyse(`/bench-data/retest-cases/${file}`, file)
    log(`${file} #${i + 1}: ${got.error ?? got.reading?.outcome} swing ${got.reading?.swingSamples} ${JSON.stringify(got.reading?.phases)}`)
    runs.push(got)
  }
  ;(window as unknown as { __single: unknown[] }).__single = runs
}

async function run() {
  const rows: RetestRow[] = []
  for (const clip of CLIPS) {
    const url = `/bench-data/clips/${clip}`
    const first = await analyse(url, clip)
    if (!first.window) {
      log(`${clip}: no window (${first.error ?? first.reading?.outcome})`)
      continue
    }
    const from = Math.max(0, first.window[0] - 0.6)
    const to = first.window[1] + 0.6
    log(`${clip}: window ${first.window[0].toFixed(2)}–${first.window[1].toFixed(2)} s`)
    let control: Reading | undefined
    for (const change of CHANGES) {
      const recorded = await recordWhole(url, from, to, change)
      const copy = recorded.copy
      if (recorded.seconds < 0.9 * (to - from - (change.late ?? 0))) {
        rows.push({ clip, change: change.id, outcome: `short recording: ${recorded.seconds.toFixed(2)} s`, moves: {}, pastNoise: [] })
        log(`  ${change.id}: short recording after ${recorded.tries} tries, not read`)
        continue
      }
      const got = await analyse(copy, `${change.id}-${clip}`)
      // A copy whose swing collapsed, or that could not be read, is kept for
      // `scripts/retest.mjs` to save, so the failure can be replayed exactly.
      const collapsed = got.error !== undefined || (got.reading?.swingSamples ?? 99) < 6
      if (collapsed) cases.push({ name: `${change.id}-${clip}`, url: copy, phases: got.reading?.phases, error: got.error })
      else URL.revokeObjectURL(copy)
      const r = got.reading
      if (change.id === 'control') control = r
      const row: RetestRow = { clip, change: change.id, outcome: got.error ? `error: ${got.error}` : (r?.outcome ?? 'none'), moves: {}, pastNoise: [] }
      if (r) {
        row.overall = r.overall
        row.blur = r.blur
        row.swingSamples = r.swingSamples
        if (control && change.id !== 'control') {
          if (r.overall !== undefined && control.overall !== undefined) row.overallMove = r.overall - control.overall
          row.bothMeasured = r.outcome === 'measured' && control.outcome === 'measured'
          row.focusSame = r.focus === control.focus
          row.flawsSame = r.flaws.join() === control.flaws.join()
          for (const [id, v] of Object.entries(r.metrics)) {
            const c = control.metrics[id]
            const sd = CARD_NOISE_SD[id]
            if (c === undefined || !sd) continue
            const move = Math.abs(v - c) / sd
            row.moves[id] = Math.round(move * 100) / 100
            if (move > PAST) row.pastNoise.push(id)
          }
          if (r.speedKmh !== undefined && control.speedKmh !== undefined) row.speedMoveKmh = Math.round((r.speedKmh - control.speedKmh) * 10) / 10
        }
      }
      rows.push(row)
      log(`  ${change.id}: ${row.outcome} [blur ${row.blur ?? '-'}, swing ${row.swingSamples ?? '-'}], overall ${row.overall ?? '-'}${row.overallMove !== undefined ? ` (${row.overallMove >= 0 ? '+' : ''}${row.overallMove})` : ''}${row.pastNoise.length ? `, past noise: ${row.pastNoise.join(' ')}` : ''}`)
    }
  }
  ;(window as unknown as { __retest: RetestRow[] }).__retest = rows
  document.getElementById('table')!.innerHTML =
    '<table><tr><th>clip</th><th>change</th><th>outcome</th><th>overall</th><th>move</th><th>same fix</th><th>same faults</th><th>past noise</th><th>speed move</th></tr>' +
    rows
      .map(
        (r) =>
          `<tr><td>${r.clip}</td><td>${r.change}</td><td>${r.outcome}</td><td>${r.overall ?? ''}</td><td>${r.overallMove ?? ''}</td><td>${r.focusSame ?? ''}</td><td>${r.flawsSame ?? ''}</td><td>${r.pastNoise.join(' ')}</td><td>${r.speedMoveKmh ?? ''}</td></tr>`,
      )
      .join('') +
    '</table>'
  log('done')
}

const file = params.get('file')
void (file ? single(file) : run())
