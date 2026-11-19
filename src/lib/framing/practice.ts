/**
 * Recording a whole practice in the app (N4.4, the old N1.10).
 *
 * A single serve is recorded into memory and capped at 90 s
 * (`MAX_RECORDING_SECONDS`): the encoder keeps every chunk until it stops. A
 * whole basket is ten or twenty minutes, several hundred megabytes at a phone's
 * bitrate, which no phone that is already warm can hold. So a practice is
 * written out as it is recorded: the recorder hands over a chunk a second, each
 * goes to a file in the browser's own private storage (the origin private file
 * system, where kept clips already live), and what the session reader is given
 * at the end is that file, read from disk, not a copy in memory.
 *
 * Where the browser cannot write such a file, there is no "whole practice" to
 * offer: an in-memory version would be the very thing this exists to avoid.
 *
 * The file is the session's clip, and the session reader takes any clip past
 * `SESSION_SECONDS` already: everything after the stop is the existing path.
 * Nothing leaves the device.
 */
import { cameraSettingsOf, rememberCamera } from './camera'
import { recordingFileName, type RecorderLike, type StreamLike } from './record'
import { HEADER_BYTES, patchDuration } from './webmDuration'

/** The longest a practice may run. Past it the recording stops by itself and is read as it is. */
export const MAX_PRACTICE_SECONDS = 20 * 60

/** How often the recorder hands over a chunk to be written out, ms. */
export const PRACTICE_SLICE_MS = 1000

/** Where a practice's chunks go as they arrive. */
export interface ChunkSink {
  write(chunk: Blob): Promise<void>
  /**
   * Close the file and give it back, read from wherever it was written, with
   * its duration written in (`webmDuration.ts`): a file recorded a chunk at a
   * time says it is infinitely long, and everything that plans a read needs it.
   */
  finish(type: string, name: string, durationMs: number): Promise<File>
  /** Throw it away. */
  discard(): Promise<void>
}

/** A recorder that can be told how often to hand over a chunk. */
export interface SlicingRecorder extends Omit<RecorderLike, 'start'> {
  start: (timeslice?: number) => void
}

/**
 * Record a practice from the camera stream, a chunk a second, each written to
 * `sink` in the order it came. When the recorder stops, every write is waited
 * for before the file is closed, so the last second of the basket is in it.
 * `stopped` gets the file and how many chunks arrived; a sink that failed
 * along the way reports `failed` instead of handing over a file with a hole.
 */
export function recordPractice(
  stream: StreamLike,
  type: string,
  Recorder: new (stream: never, options: { mimeType: string }) => SlicingRecorder,
  sink: ChunkSink,
  on: { stopped: (file: File, chunks: number) => void; failed: () => void },
  now: () => Date = () => new Date(),
): SlicingRecorder {
  const recorder = new Recorder(stream as never, { mimeType: type })
  let startedAt = 0
  const camera = cameraSettingsOf(stream.getVideoTracks?.()[0]?.getSettings?.())
  let chunks = 0
  let broken = false
  let written: Promise<void> = Promise.resolve()
  recorder.ondataavailable = (e) => {
    const data = e.data
    if (!data?.size) return
    chunks++
    written = written.then(() => sink.write(data)).catch(() => {
      broken = true
    })
  }
  recorder.onstop = () => {
    void written.then(async () => {
      if (broken) {
        await sink.discard().catch(() => {})
        on.failed()
        return
      }
      try {
        const ended = now()
        const file = await sink.finish(type, recordingFileName(type, ended).replace(/^serve-/, 'practice-'), ended.getTime() - startedAt)
        rememberCamera(file, camera)
        on.stopped(file, chunks)
      } catch {
        on.failed()
      }
    })
  }
  recorder.onerror = () => on.failed()
  startedAt = now().getTime()
  recorder.start(PRACTICE_SLICE_MS)
  return recorder
}

/* --------------------------------------------- the browser's private storage */

const DIR = 'practice'
const FILE = 'recording'
const TIMED = 'recording-timed'

/** Whether this browser can write a practice out as it is recorded. */
export function canRecordPractice(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  )
}

/**
 * A sink writing to one file in the origin private file system. One practice
 * at a time: starting another replaces the file, and finishing hands back a
 * `File` read from it.
 */
export async function privateFileSink(): Promise<ChunkSink | undefined> {
  if (!canRecordPractice()) return undefined
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(DIR, { create: true })
    const handle = await dir.getFileHandle(FILE, { create: true })
    const writable = await handle.createWritable({ keepExistingData: false })
    let open = true
    return {
      write: (chunk) => writable.write(chunk),
      async finish(type, name, durationMs) {
        if (open) await writable.close()
        open = false
        const stored = await handle.getFile()
        const head = new Uint8Array(await stored.slice(0, HEADER_BYTES).arrayBuffer())
        const patched = patchDuration(head, durationMs)
        if (!patched) return new File([stored], name, { type })
        // The timed copy, streamed from the untimed one: only the header passes
        // through memory, whatever the length of the practice.
        const timed = await dir.getFileHandle(TIMED, { create: true })
        const out = await timed.createWritable({ keepExistingData: false })
        await out.write(patched as Uint8Array<ArrayBuffer>)
        await out.write(stored.slice(HEADER_BYTES))
        await out.close()
        await dir.removeEntry(FILE).catch(() => {})
        return new File([await timed.getFile()], name, { type })
      },
      async discard() {
        if (open) await writable.abort().catch(() => {})
        open = false
        await dir.removeEntry(FILE).catch(() => {})
      },
    }
  } catch {
    return undefined
  }
}
