/**
 * The one thing to say about where the history lives, if anything (L6.5).
 *
 * iOS clears a site's storage after a week away unless it was added to the
 * Home Screen, and an app added there has storage of its own, apart from
 * Safari's: so a player who installs after filming in Safari opens an empty
 * app. The way across is a backup file.
 *
 * A BACKUP IS NOT A CHORE ANY MORE. This used to ask for a file every twenty
 * serves, on every device, however safe the history was. Now the app keeps its
 * own safety copy (`protect.ts`), so while that copy is keeping up, only a real
 * risk earns a line: iOS not installed, or a browser that has refused to keep
 * anything and no file in a long while. Where no copy is being made, or it has
 * stopped keeping up, a file is the only protection there is and the old
 * reminder stands.
 *
 * Pure: whether this is iOS and whether it is installed come in as answers,
 * so the tests can be any phone.
 */

/** Serves filed since the last backup before the home screen asks for one, with no safety copy behind them. */
export const BACKUP_EVERY = 20

/** How long "Not now" quiets the move from Safari. */
export const MOVE_QUIET_MS = 3 * 86_400_000

/** Serves between safety copies (`protect.ts`). */
export const SNAPSHOT_EVERY = 5

/** How long with no file is a long while, on a browser that will not promise to keep anything. */
export const FILE_STALE_MS = 60 * 86_400_000

/** A copy this many serves behind has stopped being made, whatever the reason. */
const SNAPSHOT_BEHIND = SNAPSHOT_EVERY * 2

export type StorageNudge = 'move' | 'restore' | 'remind'

export function storageNudge(o: {
  ios: boolean
  installed: boolean
  loaded: boolean
  /** When each stored serve was filed. */
  filed: readonly number[]
  lastExportedAt?: number
  quietedAt?: number
  now: number
  /** When the newest safety copy was made. Absent: there is none, or it has not been asked. */
  snapshotAt?: number
  /** The browser's own answer to whether it will keep this data, when it has been asked. */
  persisted?: boolean
}): StorageNudge | undefined {
  if (!o.loaded) return undefined
  if (o.installed && o.filed.length === 0) return 'restore'
  if (o.ios && !o.installed && o.filed.length > 0) {
    return o.quietedAt !== undefined && o.now - o.quietedAt < MOVE_QUIET_MS ? undefined : 'move'
  }
  const since = o.filed.filter((t) => t > (o.lastExportedAt ?? 0)).length
  const snapshotAt = o.snapshotAt
  const keepingUp = snapshotAt !== undefined && o.filed.filter((t) => t > snapshotAt).length < SNAPSHOT_BEHIND
  if (!keepingUp) return since >= BACKUP_EVERY ? 'remind' : undefined
  // Only the refusal is a risk a safety copy cannot cover: everything on this
  // site can go at once, and nothing has left it in a long while.
  if (o.persisted !== false || since === 0) return undefined
  const lastFile = o.lastExportedAt ?? Math.min(...o.filed)
  return o.now - lastFile >= FILE_STALE_MS ? 'remind' : undefined
}

/** What the home screen says for each. */
export const NUDGE_COPY: Record<StorageNudge, string> = {
  move: 'Safari deletes your serves after a week without a visit. Export them, add Serve Coach to your Home Screen, then restore them there.',
  restore: 'Moving over from Safari? Restore the backup you exported there.',
  remind: 'You haven’t saved a backup file in a while. If your browser clears your serves, only that file brings them back.',
}
