/**
 * Video-only clip recorder (CAPTURE §9.2, §9.9; ARCHITECTURE §5.1, §5.10, §5.12, §7.2).
 *
 * One-second chunks are written to IndexedDB as they arrive (data/repos/recordings.ts) and released
 * from memory once written, so a long recording never holds a clip-sized buffer, and a crash, a killed
 * tab or a flat battery loses about a second: the clip is offered again on the next launch
 * (RecordingRecovery.tsx). The finished clip is read back from IndexedDB as one Blob.
 *
 * If the chunk store is unavailable (private browsing, blocked storage) the recorder keeps chunks in
 * memory as before. If the phone runs out of space mid-recording, it stops, marks the clip interrupted
 * and keeps what was written.
 */
import { appendChunk, discardRecording, readRecording, startRecordingRows, updateRecordingHeader } from '../../../../data/index.ts'
import type { RecordingHeader } from '../../../../data/records.ts'
import { ulid } from '../../../../platform/ids.ts'
import { pickRecorderType } from './camera.ts'

export interface RecordedClip {
  blob: Blob
  mimeType: string
  durationS: number
  /** True when the recording ended on its own (track ended, error, page hidden, storage full). */
  interrupted: boolean
  /** Why it ended early, when it did. */
  reason?: 'storage-full'
  recordingId: string
}

export const MAX_RECORDING_S = 20 * 60

/** Where chunks go. The default is IndexedDB; tests pass their own. */
export interface ChunkStore {
  start(recordingId: string, header: RecordingHeader): Promise<void>
  append(recordingId: string, seq: number, blob: Blob): Promise<void>
  update(recordingId: string, patch: Partial<RecordingHeader>): Promise<void>
  read(recordingId: string): Promise<{ blob: Blob } | null>
  discard(recordingId: string): Promise<number>
}

export const idbChunkStore: ChunkStore = {
  start: (id, header) => startRecordingRows(id, header),
  append: (id, seq, blob) => appendChunk(id, seq, blob),
  update: (id, patch) => updateRecordingHeader(id, patch),
  read: (id) => readRecording(id),
  discard: (id) => discardRecording(id),
}

/** Recordings running (or stopped but not yet saved or discarded) in this page. The launch sweep skips them. */
export const activeRecordings = new Set<string>()

/** The part of MediaRecorder the recorder uses (so tests can drive it). */
export interface RecorderLike {
  readonly mimeType: string
  readonly state: 'inactive' | 'recording' | 'paused'
  ondataavailable: ((event: { data: Blob }) => void) | null
  onerror: ((event: unknown) => void) | null
  onstop: ((event: unknown) => void) | null
  start(timeslice?: number): void
  stop(): void
}

export interface ClipRecorderOptions {
  /** The Record flow's facts at start (RecoveryFacts), kept with the chunks for recovery. */
  facts?: Record<string, unknown>
  /** null keeps chunks in memory only. */
  store?: ChunkStore | null
  createRecorder?: (stream: MediaStream, options: MediaRecorderOptions) => RecorderLike
  isTypeSupported?: (type: string) => boolean
}

const isQuotaError = (e: unknown) => {
  const name = (e as { name?: string; inner?: { name?: string } } | null)?.name ?? ''
  const inner = (e as { inner?: { name?: string } } | null)?.inner?.name ?? ''
  return name === 'QuotaExceededError' || inner === 'QuotaExceededError'
}

export class ClipRecorder {
  readonly recordingId = ulid()
  private recorder: RecorderLike | null = null
  /** Chunks not (yet) in the store, by seq; a written chunk's slot is cleared. */
  private memory: (Blob | null)[] = []
  private seq = 0
  private writes: Promise<void> = Promise.resolve()
  private storing: boolean
  private anyStored = false
  private startedAt = 0
  private startedEpoch = 0
  private interrupted = false
  private reason: RecordedClip['reason']
  private claimed = false
  private facts: Record<string, unknown>
  private settle: ((clip: RecordedClip) => void) | null = null
  private readonly store: ChunkStore | null
  readonly done: Promise<RecordedClip>
  mimeType = ''

  constructor(
    private readonly stream: MediaStream,
    private readonly options: ClipRecorderOptions = {},
  ) {
    this.store = options.store === undefined ? idbChunkStore : options.store
    this.storing = this.store !== null
    this.facts = { ...(options.facts ?? {}) }
    this.done = new Promise((resolve) => {
      this.settle = resolve
    })
  }

  static supported(): boolean {
    return typeof MediaRecorder !== 'undefined'
  }

  start(): void {
    const videoOnly = new MediaStream(this.stream.getVideoTracks())
    const isSupported = this.options.isTypeSupported ?? ((t: string) => MediaRecorder.isTypeSupported(t))
    const type = pickRecorderType(isSupported)
    const recorderOptions: MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number } = {
      ...(type ? { mimeType: type } : {}),
      videoBitsPerSecond: 12_000_000,
      // Chromium's MP4 recorder only hands over data at a key frame, and its default key-frame gap is long:
      // measured in Edge, 9 s of recording gave one 762-byte chunk (the file header), so a crash lost it
      // all. A key frame every second makes the one-second chunks real (ignored where unsupported).
      videoKeyFrameIntervalDuration: 1000,
    }
    const rec = this.options.createRecorder ? this.options.createRecorder(videoOnly, recorderOptions) : (new MediaRecorder(videoOnly, recorderOptions) as unknown as RecorderLike)
    this.mimeType = rec.mimeType || type || 'video/webm'
    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return
      const seq = this.seq++
      this.memory[seq] = e.data
      this.enqueue(seq, e.data)
    }
    rec.onerror = () => {
      this.interrupted = true
      this.stop()
    }
    rec.onstop = () => void this.finish()
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      this.interrupted = true
      this.stop()
    })
    this.recorder = rec
    this.startedAt = performance.now()
    this.startedEpoch = Date.now()
    activeRecordings.add(this.recordingId)
    if (this.store) {
      const store = this.store
      const header: RecordingHeader = { mimeType: this.mimeType, startedAt: this.startedEpoch, facts: this.facts }
      this.writes = store.start(this.recordingId, header).catch((e) => this.storeFailed(e))
    }
    rec.start(1000)
  }

  private enqueue(seq: number, blob: Blob): void {
    this.writes = this.writes.then(async () => {
      if (!this.store || !this.storing) return
      try {
        await this.store.append(this.recordingId, seq, blob)
        this.memory[seq] = null
        this.anyStored = true
      } catch (e) {
        this.storeFailed(e)
      }
    })
  }

  private storeFailed(e: unknown): void {
    // Later chunks stay in memory; the ones already written are read back at the end.
    this.storing = false
    if (isQuotaError(e)) {
      this.reason = 'storage-full'
      this.interrupted = true
      this.stop()
    }
  }

  private async finish(): Promise<void> {
    await this.writes
    const type = this.mimeType.split(';')[0]
    const rest = this.memory.filter((b): b is Blob => b !== null)
    let stored: Blob | null = null
    if (this.store && this.anyStored) {
      try {
        stored = (await this.store.read(this.recordingId))?.blob ?? null
      } catch {
        stored = null
      }
    }
    const blob = new Blob(stored ? [stored, ...rest] : rest, { type })
    const durationS = (performance.now() - this.startedAt) / 1000
    if (this.store && this.anyStored) {
      await this.store
        .update(this.recordingId, { stoppedAt: Date.now(), durationS, interrupted: this.interrupted })
        .catch(() => undefined)
    }
    this.settle?.({
      blob,
      mimeType: this.mimeType,
      durationS,
      interrupted: this.interrupted,
      ...(this.reason ? { reason: this.reason } : {}),
      recordingId: this.recordingId,
    })
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

  /** Adds facts known only at stop (the tilt log) to what recovery would use. */
  noteFacts(patch: Record<string, unknown>): void {
    this.facts = { ...this.facts, ...patch }
    if (this.store && this.anyStored) void this.store.update(this.recordingId, { facts: this.facts }).catch(() => undefined)
  }

  /**
   * The Record flow saved a session for this clip. The chunks stay until that session has its video
   * (the launch sweep or the job's end removes them), so a crash in between still loses nothing.
   */
  claim(sessionId: string): void {
    this.claimed = true
    activeRecordings.delete(this.recordingId)
    if (this.store && this.anyStored) void this.store.update(this.recordingId, { sessionId, claimedAt: Date.now() }).catch(() => undefined)
  }

  /** The player chose Record again or closed without analysing: the chunks go now. No-op once claimed. */
  discard(): void {
    if (this.claimed) return
    activeRecordings.delete(this.recordingId)
    this.memory = []
    if (this.store) void this.writes.then(() => this.store?.discard(this.recordingId)).catch(() => undefined)
  }
}
