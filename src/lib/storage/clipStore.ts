/**
 * The player's own videos, kept on this device if they ask (D6.4).
 *
 * OFF UNTIL THEY TURN IT ON, AND THE GATE IS HERE. Every report says its clip
 * never left the phone; keeping it is a second promise, so the store itself
 * refuses to write unless the caller says the player opted in — no call site
 * can keep a clip by forgetting to check.
 *
 * ON THIS DEVICE ONLY: the origin-private file system, which no other site,
 * no other app and no backup file can read. One file per clip, named by the
 * clip part of its reports' ids (`clipIdOf`), so the serves of a basket share
 * the one video they came from.
 *
 * FIRST TO GO UNDER PRESSURE. A video is tens of megabytes against a report's
 * tens of kilobytes, so it sits above the stills on the store's ladder
 * (`saveSession`): when the disk pushes back, every kept clip goes before a
 * single still or report does. Day to day it is bounded twice — `MAX_KEPT_CLIPS`
 * of them, in at most `CLIP_SHARE_OF_QUOTA` of the space the browser offers —
 * and the oldest go first. A clip whose last report is deleted goes with it.
 */

/** The most videos kept at once; the oldest goes when a new one arrives. */
export const MAX_KEPT_CLIPS = 12

/** The share of the browser's offer for this site that kept videos may use. */
export const CLIP_SHARE_OF_QUOTA = 0.5

const DIR = 'clips'

export interface KeptClip {
  id: string
  size: number
  /** When it was kept, milliseconds. */
  at: number
}

/**
 * Which kept clips make way for a new one, and whether it fits at all.
 *
 * Pure, so every tier of it is tested without a browser. `kept` is oldest
 * first. `estimate` is `navigator.storage.estimate()`'s answer, or nothing when
 * the browser will not say — then only the count bounds it.
 */
export function planClipRoom(
  kept: readonly KeptClip[],
  incoming: number,
  estimate?: { usage: number; quota: number },
): { evict: string[]; fits: boolean } {
  const evict: string[] = []
  let count = kept.length
  let clipBytes = kept.reduce((sum, c) => sum + c.size, 0)
  const budget = estimate ? estimate.quota * CLIP_SHARE_OF_QUOTA : Infinity
  // Everything else the site holds stays where it is; only clips make way.
  const others = estimate ? Math.max(0, estimate.usage - clipBytes) : 0
  const free = () => (estimate ? estimate.quota - others - clipBytes : Infinity)
  for (const clip of kept) {
    const roomy = count < MAX_KEPT_CLIPS && clipBytes + incoming <= budget && incoming <= free()
    if (roomy) break
    evict.push(clip.id)
    count--
    clipBytes -= clip.size
  }
  const fits = count < MAX_KEPT_CLIPS && clipBytes + incoming <= budget && incoming <= free()
  return { evict: fits ? evict : [], fits }
}

/** The directory the clips live in, or nothing where the browser has none. */
export type ClipRoot = () => Promise<FileSystemDirectoryHandle | undefined>

const deviceRoot: ClipRoot = async () => {
  try {
    if (!navigator.storage?.getDirectory) return undefined
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(DIR, { create: true })
  } catch {
    return undefined
  }
}

/**
 * Whether this browser can keep a clip at all: a private file system, and a
 * way to write a file into it from the page (L6.7). Safari has the first
 * without the second — `createWritable` exists there only in a worker — so
 * the setting was offered, turned on, and every keep failed in silence.
 */
export const clipStoreAvailable = (
  env: { navigator?: { storage?: { getDirectory?: unknown } }; FileSystemFileHandle?: unknown } = globalThis as never,
): boolean => {
  const handle = env.FileSystemFileHandle as (((...a: never[]) => unknown) & { prototype?: object }) | undefined
  return (
    typeof env.navigator?.storage?.getDirectory === 'function' &&
    typeof handle === 'function' &&
    typeof handle.prototype === 'object' &&
    'createWritable' in handle.prototype
  )
}

/** Every kept clip, oldest first. */
export async function keptClips(root: ClipRoot = deviceRoot): Promise<KeptClip[]> {
  const dir = await root()
  if (!dir) return []
  const out: KeptClip[] = []
  for await (const handle of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (handle.kind !== 'file') continue
    const file = await (handle as FileSystemFileHandle).getFile()
    out.push({ id: handle.name, size: file.size, at: file.lastModified })
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * Keep one clip, if the player said so and there is room for it.
 *
 * Returns whether it was kept. Never throws: a clip that could not be kept is
 * a report without a video, which is every report before this existed.
 */
export async function keepClip(
  clipId: string,
  file: Blob,
  opts: { optedIn: boolean; estimate?: { usage: number; quota: number } },
  root: ClipRoot = deviceRoot,
): Promise<boolean> {
  if (!opts.optedIn) return false
  try {
    const dir = await root()
    if (!dir) return false
    const kept = (await keptClips(async () => dir)).filter((c) => c.id !== clipId)
    const estimate = opts.estimate ?? (await navigator.storage?.estimate?.().catch(() => undefined))
    const plan = planClipRoom(
      kept,
      file.size,
      estimate && estimate.quota ? { usage: estimate.usage ?? 0, quota: estimate.quota } : undefined,
    )
    if (!plan.fits) return false
    for (const id of plan.evict) await dir.removeEntry(id).catch(() => undefined)
    const handle = await dir.getFileHandle(clipId, { create: true })
    // A handle that cannot be written leaves the empty file it was just
    // created as (L6.7): that would be a 0-byte "kept clip" a reopened report
    // tries to play. Removed, and the keep reported as failed.
    if (typeof handle.createWritable !== 'function') {
      await dir.removeEntry(clipId).catch(() => undefined)
      return false
    }
    try {
      const writable = await handle.createWritable()
      await writable.write(file)
      await writable.close()
    } catch {
      await dir.removeEntry(clipId).catch(() => undefined)
      return false
    }
    return true
  } catch {
    return false
  }
}

/** A kept clip, or nothing. */
export async function clipFor(clipId: string, root: ClipRoot = deviceRoot): Promise<File | undefined> {
  try {
    const dir = await root()
    if (!dir) return undefined
    const handle = await dir.getFileHandle(clipId)
    return await handle.getFile()
  } catch {
    return undefined
  }
}

/** Forget one clip; nothing if it was never kept. */
export async function forgetClip(clipId: string, root: ClipRoot = deviceRoot): Promise<void> {
  try {
    const dir = await root()
    await dir?.removeEntry(clipId)
  } catch {
    // Already gone, or never there.
  }
}

/**
 * Forget every clip none of these reports came from: a report deleted by hand
 * or by the store's own bound takes its video with it.
 */
export async function forgetClipsExcept(clipIds: Iterable<string>, root: ClipRoot = deviceRoot): Promise<number> {
  const keep = new Set(clipIds)
  let gone = 0
  for (const clip of await keptClips(root)) {
    if (keep.has(clip.id)) continue
    await forgetClip(clip.id, root)
    gone++
  }
  return gone
}

/** Forget every kept clip — the first rung when the disk pushes back. */
export async function forgetAllClips(root: ClipRoot = deviceRoot): Promise<number> {
  return forgetClipsExcept([], root)
}
