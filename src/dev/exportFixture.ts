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
import type { Analysis } from '../lib/analysis/types'

type Draft = Fixture & { _UNVERIFIED: true; _enginePhases: Record<string, number> }

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
      keyframes,
      // Empty on purpose. Fill only with values measured outside the app.
      metrics: {},
    },
    _UNVERIFIED: true,
    _enginePhases: measured,
  }
}

const slug = (s: string) =>
  s
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

/** Hand the draft to the browser as a download. */
export function downloadFixture(analysis: Analysis): void {
  const draft = buildFixtureDraft(analysis)
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
