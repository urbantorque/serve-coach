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
import { buildServe } from '../../analysis/syntheticServe'
import { detectServe } from '../../analysis/phases'
import { diagnose } from '../../analysis/diagnose'
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
    const { toDelete, toStrip, toDowngrade } = planPrune([], level)
    assert(
      toDelete.length === 0 && toStrip.length === 0 && toDowngrade.length === 0,
      `${level} planned work against zero rows`,
    )
  }
})

check('routine pruning never takes a stored swing off a report', () => {
  /*
   * The rung's whole shape. A track is 21 kB against 24–48 kB of photographs on
   * the same report and it is the thing that survives them — taking it off
   * everything past `KEEP_STILLS` would cost a player the replay on reports
   * nowhere near a quota problem, and hand them a second horizon to learn on top
   * of the one the pictures already have.
   */
  const { toStrip, toDowngrade } = planPrune(keys(MAX_SESSIONS), 'routine')
  assert(toStrip.length > 0, 'the fixture did not reach the stills limit, so this proves nothing')
  assert(toDowngrade.length === 0, `routine pruning downgraded ${toDowngrade.length} tracks`)
})

check('under pressure the swing goes with the pictures, on the same band', () => {
  /*
   * One limit rather than a third constant to keep in agreement with the other
   * two. Checked as identity with `toStrip` rather than by recomputing the
   * arithmetic, which would only restate `planPrune` back at itself.
   */
  for (const level of ['stills', 'hard'] as const) {
    const { toStrip, toDowngrade } = planPrune(keys(MAX_SESSIONS), level)
    assert(toDowngrade.length === toStrip.length, `${level}: ${toDowngrade.length} downgraded, ${toStrip.length} stripped`)
    assert(
      toDowngrade.every((k, i) => k === toStrip[i]),
      `${level} downgraded a different band from the one it stripped`,
    )
    assert(toDowngrade.length > 0, `${level} found nothing to downgrade at a full store`)
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

/* -------------------------------------------- the ungraded deltas, stored -- */

/** One delta as this app writes it: a change with the bound that licensed it. */
const wholeDelta = () => ({ id: 'external_rotation_deg', from: 1, to: 4, delta: 18, bound: 2 })

check('an ungraded delta survives the read with its bound attached', () => {
  const s = normalise(storedBasket({ ...wholeConsistency(), uncalibrated: [wholeDelta()] }))
  const d = s!.consistency!.uncalibrated?.[0]
  assert(!!d, 'a complete delta was dropped')
  assert(d!.bound === 2, `the bound came back as ${d!.bound}`)
})

check('a delta missing its bound is dropped, because the bound is the licence', () => {
  // There is no honest repair. A zero bound would licence every change ever
  // measured, which is the failure the whole `UNCALIBRATED` register exists for.
  const { bound: _b, ...noBound } = wholeDelta()
  void _b
  const s = normalise(storedBasket({ ...wholeConsistency(), uncalibrated: [noBound] }))
  assert(s?.consistency !== undefined, 'the whole comparison went with an unusable delta')
  assert(s!.consistency!.uncalibrated === undefined, 'a delta with no bound survived the read')
})

check('a delta that no longer clears its own bound is dropped', () => {
  // Reachable from a corrupted row or a build with a laxer rule, and the writer
  // is not the only place that rule may live — a reader that trusts the row is
  // one edited backup away from printing a change that is posture.
  const s = normalise(
    storedBasket({ ...wholeConsistency(), uncalibrated: [{ ...wholeDelta(), delta: 1 }] }),
  )
  assert(s!.consistency!.uncalibrated === undefined, 'a delta smaller than its bound survived')
})

check('a report written before the deltas existed reads back without the field', () => {
  const s = normalise(storedBasket(wholeConsistency()))
  assert(s?.consistency !== undefined, 'a pre-deltas comparison block was dropped')
  assert(
    s!.consistency!.uncalibrated === undefined,
    'an empty list was invented where the field was simply never written',
  )
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

heading('A landing stored by an older build')

/** A stored report carrying whatever diagnosis it is handed. */
const storedWithDiagnosis = (diagnosis: unknown): unknown => ({
  id: 'serve-abc-0',
  createdAt: 1,
  overall: 70,
  overallStatus: 'good',
  fundamentals: [{ id: 'toss', metrics: [{ id: 'tossPeakHeight', score: 70 }] }],
  diagnosis,
})

/** The same, carrying whatever triage it is handed. */
const storedWithTriage = (triage: unknown): unknown => ({
  id: 'serve-abc-0',
  createdAt: 1,
  overall: 70,
  overallStatus: 'good',
  fundamentals: [{ id: 'toss', metrics: [{ id: 'tossPeakHeight', score: 70 }] }],
  triage,
})

check('a quality block stored before yaw_measured does not come back claiming one', () => {
  /*
   * The one older shape of `triage.quality` that actually exists in the wild:
   * the five fields it shipped with, before this round added a sixth. Every
   * report filed until now carries exactly that row.
   *
   * The direction of the repair is the whole of the check. `yaw_measured` exists
   * so a comparison between two serves can refuse a pair whose camera angle was
   * never read — and 45 is both the fallback and a real corner-on reading, so a
   * row that defaulted to `true` would present an unread angle as a measured
   * one and wave through the exact pairs the field was added to stop. Absent
   * reads as false. A serve that really was measured and predates the field
   * loses a comparison it could have had, which is the cheap side.
   */
  const legacy = {
    confidence: 0.9,
    blur: 0.1,
    roll_deg: 0,
    yaw_deg: 45,
    swing_samples: 8,
    depth_unreliable: false,
  }
  const back = normalise(
    storedWithTriage({ schema: 1, status: 'ok', quality: legacy, injury_risk: [], suppressed_count: 0 }),
  )
  assert(back?.triage !== undefined, 'a triage block from an older build was dropped entirely')
  assert(
    back!.triage!.quality.yaw_measured === false,
    'a report stored before yaw_measured existed came back claiming its yaw was measured',
  )
  // And nothing else in the block moved on the way through.
  for (const [key, value] of Object.entries(legacy)) {
    assert(
      (back!.triage!.quality as unknown as Record<string, unknown>)[key] === value,
      `repairing yaw_measured also changed quality.${key}`,
    )
  }

  // A fresh block is left exactly as the engine made it.
  const fresh = normalise(
    storedWithTriage({
      schema: 1,
      status: 'ok',
      quality: { ...legacy, yaw_measured: true },
      injury_risk: [],
      suppressed_count: 0,
    }),
  )
  assert(
    fresh!.triage!.quality.yaw_measured === true,
    'a measured yaw was downgraded on the way out of storage',
  )
})

check('a landing from before the window field is refused rather than carried forward', () => {
  /*
   * The failure this guard exists for, and the one its first version missed. It
   * handled the landing block being ABSENT and passed it through untouched when
   * PRESENT — which is no guard at all against what actually happens as a schema
   * grows: the block arriving in an older shape.
   *
   * `landing` shipped with three fields and gained `secondsAfterContact` a few
   * rounds later, alongside the refusal that needs it. A report stored in
   * between therefore carries an offset computed with no temporal refusal at
   * all — possibly one of the confident zeros that refusal was added to stop, a
   * clip that ended before the player landed reading as one who finished
   * square. There is no way to tell from the stored row which it is.
   *
   * So the offset is dropped rather than repaired. Keeping it and defaulting the
   * window to zero would be the worst of the three options: a reading claiming
   * it was taken at the instant of contact, which the current engine would never
   * produce, sitting beside a number that looks entirely ordinary.
   */
  const old = normalise(
    storedWithDiagnosis({ landing: { offset: 0, confidence: 1, anklesSeen: 1 } }),
  )
  const landing = old?.diagnosis?.landing
  assert(landing !== undefined, 'the landing block was dropped entirely')
  assert(
    typeof landing!.secondsAfterContact === 'number',
    'a field the type declares as required came back undefined',
  )
  assert(
    landing!.offset === null,
    `an offset with no window on it was carried forward as ${landing!.offset} — it was measured ` +
      'before the refusal that would have rejected it, and nothing can tell whether it should have',
  )
  // The two fields that are still meaningful are kept, so the refusal stays
  // legible rather than looking like a report nobody ever looked at.
  assert(landing!.anklesSeen === 1 && landing!.confidence === 1, 'the readable fields were discarded too')
})

check('a chain from before span_ratio comes back with the field, not without it', () => {
  /*
   * The same hole as the landing's, one field over, and it had been there just
   * as long. `span_ratio` arrived a build after the rest of the chain, so a
   * report stored in between has every link, a `span_ms`, and no ratio — and the
   * guard checked only that the chain block was present before handing it back.
   *
   * Repaired rather than refused, which is the difference from the landing. That
   * offset had to be dropped because it was computed before a refusal that might
   * have rejected it, so the value itself was in doubt. Nothing about `span_ms`
   * changed when the ratio was added: it is the same measurement, and a ratio
   * nobody stored is a derived number nobody has, which is what `null` means on
   * every other field here.
   */
  const link = { ms: -100, confidence: 1 }
  const old = normalise(
    storedWithDiagnosis({
      chain: { legs: link, hips: link, shoulders: link, elbow: link, wrist: link, span_ms: 120 },
    }),
  )
  const chain = old?.diagnosis?.chain
  assert(chain !== undefined, 'the chain block was dropped entirely')
  assert('span_ratio' in chain!, 'a field the type declares came back absent from the object')
  assert(chain!.span_ratio === null, `a ratio nobody stored came back as ${chain!.span_ratio}`)
  // The measurement that WAS stored is untouched — this is a repair, not a purge.
  assert(chain!.span_ms === 120, `span_ms was altered to ${chain!.span_ms}`)
  assert(chain!.wrist.ms === -100, 'a stored link lost its reading')
})

check('every ungraded block comes back with the shape this build produces', () => {
  /*
   * The generalisation of the two bugs above, and the check that would have
   * caught both before they were written.
   *
   * `render.test.ts` already fuzzes a stored row hard — every path knocked out
   * four ways, asserting `normalise` either drops the row or hands back one that
   * draws. That is a thorough guard against the wrong contract for these three.
   * `chain`, `landing` and `externalRotation` are measured-and-never-shown, so
   * knocking a field out of them cannot break a render and the fuzz passes
   * whatever the shape is. Precisely the blocks nothing renders are the ones no
   * render test can protect.
   *
   * SO THE EXPECTED SHAPE IS TAKEN FROM THE ENGINE rather than written down
   * here. A hand-kept list of field names would need updating by the same person
   * who forgot to update the guard, which is how both of these shipped. Reading
   * `Object.keys` off a diagnosis this build just produced means a field added
   * tomorrow is covered tomorrow, with nothing to remember.
   */
  const frames = buildServe({ seed: 7000 }, 50)
  const skel = detectServe(frames, 50)
  const fresh = diagnose(frames, skel, { tier: 5 })
  const blocks = ['chain', 'landing', 'externalRotation'] as const

  const missing: string[] = []
  for (const block of blocks) {
    const current = fresh[block] as unknown as Record<string, unknown>
    const expected = Object.keys(current)
    assert(expected.length > 0, `${block} produced no fields to compare against`)

    // Every earlier shape this block could have been stored in: each of its
    // fields, absent. One of these is the exact row that shipped broken twice.
    for (const dropped of expected) {
      const older = { ...current }
      delete older[dropped]
      const back = normalise(storedWithDiagnosis({ ...fresh, [block]: older }))
      const got = back?.diagnosis?.[block] as unknown as Record<string, unknown> | undefined
      if (!got) {
        missing.push(`${block} was dropped entirely when ${dropped} was absent`)
        continue
      }
      for (const key of expected) {
        if (!(key in got)) missing.push(`${block}.${key} absent after ${dropped} was absent`)
      }
    }
  }

  note(`  ${blocks.map((b) => `${b}: ${Object.keys(fresh[b] as object).length} fields`).join(', ')}`)
  assert(
    missing.length === 0,
    `a stored block came back missing a field the engine declares:\n      ${missing.slice(0, 8).join('\n      ')}`,
  )
})

check('a landing written by this build survives the read intact', () => {
  // The other direction, so the guard cannot pass by refusing everything.
  const fresh = normalise(
    storedWithDiagnosis({
      landing: { offset: 0.066, confidence: 1, secondsAfterContact: 0.44, anklesSeen: 1 },
    }),
  )
  const landing = fresh?.diagnosis?.landing
  assert(landing?.offset === 0.066, `a current reading came back as ${landing?.offset}`)
  assert(landing?.secondsAfterContact === 0.44, 'the window was not preserved')
})

report()
