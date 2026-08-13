/**
 * Does the JS heap stay flat across repeated analyses?
 *
 * Dev-only, and dynamically imported so none of it reaches the production
 * bundle. Answers R4 in `NEXT.md`, which named four suspects — object URLs, the
 * two extraction canvases, the pose landmarker, and `MediaRecorder` chunks — none
 * of which a Node test can see, because none of them exist without a `<video>`
 * element, a decoder and a compositor. This is the closest thing to that test
 * this repo can run without real footage: a blank canvas recorded to a real
 * playable clip via `sampleClip`, pushed through the actual `analyzeServe`
 * pipeline — same video element, same decoder, same landmarker, same object URL
 * lifecycle a real serve uses — ten times in a row, with the heap read between
 * each.
 *
 * WHAT THIS DOES NOT COVER. `sampleClip` draws no player, so `detectServe` always
 * refuses it with `NotAServeError` before `captureThumbnails` or `findBall` ever
 * run — the two other canvas users in the pipeline. Proving those flat needs a
 * clip a serve can actually be found in, which needs real footage, which is the
 * same block `NEXT.md` already records against the fixture shoot and the court
 * trip. Named here rather than silently skipped.
 *
 * Run it from the console on a running dev server:
 *
 *   const { runLeakProbe } = await import('/src/dev/leakProbe.ts')
 *   await runLeakProbe()
 *
 * `performance.memory` is a Chrome-only API. Elsewhere this returns `measurable:
 * false` rather than a row of zeros that would read as a clean bill of health.
 */
import { sampleClip } from './sampleAnalysis'
import { analyzeServe } from '../lib/analysis/analyze'

export interface LeakReading {
  run: number
  beforeMB: number
  afterMB: number
  /** The pipeline is expected to refuse every run — see the module doc. Anything else is worth reading. */
  outcome: 'refused' | 'unexpected-success' | string
}

export interface LeakProbeResult {
  measurable: boolean
  readings: LeakReading[]
  /** Highest reading minus the lowest, across every `afterMB` — the number worth reading at a glance. */
  spreadMB?: number
}

export async function runLeakProbe(runs = 10, clipSeconds = 3): Promise<LeakProbeResult> {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  if (!memory) return { measurable: false, readings: [] }

  const readings: LeakReading[] = []
  for (let run = 0; run < runs; run++) {
    const beforeMB = memory.usedJSHeapSize / 1e6
    const url = await sampleClip(clipSeconds)
    let outcome: LeakReading['outcome']
    try {
      await analyzeServe({
        videoUrl: url,
        fileName: `leak-probe-${run}.webm`,
        handedness: 'right',
        skipFramingCheck: true,
        skipBall: true,
      })
      outcome = 'unexpected-success'
    } catch (err) {
      outcome = (err as Error)?.name === 'NotAServeError' ? 'refused' : String((err as Error)?.message ?? err)
    } finally {
      URL.revokeObjectURL(url)
    }
    // Let a pending GC land before the next reading, rather than reading straight
    // off the top of an allocation burst nothing has had a chance to reclaim yet.
    await new Promise((r) => setTimeout(r, 50))
    const afterMB = memory.usedJSHeapSize / 1e6
    readings.push({ run, beforeMB: round(beforeMB), afterMB: round(afterMB), outcome })
  }

  const afters = readings.map((r) => r.afterMB)
  return { measurable: true, readings, spreadMB: round(Math.max(...afters) - Math.min(...afters)) }
}

const round = (n: number) => Math.round(n * 100) / 100
