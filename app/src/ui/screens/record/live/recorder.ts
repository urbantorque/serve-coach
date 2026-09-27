/**
 * Video-only clip recorder (CAPTURE §9.2, §9.9; ARCHITECTURE §5.1). One-second chunks, so an
 * interruption keeps what was recorded. Chunks stay in memory in this build (see known issues:
 * the chunk store in data/ has no repository yet).
 */
import { pickRecorderType } from './camera.ts'

export interface RecordedClip {
  blob: Blob
  mimeType: string
  durationS: number
  /** True when the recording ended on its own (track ended, error, page hidden). */
  interrupted: boolean
}

export const MAX_RECORDING_S = 20 * 60

export class ClipRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private interrupted = false
  private settle: ((clip: RecordedClip) => void) | null = null
  readonly done: Promise<RecordedClip>
  mimeType = ''

  constructor(private readonly stream: MediaStream) {
    this.done = new Promise((resolve) => {
      this.settle = resolve
    })
  }

  static supported(): boolean {
    return typeof MediaRecorder !== 'undefined'
  }

  start(): void {
    const videoOnly = new MediaStream(this.stream.getVideoTracks())
    const type = pickRecorderType((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(videoOnly, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 12_000_000 })
    this.mimeType = rec.mimeType || type || 'video/webm'
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    rec.onerror = () => {
      this.interrupted = true
      this.stop()
    }
    rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mimeType.split(';')[0] })
      this.settle?.({ blob, mimeType: this.mimeType, durationS: (performance.now() - this.startedAt) / 1000, interrupted: this.interrupted })
    }
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      this.interrupted = true
      this.stop()
    })
    this.recorder = rec
    this.startedAt = performance.now()
    rec.start(1000)
  }

  elapsedS(): number {
    return this.recorder ? (performance.now() - this.startedAt) / 1000 : 0
  }

  markInterrupted(): void {
    this.interrupted = true
  }

  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
  }
}

