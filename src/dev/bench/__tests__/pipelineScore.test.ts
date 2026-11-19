/**
 * The pipeline bench's arithmetic (N2.8), and the file it writes the picture
 * into, checked before any pose model is scored with them.
 */
import { CARD_NOISE_SD } from '../../../lib/analysis/cardNoise'
import { assert, check, heading, near, report } from '../../../lib/analysis/__tests__/harness'
import { compareReadings, quantile, summarise, type PipelineReading, type ServeRow } from '../pipelineScore'
import { idBytes, muxWebm, sizeBytes } from '../webm'

const reading = (metrics: Record<string, number>, o: Partial<PipelineReading> = {}): PipelineReading => ({
  outcome: 'measured',
  flaws: [],
  metrics,
  units: Object.fromEntries(Object.keys(metrics).map((k) => [k, k === 'armExtension' ? '°' : ''])),
  hand: 'right',
  view: 'side',
  ...o,
})

const row = (o: Partial<ServeRow>): ServeRow => ({
  serve: 'bath-1',
  look: 'court',
  gate: 'on',
  outcome: 'measured',
  frames: 10,
  found: 10,
  onFigure: 10,
  wristSeen: 10,
  refined: 0,
  ...o,
})

heading('Pipeline bench: readings against truth')

check('the error is the pipeline minus the truth, only for readings with a stated noise that both gave', () => {
  const e = compareReadings(reading({ armExtension: 160, kneeBend: 20, notGraded: 5 }), reading({ armExtension: 170, contactHeight: 1.2, notGraded: 1 }))
  assert(e.armExtension === -10, `arm extension error ${e.armExtension}`)
  assert(!('kneeBend' in e) && !('contactHeight' in e), 'a reading only one side gave was scored')
  assert(!('notGraded' in e), 'a reading with no stated noise was scored')
})

check('a summary counts only serves both reads measured, and states error in units of the stated noise', () => {
  const sd = CARD_NOISE_SD.armExtension
  const truth = reading({ armExtension: 170 })
  const rows = [
    row({ serve: 'bath-1', pipeline: reading({ armExtension: 170 + sd }), truth, errors: { armExtension: sd } }),
    row({ serve: 'bath-2', pipeline: reading({ armExtension: 170 - 3 * sd }), truth, errors: { armExtension: -3 * sd } }),
    row({ serve: 'bath-3', outcome: 'refused', detail: 'The clip ends before the racket reaches the ball.', truth }),
  ]
  const s = summarise(rows)
  const arm = s.pipeline.metrics.find((m) => m.id === 'armExtension')!
  assert(arm.n === 2, `n ${arm.n}`)
  near(arm.bias, -sd, 1e-6, 'bias')
  near(arm.rmsOverNoise, Math.sqrt(5), 0.01, 'rms over noise')
  near(arm.pastTwoNoise, 0.5, 1e-9, 'share past two noise')
  assert(s.pipeline.measured === 2, `measured ${s.pipeline.measured}`)
  assert(s.pipeline.outcomes['refused: The clip ends before the racket reaches the ball.'] === 1, JSON.stringify(s.pipeline.outcomes))
})

check('a what-if read is summed on its own, never into the app', () => {
  const truth = reading({ kneeBend: 30 })
  const s = summarise([
    row({ outcome: 'refused', detail: 'x', truth, whatIf: { first: { outcome: 'measured', reading: reading({ kneeBend: 34 }), errors: { kneeBend: 4 }, contactWrist: 0.1 } } }),
  ])
  assert(s.pipeline.measured === 0, 'a what-if read was counted as the app')
  assert(s.whatIf.first.measured === 1, 'the what-if read was not counted')
  near(s.whatIf.first.metrics.find((m) => m.id === 'kneeBend')!.rms, 4, 1e-9, 'what-if rms')
  near(s.whatIf.first.contactWrist!, 0.1, 1e-9, 'what-if contact wrist')
})

check('frames found and on the figure are totalled across serves', () => {
  const s = summarise([row({ frames: 90, found: 80, onFigure: 70 }), row({ frames: 10, found: 0, onFigure: 0, framingCheck: 'You stand too far from the camera to measure.' })])
  assert(s.frames === 100 && s.found === 80 && s.onFigure === 70, `${s.frames} ${s.found} ${s.onFigure}`)
  assert(s.framingCheck['You stand too far from the camera to measure.'] === 1, JSON.stringify(s.framingCheck))
})

check("the bench's engine steps are held to the pipeline's first keyframe search, not to a later refusal", () => {
  const clip = 'The clip ends before the racket reaches the ball.'
  const s = summarise([
    // Refused at the first search: the same words are needed.
    row({ outcome: 'refused', detail: clip, firstSearch: 'refused', tail: clip }),
    row({ outcome: 'refused', detail: clip, firstSearch: 'refused', tail: 'measured' }),
    // Passed the first search, refused after the refine: any tail past the keyframes agrees.
    row({ outcome: 'refused', detail: clip, firstSearch: 'passed', tail: 'refused: too_few_frames' }),
    row({ outcome: 'measured', firstSearch: 'passed', tail: clip }),
  ])
  assert(s.tailRun === 4 && s.tailAgrees === 2, `${s.tailAgrees} of ${s.tailRun}`)
  assert(s.laterRefusals === 1, `later refusals ${s.laterRefusals}`)
})

check('quantiles interpolate', () => {
  near(quantile([1, 2, 3, 4], 0.5), 2.5, 1e-9, 'median of four')
  near(quantile([5], 0.9), 5, 1e-9, 'one value')
})

heading('Pipeline bench: the WebM it films into')

check('EBML sizes and ids are written as the format reads them', () => {
  assert(sizeBytes(1).join() === '129', `size 1 ${sizeBytes(1).join()}`)
  // 127 is all ones in one byte, which means "unknown", so it takes two.
  assert(sizeBytes(127).join() === '64,127', `size 127 ${sizeBytes(127).join()}`)
  assert(sizeBytes(300, 8)[0] === 1 && sizeBytes(300, 8).length === 8, 'an eight-byte size')
  assert(idBytes(0x1a45dfa3).join() === '26,69,223,163', 'the EBML id')
  assert(idBytes(0xa3).join() === '163', 'a one-byte id')
})

/** Walk EBML elements: id, payload start and end, by the size each one states. */
function walk(b: Uint8Array, from: number, to: number) {
  const out: { id: number; start: number; end: number }[] = []
  let at = from
  while (at < to) {
    let idLen = 1
    while (!(b[at] & (0x80 >> (idLen - 1)))) idLen++
    let id = 0
    for (let i = 0; i < idLen; i++) id = id * 256 + b[at + i]
    at += idLen
    let len = 1
    while (!(b[at] & (0x80 >> (len - 1)))) len++
    let size = b[at] & (0xff >> len)
    for (let i = 1; i < len; i++) size = size * 256 + b[at + i]
    at += len
    out.push({ id, start: at, end: at + size })
    at += size
  }
  return out
}

check('frames land in clusters on their own millisecond, and every size adds up', () => {
  const frames = [0, 1, 2, 3].map((k) => ({ timestamp: Math.round((k * 1e6) / 30), key: k % 2 === 0, data: Uint8Array.of(k, k, k) }))
  const file = muxWebm({ codec: 'V_VP8', width: 8, height: 16, fps: 30 }, frames)
  const top = walk(file, 0, file.length)
  assert(top.length === 2 && top[0].id === 0x1a45dfa3 && top[1].id === 0x18538067, 'not a header and a segment')
  assert(top[1].end === file.length, 'the segment does not end with the file')
  const inner = walk(file, top[1].start, top[1].end)
  const clusters = inner.filter((e) => e.id === 0x1f43b675)
  assert(clusters.length === 2, `a cluster per key frame: ${clusters.length}`)
  const times: number[] = []
  for (const c of clusters) {
    const parts = walk(file, c.start, c.end)
    const base = file[parts[0].start]
    for (const blk of parts.filter((p) => p.id === 0xa3)) times.push(base + ((file[blk.start + 1] << 8) | file[blk.start + 2]))
  }
  assert(times.join() === '0,33,67,100', `frame times ${times.join()}`)
  assert(inner.some((e) => e.id === 0x1c53bb6b), 'no cues to seek by')
})

report()
