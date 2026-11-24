/**
 * Offline errors that say so (L6.2): an engine that would not load gets its
 * own words, never the advice for a video the decoder refused, and the home
 * screen promises offline use only once the coach is on the phone.
 */
import { DEFAULTS } from '../storage/prefs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { DownloadStalled, EngineLoadError, engineFailureOf } from '../engineDownload'
import { hintsOf } from '../analysis/types'
import Home from '../../screens/Home'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

/** The generic screen's advice, for a file the decoder refused. */
const VIDEO_ADVICE = /camera roll|MP4|MOV/

heading('Offline errors that say so')

check('a failed engine load is classified by why it failed', () => {
  assert(engineFailureOf(new DownloadStalled('/models/x'), true) === 'stalled', 'a stall was not called one')
  // By name too: a class duplicated across chunks fails instanceof.
  assert(engineFailureOf({ name: 'DownloadStalled' }, true) === 'stalled', 'a stall from another chunk was missed')
  assert(engineFailureOf(new TypeError('Failed to fetch'), false) === 'offline', 'no signal and no coach was not called offline')
  assert(engineFailureOf(new TypeError('Failed to fetch'), true) === 'failed', 'a failure with a signal was called offline')
  assert(engineFailureOf(new DownloadStalled('/m'), false) === 'stalled', 'a stall offline lost its own reason')
})

check('each failure carries its own advice, and none of it is about the video file', () => {
  const rows: string[] = []
  for (const [cause, online] of [
    [new TypeError('Failed to fetch'), false],
    [new DownloadStalled('/models/x'), true],
    [new Error('wasm instantiate failed'), true],
  ] as const) {
    const err = new EngineLoadError(cause, online, 57)
    const hints = hintsOf(err)
    rows.push(`${err.kind}: "${err.message}"`)
    assert(hints !== undefined && hints.length === 2, `${err.kind} reached the error screen without its own hints`)
    assert(!VIDEO_ADVICE.test([err.message, ...hints!].join(' ')), `${err.kind} gave video-file advice`)
    assert(err.cause === cause, `${err.kind} lost the error it came from`)
  }
  note(rows.join(' · '))
  const offline = new EngineLoadError(new TypeError('Failed to fetch'), false, 57)
  assert(/57 MB/.test(offline.hints.join(' ')), 'the offline advice does not say how big the download is')
})

check('the first run says the download only while there is one to make', () => {
  const noop = () => {}
  const foot = (offlineReady: boolean | undefined) => {
    const html = renderToStaticMarkup(
      createElement(Home, {
        sessions: [],
        offlineReady,
        sessionsLoaded: true,
        prefs: DEFAULTS,
        onPrefs: noop,
        onFilm: noop,
        onOpen: noop,
        onShowHistory: noop,
        onShowSettings: noop,
        onShowProgress: noop,
        onShowExample: noop,
      }),
    )
    return html.slice(html.indexOf('first-foot'))
  }
  assert(!foot(true).includes('one-time download'), 'a downloaded coach was offered again')
  assert(foot(false).includes('one-time download'), 'the download is not said before it happens')
  assert(!foot(undefined).includes('signal'), 'said something about the signal before the cache had answered')
})

report()
