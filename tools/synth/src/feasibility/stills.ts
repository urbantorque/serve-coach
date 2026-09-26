import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cameraAt, frameData, sceneDescription, type RenderSetup } from '../frames.ts'
import { project } from '../camera.ts'
import { encodePng } from '../png.ts'
import type { RenderService } from '../render/service.ts'

export interface StillSpec {
  name: string
  tRealS: number
}

export interface StillResult {
  name: string
  file: string
  tRealS: number
  /** Truth 2D landmarks (normalised, top-left origin) for the 33 BlazePose points. */
  landmarks2d: [number, number][]
  /** Player bounding box in normalised coords (from projected landmarks, padded). */
  bbox: [number, number, number, number]
}

/** Render single frames at chosen real times to PNG, with the matching truth projections. */
export async function renderStills(service: RenderService, setup: RenderSetup, stills: StillSpec[], outDir: string): Promise<StillResult[]> {
  mkdirSync(outDir, { recursive: true })
  const W = setup.intrinsics.widthPx
  const H = setup.intrinsics.heightPx
  const scene = sceneDescription(setup)
  const results: StillResult[] = []
  // Each still is rendered as "frame i" with a custom time origin so shutter/blur logic is unchanged.
  const frames = stills.map((s) => frameData({ ...setup, t0S: s.tRealS, captureFps: 1e9 }, 0))
  frames.forEach((f, i) => (f.i = i))
  await service.render({
    scene,
    frameCount: stills.length,
    frame: (i) => frames[i],
    onPixels: async (i, rgba) => {
      const s = stills[i]
      const file = join(outDir, `${s.name}.png`)
      writeFileSync(file, encodePng(rgba, W, H))
      const cam = cameraAt(setup, s.tRealS)
      const pose = setup.clip.pose(s.tRealS)
      const lm2 = pose.lm.map((p) => {
        const q = project(cam, p)
        return [q.x, q.y] as [number, number]
      })
      const xs = lm2.map((p) => p[0])
      const ys = lm2.map((p) => p[1])
      const padX = 0.02
      const padY = 0.02
      results[i] = {
        name: s.name,
        file,
        tRealS: s.tRealS,
        landmarks2d: lm2,
        bbox: [Math.min(...xs) - padX, Math.min(...ys) - padY, Math.max(...xs) + padX, Math.max(...ys) + padY],
      }
    },
  })
  return results
}
