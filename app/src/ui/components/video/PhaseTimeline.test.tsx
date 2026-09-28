// Forced colours (Windows High Contrast, DESIGN §12, finding 86): the serve timeline's system-colour
// rules are forced-colors: utilities on the elements, so they beat the token backgrounds (bg-ink-3,
// bg-ink) whatever the app theme, Court-side included. A rule in the base layer would lose to them.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PhaseSpan, ServeEvents } from '../../../analysis/types.ts'
import { PhaseTimeline } from './PhaseTimeline.tsx'
import { createPlayhead } from './playhead.ts'

const phases: PhaseSpan[] = [
  { phase: 'setup', startFrame: 0, endFrame: 20, keyFrame: 10, confidence: 1 },
  { phase: 'toss', startFrame: 20, endFrame: 50, keyFrame: 40, confidence: 1 },
  { phase: 'loading', startFrame: 50, endFrame: 70, keyFrame: 60, confidence: 1 },
  { phase: 'drive', startFrame: 70, endFrame: 80, keyFrame: 75, confidence: 1 },
  { phase: 'contact', startFrame: 80, endFrame: 85, keyFrame: 82, confidence: 1 },
  { phase: 'landing', startFrame: 85, endFrame: 95, keyFrame: 90, confidence: 1 },
  { phase: 'recovery', startFrame: 95, endFrame: 110, keyFrame: 100, confidence: 1 },
]
const events = {
  tossRelease: { frameIndex: 20, tReal: 0.33, confidence: 0.9 },
  contact: { frameIndex: 82, tReal: 1.37, confidence: 0.9 },
} as unknown as ServeEvents

function renderTimeline() {
  return render(
    <PhaseTimeline
      store={createPlayhead({ frame: 30 })}
      phases={phases}
      events={events}
      window={{ startFrame: 0, endFrame: 110 }}
      timing={{ nominalFps: 60, timeScale: 1 }}
      focusPhase="toss"
      onSeek={() => undefined}
    />,
  )
}

describe('PhaseTimeline in forced colours', () => {
  it('outlines every phase, fills the focus phase with Highlight, and keeps ticks and playhead in CanvasText', () => {
    const { container } = renderTimeline()
    const spans = [...container.querySelectorAll<HTMLElement>('[data-phase]')]
    expect(spans).toHaveLength(7)
    for (const s of spans) expect(s.className, s.dataset.phase).toMatch(/forced-colors:border-\[(CanvasText|Highlight)\]/)
    const focus = container.querySelector<HTMLElement>('[data-phase][data-focus]')!
    expect(focus.dataset.phase).toBe('toss')
    expect(focus.className).toContain('forced-colors:bg-[Highlight]')
    expect(focus.className).toContain('forced-colors:[forced-color-adjust:none]')
    const marks = [...container.querySelectorAll<HTMLElement>('[data-tick], [data-playhead-line]')]
    expect(marks.length).toBeGreaterThanOrEqual(3)
    for (const m of marks) {
      expect(m.className).toContain('forced-colors:bg-[CanvasText]')
      expect(m.className).toContain('forced-colors:[forced-color-adjust:none]')
    }
  })
})
