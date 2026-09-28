// The "This serve" drawer's keyboard behaviour: focus never falls to <body> when the drawer collapses
// (finding 83), and the scroll-clear rule for the collapsed drawer only moves real controls, never the
// tall <main tabindex="-1"> a tap on plain text focuses (finding 70).
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatDrawer } from './StatDrawer.tsx'

function Harness({ initial = false, onSelect }: { initial?: boolean; onSelect?: () => void }) {
  const [open, setOpen] = useState(initial)
  return (
    <>
      <main id="main" tabIndex={-1}>
        <p>Frame 133</p>
        <button type="button">Body</button>
      </main>
      <StatDrawer
        peek={[]}
        focusIds={[]}
        groups={[]}
        experimental={[]}
        unavailable={[]}
        header={<p>Header</p>}
        extras={
          <button
            type="button"
            onClick={() => {
              onSelect?.()
              // What ServeDetailScreen's key-frame strip does: seek, then collapse the drawer.
              setOpen(false)
            }}
          >
            Peak, focus. Show this frame
          </button>
        }
        expanded={open}
        onExpandedChange={setOpen}
      />
    </>
  )
}

const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 390, width: 390, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

describe('StatDrawer focus', () => {
  let scrollBy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    // jsdom has no layout: give the collapsed peek a height so the scroll-clear rule is armed.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(170)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 })
    scrollBy = vi.fn()
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy
  })
  afterEach(() => vi.restoreAllMocks())

  it('a key frame chosen inside the expanded drawer hands focus back to the drawer toggle, not <body>', async () => {
    render(<Harness initial />)
    const frame = screen.getByRole('button', { name: 'Peak, focus. Show this frame' })
    frame.focus()
    expect(document.activeElement).toBe(frame)
    await act(async () => fireEvent.click(frame))
    const toggle = screen.getByRole('button', { name: /All values/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(toggle)
  })

  it('Escape inside the expanded drawer also returns focus to the toggle', async () => {
    render(<Harness initial />)
    screen.getByRole('button', { name: 'Peak, focus. Show this frame' }).focus()
    await act(async () => fireEvent.keyDown(window, { key: 'Escape' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /All values/ }))
  })

  it('focusing the tall <main tabindex="-1"> (a tap on plain text, or the skip link) never scrolls the page', () => {
    render(<Harness />)
    const main = document.getElementById('main')!
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(rect(0, 900))
    act(() => main.focus())
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('a control under the collapsed drawer is scrolled clear of it', () => {
    render(<Harness />)
    const body = screen.getByRole('button', { name: 'Body' })
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(rect(600, 44))
    act(() => body.focus())
    expect(scrollBy).toHaveBeenCalledTimes(1)
    const top = (scrollBy.mock.calls[0][0] as ScrollToOptions).top!
    // 740 − 170 − 8 = 562: the control's bottom (644) moves up by 82 px.
    expect(top).toBe(82)
  })
})
