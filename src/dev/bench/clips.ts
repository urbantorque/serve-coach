/**
 * The whole pipeline on real, openly licensed serve footage — before and after.
 *
 * Dev only (`clipbench.html`, never bundled). The clips are Wikimedia Commons
 * videos fetched into `bench-data/clips/` with their attribution; none was
 * filmed for this app, which is the point: amateur-grade, low-resolution,
 * odd angles. Each runs through `analyzeServe` twice, reading whole frames
 * (the app before `playerCrop.ts`) and reading the crop round the server, and
 * the table shows what changed: how much of the window was tracked, whether
 * the clip was refused, where the keyframes landed, what was measured.
 *
 * There are no labels here — that is what `bench.html` is for. This answers a
 * different question: does the change hold up end to end on footage the rig
 * never produced.
 */
import { analyzeServe } from '../../lib/analysis/analyze'
import type { Analysis } from '../../lib/analysis/types'
import { samplingRateFor } from '../../lib/pose/rate'

const CLIPS = [
  '0SAQUE.webm',
  'Saque_con_pelota.webm',
  'Saque_reves.webm',
  'Sharapova_Amelia_Island.webm',
  'Blaz_Rola_NCAAs_2013.webm',
]

const out = document.getElementById('out')!
const log = (s: string) => {
  out.textContent += s + '\n'
}

interface Row {
  clip: string
  mode: 'before' | 'after'
  refined?: number
  outcome: string
  cropped?: boolean
  tracked?: string
  contact?: string
  /** Shoulders/hips half turned, ms from the racket drop (D3.6); side-on only. */
  chest?: string
  overall?: number
  focus?: string
  metrics?: Record<string, number | undefined>
  ms: number
}

function describe(a: Analysis): Omit<Row, 'clip' | 'mode' | 'ms'> {
  const span = Math.max(0.2, a.window.end - a.window.start)
  // The same count `extractFrames` asks for; the frames kept are the ones with a pose.
  const expected = Math.max(8, Math.round(span * samplingRateFor(span)))
  const contact = a.phases.find((p) => p.id === 'contact')
  const metric = (id: string) => a.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === id)
  const pick = (id: string) => {
    const m = metric(id)
    return m ? Math.round(m.value * 100) / 100 : undefined
  }
  return {
    outcome: a.triage?.status === 'rejected' ? `refused: ${a.triage.reason}` : 'measured',
    cropped: a.cost?.cropped,
    refined: a.cost?.refined,
    tracked: `${a.frames.length}/${expected}`,
    // Which cue decided contact (`readContact`), beside when it was.
    contact: contact ? `${contact.t.toFixed(2)}${a.contact ? ` ${a.contact.from}` : ''}` : undefined,
    chest: a.diagnosis?.chestTurn ? `${a.diagnosis.chestTurn.shouldersMs}/${a.diagnosis.chestTurn.hipsMs}` : undefined,
    overall: a.overall,
    focus: a.focus?.title,
    metrics: {
      contactHeight: pick('contactHeight'),
      dropDepth: pick('dropDepth'),
      kneeBend: pick('kneeBend'),
      armExtension: pick('armExtension'),
      // The two read off the ball, absent when it was not found.
      tossPeakHeight: pick('tossPeakHeight'),
      contactBelowPeak: pick('contactBelowPeak'),
    },
  }
}

async function run() {
  const rows: Row[] = []
  for (const clip of CLIPS) {
    // Before: MediaPipe on whole frames, as the app read clips until now.
    // After: the player crop and RTMPose's second read of the swing.
    for (const mode of ['before', 'after'] as const) {
      const t0 = performance.now()
      let row: Row
      try {
        const a = await analyzeServe({
          videoUrl: `/bench-data/clips/${clip}`,
          fileName: clip,
          skipPlayerCrop: mode === 'before',
          skipPoseRefine: mode === 'before',
          skipThumbnails: true,
        })
        row = { clip, mode, ...describe(a), ms: performance.now() - t0 }
      } catch (e) {
        row = { clip, mode, outcome: `error: ${(e as Error).message.slice(0, 90)}`, ms: performance.now() - t0 }
      }
      rows.push(row)
      log(`${clip} · ${mode}: ${row.outcome} ${row.tracked ?? ''}`)
    }
  }
  ;(window as unknown as { __clips: Row[] }).__clips = rows
  document.getElementById('table')!.innerHTML =
    '<table><tr><th>clip</th><th>mode</th><th>outcome</th><th>crop</th><th>refined</th><th>tracked</th><th>contact s</th><th>chest ms</th><th>overall</th><th>focus</th><th>metrics</th><th>ms</th></tr>' +
    rows
      .map(
        (r) =>
          `<tr><td>${r.clip}</td><td>${r.mode}</td><td>${r.outcome}</td><td>${r.cropped ?? ''}</td><td>${r.refined ?? ''}</td><td>${r.tracked ?? ''}</td><td>${r.contact ?? ''}</td><td>${r.chest ?? ''}</td><td>${r.overall ?? ''}</td><td>${r.focus ?? ''}</td><td>${r.metrics ? JSON.stringify(r.metrics) : ''}</td><td>${r.ms.toFixed(0)}</td></tr>`,
      )
      .join('') +
    '</table>'
  log('done')
}

run().catch((e) => log(`FAILED: ${(e as Error).stack ?? e}`))
