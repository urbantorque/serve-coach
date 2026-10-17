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

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string }

heading('The small platform fixes')

check('going home lets go of the clip, which is what the update gate waits for', () => {
  // Read off App.tsx, as the screen-flow checks are: the two halves of one
  // decision, in two places, held together here.
  const app = fs.readFileSync('src/App.tsx', 'utf8')
  const goHome = app.slice(app.indexOf('const goHome = () => {'), app.indexOf('}', app.indexOf('const goHome = () => {') + 30) + 200)
  assert(/releaseVideo\(\)/.test(goHome.slice(0, goHome.indexOf("setView({ kind: 'home' })") + 1)), 'home keeps the clip, so an update waits for the next analysis')
  assert(/const idle = \(\) => view\.kind === 'home' && !urlRef\.current/.test(app), 'the update gate no longer waits for the clip to go')
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
