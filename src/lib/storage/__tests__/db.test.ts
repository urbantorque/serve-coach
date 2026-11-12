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
  KEEP_TRACKS,
  ROUTINE_BAND,
  type Session,
  DEFAULT_PROFILE,
  forProfile,
  profilesIn,
  normaliseServeTag,
  withServeTag,
  tagsById,
  normalise,
  planPrune,
} from '../db'
import { buildServe } from '../../analysis/syntheticServe'
import { REGISTER_RULE, SCORING_VERSION } from '../../analysis/types'
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
note(`routine: stills on the newest ${KEEP_STILLS}, tracks on the newest ${KEEP_TRACKS}, no report deleted`)
note(`under pressure: keep ${KEEP_STILLS_UNDER_PRESSURE} with stills and tracks, ${KEEP_ALL_UNDER_PRESSURE} at all`)

check('the limits nest: stills inside tracks, and pressure tighter than routine', () => {
  assert(KEEP_STILLS < KEEP_TRACKS, 'the stills outlive the tracks they sit beside')
  assert(KEEP_STILLS_UNDER_PRESSURE < KEEP_STILLS, 'pressure did not tighten the stills limit')
  assert(KEEP_ALL_UNDER_PRESSURE < KEEP_TRACKS, 'pressure keeps more whole reports than routine keeps tracks')
})

heading('Routine pruning — after every save (L3.3)')

check('three hundred reports: nothing deleted, stills and tracks capped', () => {
  /*
   * The roadmap's own proof. The store used to delete everything past sixty;
   * reports are now capped by what they carry, not by how many there are.
   */
  const all = keys(300)
  const { toDelete, toStrip, toDowngrade } = planPrune(all, 'routine')
  assert(toDelete.length === 0, `routine pruning deleted ${toDelete.length} of 300`)
  assert(toStrip.length === 300 - KEEP_STILLS, `stripped ${toStrip.length}, expected ${300 - KEEP_STILLS}`)
  assert(toDowngrade.length === 300 - KEEP_TRACKS, `downgraded ${toDowngrade.length}, expected ${300 - KEEP_TRACKS}`)
  assert(toStrip.every((k, i) => k === all[i]), 'stripped something other than the oldest')
  assert(toDowngrade.every((k, i) => k === all[i]), 'downgraded something other than the oldest')
  // The newest keep everything, and the band between keeps its replay.
  assert(!toStrip.includes(all[299 - KEEP_STILLS + 1]), 'the newest stills were stripped')
  assert(!toDowngrade.includes(all[299 - KEEP_TRACKS + 1]), 'the newest tracks were downgraded')
})

check('after one save, only the reports it pushed over a limit are looked at', () => {
  /*
   * With no count cap the band past each limit grows for ever, and reading
   * all of it back on every serve made each save slower than the last. A save
   * moves one report over each limit; the band is a margin over that one.
   */
  const all = keys(300)
  const { toDelete, toStrip, toDowngrade } = planPrune(all, 'routine', 'recent')
  assert(toDelete.length === 0, 'a routine save deleted a report')
  assert(toStrip.length === ROUTINE_BAND && toDowngrade.length === ROUTINE_BAND, `looked at ${toStrip.length} and ${toDowngrade.length}`)
  assert(toStrip[ROUTINE_BAND - 1] === all[300 - KEEP_STILLS - 1], 'the report just past the stills limit was not in the band')
  assert(toDowngrade[ROUTINE_BAND - 1] === all[300 - KEEP_TRACKS - 1], 'the report just past the track limit was not in the band')
})

check('a history well under both limits is untouched', () => {
  const { toDelete, toStrip, toDowngrade } = planPrune(keys(10), 'routine')
  assert(toDelete.length + toStrip.length + toDowngrade.length === 0, 'planned work on ten reports')
})

check('one past the stills limit strips exactly the oldest one, and keeps its track', () => {
  const all = keys(KEEP_STILLS + 1)
  const { toDelete, toStrip, toDowngrade } = planPrune(all, 'routine')
  assert(toDelete.length === 0, 'routine pruning deleted a report')
  assert(toStrip.length === 1 && toStrip[0] === all[0], `stripped ${JSON.stringify(toStrip)}`)
  assert(toDowngrade.length === 0, 'a track went with the stills on a routine prune')
})

heading('Under real pressure — quota already refused a write')

check('stills-level pressure strips and downgrades almost everything, and deletes nothing', () => {
  const all = keys(300)
  const { toDelete, toStrip, toDowngrade } = planPrune(all, 'stills')
  assert(toDelete.length === 0, `stills-level pressure deleted ${toDelete.length} reports`)
  assert(toStrip.length === 300 - KEEP_STILLS_UNDER_PRESSURE, `stripped ${toStrip.length}`)
  assert(toDowngrade.length === toStrip.length, 'the tracks did not go with the stills under pressure')
})

check('hard-level pressure deletes down to KEEP_ALL_UNDER_PRESSURE, oldest first', () => {
  const all = keys(300)
  const { toDelete, toStrip } = planPrune(all, 'hard')
  assert(toDelete.length === 300 - KEEP_ALL_UNDER_PRESSURE, `deleted ${toDelete.length}`)
  assert(toDelete.every((k, i) => k === all[i]), 'hard pruning did not delete the oldest reports first')
  assert(toStrip.length === KEEP_ALL_UNDER_PRESSURE - KEEP_STILLS_UNDER_PRESSURE, `stripped ${toStrip.length}`)
  assertPartition(all.length, toDelete, toStrip, 'hard pressure')
})

check('a history already inside KEEP_ALL_UNDER_PRESSURE loses no reports even under hard pressure', () => {
  // The whole point of the retry order in `saveSession`: a phone whose disk was
  // filled by something else must not have a thin history destroyed to reclaim
  // bytes that were never the problem.
  const { toDelete } = planPrune(keys(KEEP_ALL_UNDER_PRESSURE - 2), 'hard')
  assert(toDelete.length === 0, `deleted ${toDelete.length} from a history already under the floor`)
})

check('an empty store plans nothing at any level', () => {
  for (const level of ['routine', 'stills', 'hard'] as const) {
    for (const sweep of ['all', 'recent'] as const) {
      const { toDelete, toStrip, toDowngrade } = planPrune([], level, sweep)
      assert(toDelete.length + toStrip.length + toDowngrade.length === 0, `${level}/${sweep} planned work against zero rows`)
    }
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
const storedBasket = (consistency: unknown, scoringVersion = SCORING_VERSION): unknown => ({
  id: 'serve-abc-0',
  createdAt: 1,
  scoringVersion,
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
  registerRule: REGISTER_RULE,
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

check('a stored basket with every row tied at 100 comes back naming no row', () => {
  // H43: a sort over a tie names whichever row came first, and a stored report
  // re-ranks its rows on the way in, so the rule has to hold here too.
  const block = {
    ...wholeConsistency(),
    metrics: [
      { id: 'tossPeakHeight', label: 'Toss height', score: 100, values: [1, 1], ideal: [0, 2], range: [0, 2] },
      { id: 'releaseHeight', label: 'Release height', score: 100, values: [1, 1], ideal: [0, 2], range: [0, 2] },
    ],
    weakest: { id: 'tossPeakHeight', label: 'Toss height', score: 100 },
    steadiest: { id: 'releaseHeight', label: 'Release height', score: 100 },
  }
  const s = normalise(storedBasket(block))
  assert(s?.consistency !== undefined, 'the block was dropped')
  assert(s!.consistency!.weakest === undefined && s!.consistency!.steadiest === undefined, 'a tie at 100 named a row')
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

check('a delta written under another rule is not printed again', () => {
  // Before H44 the arm, landing and sequence lines were bounded by one pair's
  // noise, or none, and printed on most baskets of a still serve; before H45 the
  // arm line ran on angled phones. Such a row clears its own stored bound, so it
  // goes by the rule it was written under (`REGISTER_RULE`).
  for (const rule of [undefined, REGISTER_RULE - 1, REGISTER_RULE + 1]) {
    const s = normalise(storedBasket({ ...wholeConsistency(), registerRule: rule, uncalibrated: [wholeDelta()] }))
    assert(s?.consistency !== undefined, 'the whole comparison went with an old delta')
    assert(s!.consistency!.uncalibrated === undefined, `a delta written under rule ${rule} was kept`)
  }
})

check('a stored row with no score is dropped, not ranked as the one that changes most', () => {
  // As 0 it was named the row that changes most, under a foot saying every row held (H45).
  const block = {
    ...wholeConsistency(),
    metrics: [
      { id: 'tossPeakHeight', label: 'Toss height', values: [1, 2], ideal: [0, 2], range: [0, 2] },
      { id: 'releaseHeight', label: 'Release height', score: 92, values: [1, 1], ideal: [0, 2], range: [0, 2] },
    ],
  }
  const s = normalise(storedBasket(block))
  assert(s!.consistency!.metrics.length === 1, `${s!.consistency!.metrics.length} rows kept`)
  assert(s!.consistency!.weakest?.id === 'releaseHeight', `named ${s!.consistency!.weakest?.label}`)
})

check('what the basket could not find of the drop is read back, and nothing malformed is', () => {
  const kept = normalise(storedBasket({ ...wholeConsistency(), missingDrop: { serves: 2, leftOut: true } }))
  assert(JSON.stringify(kept!.consistency!.missingDrop) === '{"serves":2,"leftOut":true}', 'the missing drop was not read back')
  const one = normalise(storedBasket({ ...wholeConsistency(), missingDrop: { serves: 1, leftOut: true } }))
  assert(one!.consistency!.missingDrop?.serves === 1, 'one serve of two, left out, was not read back')
  // A count over the basket, a fraction, or a left-out the rule never writes would
  // print a sentence no basket earned: "I found no racket drop on 9 of them" (H46).
  for (const bad of [
    { serves: '2', leftOut: true },
    { serves: 0, leftOut: false },
    { serves: 2 },
    'x',
    { serves: 3, leftOut: true },
    { serves: 1.5, leftOut: true },
    { serves: Infinity, leftOut: true },
    { serves: 1, leftOut: false },
  ]) {
    const s = normalise(storedBasket({ ...wholeConsistency(), missingDrop: bad }))
    assert(s!.consistency!.missingDrop === undefined, `${JSON.stringify(bad)} survived the read`)
  }
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
    back!.triage!.quality!.yaw_measured === false,
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
    fresh!.triage!.quality!.yaw_measured === true,
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


/* -------------------------------------------- the triage block, on the way out */

heading('A triage block whose shape predates its readers')

/** A stored report carrying a triage block, with one part of it replaced. */
const storedTriage = (triage: unknown) => ({
  id: 'serve-t',
  createdAt: 1,
  overall: 70,
  overallStatus: 'good',
  fundamentals: [{ id: 'toss', metrics: [{ id: 'tossPeakHeight', score: 70 }] }],
  triage,
})

const wholeQuality = () => ({
  confidence: 0.8,
  blur: 0.1,
  roll_deg: 0,
  yaw_deg: 82,
  yaw_measured: true,
  swing_samples: 8,
  depth_unreliable: false,
})

check('a complete triage block survives the read unchanged', () => {
  const s = normalise(storedTriage({ schema: 1, status: 'ok', quality: wholeQuality(), injury_risk: [] }))
  assert(s?.triage?.quality?.yaw_deg === 82, 'a complete quality block was dropped')
  assert(s?.triage?.quality?.yaw_measured === true, 'a measured angle came back unmeasured')
})

check('a quality block short of a field is dropped, and the verdict is not', () => {
  /*
   * R65's decision, and the half it left named rather than made: there is no
   * honest default for a missing `confidence`. Inventing 0.9 manufactures a
   * measurement and 0 refuses a clip that was fine, so the block goes.
   *
   * The verdict stays, and the next check is why.
   */
  const { confidence: _c, ...short } = wholeQuality()
  void _c
  const s = normalise(storedTriage({ schema: 1, status: 'ok', quality: short, injury_risk: [] }))
  assert(s?.triage !== undefined, 'the whole triage went with a malformed quality block')
  assert(s?.triage?.quality === undefined, 'a quality block missing its confidence survived')
  assert(s?.triage?.status === 'ok', 'the verdict was lost with the block')
})

check('a rejected clip keeps its rejection even when the block is unreadable', () => {
  /*
   * THE REGRESSION THIS GUARD CAUSED AND AN EXISTING CHECK CAUGHT. The first
   * version dropped the whole triage, and `importBackup` refuses to restore a
   * clip the engine rejected by reading `status` — so a rejected row came back
   * into a history that had refused it.
   *
   * A rejected clip legitimately has readings nobody took: it was refused before
   * they could be. The rejection is the one thing about it that must survive,
   * which is why the block is what drops.
   */
  const s = normalise(
    storedTriage({ schema: 1, status: 'rejected', reason: 'no_serve_found', quality: null }),
  )
  assert(s?.triage?.status === 'rejected', 'a rejected clip lost its rejection')
  assert(s?.triage?.quality === undefined, 'an unreadable block survived on a rejected clip')
})

check('an angle nobody measured reads as unmeasured, whatever the row says', () => {
  // R49·1's rule, now applied inside the shape guard rather than beside it.
  const missing = { ...wholeQuality() } as Record<string, unknown>
  delete missing.yaw_measured
  const s = normalise(storedTriage({ schema: 1, status: 'ok', quality: missing, injury_risk: [] }))
  assert(s?.triage?.quality?.yaw_measured === false, 'an absent flag defaulted to measured')
})

check('an injury flag that is not an object is dropped, and the rest kept', () => {
  const s = normalise(
    storedTriage({
      schema: 1,
      status: 'ok',
      quality: wholeQuality(),
      injury_risk: [null, { flag: 'wrist_strain_forced_pronation', severity: 'high' }],
    }),
  )
  assert(s?.triage?.injury_risk.length === 1, `kept ${s?.triage?.injury_risk.length} flags, expected 1`)
})


/* ------------------------------------------- what the player says it was ---- */

heading('A player-side tag, and what it refuses')

/**
 * R53·2's storage. The reading half was refused in R53·1 — a basket cannot be
 * told apart by position or by measurement — so a tap is the only route, and a
 * tap needs somewhere to live that `saveSession` will not erase.
 *
 * `normaliseServeTag` is not exported; it is reached through the shape it lets
 * through, which is the same way `usableConsistency` is tested above.
 */
const wholeTag = () => ({ id: 'serve-abc', serveNumber: 2, taggedAt: 1_800_000_000_000 })

check('a complete tag survives the read', () => {
  const t = normaliseServeTag(wholeTag())
  assert(t?.serveNumber === 2, `a complete tag came back as ${JSON.stringify(t)}`)
})

check('a serve number that is not one or two is refused, not clamped', () => {
  /*
   * Checked against its two legal values rather than for being a number. A 3
   * would partition a basket into a bucket no screen draws, and clamping it to 2
   * would be the app deciding what the player meant.
   */
  for (const n of [0, 3, 1.5, -1, '1']) {
    assert(
      normaliseServeTag({ ...wholeTag(), serveNumber: n }) === undefined,
      `a serve number of ${JSON.stringify(n)} was accepted`,
    )
  }
})

/* ------------------------------------- where it landed, and the merge (R56) */

check('a bad serve number costs the field, not the outcome beside it', () => {
  /*
   * The check above still passes, and it passes for a reason worth stating: its
   * fixture carries no outcome, so dropping the bad field leaves a row saying
   * nothing and the row goes. Add an outcome and the rule that actually applies
   * shows — round 23's, on `triage.quality`: a malformed part costs the part,
   * not the verdict. Losing where the serve landed because the player's other
   * tap was corrupt would be the storage deciding what they meant.
   */
  const t = normaliseServeTag({ ...wholeTag(), serveNumber: 3, outcome: 'net' })
  assert(t?.outcome === 'net', `the outcome did not survive a bad serve number: ${JSON.stringify(t)}`)
  assert(t?.serveNumber === undefined, 'a serve number of 3 was kept')
})

check('an outcome outside the four is dropped, and never guessed at', () => {
  for (const o of ['ace', 'out', 'IN', 1, '', null]) {
    const t = normaliseServeTag({ ...wholeTag(), outcome: o })
    assert(t?.outcome === undefined, `an outcome of ${JSON.stringify(o)} was accepted`)
    assert(t?.serveNumber === 2, `a bad outcome cost the serve number: ${JSON.stringify(t)}`)
  }
})

check('a row that says nothing is not a tag', () => {
  // A stored row carrying only a timestamp is a claim that the player said
  // something. They did not, and the store's own count is what tells a later
  // screen whether this feature is used at all.
  const { serveNumber: _n, ...bare } = wholeTag()
  void _n
  assert(normaliseServeTag(bare) === undefined, 'a row with neither fact was stored as a tag')
})

check('one tap never clears the other', () => {
  /*
   * The whole reason `withServeTag` is a pure function rather than a line
   * inside the transaction: two independent facts on one row, and the failure
   * is silent — the player taps where it landed and their "second serve" is
   * gone, with nothing on screen to say so.
   */
  const first = withServeTag(undefined, 'serve-abc', { serveNumber: 2 }, 10)
  assert(first?.serveNumber === 2 && first?.outcome === undefined, 'the first tap did not store')
  const second = withServeTag(first, 'serve-abc', { outcome: 'wide' }, 20)
  assert(second?.serveNumber === 2, 'tagging the outcome cleared which serve it was')
  assert(second?.outcome === 'wide', 'the outcome did not store')
  assert(second?.taggedAt === 20, 'the moment was not moved to the newer tap')
})

check('taking one tap back leaves the other, and taking both back deletes the row', () => {
  const both = withServeTag(
    withServeTag(undefined, 'serve-abc', { serveNumber: 1 }, 10),
    'serve-abc',
    { outcome: 'net' },
    20,
  )
  // An explicit `undefined` is the undo — distinguished from an absent key,
  // which is the difference that makes one call able to do both.
  const cleared = withServeTag(both, 'serve-abc', { serveNumber: undefined }, 30)
  assert(cleared?.outcome === 'net', 'untagging the serve number took the outcome with it')
  assert(cleared?.serveNumber === undefined, 'the serve number did not clear')
  const empty = withServeTag(cleared, 'serve-abc', { outcome: undefined }, 40)
  assert(empty === undefined, 'a row with nothing left on it was kept')
  const untouched = withServeTag(both, 'serve-abc', {}, 50)
  assert(
    untouched?.serveNumber === 1 && untouched?.outcome === 'net',
    'an empty patch changed something',
  )
})

check('a tag with no report to belong to is refused', () => {
  assert(normaliseServeTag({ ...wholeTag(), id: '' }) === undefined, 'an empty id was accepted')
  const { id: _drop, ...noId } = wholeTag()
  void _drop
  assert(normaliseServeTag(noId) === undefined, 'a tag with no id was accepted')
})

check('a tag with no moment is refused rather than stamped with now', () => {
  // Stamping it would invent a fact about when somebody said something, which is
  // the one thing this record is for.
  assert(
    normaliseServeTag({ ...wholeTag(), taggedAt: undefined }) === undefined,
    'a tag with no moment was given one',
  )
})

check('the lookup is by report id, and a repeated tag is the later one', () => {
  const map = tagsById([
    { id: 'a', serveNumber: 1, taggedAt: 1 },
    { id: 'b', serveNumber: 2, taggedAt: 2 },
    { id: 'a', serveNumber: 2, taggedAt: 3 },
  ])
  assert(map.size === 2, `built a map of ${map.size}, expected 2`)
  assert(map.get('a')?.serveNumber === 2, 'an earlier tag won over a later one')
})


/* --------------------------------------------------- whose report this is --- */

heading('Profiles, and the migration R55 calls the hard part')

const profiled = (id: string | undefined, createdAt: number) =>
  ({ id: `p-${id}-${createdAt}`, createdAt, profileId: id, overall: 70 }) as unknown as Session

check('a report filed before profiles lands under one default player, with no prompt', () => {
  /*
   * The migration, and the whole of it. A player who has never heard of profiles
   * keeps a history that behaves exactly as it did; a coach who adds a second
   * profile finds their own serves already gathered under the first rather than
   * scattered across nothing.
   */
  const s = normalise({
    id: 'old',
    createdAt: 1,
    overall: 70,
    overallStatus: 'good',
    fundamentals: [{ id: 'toss', metrics: [{ id: 'tossPeakHeight', score: 70 }] }],
  })
  assert(s?.profileId === DEFAULT_PROFILE, `an unprofiled report came back as ${s?.profileId}`)
})

check('a report that already names a profile keeps it', () => {
  const s = normalise({
    id: 'theirs',
    createdAt: 1,
    overall: 70,
    overallStatus: 'good',
    profileId: 'squad-2',
    fundamentals: [{ id: 'toss', metrics: [{ id: 'tossPeakHeight', score: 70 }] }],
  })
  assert(s?.profileId === 'squad-2', `a named profile came back as ${s?.profileId}`)
})

check('an empty profile is not a profile', () => {
  // A hand-edited backup, or a writer that stamped a blank. Reading it as a real
  // profile would give one player a history nobody can select.
  const s = normalise({
    id: 'blank',
    createdAt: 1,
    overall: 70,
    overallStatus: 'good',
    profileId: '',
    fundamentals: [{ id: 'toss', metrics: [{ id: 'tossPeakHeight', score: 70 }] }],
  })
  assert(s?.profileId === DEFAULT_PROFILE, `a blank profile came back as ${JSON.stringify(s?.profileId)}`)
})

check('the filter keeps one player and nobody else', () => {
  const all = [profiled('me', 3), profiled('coach', 2), profiled('me', 1)]
  const mine = forProfile(all, 'me')
  assert(mine.length === 2, `kept ${mine.length} of 3`)
  assert(mine.every((s) => s.profileId === 'me'), 'somebody else reached the filtered list')
})

check('a profile with no reports is not a profile', () => {
  /*
   * Derived from the reports rather than kept in a store, for the same reason a
   * tag dies with its report: a profile with no serves under it is a name and
   * nothing else, and a list that can contain one needs pruning, renaming and an
   * empty state that nothing has asked for.
   */
  const found = profilesIn([profiled('me', 2), profiled('coach', 1), profiled('me', 3)])
  assert(found.length === 2, `found ${found.length} profiles, expected 2`)
  assert(found[0] === 'coach', `oldest-first ordering gave ${found[0]} first`)
})

check('an unprofiled report is counted under the default, not as its own player', () => {
  // The two halves have to agree: `normalise` defaults, and anything reading raw
  // rows has to default the same way or a migrated history splits in two.
  const found = profilesIn([profiled(undefined, 1), profiled('me', 2)])
  assert(found.length === 1 && found[0] === DEFAULT_PROFILE, `found ${JSON.stringify(found)}`)
})

heading('A stored serve speed (N2.1)')

check('a whole reading and a known miss survive storage; anything else is dropped', () => {
  const withSpeed = (speed: unknown) => normalise({ ...(storedBasket(undefined) as object), speed })?.speed
  const reading = { speed: { ms: 40, low: 38, high: 43, samples: 9, span: 0.07, depthAngle: 3 } }
  assert(JSON.stringify(withSpeed(reading)) === JSON.stringify(reading), 'a whole reading was changed or dropped')
  assert((withSpeed({ miss: 'frame_rate' }) as { miss: string })?.miss === 'frame_rate', 'a known miss was dropped')
  assert(withSpeed({ miss: 'gremlins' }) === undefined, 'an unknown miss was kept')
  assert(withSpeed({ speed: { ms: 40, low: 38 } }) === undefined, 'half a reading was kept')
  assert(withSpeed({ speed: { ms: 50, low: 38, high: 43, samples: 9, span: 0.07, depthAngle: 3 } }) === undefined, 'a best figure outside its own range was kept')
})

report()
