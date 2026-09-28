// Finding 71: the sticky bottom action bar (Save check, and every screen's primary action) grows with
// large text; it publishes its height for the page's scroll-padding and scrolls a focused control
// clear of itself (WCAG 2.4.11).
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomActionBar } from './Screen.tsx'

const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 360, width: 360, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

describe('BottomActionBar', () => {
  let scrollBy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    scrollBy = vi.fn()
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 })
  })
  afterEach(() => vi.restoreAllMocks())

  function setup() {
    render(
      <>
        <main id="main" tabIndex={-1}>
          <button type="button">Release, not marked</button>
        </main>
        <BottomActionBar>
          <button type="button">Save check</button>
        </BottomActionBar>
      </>,
    )
    const bar = screen.getByRole('button', { name: 'Save check' }).closest('.glass') as HTMLElement
    const step = screen.getByRole('button', { name: 'Release, not marked' })
    return { bar, step }
  }

  it('publishes its measured height as --action-bar-h for scroll-padding-bottom', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('glass') ? rect(578, 162) : rect(0, 0)
    })
    const { bar } = setup()
    expect(bar).toBeTruthy()
    expect(document.documentElement.style.getPropertyValue('--action-bar-h')).toBe('162px')
  })

  it('a control focused under the bar (the marking steps at 200% text) is scrolled clear of it', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(162)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('glass')) return rect(578, 162)
      if (this.textContent === 'Release, not marked') return rect(569, 36)
      return rect(0, 0)
    })
    const { step } = setup()
    fireEvent.focusIn(step)
    expect(scrollBy).toHaveBeenCalledWith({ top: 569 + 36 - (578 - 8), behavior: 'instant' })
  })

  it('never scrolls for a control well above it, or for <main tabindex="-1">', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(162)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('glass')) return rect(578, 162)
      if (this.textContent === 'Release, not marked') return rect(300, 36)
      return rect(0, 900)
    })
    const { step } = setup()
    fireEvent.focusIn(step)
    fireEvent.focusIn(document.getElementById('main')!)
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
