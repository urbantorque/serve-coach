/**
 * Kept videos (D6.4): nothing is written without the player's say-so, and at
 * every tier of the storage ladder the oldest clip makes way first — or the new
 * one is not kept at all, rather than the store being emptied to fit it.
 */
import {
  CLIP_SHARE_OF_QUOTA,
  MAX_KEPT_CLIPS,
  clipFor,
  forgetAllClips,
  forgetClipsExcept,
  keepClip,
  keptClips,
  planClipRoom,
  type ClipRoot,
  type KeptClip,
} from '../clipStore'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

const MB = 1024 * 1024

/** An origin-private directory held in memory: names, sizes and the time each was written. */
function memoryRoot() {
  const files = new Map<string, { size: number; at: number }>()
  let clock = 1
  const dir = {
    kind: 'directory',
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!files.has(name) && !opts?.create) throw new DOMException('missing', 'NotFoundError')
      return {
        kind: 'file',
        name,
        async getFile() {
          const f = files.get(name)!
          return { size: f.size, lastModified: f.at, name } as unknown as File
        },
        async createWritable() {
          let size = 0
          return {
            async write(blob: Blob) {
              size = blob.size
            },
            async close() {
              files.set(name, { size, at: clock++ })
            },
          }
        },
      }
    },
    async removeEntry(name: string) {
      if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError')
    },
    async *values() {
      for (const name of [...files.keys()]) yield await dir.getFileHandle(name)
    },
  }
  const root: ClipRoot = async () => dir as unknown as FileSystemDirectoryHandle
  return { root, files }
}

const clip = (bytes: number) => new Blob([new Uint8Array(bytes)])
const clips = (n: number, size = 30 * MB): KeptClip[] => Array.from({ length: n }, (_, i) => ({ id: `serve-${i}`, size, at: i }))

heading('Kept videos')

await check('nothing is written unless the player opted in', async () => {
  const { root, files } = memoryRoot()
  assert((await keepClip('serve-a', clip(MB), { optedIn: false }, root)) === false, 'kept without the opt-in')
  assert(files.size === 0, 'a file was written without the opt-in')
  assert((await keepClip('serve-a', clip(MB), { optedIn: true, estimate: { usage: 0, quota: 1e10 } }, root)) === true, 'not kept with it')
  assert(files.size === 1 && (await clipFor('serve-a', root))?.size === MB, 'the kept clip did not read back')
})

check('with room to spare nothing makes way', () => {
  const plan = planClipRoom(clips(3), 30 * MB, { usage: 200 * MB, quota: 2000 * MB })
  assert(plan.fits && plan.evict.length === 0, `evicted ${plan.evict.join(', ')} with room to spare`)
})

check('at the count limit the oldest clip makes way, and only it', () => {
  const plan = planClipRoom(clips(MAX_KEPT_CLIPS), 30 * MB, { usage: 0, quota: 1e12 })
  assert(plan.fits && plan.evict.join() === 'serve-0', `made way with ${plan.evict.join(', ')}`)
})

check('past the share of the space videos may use, the oldest go until it fits', () => {
  // A 1 GB offer: videos may use 512 MB; five at 100 MB hold 500 of it.
  const plan = planClipRoom(clips(5, 100 * MB), 100 * MB, { usage: 520 * MB, quota: 1024 * MB })
  assert(plan.fits && plan.evict.join() === 'serve-0', `made way with ${plan.evict.join(', ')}`)
  assert(CLIP_SHARE_OF_QUOTA === 0.5, 'the share moved; re-read the arithmetic above')
})

check('when the rest of the site leaves no room, clips make way before the clip is refused', () => {
  // 900 MB of reports and other data in a 1 GB offer: only 124 MB left at all.
  const plan = planClipRoom(clips(2, 60 * MB), 100 * MB, { usage: 1020 * MB, quota: 1024 * MB })
  assert(plan.fits && plan.evict.join() === 'serve-0,serve-1', `made way with ${plan.evict.join(', ')}`)
})

check('a clip that could never fit is refused, and nothing is emptied for it', () => {
  const plan = planClipRoom(clips(4), 700 * MB, { usage: 120 * MB, quota: 1024 * MB })
  assert(!plan.fits && plan.evict.length === 0, `refused with ${plan.evict.length} evicted`)
})

check('with no estimate from the browser, only the count bounds it', () => {
  assert(planClipRoom(clips(3), 500 * MB).fits, 'refused with no estimate and room in the count')
  assert(planClipRoom(clips(MAX_KEPT_CLIPS), MB).evict.join() === 'serve-0', 'the count was not enforced without an estimate')
})

await check('keeping evicts on the device as planned, oldest first', async () => {
  const { root, files } = memoryRoot()
  const quota = { usage: 0, quota: 1e12 }
  for (let i = 0; i < MAX_KEPT_CLIPS + 2; i++) await keepClip(`serve-${i}`, clip(MB), { optedIn: true, estimate: quota }, root)
  const kept = (await keptClips(root)).map((c) => c.id)
  assert(files.size === MAX_KEPT_CLIPS, `${files.size} clips kept`)
  assert(!kept.includes('serve-0') && !kept.includes('serve-1') && kept.includes(`serve-${MAX_KEPT_CLIPS + 1}`), `kept ${kept.join(', ')}`)
})

await check('a clip goes with its last report, and every clip goes first under pressure', async () => {
  const { root, files } = memoryRoot()
  for (const id of ['serve-a', 'serve-b', 'serve-c']) await keepClip(id, clip(MB), { optedIn: true, estimate: { usage: 0, quota: 1e12 } }, root)
  assert((await forgetClipsExcept(['serve-a', 'serve-c'], root)) === 1 && !files.has('serve-b'), 'an orphaned clip was kept')
  assert((await forgetAllClips(root)) === 2 && files.size === 0, 'clips survived the first rung')
})

report()
