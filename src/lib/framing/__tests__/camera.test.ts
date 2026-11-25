/**
 * Record at the camera's best (L6.3): the constraints ask for 1080p at 60
 * without refusing a phone that cannot, a recording carries what the camera
 * actually gave, and the device check can say it — all against a fake stream
 * and a fake recorder, since the suite has no camera.
 */
import {
  IDEAL_FRAME_RATE,
  cameraLine,
  cameraOf,
  cameraSettingsOf,
  lastCamera,
  recordingConstraints,
  storeLastCamera,
} from '../camera'
import { recordClip, type RecorderLike } from '../record'
import { deviceReportText } from '../../selfCheck'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

heading("Recording at the camera's best")

check('the camera is asked for 1080p at 60 fps, as ideals it may fall short of', () => {
  const c = recordingConstraints()
  const v = c.video as MediaTrackConstraints
  note(JSON.stringify(v))
  assert(c.audio === false, 'the recording asks for sound')
  assert((v.width as ConstrainULongRange).ideal === 1920 && (v.height as ConstrainULongRange).ideal === 1080, 'not 1080p')
  assert((v.frameRate as ConstrainDoubleRange).ideal === IDEAL_FRAME_RATE && IDEAL_FRAME_RATE === 60, 'not 60 fps')
  assert((v.facingMode as ConstrainDOMStringParameters).ideal === 'environment', 'not the back camera')
  // An `exact` anywhere is a laptop or a 30 fps phone that cannot record at all.
  assert(!JSON.stringify(c).includes('exact') && !JSON.stringify(c).includes('min'), 'a constraint the camera must meet')
})

check("a track's settings are kept to what is used, and rounded", () => {
  const s = cameraSettingsOf({ width: 1920.4, height: 1080, frameRate: 59.94, deviceId: 'abc', facingMode: 'environment' })
  assert(JSON.stringify(s) === JSON.stringify({ width: 1920, height: 1080, frameRate: 60 }), JSON.stringify(s))
  assert(cameraSettingsOf({ deviceId: 'abc' }) === undefined, 'nothing useful was kept as something')
  assert(cameraSettingsOf({ width: Number.NaN, frameRate: -1 }) === undefined, 'nonsense was kept')
  assert(cameraSettingsOf(undefined) === undefined, 'no settings became some')
})

/** A recorder that does what the browser's does when told, and nothing else. */
class FakeRecorder implements RecorderLike {
  static made: FakeRecorder[] = []
  state = 'inactive'
  ondataavailable: RecorderLike['ondataavailable'] = null
  onstop: RecorderLike['onstop'] = null
  onerror: RecorderLike['onerror'] = null
  constructor(
    public stream: unknown,
    public options: { mimeType: string },
  ) {
    FakeRecorder.made.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
  deliver(bytes: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) })
  }
}

const streamGiving = (settings: Partial<MediaTrackSettings>) => ({
  getVideoTracks: () => [{ getSettings: () => settings }],
})

check('a recording carries what the camera gave, read as it started', () => {
  let got: { file: File; chunks: number } | undefined
  const rec = recordClip(
    streamGiving({ width: 1920, height: 1080, frameRate: 60 }),
    'video/mp4',
    FakeRecorder as never,
    { stopped: (file, chunks) => (got = { file, chunks }), failed: () => {} },
    () => new Date(2026, 9, 17, 10, 30),
  ) as FakeRecorder
  assert(rec.state === 'recording' && rec.options.mimeType === 'video/mp4', 'the recorder wasn’t started on the chosen type')
  rec.deliver(1000)
  rec.deliver(0)
  rec.deliver(500)
  rec.stop()
  assert(got !== undefined, 'nothing came back from the stop')
  note(`${got!.file.name}, ${got!.file.size} bytes in ${got!.chunks} chunks, camera ${cameraLine(cameraOf(got!.file))}`)
  assert(got!.chunks === 2 && got!.file.size === 1500, 'an empty chunk was counted, or a real one lost')
  assert(got!.file.type === 'video/mp4', 'the file lost its type')
  assert(JSON.stringify(cameraOf(got!.file)) === JSON.stringify({ width: 1920, height: 1080, frameRate: 60 }), 'the camera wasn’t remembered')
})

check('a phone that gives less than asked is recorded as what it gave, and an empty stop as empty', () => {
  let got: { file: File; chunks: number } | undefined
  const rec = recordClip(streamGiving({ width: 1280, height: 720, frameRate: 30 }), 'video/webm', FakeRecorder as never, {
    stopped: (file, chunks) => (got = { file, chunks }),
    failed: () => {},
  }) as FakeRecorder
  rec.stop()
  assert(got?.chunks === 0, 'an empty recording reported chunks')
  assert(cameraLine(cameraOf(got!.file)) === 'camera last 1280×720 at 30 fps', cameraLine(cameraOf(got!.file)))
  // A browser with no track settings at all records without them.
  let bare: File | undefined
  const quiet = recordClip({}, 'video/webm', FakeRecorder as never, { stopped: (f) => (bare = f), failed: () => {} }) as FakeRecorder
  quiet.stop()
  assert(bare !== undefined && cameraOf(bare) === undefined, 'settings were invented for a stream with none')
})

check('a recorder that refuses to be built is the caller’s to handle, not swallowed', () => {
  class Refuses {
    constructor() {
      throw new Error('NotSupportedError')
    }
  }
  let threw = false
  try {
    recordClip(streamGiving({}), 'video/mp4', Refuses as never, { stopped: () => {}, failed: () => {} })
  } catch {
    threw = true
  }
  assert(threw, 'a refused recorder was reported as recording')
})

check('the device check says what the last recording got, kept without opening the camera', () => {
  const store = new Map<string, string>()
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  assert(lastCamera(fake) === undefined, 'a camera was remembered before any recording')
  storeLastCamera({ width: 1920, height: 1080, frameRate: 60 }, fake)
  const last = lastCamera(fake)
  assert(cameraLine(last) === 'camera last 1920×1080 at 60 fps', cameraLine(last))
  assert(cameraLine(undefined) === 'camera last none', 'no recording didn’t say so')
  const block = deviceReportText({
    recording: { containers: [], chosen: undefined, deadEnd: false },
    canvasRecord: { api: false, track: false },
    decode: [],
    camera: { api: true, secure: true, last },
    storage: { quotaMb: 1, usedMb: 0, persisted: false },
    hardware: { screen: '1×1', dpr: 1, cores: 1, memoryGb: 1 },
    offline: false,
  } as never)
  assert(block.includes('camera last 1920×1080 at 60 fps'), 'the pasted block lost the camera line')
})

report()
