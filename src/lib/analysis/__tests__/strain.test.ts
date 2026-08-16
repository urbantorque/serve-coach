/**
 * Does the same joint warning keep coming back, and can the app count it?
 *
 * Almost every check here is about the DENOMINATOR, because that is the only
 * number in this feature that can lie. "Your back folded on 2 of your last 6
 * trips" is a reassuring sentence, and it is a false one if three of those six
 * trips never showed the app a spine — a refused clip and a clean serve look
 * identical from the outside, both carrying an empty `injury_risk`. Getting that
 * wrong would manufacture good news about somebody's back, which is the house
 * rule pointed at the one subject where being wrong costs a joint rather than a
 * point.
 *
 * The rest is about silence: below the floor, past the window, and once a
 * pattern has stopped, this says nothing at all.
 */
import { MIN_STRAIN_TRIPS, STRAIN_WINDOW, recurringStrain, type StrainSource } from '../strain'
import { INJURY_INPUTS, injuryInputsRead, type InjuryFlag } from '../triage'
import { strainLine } from '../verdict'
import { MAX_WORDS, cueIssues, wordCount } from '../voice'
import { assert, check, heading, note, report } from './harness'

const BACK: InjuryFlag = 'lumbar_load_posture_collapse'
const WRIST: InjuryFlag = 'wrist_strain_forced_pronation'

/** Every signal any flag reads, all present and all inside every limit. */
function cleanSignals(): Record<string, number> {
  return {
    palm_to_sky_deg: 10,
    pronation_deg: 10,
    spine_lean_deg: 5,
    drop_depth_ratio: 0.2,
    contact_height_ratio: 1.2,
  }
}

/** A stored serve: measured, readable, with whatever flags are named. */
function serve(
  flags: InjuryFlag[] = [],
  over: { status?: 'ok' | 'rejected'; signals?: Record<string, number> } = {},
): StrainSource {
  return {
    triage: {
      status: over.status ?? 'ok',
      injury_risk: flags.map((flag) => ({ flag, severity: 'medium' as const })),
    },
    diagnosis: { signals: over.signals ?? cleanSignals() },
  }
}

/** A run of trips, one serve each, flagged where `pattern` says so. */
const tripsWhere = (pattern: boolean[]): StrainSource[][] =>
  pattern.map((flagged) => [serve(flagged ? [BACK] : [])])

const backIn = (trips: StrainSource[][]) => recurringStrain(trips).find((r) => r.flag === BACK)

heading('A warning that keeps coming back')

check('two trips out of a run is a pattern, and it is counted in trips', () => {
  const found = backIn(tripsWhere([false, true, false, true]))
  assert(found !== undefined, 'a flag on two of four trips should be reported')
  assert(found!.trips === 2, `counted ${found!.trips} trips, expected 2`)
  assert(found!.of === 4, `denominator was ${found!.of}, expected 4`)
})

check('one trip is the report’s job, not this one', () => {
  assert(backIn(tripsWhere([false, false, true])) === undefined, 'a single occurrence should be silent')
  note(`the floor is ${MIN_STRAIN_TRIPS} trips`)
})

check('a bad afternoon counts once, however many serves it held', () => {
  // Nine flagged serves on one trip and one on another: two trips, not ten.
  const trips: StrainSource[][] = [
    Array.from({ length: 9 }, () => serve([BACK])),
    [serve([BACK])],
  ]
  const found = backIn(trips)
  assert(found?.trips === 2, `counted ${found?.trips} trips from 10 flagged serves, expected 2`)
})

check('a trip counts once even when only one of its serves was flagged', () => {
  const found = backIn([[serve([]), serve([BACK]), serve([])], [serve([BACK])]])
  assert(found?.trips === 2, `counted ${found?.trips}, expected 2`)
  assert(found?.of === 2, `denominator was ${found?.of}, expected 2`)
})

heading('The denominator only counts trips that could answer')

check('a refused clip is not a clean trip', () => {
  // Three refusals around two flagged trips. If refusals counted, the sentence
  // would read "2 of your last 5" — the app inventing three good days.
  const trips: StrainSource[][] = [
    [serve([], { status: 'rejected' })],
    [serve([BACK])],
    [serve([], { status: 'rejected' })],
    [serve([BACK])],
    [serve([], { status: 'rejected' })],
  ]
  const found = backIn(trips)
  assert(found?.trips === 2, `counted ${found?.trips} flagged trips, expected 2`)
  assert(found?.of === 2, `denominator was ${found?.of}, expected 2 — refusals must not count as clean`)
})

check('a trip whose spine was never readable is not a clean trip', () => {
  const noSpine = { ...cleanSignals() }
  delete noSpine.spine_lean_deg
  const trips: StrainSource[][] = [
    [serve([BACK])],
    [serve([], { signals: noSpine })],
    [serve([BACK])],
  ]
  const found = backIn(trips)
  assert(found?.of === 2, `denominator was ${found?.of}, expected 2 — an unreadable spine is not a straight one`)
})

check('the denominator is per flag, not shared', () => {
  // The spine is readable on every trip; the wrist is readable on only two of
  // them. Two flags, two different denominators, from one history.
  const noWrist = { ...cleanSignals() }
  delete noWrist.pronation_deg
  const trips: StrainSource[][] = [
    [serve([BACK, WRIST])],
    [serve([BACK], { signals: noWrist })],
    [serve([BACK, WRIST])],
  ]
  const found = recurringStrain(trips)
  const back = found.find((r) => r.flag === BACK)
  const wrist = found.find((r) => r.flag === WRIST)
  assert(back?.of === 3, `back denominator was ${back?.of}, expected 3`)
  assert(wrist?.of === 2, `wrist denominator was ${wrist?.of}, expected 2`)
})

check('a trip counts if any one of its serves could answer', () => {
  const noSpine = { ...cleanSignals() }
  delete noSpine.spine_lean_deg
  const trips: StrainSource[][] = [
    [serve([], { signals: noSpine }), serve([BACK])],
    [serve([BACK])],
  ]
  assert(backIn(trips)?.of === 2, 'one readable serve makes the trip answerable')
})

check('the readability test is the same one the flags are raised through', () => {
  // Not a second opinion: `injuriesIn` guards itself with this exact function,
  // so a flag can never be raised on a clip this module calls unreadable.
  for (const flag of Object.keys(INJURY_INPUTS) as InjuryFlag[]) {
    assert(injuryInputsRead(cleanSignals(), flag), `${flag} should read on clean signals`)
    for (const signal of INJURY_INPUTS[flag]) {
      const missing = { ...cleanSignals() }
      delete missing[signal]
      assert(!injuryInputsRead(missing, flag), `${flag} should not read without ${signal}`)
      assert(
        !injuryInputsRead({ ...cleanSignals(), [signal]: Number.NaN }, flag),
        `${flag} should not read a NaN ${signal}`,
      )
    }
  }
  assert(!injuryInputsRead(undefined, BACK), 'a report with no diagnosis cannot answer')
})

heading('Still live, or silent')

check('a pattern that stopped two trips ago is not reported', () => {
  assert(backIn(tripsWhere([true, true, false, false])) === undefined, 'a fixed pattern should go quiet')
})

check('one clean trip since does not silence it', () => {
  const found = backIn(tripsWhere([true, true, false]))
  assert(found !== undefined, 'a flag on the trip before last is still live')
  assert(found!.tripsSince === 1, `tripsSince was ${found!.tripsSince}, expected 1`)
})

check('the most recent trip reports zero trips since', () => {
  assert(backIn(tripsWhere([true, false, true]))?.tripsSince === 0, 'expected 0')
})

heading('The window')

check('the window only looks back so far', () => {
  // Flagged long ago, then a clean run longer than the window, then flagged on
  // the last two. The old trips must not swell the denominator.
  const pattern = [true, true, ...Array(STRAIN_WINDOW).fill(false), true, true]
  const found = backIn(tripsWhere(pattern))
  assert(found?.of === STRAIN_WINDOW, `denominator was ${found?.of}, expected ${STRAIN_WINDOW}`)
  assert(found?.trips === 2, `counted ${found?.trips}, expected 2 — the old pair is out of the window`)
})

check('unanswerable trips do not consume the window', () => {
  // Twenty refused trips between the flagged ones. The window is six trips that
  // could answer, not six rows of history.
  const refusals = Array.from({ length: 20 }, () => [serve([], { status: 'rejected' })])
  const found = backIn([[serve([BACK])], ...refusals, [serve([BACK])]])
  assert(found?.of === 2, `denominator was ${found?.of}, expected 2`)
  assert(found?.tripsSince === 0, 'the last answerable trip was flagged')
})

heading('Nothing to say')

check('an empty history says nothing', () => {
  assert(recurringStrain([]).length === 0, 'no trips, no records')
  assert(recurringStrain([[]]).length === 0, 'an empty trip is not evidence')
})

check('a player with no flags at all says nothing', () => {
  assert(recurringStrain(tripsWhere([false, false, false, false])).length === 0, 'expected silence')
})

check('a history of nothing but refusals says nothing', () => {
  const trips = Array.from({ length: 8 }, () => [serve([BACK], { status: 'rejected' })])
  assert(recurringStrain(trips).length === 0, 'a rejected clip raises no flags and must count as none')
})

heading('Which one is said first')

check('the flag on more trips leads', () => {
  const trips: StrainSource[][] = [
    [serve([BACK, WRIST])],
    [serve([BACK])],
    [serve([BACK, WRIST])],
  ]
  const found = recurringStrain(trips)
  assert(found.length === 2, `expected both flags, got ${found.length}`)
  assert(found[0].flag === BACK, `${found[0].flag} led, expected the one on three trips`)
})

check('severity breaks a tie the counts cannot', () => {
  const worseWrist: StrainSource = {
    triage: {
      status: 'ok',
      injury_risk: [
        { flag: BACK, severity: 'medium' },
        { flag: WRIST, severity: 'high' },
      ],
    },
    diagnosis: { signals: cleanSignals() },
  }
  const found = recurringStrain([[worseWrist], [worseWrist]])
  assert(found[0].flag === WRIST, `${found[0].flag} led, expected the high-severity one`)
  assert(found[0].severity === 'high', `severity was ${found[0].severity}`)
})

check('severity is the worst seen in the window, not the latest', () => {
  const high: StrainSource = {
    triage: { status: 'ok', injury_risk: [{ flag: BACK, severity: 'high' }] },
    diagnosis: { signals: cleanSignals() },
  }
  const found = backIn([[high], [serve([BACK])]])
  assert(found?.severity === 'high', `severity was ${found?.severity}, expected the worse of the two`)
})

heading('The sentence')

check('every flag has words, and they fit the editor', () => {
  for (const flag of Object.keys(INJURY_INPUTS) as InjuryFlag[]) {
    const line = strainLine({ flag, trips: STRAIN_WINDOW, of: STRAIN_WINDOW })
    assert(line !== undefined, `${flag} has no sentence`)
    assert(cueIssues(line!).length === 0, `${flag}: ${cueIssues(line!).join('; ')}`)
    assert(wordCount(line!) <= MAX_WORDS, `${flag} runs to ${wordCount(line!)} words`)
  }
})

check('the sentence states the count it was given', () => {
  const line = strainLine({ flag: BACK, trips: 4, of: 6 })
  assert(line!.includes('4 of your last 6 trips'), `read "${line}"`)
})

check('a flag this build has no words for produces no sentence', () => {
  const line = strainLine({ flag: 'a_flag_from_the_future' as InjuryFlag, trips: 2, of: 3 })
  assert(line === undefined, `a restored report named an unknown flag and got "${line}"`)
})

report()
