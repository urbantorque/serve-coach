/**
 * What the device check will say, on browsers this runner does not have.
 *
 * The check exists because nothing in this repo has recorded a frame, so the one
 * thing it must not do is be wrong in the same direction the untested code is.
 * `recordingType()` picks a container by an ordering that assumes what a browser
 * can decode; this asserts that the check notices when that assumption fails,
 * rather than inheriting it.
 *
 * Browsers are modelled as the two probes the real ones are: something with
 * `isTypeSupported`, and something with `canPlayType`. That is the whole surface.
 */
import {
  decodeVerdicts,
  deviceReportText,
  hardwareVerdict,
  playback,
  recordingVerdict,
  storageVerdict,
  REPORT_VOCABULARY,
  type DeviceReport,
} from '../selfCheck'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

/** A recorder that accepts exactly the types listed. */
const records = (...types: string[]) => ({ isTypeSupported: (t: string) => types.includes(t) })

/** A decoder that answers `probably` for the queries listed and `''` otherwise. */
const plays = (...queries: string[]) => ({
  canPlayType: (q: string) => (queries.includes(q) ? 'probably' : ''),
})

const MP4 = 'video/mp4; codecs="avc1.42E01E"'
const WEBM9 = 'video/webm; codecs="vp9"'

heading('Asking a browser what it will play')

check('the three answers are named, and the blank one is a refusal', () => {
  assert(playback(plays(MP4), MP4) === 'yes', 'probably did not read as yes')
  assert(playback({ canPlayType: () => 'maybe' }, MP4) === 'maybe', 'maybe was collapsed')
  assert(playback(plays(), MP4) === 'no', 'the empty string did not read as a refusal')
  assert(playback(undefined, MP4) === 'no', 'a missing decoder was not a refusal')
})

check('a decoder that throws is a no about that container, not a broken check', () => {
  const hostile = {
    canPlayType: () => {
      throw new Error('never heard of it')
    },
  }
  assert(playback(hostile, MP4) === 'no', 'a throw escaped')
  assert(decodeVerdicts(hostile).every((v) => v.plays === 'no'), 'a throw escaped the sweep')
})

heading('Whether this browser can record something it can then read')

check('a browser with no MediaRecorder is not a dead end, it is no button', () => {
  // The distinction matters to the player: nothing to press is the designed
  // fallback, and a button that produces an unreadable file is the defect.
  const v = recordingVerdict(undefined, plays(MP4))
  assert(v.chosen === undefined, 'chose a container with no recorder')
  assert(v.deadEnd === false, 'absence was reported as a dead end')
})

check('the ordinary browser records MP4 and plays it', () => {
  const v = recordingVerdict(records('video/mp4;codecs=avc1', 'video/webm;codecs=vp9'), plays(MP4, WEBM9))
  assert(v.chosen === 'video/mp4;codecs=avc1', `chose ${v.chosen}`)
  assert(v.deadEnd === false, 'called a working browser a dead end')
})

check('a container this browser cannot open is not the one it records in', () => {
  // The failure the recording path was designed around, arriving from the
  // direction nothing could test: a browser that will encode WebM and will not
  // decode it. The choosing used to hand that back, because its ordering is a
  // guess about decoders and this is the case where the guess is wrong.
  const v = recordingVerdict(records('video/webm;codecs=vp9'), plays(MP4))
  assert(v.chosen === undefined, `chose ${v.chosen}, which this browser cannot open`)
  assert(v.deadEnd === true, 'a browser that records nothing readable was not flagged')
})

check('the readable container is preferred over the higher-ranked unreadable one', () => {
  // MP4 outranks WebM in `RECORDING_TYPES` and this browser records both. The
  // ranking is a statement about what is *likely* readable, and it loses to the
  // browser's own answer about what actually is.
  const v = recordingVerdict(records('video/mp4', 'video/webm'), {
    canPlayType: (q: string) => (q === 'video/webm' ? 'probably' : ''),
  })
  assert(v.chosen === 'video/webm', `chose ${v.chosen}`)
  assert(v.deadEnd === false, 'flagged a browser that found a working container')
})

check('Safari saying maybe about everything is not a dead end', () => {
  // Safari answers `maybe` for files it plays perfectly. Reading that as a
  // refusal would report the recording path broken on the browser where it
  // matters most, which is the exact overclaim this whole check is against.
  const v = recordingVerdict(records('video/mp4;codecs=avc1'), { canPlayType: () => 'maybe' })
  assert(v.deadEnd === false, 'maybe was read as a refusal')
})

check('every container in the list is reported, recorded or not', () => {
  const v = recordingVerdict(records('video/mp4'), plays())
  assert(v.containers.length === 5, `reported ${v.containers.length} containers`)
  assert(v.containers.filter((c) => c.records).length === 1, 'reported the wrong count as recordable')
})

heading('What the device says about itself')

// Awaited out here rather than inside a `check`. The harness takes a synchronous
// function, so a returned promise counts as passed the instant it is created and
// a rejection lands as an unhandled one — a suite that cannot fail.
const silent = await storageVerdict({} as StorageManager)
const hostile = await storageVerdict({
  estimate: () => Promise.reject(new Error('no')),
  persisted: () => Promise.reject(new Error('no')),
} as unknown as StorageManager)
const generous = await storageVerdict({
  estimate: () => Promise.resolve({ quota: 2_500_000_000, usage: 41_000_000 }),
  persisted: () => Promise.resolve(true),
} as unknown as StorageManager)

check('a browser that will not estimate leaves the fields absent, not zero', () => {
  // Zero megabytes of quota is a sentence about a broken phone. Absent is a
  // sentence about a browser that would not say, and they are different things
  // to read at a court.
  assert(silent.quotaMb === undefined, 'invented a quota')
  assert(silent.persisted === undefined, 'invented a persistence answer')
})

check('a storage manager that throws is survived', () => {
  assert(hostile.quotaMb === undefined && hostile.usedMb === undefined, 'a rejection produced numbers')
})

check('bytes are reported in megabytes, which is what the rest of the app counts in', () => {
  assert(generous.quotaMb === 2500, `quota read ${generous.quotaMb}`)
  assert(generous.usedMb === 41, `usage read ${generous.usedMb}`)
  assert(generous.persisted === true, 'lost the persistence answer')
})

check('hardware readings absent on this browser are absent, not guessed', () => {
  assert(Object.keys(hardwareVerdict(undefined)).length === 0, 'invented hardware')
  const partial = hardwareVerdict({ innerWidth: 390, innerHeight: 844, navigator: {} })
  assert(partial.screen === '390×844', `screen read ${partial.screen}`)
  assert(partial.cores === undefined, 'invented a core count')
  assert(partial.memoryGb === undefined, 'invented a memory figure')
})

heading('What the player is invited to paste')

/**
 * A report with every field populated, so the walks below have something to
 * walk. Deliberately built by hand rather than by `readDeviceReport`, which
 * needs a browser — and a fixture that cannot be produced here is a fixture that
 * cannot go stale silently either, because the type will not compile without it.
 */
const full: DeviceReport = {
  recording: recordingVerdict(records('video/webm;codecs=vp9'), plays(MP4)),
  decode: decodeVerdicts(plays(MP4)),
  camera: { api: true, secure: true },
  storage: { quotaMb: 2945, usedMb: 41, persisted: false },
  hardware: { screen: '390×844', dpr: 3, cores: 8, memoryGb: 4 },
  offline: true,
}

/** Every string anywhere in a value, with the path that reached it. */
function strings(value: unknown, at: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([at, value])
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${at}[${i}]`, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, `${at}.${k}`, out)
  }
  return out
}

check('a report can only contain strings from a fixed vocabulary', () => {
  // The same shape as the check that walks `diagnose.ts` and fails on a
  // sentence. The point is not that today's fields are careful — it is that a
  // field added later cannot quietly carry a file name, a serve or a person into
  // a block of text the player is being invited to paste to somebody.
  const allowed = new Set<string>(REPORT_VOCABULARY)
  for (const [at, s] of strings(full, 'report')) {
    const ok = allowed.has(s) || /^\d+×\d+$/.test(s)
    assert(ok, `${at} carried "${s}", which is not in the report vocabulary`)
  }
})

/** The fixed words the text block is written in, longest first so `no` cannot eat `nothing`. */
const KEYWORDS = [
  'serve-coach device check',
  'DEAD END',
  'persisted',
  'playable',
  'nothing',
  'records',
  'storage',
  'offline',
  'camera',
  'screen',
  'secure',
  'memory',
  'record',
  'cores',
  'opens',
  'plays',
  'none',
  'play',
  'dpr',
  'MB',
  'of',
]

check('the pasted block contains nothing but its own vocabulary', () => {
  const text = deviceReportText(full)
  let residue = text
  for (const word of [...REPORT_VOCABULARY, ...KEYWORDS].sort((a, b) => b.length - a.length)) {
    residue = residue.split(word).join(' ')
  }
  // What is left should be numbers, spacing and the two punctuation marks the
  // template supplies. Any letter surviving this is a field somebody added
  // without thinking about who reads it.
  residue = residue.replace(/[\d\s×.?]/g, '')
  assert(residue === '', `the block carried unexpected content: ${residue}`)
})

check('the block says nothing about the browser it was produced on', () => {
  // No user agent, by decision rather than by oversight. It is the field most
  // likely to identify one person's device across sites, and every other line
  // here is the capability a UA string is only ever used to guess at.
  const text = deviceReportText(full).toLowerCase()
  for (const leak of ['mozilla', 'safari', 'chrome', 'iphone', 'android', 'windows']) {
    assert(!text.includes(leak), `the block named ${leak}`)
  }
})

check('the same phone twice produces the same block', () => {
  // No clock and no random, so a second report after a fix reads as a diff
  // rather than as a new document.
  assert(deviceReportText(full) === deviceReportText(full), 'the block moved between runs')
})

check('a dead end is stated in the block, not only coloured on the screen', () => {
  assert(deviceReportText(full).includes('DEAD END'), 'the pasted block hid the failure')
})

report()
