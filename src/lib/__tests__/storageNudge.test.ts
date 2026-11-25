/**
 * iOS storage safety (L6.5): Safari to the Home Screen by way of a backup, a
 * restore offered to an empty install, and a backup asked for only where nothing
 * else protects the history — with the phone and the install stubbed, since the
 * suite is neither.
 *
 * THE PROMISE CHANGED. This used to hold that twenty serves with no file always
 * earned the reminder, on every device. With the app keeping its own safety copy
 * (`protect.ts`) that reminder was a chore answering a risk already covered, so it
 * now fires only where no copy is keeping up. While one is, the only lines left
 * are the real risks a copy on the same site cannot cover: iOS not installed, and
 * a browser that refused to keep anything with no file in a long while.
 */
import { DEFAULTS } from '../storage/prefs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import {
  BACKUP_EVERY,
  FILE_STALE_MS,
  MOVE_QUIET_MS,
  NUDGE_COPY,
  SNAPSHOT_EVERY,
  storageNudge,
  type StorageNudge,
} from '../storage/nudge'
import { cueIssues } from '../analysis/voice'
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
  assert(at({ filed: [] }) === undefined, 'asked to move a history that doesn’t exist yet')
  assert(at({ loaded: false }) === undefined, 'spoke before the history had loaded')
  assert(at({ quietedAt: NOW - DAY }) === undefined, '"Not now" didn’t quiet it')
  assert(at({ quietedAt: NOW - MOVE_QUIET_MS }) === 'move', 'quieted for good rather than for a few days')
  assert(at({ installed: true }) === undefined, 'an installed app was told to install')
})

check('an installed app with no history offers a restore', () => {
  for (const ios of [true, false]) {
    assert(storageNudge({ ios, installed: true, loaded: true, filed: [], now: NOW }) === 'restore', `no restore offered (iOS ${ios})`)
    assert(storageNudge({ ios, installed: true, loaded: true, filed: filed(3), now: NOW }) === undefined, 'a restore offered over a history')
  }
})

check('with no safety copy, a file is the only protection and a long run still asks for one', () => {
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

check('with a safety copy keeping up, the routine reminder is gone', () => {
  const at = (n: number, o: { persisted?: boolean; lastExportedAt?: number } = {}) =>
    storageNudge({ ios: false, installed: true, loaded: true, filed: filed(n), snapshotAt: NOW, now: NOW, ...o })
  assert(at(BACKUP_EVERY) === undefined, 'twenty serves nagged with a copy kept')
  assert(at(500) === undefined, 'five hundred serves nagged with a copy kept')
  assert(at(500, { persisted: true }) === undefined, 'a device that keeps its data nagged')
})

check('a copy that has stopped keeping up is no copy, and the file is asked for again', () => {
  const old = NOW - 50 * DAY
  const at = (behind: number) =>
    storageNudge({
      ios: false,
      installed: true,
      loaded: true,
      // `behind` serves filed since the copy, and enough before it to reach the reminder's count.
      filed: [...filed(BACKUP_EVERY, old - BACKUP_EVERY * DAY), ...filed(behind, NOW - behind * DAY)],
      snapshotAt: old,
      now: NOW,
    })
  assert(at(SNAPSHOT_EVERY) === undefined, 'a copy one round behind counted as stopped')
  assert(at(SNAPSHOT_EVERY * 2) === 'remind', 'a copy two rounds behind still silenced the reminder')
})

check('a browser that refused to keep anything, with no file in a long while, is a real risk', () => {
  const at = (o: { lastExportedAt?: number; persisted?: boolean; filed?: number[] }) =>
    storageNudge({ ios: false, installed: false, loaded: true, filed: filed(3), snapshotAt: NOW, persisted: false, now: NOW, ...o })
  const recent = NOW - 1 * DAY
  assert(at({ lastExportedAt: recent - FILE_STALE_MS }) === 'remind', 'the refusal said nothing after months with no file')
  assert(at({ lastExportedAt: NOW - FILE_STALE_MS + DAY }) === undefined, 'asked for a file too soon')
  assert(at({ lastExportedAt: recent - FILE_STALE_MS, persisted: true }) === undefined, 'a granted browser was asked')
  assert(at({ lastExportedAt: recent - FILE_STALE_MS, persisted: undefined }) === undefined, 'an unanswered browser was called a refusal')
  // Never exported: the long while runs from the first serve.
  const season = [NOW - FILE_STALE_MS, NOW - DAY]
  assert(at({ filed: season }) === 'remind', 'a season with no file at all said nothing')
  assert(at({ filed: [NOW - DAY] }) === undefined, 'a new player was asked for a file')
  // Everything is already in a file.
  assert(at({ lastExportedAt: NOW, filed: [NOW - FILE_STALE_MS] }) === undefined, 'asked to export nothing new')
})

check('iOS not installed still earns its line, whatever the copy says', () => {
  const nudge = storageNudge({ ios: true, installed: false, loaded: true, filed: filed(3), snapshotAt: NOW, persisted: false, now: NOW })
  assert(nudge === 'move', 'a safety copy silenced the one risk it can’t cover')
})

check('every line is quiet and in the voice', () => {
  for (const line of Object.values(NUDGE_COPY)) {
    const issues = cueIssues(line)
    assert(issues.length === 0, `"${line}": ${issues.join('; ')}`)
  }
  assert(!/\d/.test(NUDGE_COPY.remind), 'the reminder still counts serves')
})

check('the home screen says each one, with the action that answers it', () => {
  const noop = () => {}
  const home = (nudge?: StorageNudge) =>
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
        nudge,
        onExportBackup: noop,
        onQuietMove: noop,
      }),
    )
  const move = home('move')
  assert(move.includes(NUDGE_COPY.move) && move.includes('Save a backup now') && move.includes('Not now'), 'the move lost its words or its buttons')
  const restore = home('restore')
  assert(restore.includes('Restore a backup') && !restore.includes('Export now'), 'the restore offered an export')
  const remind = home('remind')
  assert(remind.includes('Save a backup now') && !remind.includes('Not now'), 'the reminder can be waved away without a backup')
  assert(!home().includes('home-nudge'), 'a nudge shown with nothing to say')
})

report()
