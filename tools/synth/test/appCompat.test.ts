import { describe, expect, it } from 'vitest'
import { parseTruthPoseFrames, truthToPoseFrames } from '../../../app/src/analysis/pose/injected.ts'
import { estimateStandingBodyHeight, inferHandedness } from '../../../app/src/analysis/pose/body.ts'
import { collectSoundEvents } from '../src/audio.ts'
import { project } from '../src/camera.ts'
import { cameraAt } from '../src/frames.ts'
import { quickSet } from '../src/scenarios.ts'
import { buildScenario, type Scenario } from '../src/setup.ts'
import { buildTruth, FrameTruthSource, headTop, planOutput } from '../src/truth.ts'

/**
 * Cross-checks the truth files against the app's own pose helpers: if these disagree, either the
 * truth or the helper is wrong, and the validation corpus would be misleading.
 */
function truthAndBuild(sc: Scenario) {
  const b = buildScenario(sc)
  const source = new FrameTruthSource(b)
  const sounds = collectSoundEvents(b.clip, source.camAt, { seed: sc.seed, startS: b.t0S, endS: b.t0S + b.frameCount / sc.video.fps })
  const truth = buildTruth({ b, output: planOutput(b, sc.outputs[0]), source, files: [], sounds, audio: { sampleRate: 48000, backgroundDbfs: -50, hum: false }, groups: [], generator: {} })
  return { b, frames: truthToPoseFrames(parseTruthPoseFrames(JSON.parse(JSON.stringify(truth)))) }
}

const [side60, rear30] = quickSet()

describe('truth feeds the app pose helpers', () => {
  it('handedness is inferred correctly for a right-hander (side) and a left-hander (rear)', () => {
    for (const [sc, expected] of [
      [side60, 'right'],
      [rear30, 'left'],
    ] as const) {
      const { b, frames } = truthAndBuild(sc)
      const W = b.setup.intrinsics.widthPx
      const H = b.setup.intrinsics.heightPx
      expect(inferHandedness(frames, { frameAspect: W / H })?.handedness).toBe(expected)
    }
  })

  it('standing height from setup frames is within 3 % of the realised setup head-top to floor span', () => {
    const { b, frames } = truthAndBuild(side60)
    const W = b.setup.intrinsics.widthPx
    const H = b.setup.intrinsics.heightPx
    const est = estimateStandingBodyHeight(frames, { frameAspect: W / H, setupWindowS: 0.6 })
    expect(est).not.toBeNull()
    const t = 0.3
    const pose = b.clip.pose(t)
    const cam = cameraAt(b.setup, t)
    // In the setup stance (10 deg knee bend) the head top is below the nominal 1.80 m.
    const floorY = Math.max(...[27, 28, 29, 30, 31, 32].map((i) => project(cam, pose.lm[i]).y))
    const trueHU = floorY - project(cam, headTop(b, pose)).y
    expect(Math.abs(est!.heightHU / trueHU - 1)).toBeLessThan(0.03)
  })
})
