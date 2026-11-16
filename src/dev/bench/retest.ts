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

interface Reading {
  outcome: string
  overall?: number
  focus?: string
  flaws: string[]
  metrics: Record<string, number>
  speedKmh?: number
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
      const copy = await record(url, from, to, change)
      const got = await analyse(copy, `${change.id}-${clip}`)
      URL.revokeObjectURL(copy)
      const r = got.reading
      if (change.id === 'control') control = r
      const row: RetestRow = { clip, change: change.id, outcome: got.error ? `error: ${got.error}` : (r?.outcome ?? 'none'), moves: {}, pastNoise: [] }
      if (r) {
        row.overall = r.overall
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
      log(`  ${change.id}: ${row.outcome}, overall ${row.overall ?? '-'}${row.overallMove !== undefined ? ` (${row.overallMove >= 0 ? '+' : ''}${row.overallMove})` : ''}${row.pastNoise.length ? `, past noise: ${row.pastNoise.join(' ')}` : ''}`)
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

void run()
