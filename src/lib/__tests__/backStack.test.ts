/**
 * The back gesture's bookkeeping, against a fake history.
 *
 * What has to stay true is one equation: the browser's history depth above the
 * page equals the number of open layers. If it drifts up, the player presses
 * back and nothing happens; if it drifts down, back leaves the app with a sheet
 * still open — the defect this module exists to fix.
 */
import { createBackStack, type HistoryLike } from '../backStack'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

/** A history that pops synchronously and reports each pop back to the stack. */
function fakeHistory() {
  let depth = 0
  let onPop = () => {}
  const history: HistoryLike = {
    pushState() {
      depth++
    },
    back() {
      if (depth === 0) return
      depth--
      onPop()
    },
  }
  return {
    history,
    get depth() {
      return depth
    },
    listen(fn: () => void) {
      onPop = fn
    },
    /** The player presses back. */
    press() {
      history.back()
    },
  }
}

function setup() {
  const h = fakeHistory()
  const stack = createBackStack(h.history)
  h.listen(() => stack.popped())
  return { h, stack }
}

heading('The back gesture closes the top layer, not the app')

check('back closes an open sheet and leaves the screen under it', () => {
  const { h, stack } = setup()
  const closed: string[] = []
  stack.open(() => closed.push('screen'))
  stack.open(() => closed.push('sheet'))
  h.press()
  assert(closed.join() === 'sheet', `closed ${closed.join()}`)
  assert(stack.depth === 1 && h.depth === 1, `stack ${stack.depth}, history ${h.depth}`)
})

check('a layer closed by its own button takes its history entry with it', () => {
  const { h, stack } = setup()
  let ran = false
  const close = stack.open(() => (ran = true))
  close()
  assert(!ran, 'closing from the app must not run the back handler')
  assert(stack.depth === 0 && h.depth === 0, `stack ${stack.depth}, history ${h.depth}`)
})

check('closing a layer twice is harmless', () => {
  const { h, stack } = setup()
  const close = stack.open(() => {})
  h.press()
  close()
  assert(h.depth === 0 && stack.depth === 0, `stack ${stack.depth}, history ${h.depth}`)
})

check('going home under an open sheet keeps the two counts equal', () => {
  const { h, stack } = setup()
  const closed: string[] = []
  const closeScreen = stack.open(() => closed.push('screen'))
  stack.open(() => closed.push('sheet'))
  closeScreen()
  assert(stack.depth === 1 && h.depth === 1, `stack ${stack.depth}, history ${h.depth}`)
  h.press()
  assert(closed.join() === 'sheet', `the remaining layer should close on back, closed ${closed.join()}`)
  assert(h.depth === 0, `history left at ${h.depth}`)
})

check('a back press with nothing open is left to the browser', () => {
  const { stack } = setup()
  stack.popped()
  assert(stack.depth === 0, 'an unowned pop must not throw or go negative')
})

report()
