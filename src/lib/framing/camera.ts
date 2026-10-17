/**
 * Recording at the camera's best (L6.3), and saying what the camera gave.
 *
 * The in-app recorder used to film through the framing preview's own stream,
 * opened at 640 px wide for the live skeleton, at whatever rate the browser
 * picked. So a serve recorded in the app was a 640-wide clip at 30 frames a
 * second, on a phone whose camera does 1080p at 60, and nothing recorded what
 * it had been.
 *
 * The constraints come from here, as `ideal`s: a phone that cannot do 60 or
 * 1080p films at its best below them rather than refusing. What the track
 * actually delivered is read back with `getSettings()` when recording starts,
 * stamped on the analysis as `capture`, and kept for `?check`.
 *
 * DOM-free apart from the one storage read and write, each in a try.
 */

/** What the camera delivered, as far as the browser said. */
export interface CameraSettings {
  width?: number
  height?: number
  frameRate?: number
}

/** The long side asked for: 1080p. */
export const IDEAL_LONG_SIDE = 1920
export const IDEAL_SHORT_SIDE = 1080
/** Frames a second asked for. The swing lasts a fifth of a second. */
export const IDEAL_FRAME_RATE = 60

/** The constraints the preview and the recorder open the camera with. */
export function recordingConstraints(): MediaStreamConstraints {
  return {
    video: {
      // `ideal`, not `exact`, throughout: a laptop has no environment-facing
      // camera, and a phone that tops out at 30 fps must still film.
      facingMode: { ideal: 'environment' },
      width: { ideal: IDEAL_LONG_SIDE },
      height: { ideal: IDEAL_SHORT_SIDE },
      frameRate: { ideal: IDEAL_FRAME_RATE },
    },
    audio: false,
  }
}

/** A track's settings, kept to what the report and `?check` use, rounded. */
export function cameraSettingsOf(s: Partial<MediaTrackSettings> | undefined): CameraSettings | undefined {
  if (!s) return undefined
  const out: CameraSettings = {}
  const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined)
  const w = whole(s.width)
  const h = whole(s.height)
  const f = whole(s.frameRate)
  if (w !== undefined) out.width = w
  if (h !== undefined) out.height = h
  if (f !== undefined) out.frameRate = f
  return Object.keys(out).length ? out : undefined
}

/** One line for the device check: what the last recording got. */
export function cameraLine(s: CameraSettings | undefined): string {
  if (!s) return 'camera last none'
  const size = s.width && s.height ? `${s.width}×${s.height}` : 'size unknown'
  return `camera last ${size} at ${s.frameRate ? `${s.frameRate} fps` : 'unknown fps'}`
}

/* ------------------------------------------------- carried with the recording */

const byFile = new WeakMap<object, CameraSettings>()

/** Remember what the camera gave for a recorded file, until the file is read. */
export function rememberCamera(file: object, settings: CameraSettings | undefined): void {
  if (settings) byFile.set(file, settings)
}

/** What the camera gave for this file, if the app recorded it. */
export const cameraOf = (file: object): CameraSettings | undefined => byFile.get(file)

const LAST_KEY = 'serve-coach:last-camera'

/** Kept for `?check`, which never opens the camera itself. */
export function storeLastCamera(settings: CameraSettings | undefined, store: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  if (!settings || !store) return
  try {
    store.setItem(LAST_KEY, JSON.stringify(settings))
  } catch {
    // Storage refused: the check simply has nothing to say.
  }
}

export function lastCamera(store: Pick<Storage, 'getItem'> | undefined = safeStorage()): CameraSettings | undefined {
  if (!store) return undefined
  try {
    const raw = store.getItem(LAST_KEY)
    return raw ? cameraSettingsOf(JSON.parse(raw) as MediaTrackSettings) : undefined
  } catch {
    return undefined
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
