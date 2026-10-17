/**
 * The one thing to say about where the history lives, if anything (L6.5).
 *
 * iOS clears a site's storage after a week away unless it was added to the
 * Home Screen, and an app added there has storage of its own, apart from
 * Safari's: so a player who installs after filming in Safari opens an empty
 * app. The way across is a backup file. And everywhere else a browser can
 * clear its storage too, so a long run of serves with no backup is worth one
 * line.
 *
 * Pure: whether this is iOS and whether it is installed come in as answers,
 * so the tests can be any phone.
 */

/** Serves filed since the last backup before the home screen asks for one. */
export const BACKUP_EVERY = 20

/** How long "Not now" quiets the move from Safari. */
export const MOVE_QUIET_MS = 3 * 86_400_000

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
}): StorageNudge | undefined {
  if (!o.loaded) return undefined
  if (o.installed && o.filed.length === 0) return 'restore'
  if (o.ios && !o.installed && o.filed.length > 0) {
    return o.quietedAt !== undefined && o.now - o.quietedAt < MOVE_QUIET_MS ? undefined : 'move'
  }
  const since = o.filed.filter((t) => t > (o.lastExportedAt ?? 0)).length
  return since >= BACKUP_EVERY ? 'remind' : undefined
}

/** What the home screen says for each. */
export const NUDGE_COPY: Record<StorageNudge, string> = {
  move: 'Safari clears this after a week away. Export your serves, add Serve Coach to your Home Screen, then restore them there.',
  restore: 'Moving over from Safari? Restore the backup you exported there.',
  remind: `${BACKUP_EVERY} or more serves since your last backup. Export them so a cleared browser cannot take them.`,
}
