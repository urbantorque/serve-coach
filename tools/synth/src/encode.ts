import { spawn, type ChildProcess } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

/**
 * ffmpeg wrapper: planar yuv420p frames (BT.709, limited range) on stdin plus a WAV file are
 * encoded to H.264/AAC MP4 or VP9/Opus WebM. Colour metadata is written explicitly so decoders use
 * BT.709 rather than guessing.
 */

export type Container = 'mp4' | 'webm'

export interface EncodeSpec {
  file: string
  container: Container
  width: number
  height: number
  /** Container (media) frame rate. */
  fps: number
  /** x264 CRF (0-51). WebM maps it to VP9 CRF with vp9Crf(). */
  crf: number
  /** Optional WAV to mux as the audio track. */
  audioWav?: string
  /** Keyframe interval in frames (default: one second of media). */
  gopFrames?: number
  /** x264 preset (default 'medium'). */
  preset?: string
  /** Free-text metadata written to the container's comment tag. */
  comment?: string
}

export const ffmpegBinary = (): string => {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary for this platform')
  return ffmpegPath as unknown as string
}

/** VP9 CRF roughly matching the visual quality of an x264 CRF (VP9's scale is 0-63). */
export const vp9Crf = (x264Crf: number): number => Math.min(63, Math.round(x264Crf + 8))

const COLOUR = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709']

export function ffmpegArgs(s: EncodeSpec): string[] {
  const gop = String(s.gopFrames ?? Math.max(1, Math.round(s.fps)))
  const input = ['-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${s.width}x${s.height}`, '-framerate', String(s.fps), ...COLOUR, '-i', 'pipe:0']
  const audioIn = s.audioWav ? ['-i', s.audioWav] : []
  const maps = s.audioWav ? ['-map', '0:v:0', '-map', '1:a:0'] : ['-map', '0:v:0']
  const meta = s.comment ? ['-metadata', `comment=${s.comment}`] : []
  if (s.container === 'mp4') {
    return [
      '-hide_banner', '-loglevel', 'error', '-y', ...input, ...audioIn, ...maps,
      '-c:v', 'libx264', '-preset', s.preset ?? 'medium', '-crf', String(s.crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', gop, ...COLOUR,
      ...(s.audioWav ? ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '1'] : []),
      '-movflags', '+faststart', ...meta, s.file,
    ]
  }
  return [
    '-hide_banner', '-loglevel', 'error', '-y', ...input, ...audioIn, ...maps,
    '-c:v', 'libvpx-vp9', '-crf', String(vp9Crf(s.crf)), '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-g', gop, '-pix_fmt', 'yuv420p', ...COLOUR,
    ...(s.audioWav ? ['-c:a', 'libopus', '-b:a', '128k', '-ac', '1'] : []),
    ...meta, s.file,
  ]
}

export class Encoder {
  private readonly proc: ChildProcess
  private readonly exited: Promise<void>
  private stderr = ''
  frames = 0

  constructor(readonly spec: EncodeSpec) {
    this.proc = spawn(ffmpegBinary(), ffmpegArgs(spec), { stdio: ['pipe', 'ignore', 'pipe'] })
    this.proc.stderr!.on('data', (d: Buffer) => {
      this.stderr += d.toString('utf8')
    })
    this.exited = new Promise((resolve, reject) => {
      this.proc.on('error', reject)
      this.proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg exited with ${code} for ${spec.file}: ${this.stderr.trim().slice(-2000)}`))
      })
    })
    // Surface an early crash to the next write instead of an unhandled rejection.
    this.exited.catch(() => undefined)
  }

  /** Write one frame; resolves when ffmpeg has accepted it (stdin backpressure). */
  async write(frame: Buffer): Promise<void> {
    const stdin = this.proc.stdin!
    this.frames++
    if (!stdin.write(frame)) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = () => {
          cleanup()
          resolve()
        }
        const onClose = () => {
          cleanup()
          reject(new Error(`ffmpeg closed its input for ${this.spec.file}: ${this.stderr.trim().slice(-2000)}`))
        }
        const cleanup = () => {
          stdin.off('drain', onDrain)
          this.proc.off('close', onClose)
        }
        stdin.on('drain', onDrain)
        this.proc.on('close', onClose)
      })
    }
  }

  async finish(): Promise<void> {
    this.proc.stdin!.end()
    await this.exited
  }

  kill(): void {
    this.proc.kill()
  }
}
