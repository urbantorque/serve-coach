// Renders the synthetic serve clips (with exact 2D truth) used by run-roi-eval.mjs.
// It imports tools/synth's modules unchanged, so run it with that tool's tsx (which
// resolves the .ts imports) from tools/synth:
//
//   cd tools/synth
//   npx tsx ../../app/src/analysis/pose/smoke/render-roi-clips.mjs [--views side,rear,front45]
//        [--distances 4,7,12] [--fps 30] [--out .cache/roi-eval/clips] [--dry]
//
// Scenario = the feasibility probe in tools/synth/src/feasibility/run.ts: seed 11, intermediate
// right-hander, red outfit, bright light, hard court, portrait 1080x1920, camera 1.2 m high
// looking at 1.6 m, 26 mm equivalent. Output per clip: clip.mp4 (H.264 High, CRF 18,
// yuv420p) and truth.json (33 projected landmarks per frame, normalised to the displayed
// frame; standing stature in px; event times). About 12 s per 120-frame clip here.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { project } from '../../../../../tools/synth/src/camera.ts'
import { cameraAt, frameData, sceneDescription } from '../../../../../tools/synth/src/frames.ts'
import { RenderService } from '../../../../../tools/synth/src/render/service.ts'
import { buildScenario } from '../../../../../tools/synth/src/setup.ts'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function scenario(view, distanceM, fps) {
  return {
    id: `roi-${view}-${distanceM}m-${fps}fps`,
    description: 'pose ROI evaluation clip (feasibility probe scenario)',
    tags: [],
    seed: 11,
    player: { profile: 'intermediate', outfit: 'red' },
    serves: { count: 1, serveSeed: 1001 },
    video: { fps, orientation: 'portrait', shortSidePx: 1080, crf: 18 },
    camera: { view, distanceM, heightM: 1.2, lookAtHeightM: 1.6, focal35mmEquivMm: 26 },
    look: { lighting: 'bright', surface: 'hard-blue' },
  }
}

async function renderClip(service, view, distanceM, fps, outRoot, dry) {
  const sc = scenario(view, distanceM, fps)
  const built = buildScenario(sc)
  const setup = built.setup
  const times = built.clip.plans[0].times
  const W = setup.intrinsics.widthPx
  const H = setup.intrinsics.heightPx
  const endS = Math.min(built.clip.durationS, times.recoveryEndS + 0.2)
  const frameCount = Math.floor(endS * fps)
  // Standing stature in pixels at t = 0 (upright setup), from the player's true height.
  const cam0 = cameraAt(setup, 0)
  const pelvis = built.clip.pose(0).pelvis
  const foot = project(cam0, [pelvis[0], pelvis[1], 0])
  const head = project(cam0, [pelvis[0], pelvis[1], built.clip.anthro.heightM])
  const staturePx = +Math.hypot(foot.u - head.u, foot.v - head.v).toFixed(1)
  console.log(JSON.stringify({ id: sc.id, frameCount, staturePx, contactS: times.contactS }))
  if (dry) return

  const dir = join(outRoot, `${view}-${distanceM}m-${fps}fps`)
  mkdirSync(dir, { recursive: true })
  const ffmpeg = spawn(
    ffmpegPath,
    ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(dir, 'clip.mp4')],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  const exited = new Promise((done) => ffmpeg.on('close', (code) => done(code ?? -1)))
  const write = (buffer) => new Promise((done, fail) => ffmpeg.stdin.write(buffer, (e) => (e ? fail(e) : done())))
  const pending = new Map()
  let next = 0
  const frames = []
  const started = performance.now()
  await service.render({
    scene: sceneDescription(setup),
    frameCount,
    frame: (i) => frameData(setup, i),
    onPixels: async (i, rgba) => {
      pending.set(i, Buffer.from(rgba))
      while (pending.has(next)) {
        await write(pending.get(next))
        pending.delete(next)
        next++
      }
      const t = i / fps
      const cam = cameraAt(setup, t)
      const landmarks = built.clip.pose(t).lm.map((p) => {
        const q = project(cam, p)
        return { x: +q.x.toFixed(6), y: +q.y.toFixed(6), z: +q.depthM.toFixed(4) }
      })
      frames[i] = { frameIndex: i, tReal: +t.toFixed(6), landmarks }
    },
  })
  ffmpeg.stdin.end()
  const code = await exited
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`)
  writeFileSync(
    join(dir, 'truth.json'),
    JSON.stringify({
      generator: 'app/src/analysis/pose/smoke/render-roi-clips.mjs (tools/synth modules)',
      note: '33 BlazePose points projected from the synthetic skeleton, normalised to the displayed frame; z is camera depth in metres (not MediaPipe z)',
      video: { width: W, height: H, fps },
      scenario: sc,
      handedness: built.clip.handedness,
      staturePx,
      heightM: built.clip.anthro.heightM,
      times,
      frames,
    }),
  )
  console.log(`  rendered ${frameCount} frames in ${((performance.now() - started) / 1000).toFixed(1)} s -> ${dir}`)
}

const views = arg('views', 'side,rear,front45').split(',')
const distances = arg('distances', '4,7,12').split(',').map(Number)
const fps = Number(arg('fps', '30'))
const outRoot = resolve(arg('out', '.cache/roi-eval/clips'))
const dry = process.argv.includes('--dry')
const service = dry ? null : await RenderService.start()
try {
  for (const view of views) for (const d of distances) await renderClip(service, view, d, fps, outRoot, dry)
} finally {
  await service?.close()
}
