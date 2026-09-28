// Finding 70: the collapsed "This serve" drawer leaves the video's controls clear on load.
import { describe, expect, it } from 'vitest'
import { hiddenGuideLabels } from '../../components/record/guideLabels.ts'
import { peekRowsFor } from './peek.ts'
import { fitStageHeight, FIT_MIN } from './useFitStage.ts'

describe('drawer peek rows (finding 70)', () => {
  it('tall phones show the whole peek; 360 x 740 and large text one value; landscape its title only', () => {
    expect(peekRowsFor(844, 16)).toBe('all')
    expect(peekRowsFor(932, 16)).toBe('all')
    expect(peekRowsFor(740, 16)).toBe(1)
    expect(peekRowsFor(640, 16)).toBe(1)
    expect(peekRowsFor(844, 32)).toBe(1)
    expect(peekRowsFor(740, 32)).toBe(1)
    expect(peekRowsFor(640, 32)).toBe(0)
    expect(peekRowsFor(390, 16)).toBe(0)
  })

  it('the video box yields to the controls and the drawer, never below its minimum', () => {
    const h = fitStageHeight('min(45dvh, 693px)')
    expect(h.startsWith('min(min(45dvh, 693px), max(')).toBe(true)
    expect(h).toContain(FIT_MIN)
    expect(h).toContain('var(--drawer-peek, 176px)')
    expect(h).toContain('var(--serve-controls-h, 0px)')
    expect(h).toContain('var(--stage-top, 0px)')
  })
})

describe('live framing guide labels (finding 76)', () => {
  it('"Toss room above" is hidden rather than drawn at or below "Feet about here" or outside the preview', () => {
    expect(hiddenGuideLabels({ height: 600, toss: [124, 145], feet: [410, 431], coveredTo: 118 })).toEqual({ toss: false, feet: false })
    // 320 px: pushed below the instruction, it lands on the feet label.
    expect(hiddenGuideLabels({ height: 300, toss: [215, 236], feet: [196, 217], coveredTo: 211 }).toss).toBe(true)
    // Pushed past the bottom of a letterboxed preview.
    expect(hiddenGuideLabels({ height: 220, toss: [230, 262], feet: [150, 182], coveredTo: 226 })).toEqual({ toss: true, feet: true })
  })

  it('a label under the instruction block is hidden, never drawn beneath it', () => {
    expect(hiddenGuideLabels({ height: 500, toss: [348, 390], feet: [300, 342], coveredTo: 344 }).feet).toBe(true)
  })
})
