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
 */
import { packFrames, type Fixture } from '../lib/analysis/groundTruth'
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
}

type RejectedDraft = Fixture & { _UNVERIFIED: true; _engineRejection: string }

export function buildFixtureDraft(analysis: Analysis): Draft {
  const keyframes: Record<string, number> = {}
  for (const p of analysis.phases) keyframes[p.id] = Number(p.t.toFixed(4))

  // Every measurement the engine produced, for the labeller to delete or
  // replace. Kept out of `expect` deliberately: pre-filling `expect.metrics`
  // with engine output is how a suite ends up asserting only that the code is
  // deterministic.
  const measured: Record<string, number> = {}
  for (const f of analysis.fundamentals) {
    for (const m of f.metrics) measured[m.id] = Number(m.value.toFixed(3))
  }

  return {
    id: slug(analysis.video.name) || 'unnamed-clip',
    label: `TODO: describe this clip — player, camera angle, frame rate, phone`,
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
): RejectedDraft {
  return {
    id: slug(fileName) || 'unnamed-clip',
    label: `TODO: describe this clip — player, camera angle, frame rate, phone`,
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

/** Hand the draft to the browser as a download. */
export function downloadFixture(analysis: Analysis): void {
  save(buildFixtureDraft(analysis))
}

/** The same for a refusal, which never produced an analysis to export. */
export function downloadRejectedFixture(
  capture: FailedCapture,
  fileName: string,
  reason: string,
): void {
  save(buildRejectedDraft(capture, fileName, reason))
}
