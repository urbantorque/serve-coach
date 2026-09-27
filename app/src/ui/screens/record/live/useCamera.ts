/**
 * Rear-camera preview for Live framing (CAPTURE §9.2). Video only, never the microphone (D4).
 * Reports why the camera is unavailable instead of throwing (PRODUCT §6.3.4 states).
 *
 * Dev only: `?dev-clip=<synthetic clip id>` plays a clip from the synthetic corpus (/__synthetic/)
 * in place of the camera and records from `captureStream()`, so the framing checks, the light pose
 * pass and the recorder can be exercised on a desktop. It is compiled out of production builds.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { cameraPrecheck, classifyCameraError, openRearCamera, stopStream, type CameraProblem } from './camera.ts'

export type CameraStatus = 'idle' | 'starting' | 'live' | 'problem'

export interface CameraInfo {
  width: number
  height: number
  /** Delivered frame rate as the browser reports it, null when unknown. */
  fps: number | null
  label: string
  /** True when the preview is the dev synthetic clip, not a camera. */
  synthetic: boolean
}

export interface CameraHandle {
  status: CameraStatus
  problem: CameraProblem | null
  info: CameraInfo | null
  stream: MediaStream | null
  /** Callback ref for the preview <video>. */
  attachVideo: (el: HTMLVideoElement | null) => void
  video: HTMLVideoElement | null
  start: () => void
  stop: () => void
}

/** Dev-only synthetic source id from the URL, or null (always null in production). */
export function devClipId(search: string = typeof location === 'undefined' ? '' : location.search): string | null {
  if (!import.meta.env.DEV) return null
  const id = new URLSearchParams(search).get('dev-clip')
  return id && /^[a-z0-9-]+$/i.test(id) ? id : null
}

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream }

/** Points the preview element at the camera stream (or the dev clip) and plays it, muted and inline. */
function playInto(el: HTMLVideoElement, source: { stream: MediaStream } | { url: string } | null): void {
  if (source && 'url' in source) {
    el.src = source.url
    el.loop = true
  } else if (source) {
    el.srcObject = source.stream
  }
  el.muted = true
  el.playsInline = true
  void el.play().catch(() => undefined)
}

export function useCamera(fps: number): CameraHandle {
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [problem, setProblem] = useState<CameraProblem | null>(null)
  const [info, setInfo] = useState<CameraInfo | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runId = useRef(0)

  const attachVideo = useCallback((el: HTMLVideoElement | null) => setVideo(el), [])

  const stop = useCallback(() => {
    runId.current++
    stopStream(streamRef.current)
    streamRef.current = null
    setStream(null)
    setStatus('idle')
  }, [])

  const start = useCallback(() => {
    const id = ++runId.current
    setStatus('starting')
    setProblem(null)
    const clip = devClipId()
    if (clip) {
      setStatus('live')
      setInfo({ width: 0, height: 0, fps: null, label: `Synthetic clip ${clip}`, synthetic: true })
      return
    }
    const pre = cameraPrecheck({
      isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
      hasGetUserMedia: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
    })
    if (pre) {
      setProblem(pre)
      setStatus('problem')
      return
    }
    openRearCamera(fps)
      .then((cam) => {
        if (id !== runId.current) {
          stopStream(cam.stream)
          return
        }
        streamRef.current = cam.stream
        setStream(cam.stream)
        setInfo({
          width: cam.settings.width ?? 0,
          height: cam.settings.height ?? 0,
          fps: typeof cam.settings.frameRate === 'number' ? cam.settings.frameRate : null,
          label: cam.label,
          synthetic: false,
        })
        setStatus('live')
      })
      .catch((error: unknown) => {
        if (id !== runId.current) return
        setProblem(classifyCameraError(error))
        setStatus('problem')
      })
  }, [fps])

  // Attach the stream (or the dev clip) to the preview element.
  useEffect(() => {
    if (!video || status !== 'live') return
    const clip = devClipId()
    const onMeta = () => {
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              width: video.videoWidth || prev.width,
              height: video.videoHeight || prev.height,
              fps: prev.fps ?? (clip ? 60 : null),
            }
          : prev,
      )
      if (clip && !streamRef.current) {
        const captured = (video as CapturableVideo).captureStream?.()
        if (captured) {
          streamRef.current = captured
          setStream(captured)
        }
      }
    }
    video.addEventListener('loadedmetadata', onMeta)
    playInto(video, clip ? { url: `/__synthetic/clips/${clip}/${clip}.mp4` } : streamRef.current ? { stream: streamRef.current } : null)
    return () => {
      video.removeEventListener('loadedmetadata', onMeta)
    }
  }, [video, status])

  useEffect(() => () => {
    runId.current++
    stopStream(streamRef.current)
    streamRef.current = null
  }, [])

  return { status, problem, info, stream, attachVideo, video, start, stop }
}
