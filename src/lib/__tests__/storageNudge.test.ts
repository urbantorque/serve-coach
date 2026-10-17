/**
 * iOS storage safety (L6.5): Safari to the Home Screen by way of a backup, a
 * restore offered to an empty install, and a backup asked for after a long
 * run without one — with the phone and the install stubbed, since the suite
 * is neither.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { BACKUP_EVERY, MOVE_QUIET_MS, NUDGE_COPY, storageNudge, type StorageNudge } from '../storage/nudge'
import Home from '../../screens/Home'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const DAY = 86_400_000
const NOW = 100 * DAY
const filed = (n: number, from = NOW - n * DAY) => Array.from({ length: n }, (_, i) => from + i * DAY)

heading('iOS storage safety')

check('Safari on iOS, after the first save, is told the way across', () => {
  const at = (o: Partial<Parameters<typeof storageNudge>[0]>) =>
    storageNudge({ ios: true, installed: false, loaded: true, filed: filed(1), now: NOW, ...o })
  assert(at({}) === 'move', 'the first save in Safari said nothing')
  assert(at({ filed: [] }) === undefined, 'asked to move a history that does not exist yet')
  assert(at({ loaded: false }) === undefined, 'spoke before the history had loaded')
  assert(at({ quietedAt: NOW - DAY }) === undefined, '"Not now" did not quiet it')
  assert(at({ quietedAt: NOW - MOVE_QUIET_MS }) === 'move', 'quieted for good rather than for a few days')
  assert(at({ installed: true }) === undefined, 'an installed app was told to install')
})

check('an installed app with no history offers a restore', () => {
  for (const ios of [true, false]) {
    assert(storageNudge({ ios, installed: true, loaded: true, filed: [], now: NOW }) === 'restore', `no restore offered (iOS ${ios})`)
    assert(storageNudge({ ios, installed: true, loaded: true, filed: filed(3), now: NOW }) === undefined, 'a restore offered over a history')
  }
})

check('a backup is asked for after a long run of serves without one', () => {
  const at = (n: number, lastExportedAt?: number) =>
    storageNudge({ ios: false, installed: false, loaded: true, filed: filed(n), lastExportedAt, now: NOW })
  assert(at(BACKUP_EVERY - 1) === undefined, 'asked too early')
  assert(at(BACKUP_EVERY) === 'remind', `${BACKUP_EVERY} serves with no backup said nothing`)
  // Exported part way: only what was filed since counts.
  const half = NOW - 10 * DAY
  assert(at(BACKUP_EVERY + 5, half) === undefined, 'serves already backed up were counted again')
  assert(
    storageNudge({ ios: false, installed: true, loaded: true, filed: filed(BACKUP_EVERY + 1), lastExportedAt: 0, now: NOW }) === 'remind',
    'an installed app was never reminded',
  )
  note(`reminded at ${BACKUP_EVERY} serves since the last export`)
})

check('the home screen says each one, with the action that answers it', () => {
  const noop = () => {}
  const home = (nudge?: StorageNudge) =>
    renderToStaticMarkup(
      createElement(Home, {
        sessions: [],
        offlineReady: true,
        sessionsLoaded: true,
        onPick: noop,
        onOpen: noop,
        onShowGuide: noop,
        onShowHistory: noop,
        onShowSettings: noop,
        onShowProgress: noop,
        onGuideThen: noop,
        onShowExample: noop,
        needsHandedness: false,
        onMakeOffline: noop,
        nudge,
        onExportBackup: noop,
        onQuietMove: noop,
      }),
    )
  const move = home('move')
  assert(move.includes(NUDGE_COPY.move) && move.includes('Export now') && move.includes('Not now'), 'the move lost its words or its buttons')
  const restore = home('restore')
  assert(restore.includes('Restore a backup') && !restore.includes('Export now'), 'the restore offered an export')
  const remind = home('remind')
  assert(remind.includes('Export now') && !remind.includes('Not now'), 'the reminder can be waved away without a backup')
  assert(!home().includes('home-nudge'), 'a nudge shown with nothing to say')
})

report()
