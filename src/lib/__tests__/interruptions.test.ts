/**
 * Interruptions (L6.4): a seek that waits out a hidden page instead of giving
 * up on it, an analysis the page did not live to finish said once on the next
 * load, and a screen that could not be kept on said while it matters.
 */
import { DEFAULTS } from '../storage/prefs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { timeoutWhileVisible, type VisibilityLike } from '../pose/visibleWait'
import { waitFor } from '../pose/extract'
import { interruptedLine, markRead, markReading, takeInterrupted } from '../interrupted'
import { wakeLockLine } from '../../components/useWakeLock'
import Analyzing from '../../screens/Analyzing'
import Home from '../../screens/Home'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

/** A page that can be hidden and shown, with the event the browser sends. */
function fakePage(hidden = false) {
  const listeners = new Set<() => void>()
  const page: VisibilityLike & { show: () => void; hide: () => void; listening: () => number } = {
    hidden,
    addEventListener: (_, fn) => void listeners.add(fn),
    removeEventListener: (_, fn) => void listeners.delete(fn),
    show: () => {
      page.hidden = false
      for (const fn of [...listeners]) fn()
    },
    hide: () => {
      page.hidden = true
    },
    listening: () => listeners.size,
  }
  return page
}

function fakeClock() {
  let now = 0
  let id = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    setTimeout: (fn: () => void, ms: number) => {
      timers.set(++id, { at: now + ms, fn })
      return id
    },
    clearTimeout: (t: unknown) => void timers.delete(t as number),
    advance: (ms: number) => {
      now += ms
      for (const [k, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(k)
          t.fn()
        }
      }
    },
    pending: () => timers.size,
  }
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

heading('Interruptions')

check('a timeout runs out only while the page is visible, and starts again when it comes back', () => {
  const page = fakePage()
  const clock = fakeClock()
  let fired = 0
  timeoutWhileVisible(() => fired++, 6000, page, clock)
  page.hide()
  clock.advance(6000)
  assert(fired === 0, 'gave up while the page was hidden')
  clock.advance(60_000)
  assert(fired === 0, 'gave up during a long lock')
  page.show()
  clock.advance(5999)
  assert(fired === 0, 'the allowance after waking was cut short')
  clock.advance(1)
  assert(fired === 1 && page.listening() === 0, 'did not fire once, and clean up, after the page came back')

  // Visible throughout: an ordinary timeout.
  const plain = fakeClock()
  let once = 0
  timeoutWhileVisible(() => once++, 100, fakePage(), plain)
  plain.advance(100)
  assert(once === 1, 'a visible page did not time out')

  // Cancelled while waiting for the page: nothing left behind.
  const waiting = fakePage(true)
  const c = fakeClock()
  const cancel = timeoutWhileVisible(() => assert(false, 'fired after a cancel'), 10, waiting, c)
  c.advance(10)
  cancel()
  waiting.show()
  c.advance(10)
  assert(waiting.listening() === 0 && c.pending() === 0, 'a cancelled wait left a listener or a timer')
})

await check('a seek on a hidden page waits for it rather than carrying on without the frame', async () => {
  const page = fakePage(true)
  const clock = fakeClock()
  const video = new EventTarget() as unknown as HTMLVideoElement
  let done = false
  const wait = waitFor(video, 'seeked', 6000, { doc: page, clock }).then(() => (done = true))
  clock.advance(6000)
  await settle()
  assert(!done, 'the seek gave up while the screen was locked')
  page.show()
  ;(video as unknown as EventTarget).dispatchEvent(new Event('seeked'))
  await wait
  assert(done, 'the seek did not land once the page came back')

  // And on a visible page the timeout still ends a seek that never lands.
  const visible = fakePage()
  const c = fakeClock()
  let ended = false
  const stuck = waitFor(new EventTarget() as unknown as HTMLVideoElement, 'seeked', 6000, { doc: visible, clock: c }).then(
    () => (ended = true),
  )
  c.advance(6000)
  await stuck
  assert(ended, 'a visible page waited forever on a seek')
})

check('an analysis the page did not finish is said once, on the next load', () => {
  const store = new Map<string, string>()
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  assert(takeInterrupted(fake) === undefined, 'a fresh tab reported an interruption')
  markReading('serve.mp4', 1000, fake)
  markRead(fake)
  assert(takeInterrupted(fake) === undefined, 'a finished analysis was reported as cut off')
  markReading('serve.mp4', 2000, fake)
  // The page reloads here.
  const cut = takeInterrupted(fake)
  assert(cut?.fileName === 'serve.mp4' && cut.startedAt === 2000, 'the cut-off analysis was not found')
  assert(takeInterrupted(fake) === undefined, 'the same interruption was said twice')
  store.set('serve-coach:reading', '{not json')
  assert(takeInterrupted(fake) === undefined, 'a damaged marker was read as an interruption')
})

check('the screen line is said only when the screen may lock', () => {
  assert(wakeLockLine('refused') !== undefined && wakeLockLine('unsupported') !== undefined, 'a screen that may lock went unsaid')
  assert(wakeLockLine('held') === undefined && wakeLockLine('off') === undefined, 'a held lock was warned about')
})

check('the analysing screen and the home screen say it', () => {
  const noop = () => {}
  const progress = { step: 'tracking', ratio: 0.3 } as never
  const line = wakeLockLine('refused')!
  assert(renderToStaticMarkup(createElement(Analyzing, { progress, fileName: 'serve.mp4', onCancel: noop, screenLine: line })).includes('Keep the screen on'), 'the analysing screen lost the line')
  assert(!renderToStaticMarkup(createElement(Analyzing, { progress, fileName: 'serve.mp4', onCancel: noop })).includes('Keep the screen on'), 'the line shows with the lock held')
  const home = (interrupted?: string) =>
    renderToStaticMarkup(
      createElement(Home, {
        sessions: [],
        offlineReady: true,
        sessionsLoaded: true,
        prefs: DEFAULTS,
        onPrefs: noop,
        onFilm: noop,
        onOpen: noop,
        onShowHistory: noop,
        onShowSettings: noop,
        onShowProgress: noop,
        onShowExample: noop,
        interrupted,
      }),
    )
  assert(home(interruptedLine()).includes('stopped part way'), 'home did not say the reading was cut off')
  assert(!home().includes('stopped part way'), 'home said it with nothing interrupted')
})

report()
