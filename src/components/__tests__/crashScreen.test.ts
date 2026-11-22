/**
 * A crash screen that backs up first (L6.8): the backup is offered before the
 * way out deletes anything, deleting asks once more, and the backup it takes
 * from the raw stores restores through the ordinary import.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { CrashScreen } from '../ErrorBoundary'
import { backupFromStores } from '../../lib/storage/rawBackup'
import { type BackupStore } from '../../lib/storage/backup'
import { importBackup } from '../../lib/storage/restore'
import { DEFAULTS, type Prefs } from '../../lib/storage/prefs'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import type { Session } from '../../lib/storage/db'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

const noop = () => {}
const screen = (o: Partial<Parameters<typeof CrashScreen>[0]>) =>
  renderToStaticMarkup(
    createElement(CrashScreen, {
      message: 'Cannot read properties of undefined',
      backup: 'idle',
      confirming: false,
      clearing: false,
      onReload: noop,
      onBackup: noop,
      onClear: noop,
      onConfirmClear: noop,
      onKeep: noop,
      ...o,
    }),
  )

heading('A crash screen that backs up first')

check('the backup is offered, and clearing does not delete on the first tap', () => {
  const idle = screen({})
  assert(idle.includes('Save a backup first'), 'no backup offered before the way out')
  assert(idle.includes('Clear saved reports and reload') && !idle.includes('Delete them'), 'clearing was one tap from deleting')
  const asked = screen({ confirming: true })
  assert(asked.includes('Delete them and reload') && asked.includes('Keep them'), 'the confirmation lost a choice')
  assert(asked.includes('Save a backup first if you can'), 'the confirmation did not point back at the backup')
  const backedUp = screen({ confirming: true, backup: 'saved' })
  assert(backedUp.includes('Backup saved') && backedUp.includes('Your backup file can bring them back'), 'a saved backup was not acknowledged')
  assert(screen({ backup: 'failed' }).includes('The backup failed'), 'a failed backup went unsaid')
})

await check('the backup taken from the raw stores restores through the ordinary import', async () => {
  const one = { ...sampleAnalysis(), id: 'serve-rescued', createdAt: 1_700_000_000_000 }
  const { frames: _f, ...stored } = one
  void _f
  const file = backupFromStores(
    {
      sessions: [stored, { id: 'serve-broken', nonsense: true }],
      serveTags: [{ id: 'serve-rescued', serveNumber: 2, taggedAt: 1 }],
      somethingElse: [{ id: 'x' }],
    },
    1_700_000_000_500,
    { handedness: 'left', tier: 4, seenFilmingGuide: true },
  )
  assert(!('somethingElse' in file), 'an unknown store was carried into the file')
  assert((file.prefs as Record<string, unknown>).handedness === 'left' && !('seenFilmingGuide' in (file.prefs as object)), 'the wrong preferences travelled')

  const saved = new Map<string, Session>()
  let prefs: Prefs = { ...DEFAULTS }
  const store: BackupStore = {
    listSessions: async () => [...saved.values()],
    saveSession: async (a) => void saved.set(a.id, a as unknown as Session),
    listPracticeLogs: async () => [],
    logPractice: async () => {},
    listServeTags: async () => [],
    tagServe: async () => {},
    pruneSessions: async () => {},
    readPrefs: () => ({ ...prefs }),
    writePrefs: (patch) => (prefs = { ...prefs, ...patch }),
  }
  const result = await importBackup(JSON.stringify(file), store)
  assert(saved.has('serve-rescued'), 'the readable report did not come back')
  assert(!saved.has('serve-broken'), 'the unreadable record that crashed the app came back with it')
  assert(result.added === 1 && prefs.handedness === 'left', `restored ${result.added}, hand ${prefs.handedness}`)
})

report()
