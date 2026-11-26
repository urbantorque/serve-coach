/**
 * What the device and its connection are, asked on the first screen.
 *
 * Out of `storage/backup.ts` and `engineDownload.ts` (Mirror M0.4): the entry
 * asked these three small questions and carried the whole backup and the
 * engine downloader to do it. Both still re-export them.
 */

/**
 * Is this running as an installed app?
 *
 * On iOS this is the only thing that exempts a site from the seven-day storage
 * clearance, which makes it the single most effective thing a player can do to
 * keep their history — and worth asking them to do, once.
 */
export function isInstalled(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // Safari's own, pre-standard flag. Still the only signal on iOS.
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

export const isIOS = (): boolean => {
  try {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // iPadOS reports itself as a Mac; the touch points give it away.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
  } catch {
    return false
  }
}

/**
 * Whether the player is on a connection a 57 MB download costs money on: Save
 * Data turned on, or the browser saying the connection is cellular. Chrome on
 * Android reports both; Safari reports neither, and nothing is said there.
 */
export function meteredConnection(nav: {
  connection?: { saveData?: boolean; type?: string }
}): 'saveData' | 'cellular' | undefined {
  const c = nav.connection
  if (!c) return undefined
  if (c.saveData) return 'saveData'
  if (c.type === 'cellular') return 'cellular'
  return undefined
}
