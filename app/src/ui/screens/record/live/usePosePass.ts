/**
 * Light pose pass for live framing (CAPTURE §9.4): MediaPipe lite through the engine's pose layer,
 * about 5 frames a second from the preview, at most one frame in flight. It feeds the "stand tall"
 * snapshot (median of upright readings) behind In frame, Room above, Room ahead and Size, and the
 * serving-spot state. When the model cannot start here (no WebGL or wasm), it reports 'unavailable'
 * and the checks say so rather than guessing.
 */
import { useEffect, useRef, useState } from 'react'
import type { PoseInputFrame } from '../../../../analysis/pose/poseSource.ts'
import type { Handedness, PoseFrame } from '../../../../analysis/types.ts'
import type { PoseSnapshot } from './framing.ts'
import { readPoseFrame, snapshotFromReadings, standingAtSpot, type PoseReading } from './poseSnapshot.ts'

export type PosePassStatus = 'off' | 'loading' | 'running' | 'unavailable'

export interface PosePass {
  status: PosePassStatus
  snapshot: PoseSnapshot | null
  /** Standing still at the serving spot for about a second (R4 trigger). */
  atSpot: boolean
  /** A person was found in the latest reading. */
  seen: boolean
}

interface PoseRunner {
  init: () => Promise<void>
  estimate: (frames: AsyncIterable<PoseInputFrame>) => AsyncIterable<PoseFrame>
  dispose: () => Promise<void>
}

const LOADING: PosePass = { status: 'loading', snapshot: null, atSpot: false, seen: false }
const OFF: PosePass = { ...LOADING, status: 'off' }
const UNAVAILABLE: PosePass = { ...LOADING, status: 'unavailable' }

const RATE_HZ = 5
const LONG_SIDE_PX = 960
const KEEP_S = 6

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })

async function* previewFrames(video: HTMLVideoElement, signal: AbortSignal): AsyncGenerator<PoseInputFrame> {
  let index = 0
  let previous: ImageBitmap | null = null
  try {
    while (!signal.aborted) {
      await wait(1000 / RATE_HZ, signal)
      if (signal.aborted) break
      if (video.readyState < 2 || !video.videoWidth) continue
      const scale = Math.min(1, LONG_SIDE_PX / Math.max(video.videoWidth, video.videoHeight))
      const bitmap = await createImageBitmap(video, {
        resizeWidth: Math.round(video.videoWidth * scale),
        resizeHeight: Math.round(video.videoHeight * scale),
      })
      // The pose source copies each input; the previous one can go once the next is ready.
      previous?.close()
      previous = bitmap
      yield { frameIndex: index++, tReal: performance.now() / 1000, image: bitmap }
    }
  } finally {
    previous?.close()
  }
}

export function usePosePass(video: HTMLVideoElement | null, enabled: boolean, handedness: Handedness): PosePass {
  const [state, setState] = useState<PosePass>(LOADING)
  const readings = useRef<PoseReading[]>([])
  const supported = typeof createImageBitmap === 'function' && typeof WebAssembly !== 'undefined'

  useEffect(() => {
    if (!enabled || !video || !supported) return
    const abort = new AbortController()
    let source: PoseRunner | null = null
    readings.current = []

    const run = async () => {
      try {
        // Loaded on demand so the model code ships only with this screen.
        const { MediaPipePoseSource } = await import('../../../../analysis/pose/mediapipeSource.ts')
        if (abort.signal.aborted) return
        source = new MediaPipePoseSource({ model: 'lite', numPoses: 2, maxInFlight: 1, delegate: 'auto' })
        await source.init()
        if (abort.signal.aborted) return
        setState((s) => ({ ...s, status: 'running' }))
        for await (const frame of source.estimate(previewFrames(video, abort.signal))) {
          if (abort.signal.aborted) break
          const aspect = video.videoWidth / Math.max(1, video.videoHeight)
          const reading = readPoseFrame(frame, aspect, handedness)
          const now = frame.tReal
          const list = readings.current.filter((r) => now - r.tS <= KEEP_S)
          if (reading) list.push(reading)
          readings.current = list
          setState({
            status: 'running',
            snapshot: snapshotFromReadings(list, now),
            atSpot: standingAtSpot(list, now),
            // Seen in the last second: one missed frame mid-movement must not flip the instruction.
            seen: list.some((r) => now - r.tS <= 1),
          })
        }
      } catch {
        if (!abort.signal.aborted) setState({ status: 'unavailable', snapshot: null, atSpot: false, seen: false })
      }
    }
    void run()
    return () => {
      abort.abort()
      void source?.dispose().catch(() => undefined)
      setState(LOADING)
    }
  }, [video, enabled, handedness, supported])

  if (!supported) return UNAVAILABLE
  if (!enabled || !video) return OFF
  return state
}
