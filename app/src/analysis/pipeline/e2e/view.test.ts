// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { PipelineProgress, PipelineTimings } from '../types.ts'
import { activeRowFor, etaWords, metricText, renderView, type ViewState } from './view.ts'

const progress = (overall: number, extra: Partial<PipelineProgress> = {}): PipelineProgress => ({
  jobId: 'j',
  stage: 'dense',
  step: 'tracking-body',
  stepFraction: 0.5,
  label: 'Tracking the toss (serve 3 of 8)',
  overall,
  elapsedMs: 9000,
  ...extra,
})

const timings = { probeMs: 1, audioMs: 0, poseInitMs: 1, sparseMs: 1, denseMs: 1, densePoseMs: 1, denseBallMs: 1, ballReadbackMs: 1, ballCropScale: 1, ballAnalyseMs: 1, measureMs: 1, keyFramesMs: 1, coachingMs: 1, saveMs: 1, totalMs: 1000, sparseCoarseFrames: 1, sparseFillFrames: 1, framesDecoded: 1, poseFrames: 1, ballFrames: 1, windows: 1, ballBackend: 'worker', ballWorkers: 1, poseBackend: 'worker' } satisfies PipelineTimings

describe('pipeline e2e view', () => {
  it('renders the four rows with determinate, labelled progress bars while running', () => {
    const root = document.createElement('main')
    let cancelled = false
    renderView(root, { clipLabel: 'clip.mp4', status: 'running', view: 'side', progress: progress(0.62, { etaS: 95 }), showExperimental: false }, { onCancel: () => (cancelled = true) })
    const rows = root.querySelectorAll('li.row')
    expect(rows).toHaveLength(4)
    expect(Array.from(rows).map((r) => (r as HTMLElement).dataset.state)).toEqual(['done', 'active', 'waiting', 'waiting'])
    const bar = rows[1].querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-label')).toBe('Tracking the toss')
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
    expect(rows[1].textContent).toContain('serve 3 of 8')
    expect(root.querySelector('[role="status"]')?.textContent).toContain('About 2 minutes left')
    ;(root.querySelector('button') as HTMLButtonElement).click()
    expect(cancelled).toBe(true)
  })

  it('never shows a number without its status and hides experimental values', () => {
    const root = document.createElement('main')
    const state: ViewState = {
      clipLabel: 'clip.mp4',
      status: 'done',
      view: 'side',
      showExperimental: false,
      summary: {
        servesFound: 1,
        servesIncluded: 1,
        keyFrames: 6,
        coaching: 'Decided (focus)',
        warnings: [],
        timings,
        serves: [
          {
            index: 1,
            included: true,
            thumbs: [{ event: 'contact', url: 'blob:x' }],
            metrics: [
              { id: 'toss-apex-height', value: 3.14159, unit: 'm', status: 'estimated', confidence: 0.8, basis: 'x', uncertainty: { kind: 'range', low: 3.0, high: 3.3 } },
              { id: 'spin', value: null, unit: 'rpm', status: 'unavailable', confidence: 0, basis: 'x', unavailableReason: 'a phone video cannot resolve spin' },
              { id: 'speed-experimental', value: '150–170', unit: 'km/h', status: 'experimental', confidence: 0.3, basis: 'x' },
              { id: 'knee-bend-band', value: null, unit: '', status: 'unavailable', confidence: 0, basis: 'x', unavailableReason: 'Only the view from behind can see this.' },
            ],
          },
        ],
      },
    }
    renderView(root, state)
    const values = root.querySelectorAll('[data-metric]')
    expect(values).toHaveLength(2)
    for (const v of values) expect((v as HTMLElement).dataset.status).toBeTruthy()
    expect(root.textContent).toContain('≈ 3.14 m')
    expect(root.textContent).toContain('Estimate')
    expect(root.textContent).toContain('a phone video cannot resolve spin')
    expect(root.textContent).not.toContain('150–170')
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('Serve 1, Contact')
    // D1: a side-view session never lists rear-only metrics, not even as unavailable.
    expect(root.querySelector('[data-metric="knee-bend-band"]')).toBeNull()
    // Values first, player-facing names.
    expect((values[0] as HTMLElement).dataset.metric).toBe('toss-apex-height')
    expect(root.textContent).toContain('Toss height')
    expect(root.querySelectorAll('h1')).toHaveLength(1)
  })

  it('helpers: active row, ETA words and metric text', () => {
    expect(activeRowFor(progress(0.1), 'running')).toBe(0)
    expect(activeRowFor(progress(0.93), 'running')).toBe(2)
    expect(activeRowFor(progress(1), 'running')).toBe(3)
    expect(activeRowFor(undefined, 'done')).toBe(4)
    expect(etaWords(progress(0.5))).toMatch(/Working out/)
    expect(etaWords(progress(0.5, { etaS: 20 }))).toBe('Less than a minute left.')
    expect(metricText({ id: 'x', value: 12, unit: 'cm', status: 'measured', confidence: 1, basis: '', n: 9 }).value).toBe('12 cm, n = 9')
  })
})
