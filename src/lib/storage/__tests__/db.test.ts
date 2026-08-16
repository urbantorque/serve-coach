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
  normalise,
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

/* ------------------------------------------------ what a stored row may hold */

heading('A stored basket, reshaped so nothing downstream throws on it')

/**
 * A stored report carrying a comparison block, with one part of it replaced.
 *
 * `usableConsistency` is not exported — it is `normalise`'s private repair —
 * so the block is driven the way a real read drives it: through the whole row.
 */
const storedBasket = (consistency: unknown): unknown => ({
  id: 'serve-abc-0',
  createdAt: 1,
  overall: 70,
  overallStatus: 'good',
  fundamentals: [{ id: 'toss', metrics: [{ id: 'tossPeakHeight', score: 70 }] }],
  consistency,
})

/** Everything a comparison block carries when this app wrote it. */
const wholeConsistency = () => ({
  serves: 2,
  score: 70,
  overallScores: [60, 80],
  serveNumbers: [4, 6],
  metrics: [
    { id: 'tossPeakHeight', label: 'Toss height', score: 70, values: [1, 2], ideal: [0, 1], range: [0, 2] },
  ],
  gap: {
    best: 6,
    worst: 4,
    bestScore: 80,
    worstScore: 60,
    differences: [{ id: 'tossPeakHeight', label: 'Toss height', bestValue: 1, worstValue: 2 }],
  },
})

check('a whole comparison block survives the read unchanged', () => {
  const s = normalise(storedBasket(wholeConsistency()))
  assert(s?.consistency !== undefined, 'a complete comparison block was dropped')
  assert(
    JSON.stringify(s!.consistency!.serveNumbers) === '[4,6]',
    `the serve numbers were not carried through: ${JSON.stringify(s!.consistency!.serveNumbers)}`,
  )
  assert(s!.consistency!.gap?.best === 6, 'the gap was dropped from a complete block')
})

check('a block with no serve numbers reads back with an empty list, not a missing one', () => {
  // The crash this pins: `ConsistencyPanel` and `renderBasketCard` both index
  // `serveNumbers[i]` and then fall back per element, so an absent array is a
  // TypeError on the first chip — a blank report behind the ErrorBoundary.
  const { serveNumbers: _drop, ...rest } = wholeConsistency()
  void _drop
  const s = normalise(storedBasket(rest))
  assert(s?.consistency !== undefined, 'a block missing only its serve numbers was dropped whole')
  assert(
    Array.isArray(s!.consistency!.serveNumbers),
    'serveNumbers came back as something a panel cannot index',
  )
  assert(
    s!.consistency!.serveNumbers.length === 0,
    'a missing list was invented rather than left to the readers own fallback',
  )
})

check('serve numbers that are not numbers are dropped rather than printed', () => {
  const s = normalise(storedBasket({ ...wholeConsistency(), serveNumbers: ['4', null] }))
  assert(s!.consistency!.serveNumbers.length === 0, 'non-numeric serve numbers survived the read')
})

check('half a gap is dropped, because half a gap is a crash', () => {
  const { differences: _d, ...half } = wholeConsistency().gap
  void _d
  const s = normalise(storedBasket({ ...wholeConsistency(), gap: half }))
  assert(s?.consistency !== undefined, 'the whole comparison went with an unusable gap')
  assert(s!.consistency!.gap === undefined, 'a gap with no differences on it survived the read')
})

check('a gap missing one of its four numbers is dropped', () => {
  const gap = { ...wholeConsistency().gap, worstScore: undefined }
  const s = normalise(storedBasket({ ...wholeConsistency(), gap }))
  assert(s!.consistency!.gap === undefined, 'a gap with no worst score survived the read')
})

check('a null inside the differences is dropped, and the rest of the gap kept', () => {
  const gap = { ...wholeConsistency().gap }
  gap.differences = [null as never, ...gap.differences]
  const s = normalise(storedBasket({ ...wholeConsistency(), gap }))
  assert(s!.consistency!.gap !== undefined, 'one bad row took the whole gap with it')
  assert(
    s!.consistency!.gap!.differences.length === 1,
    `expected the one usable difference, got ${s!.consistency!.gap!.differences.length}`,
  )
})

check('a spread row with no readable label is dropped', () => {
  // The panel names `weakest` in a sentence and lowercases it, so a row with
  // nothing to be called is a crash rather than a blank.
  const c = wholeConsistency()
  const s = normalise(
    storedBasket({ ...c, metrics: [{ ...c.metrics[0], label: 42 }] }),
  )
  assert(s?.consistency === undefined, 'a row with a number for a label survived the read')
})

check('a report with no comparison at all still reads', () => {
  const s = normalise(storedBasket(undefined))
  assert(s !== undefined, 'an ordinary single-serve report was dropped')
  assert(s!.consistency === undefined, 'a comparison was invented for a report that had none')
})

report()
