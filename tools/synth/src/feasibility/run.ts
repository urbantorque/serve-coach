/**
 * Detection feasibility check: render stills of one serve in several views/distances, run the app's
 * MediaPipe Pose Landmarker (full model, IMAGE mode) on the full frame and on a square crop around the
 * player (an oracle ROI from the truth box, standing in for a tracker), and score against truth.
 *
 *   npx tsx src/feasibility/run.ts [--out <json>] [--views side,rear,front45] [--distances 4,7,12]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RenderService } from '../render/service.ts'
import { buildScenario, type Scenario } from '../setup.ts'
import { renderStills, type StillResult } from './stills.ts'
import { PoseDetector, scorePose } from './detect.ts'
import type { ViewName } from '../camera.ts'
import type { LightingPreset } from '../render/sceneTypes.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOOL = resolve(HERE, '..', '..')
const REPO = resolve(TOOL, '..', '..')

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

export function probeScenario(view: ViewName, distanceM: number, lighting: LightingPreset = 'bright', outfit: 'red' | 'white' | 'navy' = 'red'): Scenario {
  return {
    id: `probe-${view}-${distanceM}m-${lighting}`,
    description: 'feasibility probe',
    seed: 11,
    player: { profile: 'intermediate', outfit },
    serves: { count: 1, serveSeed: 1001 },
    video: { fps: 60, orientation: 'portrait', shortSidePx: 1080 },
    camera: { view, distanceM, heightM: 1.2, lookAtHeightM: 1.6, focal35mmEquivMm: 26 },
    look: { lighting, surface: 'hard-blue' },
    outputs: [],
  }
}

/** Square crop centred on the truth box, side = 1.3 x the box's larger side (in pixels). */
function oracleCrop(r: StillResult, W: number, H: number): [number, number, number, number] {
  const [x0, y0, x1, y1] = r.bbox
  const cx = ((x0 + x1) / 2) * W
  const cy = ((y0 + y1) / 2) * H
  const side = Math.max((x1 - x0) * W, (y1 - y0) * H) * 1.3
  const half = Math.min(side / 2, W / 2, H / 2)
  const ccx = Math.min(W - half, Math.max(half, cx))
  const ccy = Math.min(H - half, Math.max(half, cy))
  return [(ccx - half) / W, (ccy - half) / H, (ccx + half) / W, (ccy + half) / H]
}

async function main(): Promise<void> {
  const views = arg('views', 'side,rear,front45').split(',') as ViewName[]
  const distances = arg('distances', '4,7,12').split(',').map(Number)
  const lighting = arg('lighting', 'bright') as LightingPreset
  const outfit = arg('outfit', 'red') as 'red'
  const outJson = resolve(arg('out', join(REPO, 'validation', 'synthetic', 'feasibility.json')))
  const stillsRoot = join(TOOL, '.cache', 'feasibility')
  const svc = await RenderService.start()
  const det = await PoseDetector.start()
  const rows: Record<string, unknown>[] = []
  try {
    for (const view of views) {
      for (const d of distances) {
        const b = buildScenario(probeScenario(view, d, lighting, outfit))
        const T = b.clip.plans[0].times
        const stills = [
          ['setup', 0.3],
          ['motion', T.motionStartS + 0.35],
          ['pre-release', T.tossReleaseS - 0.2],
          ['release', T.tossReleaseS],
          ['trophy', (T.trophyStartS + T.trophyEndS) / 2],
          ['drop', T.contactS - 0.12],
          ['contact', T.contactS],
          ['follow', T.contactS + 0.12],
          ['landing', T.landingS + 0.05],
          ['recovery', T.recoveryEndS - 0.3],
        ].map(([name, t]) => ({ name: name as string, tRealS: t as number }))
        const dir = join(stillsRoot, `${view}-${d}m-${lighting}-${outfit}`)
        const res = await renderStills(svc, b.setup, stills, dir)
        const W = b.setup.intrinsics.widthPx
        const H = b.setup.intrinsics.heightPx
        const full = await det.detect(res.map((r) => ({ file: r.file })))
        const crop = await det.detect(res.map((r) => ({ file: r.file, crop: oracleCrop(r, W, H) })))
        for (let i = 0; i < res.length; i++) {
          const heightPx = (res[i].bbox[3] - res[i].bbox[1]) * H
          const row: Record<string, unknown> = { view, distanceM: d, lighting, outfit, still: res[i].name, playerBoxHeightPx: Math.round(heightPx) }
          for (const [label, r] of [
            ['full', full[i]],
            ['crop', crop[i]],
          ] as const) {
            row[`${label}Detected`] = r.detected
            if (r.landmarks) {
              const s = scorePose(r.landmarks, res[i].landmarks2d, W, H)
              row[`${label}ErrOverHeight`] = +s.meanErrOverHeight.toFixed(4)
              row[`${label}Pck10`] = +s.pck10.toFixed(3)
              row[`${label}LRSwapped`] = s.leftRightSwapped
            }
          }
          rows.push(row)
        }
        const n = res.length
        const fullRate = full.filter((r) => r.detected).length / n
        const cropRate = crop.filter((r) => r.detected).length / n
        console.log(`${view.padEnd(8)} ${String(d).padStart(3)} m  full ${(fullRate * 100).toFixed(0).padStart(3)}%  crop ${(cropRate * 100).toFixed(0).padStart(3)}%`)
      }
    }
  } finally {
    await det.close()
    await svc.close()
  }
  const summary: Record<string, unknown>[] = []
  const keys = [...new Set(rows.map((r) => `${r.view}|${r.distanceM}`))]
  for (const k of keys) {
    const rs = rows.filter((r) => `${r.view}|${r.distanceM}` === k)
    const rate = (f: string) => rs.filter((r) => r[f] === true).length / rs.length
    const meanOf = (f: string) => {
      const v = rs.map((r) => r[f]).filter((x): x is number => typeof x === 'number')
      return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : null
    }
    summary.push({
      view: rs[0].view,
      distanceM: rs[0].distanceM,
      stills: rs.length,
      fullFrameDetectionRate: +rate('fullDetected').toFixed(2),
      cropDetectionRate: +rate('cropDetected').toFixed(2),
      fullMeanErrOverHeight: meanOf('fullErrOverHeight'),
      cropMeanErrOverHeight: meanOf('cropErrOverHeight'),
      cropPck10: meanOf('cropPck10'),
      medianPlayerHeightPx: rs.map((r) => r.playerBoxHeightPx as number).sort((a, b) => a - b)[Math.floor(rs.length / 2)],
    })
  }
  mkdirSync(dirname(outJson), { recursive: true })
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: 'pose_landmarker_full.task (app/public/models), IMAGE mode, numPoses 1, confidences 0.5',
        note: 'crop = square ROI centred on the truth player box (1.3x its larger side), an oracle stand-in for a tracker ROI',
        lighting,
        outfit,
        summary,
        rows,
      },
      null,
      1,
    ),
  )
  console.table(summary)
}

await main()
