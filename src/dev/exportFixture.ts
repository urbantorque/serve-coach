/**
 * Turn the analysis on screen into a ground-truth fixture file.
 *
 * Dev-only, and dynamically imported so none of it reaches the production
 * bundle. This is the only way real footage gets into the test suite: the clip
 * itself never leaves the page and could not be committed anyway at a few
 * hundred megabytes, but the pose output it produced is a few hundred kilobytes
 * and is the actual input the analysis code sees.
 *
 * What comes out is a *draft*. It carries the engine's own current answers and a
 * `_UNVERIFIED` flag, because a file asserting that the engine agrees with
 * itself tests nothing — the suite fails while that flag is present, so an
 * unlabelled dump cannot quietly pad the fixture count. See
 * `src/lib/analysis/__tests__/fixtures/README.md` for what to do with it.
 *
 * The draft is designed to fail. Everything here is about making the work
 * between a failing draft and a real fixture visible while the labeller is still
 * at the keyboard: the description is asked for rather than left as a
 * placeholder, the unit each measurement wants is written down beside it, and
 * `draftGaps` says what is left in the validator's own words.
 */
import { labelProblem, packFrames, validateFixtureSchema, type Fixture } from '../lib/analysis/groundTruth'
import type { Analysis, FailedCapture } from '../lib/analysis/types'

/**
 * Sidecar keys are underscore-prefixed on purpose.
 *
 * `validateFixtureSchema` rejects any fixture still carrying one, so they cannot
 * reach the RECORDED list. That is the point: they exist so the labeller can see
 * what the engine said while correcting it, and deleting them is the moment the
 * labeller has to hold their own answer next to the engine's and decide the two
 * differ. The validator also compares them value-for-value against `expect`, so
 * a value left exactly as the engine printed it is caught by name.
 *
 * `_enginePhases` was the old name for the metrics sidecar and never held
 * phases; the schema check that reads these matches on the `_` prefix, not the
 * name, so the rename costs nothing and stops the next reader from trusting it.
 */
type Draft = Fixture & {
  _UNVERIFIED: true
  _engineMetrics: Record<string, number>
  _engineKeyframes: Record<string, number>
  /**
   * The unit each measurement is compared in — `°`, `×`, `ms`, `%`.
   *
   * Not decoration. `expect.metrics` is diffed against the engine in the
   * metric's own unit, and `validateFixture` picks the allowance from that unit
   * too, so a value in the wrong one is not slightly wrong, it is wrong by a
   * factor. The measurements a labeller can actually take outside the app are
   * the ones most exposed to it: a tape measure gives contact height in metres
   * and this engine wants it in the player's own standing heights, and a
   * protractor gives degrees where the engine's elbow figure is degrees too —
   * so the two cases look identical on screen and differ by 2.6×.
   *
   * A sidecar rather than a real field because it is the engine talking, and
   * everything the engine says about its own answers has to be deleted before
   * the file is ground truth.
   */
  _engineUnits: Record<string, string>
}

type RejectedDraft = Fixture & { _UNVERIFIED: true; _engineRejection: string }

/** What the labeller is asked, and an example short enough to read in a prompt box. */
const LABEL_ASK =
  'Describe this clip — who is serving, which hand, camera angle, frame rate, phone.'
const LABEL_EXAMPLE = 'Adult male, right handed, side-on, 30 fps, iPhone 13'

export function buildFixtureDraft(analysis: Analysis, label: string): Draft {
  refuseBadLabel(label)

  const keyframes: Record<string, number> = {}
  for (const p of analysis.phases) keyframes[p.id] = Number(p.t.toFixed(4))

  // Every measurement the engine produced, for the labeller to delete or
  // replace. Kept out of `expect` deliberately: pre-filling `expect.metrics`
  // with engine output is how a suite ends up asserting only that the code is
  // deterministic.
  const measured: Record<string, number> = {}
  const units: Record<string, string> = {}
  for (const f of analysis.fundamentals) {
    for (const m of f.metrics) {
      measured[m.id] = Number(m.value.toFixed(3))
      units[m.id] = m.unit
    }
  }

  return {
    id: slug(analysis.video.name) || 'unnamed-clip',
    label: label.trim(),
    source: 'recorded',
    notes:
      `Captured ${new Date(analysis.createdAt).toISOString()}. ` +
      `${analysis.video.width}×${analysis.video.height}, ` +
      `sampled at ${analysis.quality.sampledFps.toFixed(1)} fps, ` +
      `${analysis.quality.swingSamples} samples through the swing, ` +
      `engine confidence ${(analysis.quality.confidence * 100).toFixed(0)}%.`,
    fps: analysis.quality.sampledFps,
    frames: packFrames(analysis.frames),
    expect: {
      handedness: analysis.handedness,
      view: analysis.quality.view,
      // The engine's own keyframe times, to be corrected by scrubbing the clip.
      // Also copied to `_engineKeyframes` so the schema check can tell a
      // corrected time from one left exactly as the engine found it.
      keyframes,
      // Empty on purpose. Fill only with values measured outside the app.
      metrics: {},
      // One note per metric, required by the schema. A metric added here without
      // one fails the suite, which is the only reason it is hard to paste the
      // app's own numbers in and call them ground truth.
      metricSource: {},
    },
    _UNVERIFIED: true,
    _engineMetrics: measured,
    _engineKeyframes: { ...keyframes },
    _engineUnits: units,
  }
}

const slug = (s: string) =>
  s
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

/**
 * Refuse to build a draft nobody described.
 *
 * A throw rather than a silent placeholder, and it borrows `labelProblem` from
 * the validator rather than testing for "TODO" itself — see that function for
 * why there is only one opinion about this. The old default wrote the
 * placeholder into the file, which meant the export could not tell a clip
 * somebody had described from one they had not, and neither could anybody
 * reading the downloads folder a week later.
 */
function refuseBadLabel(label: string): void {
  const problem = labelProblem(label)
  if (problem) throw new Error(`fixture label ${problem}`)
}

/**
 * The same, for a clip the engine refused to read.
 *
 * A refusal produces no analysis, so there is nothing for `buildFixtureDraft`
 * to describe — but the pose output exists, it is what the refusal was decided
 * from, and `validateFixture` already knows how to run a fixture whose expected
 * result is a refusal. Only the capture step was missing.
 *
 * `rejected` is prefilled with the engine's own verdict for the same reason the
 * keyframes are in the other draft: it is what the engine said, not what is
 * true. If the clip is plainly a serve, set it false and label the keyframes —
 * the fixture then fails until the engine stops refusing it, which is the whole
 * reason for recording it.
 */
export function buildRejectedDraft(
  capture: FailedCapture,
  fileName: string,
  reason: string,
  label: string,
): RejectedDraft {
  refuseBadLabel(label)

  return {
    id: slug(fileName) || 'unnamed-clip',
    label: label.trim(),
    source: 'recorded',
    notes:
      `Refused by the engine. ${capture.frames.length} frames ` +
      `sampled at ${capture.fps.toFixed(1)} fps.`,
    fps: capture.fps,
    frames: packFrames(capture.frames),
    expect: { rejected: true },
    _UNVERIFIED: true,
    _engineRejection: reason,
  }
}

/* ------------------------------------------------------------ what is left */

/**
 * Everything still standing between this draft and a fixture the suite accepts.
 *
 * Derived from `validateFixtureSchema` rather than written out, so it cannot
 * drift from the gate it is describing: a rule added to the validator appears
 * here the same day, and a rule relaxed there stops being asked for here. The
 * only lines written by hand are the two the schema is structurally unable to
 * see — a keyframe corrected by scrubbing looks exactly like one that was
 * never touched unless it happens to land on the engine's own value, and an
 * `expect.metrics` nobody filled in is indistinguishable from one that was
 * deliberately left empty.
 *
 * The handedness line is the one worth reading twice. `expect.handedness` and
 * `expect.view` are prefilled from the engine, which makes them the two
 * assertions in the file that the engine passes by construction. They are worth
 * keeping — a fixture whose hand was labelled by a human is the only thing that
 * catches the mirrored-front-camera case — but only once somebody has looked at
 * the clip and agreed.
 */
export function draftGaps(draft: Draft | RejectedDraft): string[] {
  const gaps = validateFixtureSchema(draft).map((i) => `${i.where || 'fixture'} — ${i.problem}`)

  if ('_engineKeyframes' in draft) {
    gaps.push(
      'expect.keyframes — every time here is the engine\'s. Scrub the clip and correct them',
      'expect.handedness and expect.view — the engine\'s read. Check them against the clip',
      'expect.metrics — empty. Add whatever you can measure outside the app, in the units ' +
        'listed in _engineUnits, each with a metricSource note saying how',
    )
  }

  return gaps
}

/* -------------------------------------------------------------- the button */

function save(draft: Draft | RejectedDraft): void {
  const blob = new Blob([JSON.stringify(draft)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${draft.id}.fixture.json`
  a.click()
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the fetch to have started.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Ask for the description, and keep asking until it is one or the labeller
 * gives up.
 *
 * `prompt` and `alert` rather than anything built, because this is a dev-only
 * button behind an `import.meta.env.DEV` dynamic import and a modal typed into
 * by whoever is holding the phone. Building UI for it would put design work into
 * a path no player reaches.
 *
 * Cancelling writes no file. That is the point of asking at all: a draft that
 * cannot be described is a draft nobody will be able to place in the coverage
 * table, and one sitting in a downloads folder called `clip-4.fixture.json` is
 * worse than one that was never saved, because it looks like progress.
 */
function askForLabel(): string | undefined {
  let typed = ''
  for (;;) {
    const answer = window.prompt(`${LABEL_ASK}\n\nFor example: ${LABEL_EXAMPLE}`, typed)
    if (answer === null) return undefined
    const problem = labelProblem(answer)
    if (!problem) return answer.trim()
    typed = answer
    window.alert(`That description is ${problem}.\n\nFor example: ${LABEL_EXAMPLE}`)
  }
}

/**
 * Print what the labeller still has to do, next to the file they just saved.
 *
 * The console rather than a modal: it is a list of a dozen lines that has to be
 * readable beside an open editor, and it is the same list the suite will print
 * if they skip it.
 */
function announce(draft: Draft | RejectedDraft): void {
  const gaps = draftGaps(draft)
  console.info(
    `%c${draft.id}.fixture.json saved — ${gaps.length} things left before it is ground truth`,
    'font-weight:bold',
  )
  for (const gap of gaps) console.info(`  · ${gap}`)
  console.info('  See src/lib/analysis/__tests__/fixtures/README.md')
}

/** Hand the draft to the browser as a download. */
export function downloadFixture(analysis: Analysis): void {
  const label = askForLabel()
  if (label === undefined) return
  const draft = buildFixtureDraft(analysis, label)
  save(draft)
  announce(draft)
}

/** The same for a refusal, which never produced an analysis to export. */
export function downloadRejectedFixture(
  capture: FailedCapture,
  fileName: string,
  reason: string,
): void {
  const label = askForLabel()
  if (label === undefined) return
  const draft = buildRejectedDraft(capture, fileName, reason, label)
  save(draft)
  announce(draft)
}
