/**
 * The small platform fixes (L6.10): home lets a waiting update land, the
 * glance's voice is unlocked by the record tap, and the device check says
 * what the platform does for the app.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { primeSpeech } from '../speech'
import { deviceReportText, platformVerdict, type DeviceReport } from '../selfCheck'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'
import { MAX_BYTES, earlyRefusal, leaveForHome, updateMayLand } from '../../components/runDecisions'

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string }

heading('The small platform fixes')

check('going home lets go of the clip first, and the update gate then opens (M5.1)', () => {
  // Behaviour, not source: the order of the steps, and what the gate says after.
  const order: string[] = []
  let held = true
  leaveForHome({ releaseVideo: () => { order.push('release'); held = false }, showHome: () => order.push('home'), refresh: () => order.push('refresh') })
  assert(order.join() === 'release,home,refresh', `went home in the order ${order.join()}`)
  assert(updateMayLand({ view: 'home', holdsVideo: held, sweeping: false }), 'home after going home still keeps a waiting update shut')
  assert(!updateMayLand({ view: 'home', holdsVideo: true, sweeping: false }), 'the gate opened with a clip still held')
  // Structural, deliberately: the hook has to ask the gate about the clip it holds.
  const run = fs.readFileSync('src/components/useAnalysisRun.ts', 'utf8')
  assert(/updateMayLand\(\{ view: view\.kind, holdsVideo: Boolean\(urlRef\.current\)/.test(run), 'the update gate no longer waits for the clip to go')
})

check('a clip too large or not a video is refused before the decoder is asked, with a way forward (M5.1)', () => {
  const big = earlyRefusal({ size: MAX_BYTES + 1, type: 'video/mp4' })
  assert(big?.title === 'That video is too large to open here' && big.hints.length === 3, JSON.stringify(big))
  const photo = earlyRefusal({ size: 1000, type: 'image/jpeg' })
  assert(photo?.title === 'That does not look like a video', JSON.stringify(photo))
  assert(earlyRefusal({ size: 1000, type: 'video/mp4' }) === undefined, 'a small video was refused')
  assert(earlyRefusal({ size: 1000, type: '' }) === undefined, 'a file with no type, as some phones send, was refused')
})

check('the record tap unlocks the voice, through a voice on the phone or not at all', () => {
  const spoken: { text: string; volume: number; voice: unknown }[] = []
  const g = globalThis as unknown as Record<string, unknown>
  const saved = { window: g.window, Utterance: g.SpeechSynthesisUtterance }
  class Utterance {
    voice: unknown
    volume = 1
    constructor(public text: string) {}
  }
  const synth = (voices: object[]) => ({
    getVoices: () => voices,
    speak: (u: Utterance) => spoken.push({ text: u.text, volume: u.volume, voice: u.voice }),
    cancel: () => {},
  })
  try {
    g.SpeechSynthesisUtterance = Utterance
    g.window = { speechSynthesis: synth([{ localService: false, lang: 'en-GB', default: true }]) }
    assert(primeSpeech('en-GB') === false && spoken.length === 0, 'primed through a voice that sends text away')
    const local = { localService: true, lang: 'en-GB', default: false }
    g.window = { speechSynthesis: synth([{ localService: false, lang: 'en-GB', default: true }, local]) }
    assert(primeSpeech('en-GB') === true, 'did not prime with a local voice there')
    assert(spoken.length === 1 && spoken[0].volume === 0 && spoken[0].voice === local, 'the priming was heard, or not through the local voice')
    note(`primed with "${spoken[0].text}" at volume ${spoken[0].volume}`)
  } finally {
    g.window = saved.window
    g.SpeechSynthesisUtterance = saved.Utterance
  }
})

check('the device check says what the platform does for the app', () => {
  const v = platformVerdict({
    navigator: { wakeLock: {} },
    videoPrototype: { requestVideoFrameCallback() {} },
    keepClips: false,
    localVoice: true,
    installed: false,
  })
  assert(v.wakeLock && v.frameCallback && !v.keepClips && v.localVoice && !v.installed, JSON.stringify(v))
  const none = platformVerdict({ keepClips: false, localVoice: false, installed: false })
  assert(!none.wakeLock && !none.frameCallback, 'a browser with nothing read as having it')
  const text = deviceReportText({
    recording: { containers: [], chosen: undefined, deadEnd: false },
    canvasRecord: { api: false, track: false },
    decode: [],
    camera: { api: true, secure: true },
    storage: { quotaMb: 1, usedMb: 0, persisted: false },
    hardware: { screen: '1×1', dpr: 1, cores: 1, memoryGb: 1 },
    offline: false,
    platform: v,
  } as unknown as DeviceReport)
  assert(text.includes('wake yes clips no frames yes voice yes installed no'), text)
})

report()
