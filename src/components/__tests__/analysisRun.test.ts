/**
 * `useAnalysisRun` and the hooks beside it (L6.11): the decisions that were
 * buried in `App.tsx` held as pure functions, the hooks mounted and read back,
 * and the screen left under its size.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { sweepAfterRead, updateMayLand } from '../runDecisions'
import { useAnalysisRun, type AnalysisRunDeps } from '../useAnalysisRun'
import { useHistoryLookups } from '../useHistoryLookups'
import { useSets } from '../useSets'
import { DEFAULTS } from '../../lib/storage/prefs'
import type { View } from '../../App'
import type { Session } from '../../lib/storage/db'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, e: 'utf8') => string }

heading('Reading a clip, apart from the screen')

check('a waiting update lands only on an idle home screen', () => {
  const kinds: View['kind'][] = ['home', 'analyzing', 'report', 'glance', 'session', 'progress', 'error', 'saved']
  for (const view of kinds) {
    for (const holdsVideo of [false, true]) {
      for (const sweeping of [false, true]) {
        const lands = updateMayLand({ view, holdsVideo, sweeping })
        assert(lands === (view === 'home' && !holdsVideo && !sweeping), `${view}, video ${holdsVideo}, sweep ${sweeping}: ${lands}`)
      }
    }
  }
})

check('a basket is swept after its first serve only when there is one to sweep', () => {
  const base = { glance: false, serves: 6, refused: false, clipOpen: true }
  assert(sweepAfterRead(base), 'a believed basket with its clip open was not swept')
  assert(!sweepAfterRead({ ...base, serves: 1 }), 'a single serve was swept')
  assert(!sweepAfterRead({ ...base, refused: true }), 'a refused read was swept six more times')
  assert(!sweepAfterRead({ ...base, clipOpen: false }), 'a clip no longer open was swept')
  assert(!sweepAfterRead({ ...base, glance: true }), 'a basket recorded on court was swept there')
})

/** Mount a hook in a component and hand back what it returned. */
function mounted<T>(hook: () => T): T {
  let out: T | undefined
  const Probe = () => {
    out = hook()
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return out as T
}

const noop = () => {}
const deps = (view: View): AnalysisRunDeps => ({
  view,
  setView: noop,
  prefs: { ...DEFAULTS },
  sessions: [],
  refreshSessions: noop,
  trySave: async () => {},
  setPair: noop,
  recheckOffline: noop,
  historyRef: { current: { sessions: [] } },
  setKeepFailedFor: noop,
  setInterrupted: noop,
})

check('the reading mounts on its own, with nothing running', () => {
  const home = mounted(() => useAnalysisRun(deps({ kind: 'home' })))
  for (const k of ['run', 'openClip', 'compareServes', 'cancel', 'stopSweep', 'startSession', 'stopSession', 'releaseVideo'] as const) {
    assert(typeof home[k] === 'function', `${k} is not handed back`)
  }
  assert(home.progress.step === 'engine' && home.sweep === undefined, 'a fresh mount showed work in flight')
  assert(home.sessionRunning === false && home.urlRef.current === undefined, 'a fresh mount held a clip or a session')
  const reading = mounted(() =>
    useAnalysisRun(
      deps({ kind: 'session', session: { id: 's' } as never, stage: { state: 'running' } as never, canRead: true }),
    ),
  )
  assert(reading.sessionRunning === true, 'a running session was not seen as one')
})

check('the history lookups and the sets read what they are given', () => {
  const at = (createdAt: number, serveType: 'flat' | 'kick') => ({ id: `s${createdAt}`, createdAt, serveType }) as unknown as Session
  const sessions = [at(1, 'flat'), at(2, 'kick'), at(3, 'flat'), at(5, 'flat')]
  const lookups = mounted(() => useHistoryLookups({ sessions, tripLedger: [] }))
  assert(lookups.priorTo(4, 'flat')?.createdAt === 3, 'the serve before was not the latest earlier one of its type')
  assert(lookups.priorTo(1, 'flat') === undefined, 'a first serve found one before it')
  const sets = mounted(() => useSets({ prefs: { ...DEFAULTS }, setPrefs: noop, sessions, serveTags: [] }))
  assert(sets.glanceSet({ createdAt: 9 } as never) === undefined, 'a glance with no set running said one was')
})

check('the screen is under its size, with the work in its own file', () => {
  const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n').length
  note(`App.tsx is ${lines} lines`)
  assert(lines < 1200, `App.tsx is ${lines} lines`)
})

report()
