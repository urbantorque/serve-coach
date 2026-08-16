/**
 * When a new version of the app is allowed to take over.
 *
 * The behaviour being pinned is a refusal, which is the whole reason this
 * module exists: a service worker registered to update on its own schedule
 * reloads the page whenever a deploy reaches it, and this app spends most of
 * its working life in the middle of something a reload destroys — half a minute
 * of pose detection, or a basket sweep that is one full video pass per serve.
 *
 * `applyWhenIdle` is the entire decision, and it takes its "is anything in
 * flight" answer as a function precisely so it can be driven here without a
 * browser, a service worker or a running analysis.
 */
import { __setWaitingForTest, applyWhenIdle, updateWaiting } from '../updates'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

heading('A waiting version, and the moment it is taken')

check('nothing waiting means nothing happens, however idle the app is', () => {
  __setWaitingForTest(false)
  assert(!applyWhenIdle(() => true), 'an update was applied when none was waiting')
})

check('a waiting version is taken when the app is idle', () => {
  let activated = 0
  __setWaitingForTest(true, async () => {
    activated++
  })
  assert(applyWhenIdle(() => true), 'an idle app refused a waiting update')
  assert(activated === 1, `the waiting worker was not activated: ${activated} calls`)
})

check('a waiting version is held while the app is busy', () => {
  let activated = 0
  __setWaitingForTest(true, async () => {
    activated++
  })
  assert(!applyWhenIdle(() => false), 'a busy app was reloaded out from under the player')
  assert(activated === 0, 'the worker took over during an analysis')
  // Held, not discarded — the next quiet moment still gets it.
  assert(updateWaiting(), 'a held update was forgotten rather than kept')
})

check('an update held through a sweep is taken the moment the app goes quiet', () => {
  let activated = 0
  let busy = true
  __setWaitingForTest(true, async () => {
    activated++
  })
  assert(!applyWhenIdle(() => !busy), 'the sweep was interrupted')
  busy = false
  assert(applyWhenIdle(() => !busy), 'the held update was never taken')
  assert(activated === 1, `expected one activation, got ${activated}`)
})

check('one waiting version is taken once, not once per check', () => {
  // The effect that drives this re-runs on every view change, so a second call
  // after a successful one is the ordinary case rather than an edge.
  let activated = 0
  __setWaitingForTest(true, async () => {
    activated++
  })
  applyWhenIdle(() => true)
  applyWhenIdle(() => true)
  applyWhenIdle(() => true)
  assert(activated === 1, `the page was told to reload ${activated} times`)
})

check('the predicate is asked at the moment of acting, not when it was written', () => {
  // An analysis can start between an update landing and the check running, so a
  // boolean captured earlier would be a decision about the wrong moment.
  let activated = 0
  let asked = 0
  __setWaitingForTest(true, async () => {
    activated++
  })
  const idle = () => {
    asked++
    return false
  }
  applyWhenIdle(idle)
  applyWhenIdle(idle)
  assert(asked === 2, `the predicate was asked ${asked} times, expected 2`)
  assert(activated === 0, 'a busy app was reloaded')
})

report()
