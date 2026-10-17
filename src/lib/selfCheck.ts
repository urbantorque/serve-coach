/**
 * What this particular phone will actually do, asked on the phone.
 *
 * THE PROBLEM THIS EXISTS FOR. Three features shipped that no device has ever
 * run: recording off the viewfinder stream, the glance screen, and the target
 * dial drawn into a captured still. The pane they were developed against reports
 * `document.hidden`, so there was no camera, no encoder, and no decode of a
 * recording. What was verified was the choosing — and the choosing is exactly
 * the part that cannot tell you it chose wrong.
 *
 * So this module asks the device the questions the code has been assuming
 * answers to, and shows them on the device that answered. It is not diagnostics
 * for their own sake: every field below decides whether some path in the app
 * works or produces a file nothing can open.
 *
 * IT IS IN THE PRODUCTION BUNDLE, unlike `?demo`. A check that only exists in a
 * dev build cannot be run on the phone that matters, which is the whole point of
 * it. It costs a few kilobytes, makes no request, and is reached by a URL or by
 * a button at the foot of the history sheet — never by anything on the path a
 * player takes to analyse a serve.
 *
 * NOTHING HERE IS A FIX. The report says what is true. Where it says something
 * that ought not to be true — a browser that records a container it cannot play
 * back is the case this was built to catch — that is a defect for its own round,
 * not something to paper over at the point of measurement.
 */
import { RECORDING_TYPES, playbackQuery, recordingType } from './framing/record'
import { previewSupported } from './framing/access'
import { cameraLine, lastCamera, type CameraSettings } from './framing/camera'
import { clipStoreAvailable } from './storage/clipStore'
import { hasLocalVoice } from './speech'
import { isInstalled } from './storage/backup'

/**
 * What `canPlayType` said, in three words rather than its own two-and-a-blank.
 *
 * The API answers `'probably'`, `'maybe'` or the empty string, and the empty
 * string is the one that matters: it is a refusal, and it reads in a debugger
 * like a missing value. `'maybe'` is genuinely different from both — the browser
 * recognises the container and will not commit to the codec inside it — and
 * collapsing it into either neighbour would throw away the only signal that
 * distinguishes "no" from "we will find out after the player has served".
 */
export type Playback = 'yes' | 'maybe' | 'no'

export interface RecorderProbe {
  isTypeSupported?: (t: string) => boolean
}

export interface DecoderProbe {
  canPlayType?: (t: string) => string
}

export interface ContainerVerdict {
  /** The MediaRecorder mime type, as `record.ts` writes it. */
  type: string
  /** Whether `MediaRecorder` will record it. */
  records: boolean
  /** Whether a `<video>` element on the same browser will play it back. */
  plays: Playback
}

export interface RecordingVerdict {
  /** What `recordingType()` would choose here, if anything. */
  chosen?: string
  containers: ContainerVerdict[]
  /**
   * This browser will encode, and nothing it encodes can be read back here.
   *
   * Not the same flag it started as. It first meant "the app is about to record
   * something unreadable", because `recordingType()` chose by an ordering that
   * assumed decodability and never asked. That is now asked at the point of
   * choosing, so the app cannot pick an unreadable container — and what is left
   * is the browser where *every* recordable container is unreadable. The
   * consequence is no record button, which is the designed fallback rather than
   * a broken file, and the panel says so in those terms.
   */
  deadEnd: boolean
}

/**
 * Whether this browser can record a CANVAS, which is a different question from
 * whether it can record a camera.
 *
 * WHY IT NEEDED ASKING SEPARATELY. `RecordingVerdict` above is entirely about
 * `MediaRecorder` and the containers it will encode, and it is answered from a
 * camera stream. R54 wants to record the replay — a body drawn to a canvas, with
 * no camera involved and no image of any person in it — and that goes through
 * `HTMLCanvasElement.captureStream()`, an API `MediaRecorder` support says
 * nothing about. A browser can have every container in `RECORDING_TYPES` and no
 * `captureStream` at all, and the app would have found out by handing the player
 * a share button that produces nothing.
 *
 * WHAT THIS DOES NOT ANSWER, and it is the larger half. Constraint 8 says
 * anything touching a canvas is guilty until measured, and this measures
 * capability rather than cost. Whether a canvas recorder on a warm phone is
 * affordable cannot be measured here at all: `?demo` already fails on it, because
 * the pane reports `document.hidden` and throttles exactly this path — R40 asked
 * a canvas for three seconds of film and got 1.06, and R41 found it stopped
 * resolving entirely. So R54 stays gated, and what it is gated on is now a
 * reading the court trip can bring back rather than a question nobody had asked.
 */
export interface CanvasRecordVerdict {
  /** `captureStream` exists on a canvas here. */
  api: boolean
  /** It returned a stream carrying at least one live video track. */
  track: boolean
}

/**
 * Ask a canvas for a stream, and refuse to conclude anything from a throw.
 *
 * Takes the canvas rather than making one, for the reason `recordingType` takes
 * its two probes: this file is tested in Node, and a function that reached for
 * `document` could not be. A caller with no DOM passes nothing and gets two
 * falses, which is the honest answer for a place with no canvas in it.
 *
 * A throw reads as "no" rather than propagating. Every other probe in this file
 * makes the same trade, and it is the right one here twice over: a browser that
 * throws from a capability check has answered the question, and this runs inside
 * a panel a player opened to find out what their phone does.
 */
export function canvasRecordVerdict(canvas?: {
  captureStream?: (fps?: number) => { getVideoTracks?: () => unknown[] }
}): CanvasRecordVerdict {
  if (typeof canvas?.captureStream !== 'function') return { api: false, track: false }
  try {
    const stream = canvas.captureStream(0)
    const tracks = stream?.getVideoTracks?.() ?? []
    return { api: true, track: tracks.length > 0 }
  } catch {
    return { api: true, track: false }
  }
}

/** `canPlayType`'s three answers, named. */
export function playback(decoder: DecoderProbe | undefined, query: string): Playback {
  if (typeof decoder?.canPlayType !== 'function') return 'no'
  try {
    const said = decoder.canPlayType(query)
    return said === 'probably' ? 'yes' : said === 'maybe' ? 'maybe' : 'no'
  } catch {
    // Same reading as `recordingType`'s: a browser that throws from a capability
    // check has been asked about a string it has never heard of. That is a "no"
    // about this container, not a broken decoder.
    return 'no'
  }
}

/**
 * Whether this browser can record something it will also read back.
 *
 * Reports the two questions separately for every container, and then what
 * `recordingType` does with them — so the panel shows the evidence beside the
 * decision rather than only the decision. That separation is what made the
 * original defect visible: the decision looked right until the two columns were
 * printed next to each other.
 *
 * `'maybe'` counts as playable. It is what Safari says about almost everything,
 * including files it plays perfectly, so treating it as a refusal would report a
 * dead end on the one browser where the recording path matters most.
 */
export function recordingVerdict(
  recorder: RecorderProbe | undefined,
  decoder: DecoderProbe | undefined,
): RecordingVerdict {
  const containers: ContainerVerdict[] = RECORDING_TYPES.map((type) => {
    let records = false
    try {
      records = recorder?.isTypeSupported?.(type) === true
    } catch {
      records = false
    }
    return { type, records, plays: playback(decoder, playbackQuery(type)) }
  })

  const chosen = recordingType(recorder, decoder)
  // A browser with no `MediaRecorder` at all is not a dead end, it is the file
  // picker — which is a first-class path, not a degraded one.
  const deadEnd = !chosen && containers.some((c) => c.records)
  return { chosen, containers, deadEnd }
}

/**
 * The containers a clip can arrive in from the picker, as opposed to from the
 * recorder.
 *
 * HEVC is on this list because it is the app's most-reported failure that is not
 * a bug: iPhones record it by default, Safari plays it, and Chrome on Windows
 * frequently will not — so the file looks perfect in the camera roll and cannot
 * be opened. `analyze.ts` already names that codec when a decode fails; this
 * asks the same question before anybody has filmed anything.
 */
const DECODE_PROBES = [
  { label: 'MP4, H.264', type: 'video/mp4; codecs="avc1.42E01E"' },
  { label: 'MP4, HEVC — what an iPhone records', type: 'video/mp4; codecs="hvc1"' },
  { label: 'WebM, VP9', type: 'video/webm; codecs="vp9"' },
  { label: 'WebM, VP8', type: 'video/webm; codecs="vp8"' },
] as const

export interface DecodeVerdict {
  label: string
  plays: Playback
}

export function decodeVerdicts(decoder: DecoderProbe | undefined): DecodeVerdict[] {
  return DECODE_PROBES.map(({ label, type }) => ({ label, plays: playback(decoder, type) }))
}

export interface StorageVerdict {
  /** Megabytes the browser says it will allow, when it will say. */
  quotaMb?: number
  /** Megabytes already used by this origin. */
  usedMb?: number
  /** Whether the browser has promised not to evict it. */
  persisted?: boolean
}

/**
 * How much room there is, in the units the rest of the app thinks in.
 *
 * `estimate()` is absent on older Safari and returns wildly conservative numbers
 * on some browsers in private mode, which is worth showing rather than hiding —
 * a player whose phone reports 40 MB of quota has an explanation for a history
 * that keeps vanishing, and no other screen in the app can give them one.
 */
export async function storageVerdict(
  storage: StorageManager | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.storage,
): Promise<StorageVerdict> {
  const out: StorageVerdict = {}
  try {
    if (typeof storage?.estimate === 'function') {
      const { quota, usage } = await storage.estimate()
      const mb = (n?: number) => (typeof n === 'number' ? Math.round(n / 1e6) : undefined)
      out.quotaMb = mb(quota)
      out.usedMb = mb(usage)
    }
    if (typeof storage?.persisted === 'function') out.persisted = await storage.persisted()
  } catch {
    // A refusal to answer is not a failure of the check. Leave the fields absent
    // and let the panel say the browser would not say.
  }
  return out
}

/**
 * What the platform does for the app (L6.10): keeping the screen on, keeping a
 * clip, presenting a decoded frame on time, a voice on the phone, and running
 * installed. Each one changes what the app can do on this phone, and each was
 * a guess until now.
 */
export interface PlatformVerdict {
  wakeLock: boolean
  keepClips: boolean
  frameCallback: boolean
  localVoice: boolean
  installed: boolean
}

/** The five answers, from what was found rather than from a user agent. Pure, for the tests. */
export function platformVerdict(env: {
  navigator?: object
  videoPrototype?: object
  keepClips: boolean
  localVoice: boolean
  installed: boolean
}): PlatformVerdict {
  return {
    wakeLock: Boolean(env.navigator && 'wakeLock' in env.navigator),
    keepClips: env.keepClips,
    frameCallback: Boolean(env.videoPrototype && 'requestVideoFrameCallback' in env.videoPrototype),
    localVoice: env.localVoice,
    installed: env.installed,
  }
}

export interface HardwareVerdict {
  /** CSS pixels, as the layout sees them. */
  screen?: string
  /** Device pixel ratio — how much bigger the canvases really are. */
  dpr?: number
  /** Logical cores, which bounds how much of the pose work can overlap. */
  cores?: number
  /**
   * `navigator.deviceMemory`, in gigabytes, rounded down to a power of two by
   * the browser before anybody here sees it. Chrome only. It is the only
   * available reading on the constraint the app is held to and it is a coarse
   * one, which is why the panel prints it as "about".
   */
  memoryGb?: number
}

export function hardwareVerdict(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): HardwareVerdict {
  const w = win as
    | {
        innerWidth?: number
        innerHeight?: number
        devicePixelRatio?: number
        navigator?: { hardwareConcurrency?: number; deviceMemory?: number }
      }
    | undefined
  if (!w) return {}
  const out: HardwareVerdict = {}
  if (typeof w.innerWidth === 'number' && typeof w.innerHeight === 'number') {
    out.screen = `${w.innerWidth}×${w.innerHeight}`
  }
  if (typeof w.devicePixelRatio === 'number') out.dpr = w.devicePixelRatio
  if (typeof w.navigator?.hardwareConcurrency === 'number') {
    out.cores = w.navigator.hardwareConcurrency
  }
  if (typeof w.navigator?.deviceMemory === 'number') out.memoryGb = w.navigator.deviceMemory
  return out
}

export interface DeviceReport {
  recording: RecordingVerdict
  /** Whether the replay could be recorded here — a different API from the above. */
  canvasRecord: CanvasRecordVerdict
  decode: DecodeVerdict[]
  camera: {
    /** `getUserMedia` exists — which it does not at all over plain http. */
    api: boolean
    /** Whether this is a secure context, which is why it would not exist. */
    secure: boolean
    /** What the camera gave the last recording made in the app (L6.3). */
    last?: CameraSettings
  }
  storage: StorageVerdict
  hardware: HardwareVerdict
  /** What the platform does for the app (L6.10). Optional, for reports built before it. */
  platform?: PlatformVerdict
  /** Whether the model and runtime are cached, so the app works with no signal. */
  offline: boolean
}

/**
 * Every answer, gathered.
 *
 * The `offline` reading is injected rather than imported, so that this module
 * stays free of `poseEngine` — which pulls the whole MediaPipe binding in with
 * it, and would turn a self-check into a nine-megabyte download on a screen
 * whose entire purpose is to be openable on a phone with no signal.
 */
/**
 * The whole report as one block of text, for pasting into a message.
 *
 * A player on a court cannot be asked to describe what a diagnostic screen says,
 * and a screenshot of it arrives as a picture somebody then has to read numbers
 * out of. This is the same readings in a form that survives being pasted.
 *
 * THE USER AGENT IS DELIBERATELY ABSENT. It is the field most likely to identify
 * one person's device across sites, and it adds nothing the rest of this says: a
 * UA string is what you read when you want to *guess* at capabilities, and every
 * line here is the capability itself, asked directly. Leaving it out is also
 * what makes the vocabulary of this block finite, which is what lets a test
 * assert that nothing about the player can ever appear in it.
 *
 * Deterministic on purpose — no clock, no random, nothing read from storage. Two
 * runs on one phone produce the same block, so a second report after a fix is
 * legible as a diff.
 */
export function deviceReportText(r: DeviceReport): string {
  const chosen = r.recording.chosen
  const plays = chosen ? r.recording.containers.find((c) => c.type === chosen)?.plays : undefined
  const lines = [
    'serve-coach device check',
    `records ${chosen ?? 'nothing'}${chosen ? ` plays ${plays ?? 'no'}` : ''}`,
    r.recording.deadEnd ? 'DEAD END records nothing playable' : '',
    ...r.recording.containers.map(
      (c) => `  ${c.type} record ${c.records ? 'yes' : 'no'} play ${c.plays}`,
    ),
    ...DECODE_PROBES.map((p, i) => `  opens ${p.type} ${r.decode[i]?.plays ?? 'no'}`),
    `camera ${r.camera.api ? 'yes' : 'no'} secure ${r.camera.secure ? 'yes' : 'no'}`,
    cameraLine(r.camera.last),
    // The replay's own recording path. Separate from `records` above because it
    // is a separate API — see `canvasRecordVerdict`.
    `canvas ${r.canvasRecord.api ? 'yes' : 'no'} track ${r.canvasRecord.track ? 'yes' : 'no'}`,
    `offline ${r.offline ? 'yes' : 'no'}`,
    `storage ${r.storage.usedMb ?? '?'} of ${r.storage.quotaMb ?? '?'} MB persisted ${
      r.storage.persisted === undefined ? '?' : r.storage.persisted ? 'yes' : 'no'
    }`,
    `screen ${r.hardware.screen ?? '?'} dpr ${r.hardware.dpr ?? '?'} cores ${
      r.hardware.cores ?? '?'
    } memory ${r.hardware.memoryGb ?? '?'}`,
    r.platform
      ? `wake ${r.platform.wakeLock ? 'yes' : 'no'} clips ${r.platform.keepClips ? 'yes' : 'no'} frames ${
          r.platform.frameCallback ? 'yes' : 'no'
        } voice ${r.platform.localVoice ? 'yes' : 'no'} installed ${r.platform.installed ? 'yes' : 'no'}`
      : '',
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * Every string a `DeviceReport` is allowed to contain.
 *
 * Read by a test that walks a report and fails on anything outside it — the same
 * shape as the check that walks `diagnose.ts`'s output and fails on a sentence.
 * The point is not that today's code is careful; it is that a field added later
 * cannot quietly carry a file name, a serve, or a phone into a block of text the
 * player is being invited to paste to somebody.
 *
 * The screen dimension is the one free-form value, and it is two integers.
 */
export const REPORT_VOCABULARY: readonly string[] = [
  ...RECORDING_TYPES,
  ...DECODE_PROBES.map((p) => p.type),
  ...DECODE_PROBES.map((p) => p.label),
  'yes',
  'maybe',
  'no',
  // The replay's own recording path — two fixed labels, no values of their own.
  // Added deliberately: the guard that made this necessary caught the line the
  // moment it was written, which is the whole reason the list is a list.
  'canvas',
  'track',
]

export async function readDeviceReport(offline: () => Promise<boolean>): Promise<DeviceReport> {
  const video = typeof document === 'undefined' ? undefined : document.createElement('video')
  return {
    recording: recordingVerdict(
      typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder,
      video ?? undefined,
    ),
    // A canvas made only to be asked a question and dropped. Never attached, so
    // it costs one element and no pixels — `canvasRecordVerdict` passes 0 fps,
    // which asks for a stream that produces frames only on demand.
    canvasRecord: canvasRecordVerdict(
      typeof document === 'undefined'
        ? undefined
        : (document.createElement('canvas') as unknown as Parameters<typeof canvasRecordVerdict>[0]),
    ),
    decode: decodeVerdicts(video ?? undefined),
    camera: {
      api: previewSupported(),
      secure: typeof window === 'undefined' ? false : window.isSecureContext === true,
      // Read back from the last recording, not by opening the camera here:
      // a diagnostic screen asking for the camera would be a permission
      // prompt for a check.
      ...(lastCamera() ? { last: lastCamera() } : {}),
    },
    storage: await storageVerdict(),
    hardware: hardwareVerdict(),
    platform: platformVerdict({
      navigator: typeof navigator === 'undefined' ? undefined : navigator,
      videoPrototype: typeof HTMLVideoElement === 'undefined' ? undefined : HTMLVideoElement.prototype,
      keepClips: clipStoreAvailable(),
      localVoice: hasLocalVoice(),
      installed: isInstalled(),
    }),
    offline: await offline().catch(() => false),
  }
}
