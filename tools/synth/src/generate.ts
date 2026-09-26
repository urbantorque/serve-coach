import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { AUDIO_SAMPLE_RATE, collectSoundEvents, encodeWav, renderAudio, type SoundEvent } from './audio.ts'
import { Encoder, vp9Crf, type Container } from './encode.ts'
import { frameData, sceneDescription } from './frames.ts'
import type { RenderService } from './render/service.ts'
import { buildScenario, type BuiltScenario, type Scenario } from './setup.ts'
import { buildTruth, FrameTruthSource, planOutput, type OutputPlan } from './truth.ts'
import { GROUPS } from './scenarios.ts'

export interface ClipRecord {
  id: string
  job: string
  groups: string[]
  tags: string[]
  description: string
  files: { mp4: string; webm?: string; truth: string }
  bytes: { mp4: number; webm?: number; truth: number }
  video: { width: number; height: number; fps: number; captureFps: number; timeScale: number; frameCount: number; durationMediaS: number; crf: number }
  camera: { view: string; distanceM: number; heightM: number; orientation: string; focal35mmEquivMm: number; shake: boolean }
  lighting: string
  player: { profile: string; heightM: number; handedness: string }
  serves: number
  flags: { tossApexInFrame: boolean[]; contactInFrame: boolean[]; bounceInFrame: boolean[] }
  generatedAt: string
}

export interface JobOptions {
  /** validation/synthetic */
  outRoot: string
  /** Scratch folder for WAV files. */
  tmpDir: string
  log: (msg: string) => void
  generator: Record<string, unknown>
}

const GROUP_IDS = new Set(GROUPS.map((g) => g.id))

export function clipDir(outRoot: string, clipId: string): string {
  return join(outRoot, 'clips', clipId)
}

export function clipFiles(outRoot: string, clipId: string): { dir: string; mp4: string; webm: string; truth: string } {
  const dir = clipDir(outRoot, clipId)
  return { dir, mp4: join(dir, `${clipId}.mp4`), webm: join(dir, `${clipId}.webm`), truth: join(dir, 'truth.json') }
}

/** True when every output of the job already exists on disk. */
export function jobComplete(sc: Scenario, outRoot: string): boolean {
  return sc.outputs.every((o) => {
    const f = clipFiles(outRoot, o.id)
    return existsSync(f.mp4) && existsSync(f.truth) && (!o.webm || existsSync(f.webm))
  })
}

interface ActiveOutput {
  plan: OutputPlan
  encoders: { container: Container; enc: Encoder; file: string }[]
  wav: string
}

/** Render one job once and encode all its outputs, then write each output's truth.json. */
export async function runJob(svc: RenderService, sc: Scenario, opts: JobOptions): Promise<ClipRecord[]> {
  const t0 = performance.now()
  const b = buildScenario(sc)
  const source = new FrameTruthSource(b)
  const W = b.setup.intrinsics.widthPx
  const H = b.setup.intrinsics.heightPx
  mkdirSync(opts.tmpDir, { recursive: true })

  const sounds = jobSounds(b, source)
  const { backgroundDbfs, hum } = audioSettings(sc)

  const active: ActiveOutput[] = []
  try {
    for (const spec of sc.outputs) {
      const plan = planOutput(b, spec)
      const files = clipFiles(opts.outRoot, spec.id)
      mkdirSync(files.dir, { recursive: true })
      const samples = renderAudio(sounds, { durationMediaS: plan.durationMediaS, timeScale: plan.timeScale, t0S: b.t0S, backgroundDbfs, hum, seed: sc.seed })
      const wav = join(opts.tmpDir, `${spec.id}.wav`)
      writeFileSync(wav, encodeWav(samples))
      const containers: Container[] = spec.webm ? ['mp4', 'webm'] : ['mp4']
      const encoders = containers.map((container) => {
        const file = container === 'mp4' ? files.mp4 : files.webm
        const enc = new Encoder({ file, container, width: W, height: H, fps: plan.mediaFps, crf: spec.crf, audioWav: wav, comment: `serve-synth ${spec.id}` })
        return { container, enc, file }
      })
      active.push({ plan, encoders, wav })
    }

    const scene = sceneDescription(b.setup, 'yuv420p')
    let lastLog = performance.now()
    await svc.render({
      scene,
      frameCount: b.frameCount,
      frame: (i) => frameData(b.setup, i),
      onPixels: async (i, px) => {
        const writes: Promise<void>[] = []
        for (const o of active) if (i % o.plan.decimate === 0) for (const e of o.encoders) writes.push(e.enc.write(px))
        await Promise.all(writes)
      },
      onProgress: (done, total) => {
        const now = performance.now()
        if (now - lastLog > 15000 || done === total) {
          lastLog = now
          opts.log(`  ${sc.id}: ${done}/${total} frames (${((done / (now - t0)) * 1000).toFixed(1)} fps)`)
        }
      },
    })
    await Promise.all(active.flatMap((o) => o.encoders.map((e) => e.enc.finish())))
  } catch (e) {
    for (const o of active) for (const en of o.encoders) en.enc.kill()
    for (const o of active) for (const en of o.encoders) rmSync(en.file, { force: true })
    throw e
  } finally {
    for (const o of active) rmSync(o.wav, { force: true })
  }

  const records = writeTruths(b, source, sounds, active.map((o) => o.plan), opts)
  opts.log(`  ${sc.id}: done in ${((performance.now() - t0) / 1000).toFixed(1)} s -> ${records.map((r) => r.id).join(', ')}`)
  return records
}

/** Audio settings shared by the encoder and the truth file. */
function audioSettings(sc: Scenario): { backgroundDbfs: number; hum: boolean } {
  return { backgroundDbfs: sc.audio?.backgroundDbfs ?? -50, hum: sc.look.lighting === 'night' }
}

function jobSounds(b: BuiltScenario, source: FrameTruthSource): SoundEvent[] {
  const sc = b.scenario
  const endAbs = b.t0S + (b.frameCount - 1) / sc.video.fps
  return collectSoundEvents(b.clip, source.camAt, { distractorsPerMinute: sc.audio?.distractorsPerMinute, seed: sc.seed, startS: b.t0S, endS: endAbs })
}

/** Write truth.json for each output (its videos must already exist) and return manifest records. */
function writeTruths(b: BuiltScenario, source: FrameTruthSource, sounds: SoundEvent[], plans: OutputPlan[], opts: JobOptions): ClipRecord[] {
  const { backgroundDbfs, hum } = audioSettings(b.scenario)
  return plans.map((plan) => {
    const spec = plan.spec
    const files = clipFiles(opts.outRoot, spec.id)
    const groups = spec.tags.filter((t) => GROUP_IDS.has(t))
    const containers: Container[] = spec.webm ? ['mp4', 'webm'] : ['mp4']
    const truth = buildTruth({
      b,
      output: plan,
      source,
      files: containers.map((container) => ({
        container,
        file: relative(files.dir, container === 'mp4' ? files.mp4 : files.webm).replaceAll('\\', '/'),
        codec: container === 'mp4' ? 'h264 (libx264 high, preset medium)' : 'vp9 (libvpx-vp9)',
        crf: container === 'mp4' ? spec.crf : vp9Crf(spec.crf),
        audioCodec: container === 'mp4' ? 'aac 160 kbit/s mono 48 kHz' : 'opus 128 kbit/s mono 48 kHz',
      })),
      sounds,
      audio: { sampleRate: AUDIO_SAMPLE_RATE, backgroundDbfs, hum },
      groups,
      generator: opts.generator,
    })
    writeFileSync(files.truth, JSON.stringify(truth))
    return clipRecord(b, plan, truth, groups, opts.outRoot)
  })
}

/**
 * Rebuild truth.json (and manifest records) for a job whose videos already exist, without
 * rendering. Valid only while the motion, camera and render code are unchanged since encoding.
 */
export function rebuildTruth(sc: Scenario, opts: JobOptions): ClipRecord[] {
  const missing = sc.outputs.filter((o) => {
    const f = clipFiles(opts.outRoot, o.id)
    return !existsSync(f.mp4) || (o.webm === true && !existsSync(f.webm))
  })
  if (missing.length) throw new Error(`videos missing for ${missing.map((o) => o.id).join(', ')}`)
  const b = buildScenario(sc)
  const source = new FrameTruthSource(b)
  return writeTruths(b, source, jobSounds(b, source), sc.outputs.map((o) => planOutput(b, o)), opts)
}

function clipRecord(b: BuiltScenario, o: OutputPlan, truth: Record<string, unknown>, groups: string[], outRoot: string): ClipRecord {
  const sc = b.scenario
  const spec = o.spec
  const f = clipFiles(outRoot, spec.id)
  const rel = (p: string) => relative(outRoot, p).replaceAll('\\', '/')
  const serves = truth.serves as { visibility: { tossApexInFrame: boolean; contactInFrame: boolean; bounceInFrame: boolean } }[]
  return {
    id: spec.id,
    job: sc.id,
    groups,
    tags: spec.tags,
    description: sc.description,
    files: { mp4: rel(f.mp4), ...(spec.webm ? { webm: rel(f.webm) } : {}), truth: rel(f.truth) },
    bytes: { mp4: statSync(f.mp4).size, ...(spec.webm ? { webm: statSync(f.webm).size } : {}), truth: statSync(f.truth).size },
    video: {
      width: b.setup.intrinsics.widthPx,
      height: b.setup.intrinsics.heightPx,
      fps: o.mediaFps,
      captureFps: o.realFps,
      timeScale: o.timeScale,
      frameCount: o.frameCount,
      durationMediaS: Math.round(o.durationMediaS * 1e6) / 1e6,
      crf: spec.crf,
    },
    camera: {
      view: sc.camera.view,
      distanceM: sc.camera.distanceM,
      heightM: sc.camera.heightM,
      orientation: sc.video.orientation,
      focal35mmEquivMm: sc.camera.focal35mmEquivMm,
      shake: !!sc.camera.shake,
    },
    lighting: sc.look.lighting + (b.setup.look.flickerAmplitude > 0 ? ' (100 Hz flicker)' : ''),
    player: { profile: b.profile.id, heightM: b.profile.heightM, handedness: b.profile.handedness },
    serves: serves.length,
    flags: {
      tossApexInFrame: serves.map((s) => s.visibility.tossApexInFrame),
      contactInFrame: serves.map((s) => s.visibility.contactInFrame),
      bounceInFrame: serves.map((s) => s.visibility.bounceInFrame),
    },
    generatedAt: new Date().toISOString(),
  }
}
