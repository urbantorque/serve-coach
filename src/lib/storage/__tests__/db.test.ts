/**
 * The quota-pressure ladder, driven rather than trusted.
 *
 * `prune`'s own I/O needs a live IndexedDB, which this suite does not have —
 * see the header of `scripts/run-tests.mjs`. `planPrune` is the ladder's
 * arithmetic with the I/O taken out, so it can be handed a fabricated run of
 * keys and checked exactly the way `prune` would use it: oldest first, in.
 */
import {
  KEEP_ALL_UNDER_PRESSURE,
  KEEP_STILLS,
  KEEP_STILLS_UNDER_PRESSURE,
  MAX_SESSIONS,
  planPrune,
} from '../db'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

/** `n` fabricated keys, oldest first — all `planPrune` reads is the order. */
const keys = (n: number) => Array.from({ length: n }, (_, i) => `k${i}`)

/** Every key accounted for exactly once: deleted, stripped, or left untouched. */
function assertPartition(total: number, toDelete: unknown[], toStrip: unknown[], what: string) {
  assert(
    toDelete.length + toStrip.length <= total,
    `${what}: ${toDelete.length} deleted + ${toStrip.length} stripped exceeds ${total} rows`,
  )
  const seen = new Set([...toDelete, ...toStrip])
  assert(
    seen.size === toDelete.length + toStrip.length,
    `${what}: a key was named in both toDelete and toStrip`,
  )
}

heading('The constants the ladder is built from')
note(`routine: keep ${KEEP_STILLS} with stills, ${MAX_SESSIONS} at all`)
note(`under pressure: keep ${KEEP_STILLS_UNDER_PRESSURE} with stills, ${KEEP_ALL_UNDER_PRESSURE} at all`)

check('under pressure keeps fewer of both kinds than routine does', () => {
  // The ladder only makes sense if pressure tightens it. Read off the constants
  // themselves, so a change to either turns this red rather than the ladder
  // quietly inverting.
  assert(KEEP_STILLS_UNDER_PRESSURE < KEEP_STILLS, 'pressure did not tighten the stills limit')
  assert(KEEP_ALL_UNDER_PRESSURE < MAX_SESSIONS, 'pressure did not tighten the session limit')
})

heading('Routine pruning — after every save')

check('a history well under both limits is untouched', () => {
  const { toDelete, toStrip } = planPrune(keys(10), 'routine')
  assert(toDelete.length === 0, `deleted ${toDelete.length} of 10`)
  assert(toStrip.length === 0, `stripped ${toStrip.length} of 10`)
})

check('exactly at the stills limit strips nothing', () => {
  const { toStrip } = planPrune(keys(KEEP_STILLS), 'routine')
  assert(toStrip.length === 0, `stripped ${toStrip.length} at exactly the limit`)
})

check('one past the stills limit strips exactly the oldest one', () => {
  const all = keys(KEEP_STILLS + 1)
  const { toDelete, toStrip } = planPrune(all, 'routine')
  assert(toDelete.length === 0, 'routine pruning deleted a report under MAX_SESSIONS')
  assert(toStrip.length === 1 && toStrip[0] === all[0], `stripped ${JSON.stringify(toStrip)}`)
})

check('past MAX_SESSIONS the oldest are deleted, not just stripped', () => {
  const all = keys(MAX_SESSIONS + 5)
  const { toDelete, toStrip } = planPrune(all, 'routine')
  assert(toDelete.length === 5, `deleted ${toDelete.length}, expected 5`)
  assert(
    toDelete.every((k, i) => k === all[i]),
    'deleted something other than the oldest five',
  )
  assert(toStrip.length === MAX_SESSIONS - KEEP_STILLS, `stripped ${toStrip.length}`)
  assertPartition(all.length, toDelete, toStrip, 'past MAX_SESSIONS')
})

heading('Under real pressure — quota already refused a write')

check('stills-level pressure strips almost everything before it deletes anything', () => {
  // `keepAll` does not move at this level — see `planPrune` — only `keepStills`
  // does, which is the point: the cheap bytes go first, across the whole
  // history, before a single report is deleted.
  const all = keys(MAX_SESSIONS)
  const { toDelete, toStrip } = planPrune(all, 'stills')
  assert(toDelete.length === 0, `stills-level pressure deleted ${toDelete.length} reports`)
  assert(
    toStrip.length === MAX_SESSIONS - KEEP_STILLS_UNDER_PRESSURE,
    `stripped ${toStrip.length}, expected ${MAX_SESSIONS - KEEP_STILLS_UNDER_PRESSURE}`,
  )
})

check('hard-level pressure deletes down to KEEP_ALL_UNDER_PRESSURE', () => {
  const all = keys(MAX_SESSIONS)
  const { toDelete, toStrip } = planPrune(all, 'hard')
  assert(
    toDelete.length === MAX_SESSIONS - KEEP_ALL_UNDER_PRESSURE,
    `deleted ${toDelete.length}, expected ${MAX_SESSIONS - KEEP_ALL_UNDER_PRESSURE}`,
  )
  assert(
    toDelete.every((k, i) => k === all[i]),
    'hard pruning did not delete the oldest reports first',
  )
  assert(
    toStrip.length === KEEP_ALL_UNDER_PRESSURE - KEEP_STILLS_UNDER_PRESSURE,
    `stripped ${toStrip.length}`,
  )
  assertPartition(all.length, toDelete, toStrip, 'hard pressure')
})

check('a history already inside KEEP_ALL_UNDER_PRESSURE loses no reports even under hard pressure', () => {
  // The whole point of the retry order in `saveSession`: a phone whose disk was
  // filled by something else must not have a thin history destroyed to reclaim
  // bytes that were never the problem.
  const all = keys(KEEP_ALL_UNDER_PRESSURE - 2)
  const { toDelete } = planPrune(all, 'hard')
  assert(toDelete.length === 0, `deleted ${toDelete.length} from a history already under the floor`)
})

check('an empty store plans nothing at any level', () => {
  for (const level of ['routine', 'stills', 'hard'] as const) {
    const { toDelete, toStrip } = planPrune([], level)
    assert(toDelete.length === 0 && toStrip.length === 0, `${level} planned work against zero rows`)
  }
})

report()
