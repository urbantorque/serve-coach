/**
 * The moments a window of video is read at (H35).
 *
 * `readingPlan` decides which frames of a file the pose model ever sees, and a
 * browser is not needed to check that: where it falls against a file's frames is
 * arithmetic. What a real decoder does with those moments was checked in Chrome
 * on numbered H.264 files, 7,938 of 7,938 through the app's own seek; it is in
 * ROADMAP.md H35, and it is not run here.
 */
import { FINE_FPS, MAX_FINE_FRAMES, phaseOf, readingPlan, samplingRateFor } from '../rate'
import { assert, check, heading, near, note, report } from '../../analysis/__tests__/harness'

const FILE_RATES = [24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120, 240]
/** The located window, whole clips short and long, and windows that start anywhere. */
const WINDOWS: [number, number][] = [
  [0, 2.7],
  [12.345, 15.045],
  [0, 3],
  [0.017, 3.4],
  [4.2, 7.1],
  [101.5, 104.2],
]

heading('Reading the file’s own frames')

check('every sample is its own frame, in the middle of it, and the gaps are even', () => {
  for (const fps of FILE_RATES) {
    for (const [start, end] of WINDOWS) {
      const { times, onFrames, rate } = readingPlan(start, end, fps)
      assert(onFrames, `${fps} fps over ${start}–${end} fell back to the even grid`)
      const frames = times.map((t) => Math.floor(t * fps))
      assert(new Set(frames).size === frames.length, `${fps} fps over ${start}–${end} read one frame twice`)
      for (const [i, t] of times.entries()) {
        near((t * fps) % 1, 0.5, 1e-6, `${fps} fps, sample ${i} isn’t mid-frame`)
        if (i > 0) near(t - times[i - 1], 1 / rate, 1e-9, `${fps} fps, step ${i} isn’t even`)
      }
    }
  }
})

check('a read stays inside its window, and inside the budget', () => {
  for (const fps of FILE_RATES) {
    for (const [start, end] of WINDOWS) {
      const { times, rate } = readingPlan(start, end, fps)
      assert(times[0] >= start - 1e-9 && times[times.length - 1] <= end + 1e-9, `${fps} fps ran off its window`)
      assert(times.length <= MAX_FINE_FRAMES, `${fps} fps read ${times.length} frames`)
      assert(rate <= FINE_FPS, `${fps} fps was read at ${rate}`)
    }
  }
})

check('the rate is the fastest whole step under the ceiling', () => {
  const rate = (fps: number) => +readingPlan(0, 2.7, fps).rate.toFixed(3)
  const seen = FILE_RATES.map((fps) => `${fps}: ${rate(fps)}`)
  note(seen.join(', '))
  for (const fps of [30, 60, 90, 120, 240]) assert(rate(fps) === 30, `${fps} fps reads at ${rate(fps)}`)
  assert(rate(25) === 25 && rate(50) === 25, 'a 25 fps family read off its frames')
  assert(rate(24) === 24 && rate(48) === 24, 'a 24 fps family read off its frames')
  assert(rate(29.97) === 29.97 && rate(59.94) === 29.97, 'an NTSC rate read off its frames')
})

check('a located window costs five reads, not a change in the budget', () => {
  assert(readingPlan(0, 2.7).times.length === 86, 'the even read of the located window moved')
  assert(readingPlan(0, 2.7, 30).times.length === 81, 'the located window isn’t 81 reads at 30 fps')
  assert(readingPlan(0, 2.7, 60).times.length === 81, 'the located window isn’t 81 reads at 60 fps')
})

check('a read starts from where the file’s frames really are', () => {
  /*
   * A first frame half a frame off zero put every moment on a frame edge: a
   * quarter of the samples repeats, a quarter skips, contact ahead 8.2 (H35).
   */
  for (const fps of [25, 30, 60]) {
    for (const share of [-0.4, -0.1, 0.25, 0.5]) {
      const phase = share / fps
      const { times, onFrames } = readingPlan(1.234, 3.9, fps, { phase })
      assert(onFrames, `${fps} fps at a phase of ${share} fell back`)
      for (const t of times) near(((t - phase) * fps) % 1, 0.5, 1e-6, `${fps} fps, ${share}: not mid-frame`)
      assert(times[0] >= 1.234 - 1e-9, `${fps} fps, ${share}: started before the window`)
    }
  }
  // A first frame three quarters of a frame in puts the phase a quarter frame
  // under zero, and the first moment counted from it fell before the film began:
  // the browser showed the first frame there and again at the next, the first
  // filed 17 ms early. Seen in Chrome on a whole clip read from zero (H44). The app
  // tells the first frame there now (the next check); a caller with a phase alone
  // still gets nothing before zero.
  for (const fps of [25, 30, 60]) {
    for (const end of [3, 4.4, 5.2]) {
      const phase = -0.25 / fps
      const { times } = readingPlan(0, end, fps, { phase })
      assert(times[0] >= 0.75 / fps, `${fps} fps over 0–${end}: read at ${times[0].toFixed(4)}, before the first frame at ${(0.75 / fps).toFixed(4)}`)
    }
  }
  // Chrome tells a frame's time to the microsecond, so a phase read off a frame of
  // a file at zero comes back a hair under it at 24, 29.97 and 60 fps: rounding, and
  // frame 0 is kept.
  for (const fps of [24, 30000 / 1001, 60]) {
    const { times } = readingPlan(0, 3, fps, { phase: -1e-6 })
    near(times[0], 0.5 / fps - 1e-6, 1e-9, `${fps.toFixed(2)} fps lost its first frame to rounding`)
  }
  const stamp = (k: number, fps: number, off: number) => k / fps + off
  near(phaseOf(stamp(1234, 30, 0.007), 30), 0.007, 1e-9, 'a 7 ms offset')
  near(phaseOf(stamp(1234, 30, -0.012), 30), -0.012, 1e-9, 'a negative offset')
  near(phaseOf(stamp(1234, 60, 0), 60), 0, 1e-9, 'no offset')
  assert(phaseOf(Number.NaN, 30) === 0, 'a stamp nobody gave moved the read')
})

check('a whole clip is read from the film’s first frame, wherever that is, and never before it', () => {
  /*
   * The first frame's own time, which the browser tells a window that starts at
   * the film's start (H45). Without it a first frame more than a frame in (an
   * empty edit, a composition offset) left moments before the film, read as that
   * frame again, and a file at zero whose told frame came early lost frame 0.
   */
  for (const fps of [24, 25, 30, 60]) {
    for (const firstIn of [0, 0.75, 1.25, 1.6, 2.5, 4.4]) {
      const firstFrame = firstIn / fps
      const phase = phaseOf(firstFrame, fps)
      for (const end of [3, 4.4, 5.2]) {
        const { times, onFrames } = readingPlan(0, end, fps, { phase, firstFrame, seekableTo: end - 0.02 })
        assert(onFrames, `${fps} fps, first frame ${firstIn} in, over 0–${end}: fell back`)
        assert(times[0] >= firstFrame - 1e-9, `${fps} fps, first frame ${firstIn} in: read at ${times[0].toFixed(4)}, before it`)
        assert(times[0] < firstFrame + Math.ceil(fps / 32 + 1e-9) / fps, `${fps} fps, first frame ${firstIn} in: began ${((times[0] - firstFrame) * fps).toFixed(2)} frames late`)
      }
    }
  }
  // A file too slow to walk keeps the grid, and the grid starts at a told first frame
  // too: it read nine or ten moments before the film on a 12 to 18 fps clip (H46).
  for (const fps of [12, 15, 18]) {
    const { times, onFrames } = readingPlan(0, 3, fps, { phase: phaseOf(0.3, fps), firstFrame: 0.3, seekableTo: 2.98 })
    assert(!onFrames, `${fps} fps was walked`)
    assert(times[0] >= 0.3 - 1e-9, `${fps} fps, first frame 0.3 s in: the grid read at ${times[0].toFixed(4)}, before it`)
  }
  // A file at zero whose later frames jittered early keeps frame 0 once its own time is known.
  const jittered = readingPlan(0, 3, 30, { phase: -0.001, firstFrame: 0 })
  near(jittered.times[0], 0.5 / 30 - 0.001, 1e-9, 'a jittered file at zero lost its first frame')
})

check('a first frame that lasts longer or shorter than the rest is read once, and nothing before it', () => {
  /*
   * The phase is read off a frame after the first (H46). A first frame need not
   * last as long as the rest, and a phase taken from one that lasted half a frame
   * longer put every later moment on a frame's edge: a third of a 30 fps clip read
   * twice, in Chrome. Up to a frame and a half, the first frame is read once.
   */
  for (const fps of [24, 30, 60]) {
    for (const firstIn of [0, 0.3, 2]) {
      for (const lasts of [0.4, 0.5, 0.75, 1.25, 1.35, 1.45]) {
        const firstFrame = firstIn / fps
        const second = firstFrame + lasts / fps
        const phase = phaseOf(second + 2 / fps, fps)
        const { times } = readingPlan(0, 3, fps, { phase, firstFrame, seekableTo: 2.98 })
        const shown = times.map((t) => (t < firstFrame - 1e-9 ? -1 : t < second ? 0 : 1 + Math.floor((t - second) * fps + 1e-9)))
        const where = `${fps} fps, first frame ${firstIn} in lasting ${lasts}`
        assert(!shown.includes(-1), `${where}: read before it, at ${times[0].toFixed(4)}`)
        assert(new Set(shown).size === shown.length, `${where}: a frame read twice`)
      }
    }
  }
})

check('every planned moment shows its own frame, even where the seek is clamped', () => {
  // `seekTo` stops 20 ms short of the end, so at 60 fps and up the last moment
  // of a clip used to show the frame before the one it was filed as. A 30 fps
  // clip keeps its last frame, which the clamped seek still lands on.
  for (const fps of [25, 30, 50, 60, 90, 120, 240]) {
    for (const duration of [3, 3.01, 2.99]) {
      const { times, onFrames } = readingPlan(0, duration, fps, { seekableTo: duration - 0.02 })
      assert(onFrames, `${fps} fps fell back`)
      for (const t of times) {
        const shown = Math.floor(Math.min(t, duration - 0.02) * fps)
        assert(shown === Math.floor(t * fps), `${fps} fps, ${duration} s: ${t.toFixed(4)} shows frame ${shown}`)
      }
    }
  }
  const at30 = readingPlan(0, 3, 30, { seekableTo: 2.98 })
  assert(at30.times[at30.times.length - 1] > 2.98, 'a 30 fps clip lost the last frame the seek can still show')
})

heading('Where the step can’t be taken')

check('a 30 fps clip the budget would walk at 15 a second is read at the grid’s count, each sample a frame of its own', () => {
  /*
   * Past four seconds a 30 fps clip wants every second frame, half the 27 Hz the
   * budget can pay for, and a third of such takes were refused when it was tried.
   * So it takes the grid's count. THE PROMISE CHANGED (H44): it used to stay on
   * the even grid itself, whose stamps slid against the film, and clean serves
   * were told a fault on 52 takes where these reads now tell 14 (`rate.ts`).
   */
  assert(readingPlan(0, 3.9, 30).rate === 30, 'a 3.9 s clip isn’t walked frame by frame')
  for (const [fps, start, end, phase] of [
    [30, 0, 4.4, 0],
    [30, 2.31, 6.4, 0.011],
    [60, 0, 4.1, 0],
    [25, 7, 12, -0.013],
    [30, 0, 5, 0],
    [75, 0, 5, 0.004],
  ] as const) {
    const plan = readingPlan(start, end, fps, { phase })
    const grid = readingPlan(start, end)
    const frames = plan.times.map((t) => Math.round((t - phase) * fps - 0.5))
    assert(plan.onFrames, `${fps} fps over ${start}–${end} wasn’t put on the frames`)
    assert(plan.times.length === grid.times.length && plan.rate === grid.rate, `${fps} fps over ${start}–${end} didn’t take the grid's count`)
    for (const [i, t] of plan.times.entries()) {
      near(((t - phase) * fps) % 1, 0.5, 1e-6, `${fps} fps, sample ${i} isn’t mid-frame`)
      if (i > 0) assert(frames[i] > frames[i - 1], `${fps} fps, sample ${i} read a frame again or went back`)
    }
    const widest = Math.max(...frames.slice(1).map((k, i) => k - frames[i]))
    assert(widest <= Math.ceil(fps / grid.rate), `${fps} fps over ${start}–${end} skipped ${widest - 1} frames at once`)
    assert(plan.times[0] >= start - 1e-9 && plan.times[plan.times.length - 1] <= end + 1e-9, `${fps} fps ran off its window`)
  }
})

heading('Where the even grid stays')

check('nobody knows the rate: the old grid, to the digit', () => {
  for (const known of [undefined, 0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
    for (const [start, end] of WINDOWS) {
      const span = end - start
      const fps = samplingRateFor(span)
      const count = Math.max(8, Math.round(span * fps))
      const plan = readingPlan(start, end, known)
      assert(!plan.onFrames && plan.rate === fps, `${known} didn’t fall back`)
      assert(plan.times.length === count, `${known} read ${plan.times.length} samples, not ${count}`)
      plan.times.forEach((t, i) => assert(t === start + (span * i) / (count - 1), `${known}, sample ${i} moved`))
    }
  }
})

check('a file with fewer frames than the grid has moments keeps the grid', () => {
  // Under `LOWEST_WALK` the grid reads each frame twice, and the engine's
  // smooths, counted in samples, need the count.
  for (const fps of [12, 15, 18]) {
    const plan = readingPlan(0, 2.7, fps)
    assert(!plan.onFrames && plan.times.length === readingPlan(0, 2.7).times.length, `${fps} fps left the grid`)
  }
})

check('a long stretched window takes the step, and stays in budget', () => {
  // 120 fps slow motion written at 30: 10.8 s of file, about 11 samples a second.
  const plan = readingPlan(20, 30.8, 30, { stretch: 4 })
  note(`stretched window: ${plan.times.length} reads at ${plan.rate.toFixed(2)} a second of file`)
  assert(plan.onFrames, 'a stretched window fell back to the even grid')
  assert(plan.times.length <= MAX_FINE_FRAMES && plan.rate === 10, `read ${plan.times.length} at ${plan.rate}`)
})

check('a serve is never walked slower than the engine can follow', () => {
  /*
   * At 15 a second the racket hand's peak goes under the tossing arm, and a clip
   * was refused because "the clip ends before the racket reaches the ball",
   * which was false. A 75 fps clip on a blind window would walk at 18.75.
   */
  for (const fps of [12, 15, 18]) assert(!readingPlan(0, 2.7, fps).onFrames, `${fps} fps was walked`)
  assert(readingPlan(0, 5, 75).rate === readingPlan(0, 5).rate, 'a 75 fps clip was walked at 18.75 on a blind window')
  assert(readingPlan(0, 2.7, 20).onFrames && readingPlan(0, 5, 60).onFrames, 'a read the engine can follow fell back')
  assert(readingPlan(0, 21.6, 15, { stretch: 8 }).onFrames, 'slow motion was refused the walk on its clock')
})

check('too little to walk falls back rather than reading a handful', () => {
  assert(!readingPlan(0, 0.1, 30).onFrames, 'a span of three frames was walked')
  assert(readingPlan(0, 0.1, 30).times.length === 8, 'the shortest read is eight samples')
})

report()
