/**
 * Camera stream and recorder set-up for the web prototype (CAPTURE §9.2, ARCHITECTURE §5.1).
 * Video only: the in-app recorder never asks for the microphone (D4, CAPTURE §7.2).
 */

export type CameraProblem = 'insecure' | 'unsupported' | 'denied' | 'busy' | 'not-found' | 'unknown'

/** Maps a getUserMedia failure to the state the screen shows (PRODUCT §6.3.4 states). */
export function classifyCameraError(error: unknown): CameraProblem {
  const name = (error as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'not-found'
  return 'unknown'
}

/** Why the camera cannot even be asked for, or null when it can. */
export function cameraPrecheck(env: { isSecureContext: boolean; hasGetUserMedia: boolean }): CameraProblem | null {
  if (!env.isSecureContext) return 'insecure'
  if (!env.hasGetUserMedia) return 'unsupported'
  return null
}

const VIRTUAL = /dual|triple|ultra|tele|wide angle 0\.5|front|facetime|selfie/i

/**
 * Prefers the plain back wide camera ("Back Camera" in English) over virtual multi-camera devices
 * that switch lenses mid-clip (CAPTURE §9.2). Labels are localised and UNVERIFIED; returns
 * undefined to fall back to facingMode.
 */
export function pickBackCamera(devices: Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>[]): string | undefined {
  const video = devices.filter((d) => d.kind === 'videoinput' && d.label)
  const exact = video.find((d) => /^back camera$/i.test(d.label.trim()))
  if (exact) return exact.deviceId
  const back = video.find((d) => /back|rear|environment/i.test(d.label) && !VIRTUAL.test(d.label))
  return back?.deviceId
}

/** `MediaRecorder` type preference (CAPTURE §9.2): MP4/H.264 first (exact timeline), then WebM. */
export const RECORDER_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'] as const

export function pickRecorderType(isSupported: (type: string) => boolean): string | undefined {
  return RECORDER_TYPES.find((t) => {
    try {
      return isSupported(t)
    } catch {
      return false
    }
  })
}

export interface OpenCamera {
  stream: MediaStream
  track: MediaStreamTrack
  settings: MediaTrackSettings
  label: string
}

export function videoConstraints(fps: number, deviceId?: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: fps, min: 24 },
  }
}

/** Opens the rear camera, then switches to the plain wide lens when labels allow (labels appear after permission). */
export async function openRearCamera(fps: number): Promise<OpenCamera> {
  const media = navigator.mediaDevices
  let stream: MediaStream
  try {
    stream = await media.getUserMedia({ video: videoConstraints(fps), audio: false })
  } catch (error) {
    // Some desktop cameras reject min frame rates; retry with the plainest request.
    if ((error as { name?: string })?.name === 'OverconstrainedError') stream = await media.getUserMedia({ video: true, audio: false })
    else throw error
  }
  let track = stream.getVideoTracks()[0]
  try {
    const devices = await media.enumerateDevices()
    const wanted = pickBackCamera(devices)
    if (wanted && wanted !== track.getSettings().deviceId) {
      const better = await media.getUserMedia({ video: videoConstraints(fps, wanted), audio: false })
      stream.getTracks().forEach((t) => t.stop())
      stream = better
      track = stream.getVideoTracks()[0]
    }
  } catch {
    // Keep the facingMode stream.
  }
  return { stream, track, settings: track.getSettings(), label: track.label }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop())
}
