/**
 * The player's own tags in the plan, past chance only (N2.9).
 *
 * Three layers. The exact test against tables whose answers are known by hand.
 * The rates on synthetic histories: how often pure noise names a link over a
 * whole tagged history, read at every look, and how often a planted link is
 * found. And the report: what moves, what never moves, and what says nothing.
 * Every rate here is a rate on synthetic histories; it proves the test keeps
 * its stated rate, not that a link found on a real player is a cause.
 */
import {
  FIRST_LOOK,
  LINK_ALPHA,
  MIN_SIDE,
  chanceOfAtLeast,
  faultsOf,
  holm,
  linkLine,
  linkedPlan,
  linksAtLook,
  linksIn,
  lookFor,
  missLinks,
  type MissLink,
  type Row,
} from '../missLinks'
import { causalPlan } from '../analysis/verdict'
import { cueIssues, sentenceCount, wordCount } from '../analysis/voice'
import type { FlawFinding, FlawId } from '../analysis/flaws'
import type { Diagnosis } from '../analysis/diagnose'
import type { Triage } from '../analysis/triage'
import type { Analysis } from '../analysis/types'
import type { ServeOutcome, ServeTag, Session } from '../storage/db'
import type { ServeDials } from '../analysis/syntheticServe'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

/** A seeded uniform draw (mulberry32), so every rate here is the same on every run. */
function stream(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pct = (k: number, n: number) => `${((100 * k) / n).toFixed(1)}%`

/* ------------------------------------------------------------ the test -- */

heading('The exact test, against answers known by hand')

check("one table is Fisher's exact test: the lady tasting tea", () => {
  // Four cups of each, three of four picked right: 17/70 by hand; all four, 1/70.
  const three = chanceOfAtLeast([{ serves: 8, fault: 4, miss: 4, both: 3 }])
  const four = chanceOfAtLeast([{ serves: 8, fault: 4, miss: 4, both: 4 }])
  assert(Math.abs(three - 17 / 70) < 1e-12, `three right read ${three}, not 17/70`)
  assert(Math.abs(four - 1 / 70) < 1e-12, `four right read ${four}, not 1/70`)
  assert(chanceOfAtLeast([{ serves: 8, fault: 4, miss: 4, both: 0 }]) === 1, 'the least extreme count was not certain')
})

check('two sittings are summed exactly, not multiplied as if separate tests', () => {
  // Both sittings perfect: only one arrangement of eight reaches eight, (1/70)^2.
  const both = chanceOfAtLeast([
    { serves: 8, fault: 4, miss: 4, both: 4 },
    { serves: 8, fault: 4, miss: 4, both: 4 },
  ])
  assert(Math.abs(both - (1 / 70) ** 2) < 1e-15, `read ${both}`)
  // Seven of eight across two sittings: (1/70)^2 plus the two ways to drop one, 2 * (16/70) * (1/70).
  const seven = chanceOfAtLeast([
    { serves: 8, fault: 4, miss: 4, both: 4 },
    { serves: 8, fault: 4, miss: 4, both: 3 },
  ])
  const want = (1 / 70) ** 2 + 2 * (16 / 70) * (1 / 70)
  assert(Math.abs(seven - want) < 1e-15, `read ${seven}, want ${want}`)
})

check("Holm's step-down passes the right tests and stops at the first that fails", () => {
  const passed = holm([{ p: 0.01 }, { p: 0.04 }, { p: 0.012 }, { p: 0.5 }], 0.05).map((t) => t.p)
  // 0.01 <= 0.05/4, 0.012 <= 0.05/3, 0.04 > 0.05/2: two pass, and the 0.04 stops it.
  assert(passed.join() === '0.01,0.012', `passed ${passed.join()}`)
})

check('the looks double from the first, each spending half of what is left', () => {
  assert(lookFor(FIRST_LOOK - 1) === undefined, `a look at ${FIRST_LOOK - 1} tagged serves`)
  const looks = [FIRST_LOOK, 2 * FIRST_LOOK - 1, 2 * FIRST_LOOK, 4 * FIRST_LOOK, 1000].map((n) => lookFor(n)!)
  assert(looks[0].serves === FIRST_LOOK && looks[0].alpha === LINK_ALPHA / 2, JSON.stringify(looks[0]))
  assert(looks[1].serves === FIRST_LOOK, `${2 * FIRST_LOOK - 1} serves did not hold the first look`)
  assert(looks[2].serves === 2 * FIRST_LOOK && looks[2].alpha === LINK_ALPHA / 4, JSON.stringify(looks[2]))
  // However long the history runs, every look's share together stays under the rate.
  let spent = 0
  for (let n = FIRST_LOOK; n < 1e7; n *= 2) spent += lookFor(n)!.alpha
  assert(spent < LINK_ALPHA, `the looks spend ${spent}`)
  note(`looks at ${FIRST_LOOK}, ${2 * FIRST_LOOK}, ${4 * FIRST_LOOK}... at ${looks.slice(0, 1).concat(looks[2], looks[3]).map((l) => `${(100 * l.alpha).toFixed(3)}%`).join(', ')}`)
})

/* ------------------------------------------------- synthetic histories -- */

const FAULTS: FlawId[] = ['toss_arm_drops', 'low_contact', 'no_leg_drive', 'toss_drift', 'collapsed_elbow']
const logit = (p: number) => Math.log(p / (1 - p))
const expit = (x: number) => 1 / (1 + Math.exp(-x))

/** A link planted on the first fault: how its serves split between the net and in, with it and without. */
interface Planted {
  share: number
  withIt: { net: number; in: number }
  without: { net: number; in: number }
}

/**
 * One player's tagged serves, as rows, in sittings of 20.
 *
 * Five faults each on a share of serves drawn from 20% to 60%, each unread on
 * one serve in ten. Outcomes near the Bath player's mix (about half in, a
 * quarter into the net, the rest long or wide). `drift` gives each sitting a
 * mood that raises the faults and the misses together, which is the confound a
 * season really has: a tired, windy day is worse at both, for no reason in the
 * serve.
 */
function rowsFor(random: () => number, serves: number, drift = 0, planted?: Planted, pooled = false): Row[] {
  const share = FAULTS.map(() => 0.2 + 0.4 * random())
  const rows: Row[] = []
  let mood = 0
  for (let i = 0; i < serves; i++) {
    if (i % 20 === 0) mood = drift * (2 * random() - 1)
    const faults: Row['faults'] = {}
    let carries = false
    FAULTS.forEach((flaw, k) => {
      const on = random() < expit(logit(k === 0 && planted ? planted.share : share[k]) + mood)
      if (k === 0) carries = on
      if (random() >= 0.1) faults[flaw] = on
    })
    const base = planted ? (carries ? planted.withIt : planted.without) : { net: 0.2, in: 0.55 }
    const inn = expit(logit(base.in) - mood)
    const rest = (1 - inn) / (1 - base.in)
    const u = random()
    const outcome =
      u < inn ? 'in' : u < inn + base.net * rest ? 'net' : u < inn + (base.net + 0.6 * (1 - base.in - base.net)) * rest ? 'long' : 'wide'
    rows.push({ outcome, stratum: pooled ? 'one' : `${Math.floor(i / 20)}|side`, faults })
  }
  return rows
}

/** A strong link: on half the serves, and the net goes from 12% of serves to 40% with it. */
const STRONG: Planted = { share: 0.5, withIt: { net: 0.4, in: 0.4 }, without: { net: 0.12, in: 0.62 } }
/** A weaker one: the net from 15% to 30%. */
const WEAKER: Planted = { share: 0.5, withIt: { net: 0.3, in: 0.48 }, without: { net: 0.15, in: 0.6 } }

heading('Past chance, on synthetic histories')

check(`noise names a link under ${100 * LINK_ALPHA}% of the time over a whole tagged history, read at every look`, () => {
  // 400 players of pure noise, each tagging 384 serves, read at 48, 96, 192 and
  // 384. A history that ever names a link counts once.
  for (const drift of [0, 1.5]) {
    const random = stream(drift ? 202 : 101)
    const N = 400
    let ever = 0
    for (let k = 0; k < N; k++) {
      const rows = rowsFor(random, 8 * FIRST_LOOK, drift)
      for (let n = FIRST_LOOK; n <= rows.length; n *= 2) {
        if (linksAtLook(rows.slice(0, n)).length) {
          ever++
          break
        }
      }
    }
    note(`${drift ? 'with sittings that drift' : 'steady sittings'}: ${pct(ever, N)} of ${N} players ever saw a link`)
    assert(ever / N <= LINK_ALPHA, `${pct(ever, N)} of noise histories named a link`)
  }
})

check('asking within each sitting is what keeps a drifting season honest', () => {
  // One look of 96 serves at the full 5%, so the two can be set side by side.
  // Pooled into one stratum, a season whose bad days are worse at both the
  // faults and the misses reads as links; within each sitting it does not.
  const N = 400
  let pooled = 0
  let within = 0
  const a = stream(303)
  const b = stream(303)
  for (let k = 0; k < N; k++) {
    if (linksIn(rowsFor(a, 2 * FIRST_LOOK, 1.5, undefined, true), LINK_ALPHA).length) pooled++
    if (linksIn(rowsFor(b, 2 * FIRST_LOOK, 1.5), LINK_ALPHA).length) within++
  }
  note(`a drifting season, one look at 5%: pooled ${pct(pooled, N)}, within sittings ${pct(within, N)}`)
  assert(within / N <= LINK_ALPHA, `within sittings named a link in ${pct(within, N)}`)
  assert(pooled / N > 2 * LINK_ALPHA, `pooled named only ${pct(pooled, N)}: the confound this guards against is not in the histories`)
})

check('a strong link is found at the stated rate, and a weaker one is said to be hard', () => {
  // Stated: at least 10% of players at 48 tagged serves, 25% at 96, 60% at 192.
  const floors: Record<number, number> = { [FIRST_LOOK]: 0.1, [2 * FIRST_LOOK]: 0.25, [4 * FIRST_LOOK]: 0.6 }
  const N = 400
  const found: string[] = []
  for (const [planted, name] of [
    [STRONG, 'strong'],
    [WEAKER, 'weaker'],
  ] as const) {
    for (const n of [FIRST_LOOK / 2, FIRST_LOOK, 2 * FIRST_LOOK, 4 * FIRST_LOOK]) {
      const random = stream(n + (name === 'strong' ? 0 : 7))
      let hit = 0
      let wrong = 0
      // Before the first look nothing is asked; what a look there would have
      // found is counted anyway, as the case for `FIRST_LOOK` (2.5%, half the rate).
      let early = 0
      for (let k = 0; k < N; k++) {
        const rows = rowsFor(random, n, 0, planted)
        const links = linksAtLook(rows)
        if (links.some((l) => l.flaw === FAULTS[0] && l.miss === 'net')) hit++
        if (links.some((l) => l.flaw !== FAULTS[0])) wrong++
        if (n < FIRST_LOOK && linksIn(rows, LINK_ALPHA / 2).some((l) => l.flaw === FAULTS[0] && l.miss === 'net')) early++
      }
      found.push(`${name} at ${n}: ${pct(hit, N)}${n < FIRST_LOOK ? ` (a look there would find ${pct(early, N)})` : ''}`)
      if (name === 'strong' && floors[n] !== undefined) {
        assert(hit / N >= floors[n], `a strong link at ${n} serves was found ${pct(hit, N)}, under ${100 * floors[n]}%`)
      }
      if (n < FIRST_LOOK) assert(hit === 0, `a link was named before the first look, at ${n}`)
      // The faults with nothing planted on them stay quiet while one is linked.
      assert(wrong / N <= LINK_ALPHA, `${pct(wrong, N)} of ${name} histories at ${n} named an unlinked fault`)
    }
  }
  note(found.join(' · '))
})

heading('Nothing is a fault that was not read')

const finding = (flaw: FlawId, detected: boolean, confidence = 0.9, extra: Partial<FlawFinding> = {}): FlawFinding => ({
  flaw,
  detected,
  signal: flaw,
  value: 1,
  unit: 'ratio',
  miss: detected ? 0.1 : 0,
  target: [0, 1],
  target_tier: 5,
  severity: detected ? 'medium' : 'none',
  confidence,
  ...extra,
})

check('a reading the camera could not take is neither a fault nor a clean serve', () => {
  const read = faultsOf([finding('low_contact', true), finding('toss_drift', false), finding('collapsed_elbow', true, 0.3)])
  assert(read.low_contact === true, 'a named fault was not read as one')
  assert(read.toss_drift === false, 'a fault read and not named was not read as clean')
  assert(read.collapsed_elbow === undefined, `a reading under the bar to name anything read as ${read.collapsed_elbow}`)
  assert(read.no_leg_drive === undefined, 'a fault with no reading at all was given an answer')
  assert(faultsOf([finding('low_contact', true, 0.9, { value: Number.NaN })]).low_contact === undefined, 'a reading with no number counted')
})

/* -------------------------------------------------- from the history -- */

const DAY = 24 * 3600 * 1000
const MINUTE = 60_000

interface Serve {
  at: number
  outcome?: ServeOutcome
  serveNumber?: 1 | 2
  /** Named, read and not named, or unread (absent). */
  faults: Partial<Record<FlawId, boolean | 'unread'>>
  serveType?: Session['serveType']
}

/** A history of saved serves and their tags, from a plain description. */
function historyOf(serves: Serve[]): { sessions: Session[]; tags: ServeTag[] } {
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  serves.forEach((s, i) => {
    const id = `h${i}`
    const flaws = Object.entries(s.faults).map(([flaw, v]) =>
      v === 'unread' ? finding(flaw as FlawId, false, 0.3) : finding(flaw as FlawId, v as boolean),
    )
    sessions.push({
      id,
      createdAt: s.at,
      serveType: s.serveType ?? 'flat',
      scoringVersion: 1,
      quality: { view: 'side' },
      triage: { status: 'ok' },
      diagnosis: { flaws },
    } as unknown as Session)
    if (s.outcome || s.serveNumber) tags.push({ id, outcome: s.outcome, serveNumber: s.serveNumber, taggedAt: s.at })
  })
  return { sessions, tags }
}

/**
 * Three sittings of 16 (48 serves): eight into the net and eight in at each.
 * `withNet` of the net serves and `withIn` of the in serves show `flaw`.
 */
function sittings(flaw: FlawId, withNet: number, withIn: number, extra: Partial<Serve> = {}, count = 3): Serve[] {
  const out: Serve[] = []
  for (let day = 0; day < count; day++) {
    for (let i = 0; i < 16; i++) {
      const net = i < 8
      const has = net ? i < withNet : i - 8 < withIn
      out.push({ at: (day + 1) * 3 * DAY + i * MINUTE, outcome: net ? 'net' : 'in', faults: { [flaw]: has }, ...extra })
    }
  }
  return out
}

/** The serve on screen, filmed after the history, unless said otherwise. */
const onScreen = (at = 30 * DAY, serveType: Session['serveType'] = 'flat') =>
  ({ id: 'now', createdAt: at, serveType, scoringVersion: 1 }) as Session

heading('From the tags to the links')

check('a planted link in a tagged history is found, and its counts are the taps', () => {
  const { sessions, tags } = historyOf(sittings('low_contact', 6, 2))
  const links = missLinks(onScreen(), sessions, tags)
  assert(links.length === 1, `${links.length} links`)
  const [l] = links
  assert(l.flaw === 'low_contact' && l.miss === 'net', `${l.flaw} with ${l.miss}`)
  assert(l.withFault.miss === 18 && l.without.miss === 6 && l.withFault.in === 6 && l.without.in === 18, JSON.stringify(l))
  note(`p = ${l.p.toExponential(2)}: ${linkLine(l, true)}`)
})

check(`too few tags, or nothing past chance, and there is no link`, () => {
  const strong = sittings('low_contact', 6, 2)
  const few = historyOf(strong.slice(0, FIRST_LOOK - 1))
  assert(missLinks(onScreen(), few.sessions, few.tags).length === 0, `a link from ${FIRST_LOOK - 1} tagged serves`)
  const even = historyOf(sittings('low_contact', 4, 4))
  assert(missLinks(onScreen(), even.sessions, even.tags).length === 0, 'a link from a fault that showed on half of each')
  // The tags are what counts: the same serves with no outcome tapped say nothing.
  const untold = historyOf(strong.map((s) => ({ ...s, outcome: undefined })))
  assert(missLinks(onScreen(), untold.sessions, untold.tags).length === 0, 'a link from serves nobody tagged')
})

check('an unread fault on the misses is not read as the fault', () => {
  // Every net serve has the reading unread, every in serve has it read and
  // clean. Counting "unread" as the fault would make a perfect link of it.
  const serves = sittings('low_contact', 0, 0).map((s) =>
    s.outcome === 'net' ? { ...s, faults: { low_contact: 'unread' as const } } : s,
  )
  const { sessions, tags } = historyOf(serves)
  assert(missLinks(onScreen(), sessions, tags).length === 0, 'an unread fault became a link')
})

check('only serves like this one, filmed before it, are compared', () => {
  const strong = sittings('low_contact', 6, 2)
  // Filmed after the serve on screen.
  const later = historyOf(strong)
  assert(missLinks(onScreen(DAY), later.sessions, later.tags).length === 0, 'serves filmed after it were read')
  // Another serve type.
  const kicks = historyOf(strong.map((s) => ({ ...s, serveType: 'kick' as const })))
  assert(missLinks(onScreen(), kicks.sessions, kicks.tags).length === 0, 'kicks were read against a flat serve')
  // Tagged second serves are a different serve: read for a second, not a first.
  const seconds = historyOf(strong.map((s) => ({ ...s, serveNumber: 2 as const })))
  assert(missLinks(onScreen(), seconds.sessions, seconds.tags).length === 0, 'second serves were read against a first')
  const asSecond = [...seconds.tags, { id: 'now', serveNumber: 2 as const, taggedAt: 30 * DAY }]
  assert(missLinks(onScreen(), seconds.sessions, asSecond).length === 1, 'a second serve did not read the seconds')
})

/* ------------------------------------------------------- on the report -- */

/**
 * The serve on screen: the tossing arm first (the toss group), then the legs,
 * the elbow and the shoulders; the low contact fifth, held back by the cap.
 * Level 5, so the order is the default one.
 */
const OWN: FlawFinding[] = [
  finding('toss_arm_drops', true, 1, { severity: 'high' }),
  finding('no_leg_drive', true, 0.7),
  finding('collapsed_elbow', true, 0.9),
  finding('early_shoulder_rotation', true, 0.9),
  finding('low_contact', true, 0.9),
]

function reportOf(flaws: FlawFinding[] = OWN): { triage: Triage; diagnosis: Diagnosis } {
  const primary = flaws[0]
  return {
    triage: {
      schema: 1,
      status: 'ok',
      tier: { current: 5, target: 6 },
      primary_flaw: { ...primary, group: 'toss', unit: 'ratio' },
      injury_risk: [],
    } as unknown as Triage,
    diagnosis: { flaws } as unknown as Diagnosis,
  }
}

const link = (flaw: FlawId, miss = 'net', p = 1e-4): MissLink => ({
  flaw,
  miss,
  withFault: { miss: 18, in: 6 },
  without: { miss: 6, in: 18 },
  p,
})

const flawsOf = (plan: Analysis['focus'][]) => plan.map((p) => p.flaw).join(' > ')

heading('What the report does with a link')

check('with no link the plan is the causal plan, word for word, with no lines', () => {
  const { triage, diagnosis } = reportOf()
  const plain = causalPlan(triage, diagnosis)
  const linked = linkedPlan(triage, diagnosis, [])
  assert(JSON.stringify(linked.plan) === JSON.stringify(plain), `${flawsOf(linked.plan)} against ${flawsOf(plain)}`)
  assert(Object.keys(linked.why).length === 0, 'a line with no link')
  // A link to a fault this serve does not show changes nothing either.
  const elsewhere = linkedPlan(triage, diagnosis, [link('toss_drift')])
  assert(JSON.stringify(elsewhere.plan) === JSON.stringify(plain) && !Object.keys(elsewhere.why).length, 'a link to a fault not on this serve moved the plan')
  note(`the plan: ${flawsOf(plain)}`)
})

check('a linked fix moves up behind the first, and says why in my voice', () => {
  const { triage, diagnosis } = reportOf()
  const { plan, why } = linkedPlan(triage, diagnosis, [link('early_shoulder_rotation', 'long')])
  assert(
    flawsOf(plan) === 'toss_arm_drops > early_shoulder_rotation > no_leg_drive > collapsed_elbow',
    flawsOf(plan),
  )
  const line = why.early_shoulder_rotation ?? ''
  assert(line.startsWith('I moved this up.'), `"${line}"`)
  assert(line.includes('serves that went long'), `"${line}"`)
  assert(cueIssues(line).length === 0, cueIssues(line).join('; '))
  note(line)
})

check('the first fix never moves, and its own link is said under it, not as a move', () => {
  const { triage, diagnosis } = reportOf()
  const { plan, why } = linkedPlan(triage, diagnosis, [link('toss_arm_drops'), link('no_leg_drive', 'wide')])
  assert(flawsOf(plan) === flawsOf(causalPlan(triage, diagnosis)), flawsOf(plan))
  assert(why.toss_arm_drops !== undefined && !why.toss_arm_drops.startsWith('I moved'), `"${why.toss_arm_drops}"`)
  // Already second, so not moved either.
  assert(why.no_leg_drive !== undefined && !why.no_leg_drive.startsWith('I moved'), `"${why.no_leg_drive}"`)
})

check('a linked fault the cap held back comes in, and the plan keeps its length', () => {
  const { triage, diagnosis } = reportOf()
  const before = causalPlan(triage, diagnosis)
  const { plan, why } = linkedPlan(triage, diagnosis, [link('low_contact')])
  assert(!before.some((p) => p.flaw === 'low_contact'), 'the low contact was not held back to begin with')
  assert(flawsOf(plan) === 'toss_arm_drops > low_contact > no_leg_drive > collapsed_elbow', flawsOf(plan))
  assert(plan.length === before.length, `${plan.length} drills against ${before.length}`)
  assert(why.low_contact?.startsWith('I moved this up.') === true, `"${why.low_contact}"`)
})

check('a rough reading on this serve does not pass a firm one', () => {
  const rough = OWN.map((f) => (f.flaw === 'collapsed_elbow' ? { ...f, confidence: 0.5 } : f))
  const { triage, diagnosis } = reportOf(rough)
  const { plan, why } = linkedPlan(triage, diagnosis, [link('collapsed_elbow')])
  const at = plan.findIndex((p) => p.flaw === 'collapsed_elbow')
  const firmAfter = plan.slice(at + 1).filter((p) => p.flaw !== 'collapsed_elbow' && p.flaw !== 'toss_arm_drops')
  assert(at === -1 || firmAfter.length === 0, `a rough reading went ahead of a firm one: ${flawsOf(plan)}`)
  if (at >= 0) assert(!why.collapsed_elbow?.startsWith('I moved'), `"${why.collapsed_elbow}"`)
})

check('several links keep the causal order among themselves', () => {
  const { triage, diagnosis } = reportOf()
  const { plan } = linkedPlan(triage, diagnosis, [link('early_shoulder_rotation', 'long', 1e-6), link('collapsed_elbow', 'net', 1e-3)])
  assert(flawsOf(plan) === 'toss_arm_drops > collapsed_elbow > early_shoulder_rotation > no_leg_drive', flawsOf(plan))
})

heading('The lines')

check('every line is first person when it moves a fix, 25 words, two sentences, and passes the lint', () => {
  const lines: string[] = []
  for (const miss of ['net', 'long', 'wide']) {
    for (const moved of [true, false]) {
      // The longest counts a phone could hold, so no number spells past the ceiling.
      const big: MissLink = { flaw: 'low_contact', miss, withFault: { miss: 999, in: 999 }, without: { miss: 999, in: 999 }, p: 0 }
      const line = linkLine(big, moved)
      lines.push(line)
      assert(cueIssues(line).length === 0, `"${line}": ${cueIssues(line).join('; ')}`)
      assert(wordCount(line) <= 25 && sentenceCount(line) <= 2, `"${line}"`)
      if (moved) assert(/^I\b/.test(line), `"${line}" is not in the first person`)
    }
  }
  note(lines[0])
})

heading('On the real engine')

/** A rig serve, read by the real engine, saved as a report and tagged. */
function engineServe(dials: Partial<ServeDials>, seed: number, at: number): Session {
  const a = sampleAnalysis({ noise: 0.004, seed, ...dials })
  const { frames: _f, ...rest } = a as Analysis
  void _f
  return { ...rest, id: `e${seed}`, createdAt: at } as Session
}

check("the engine's own diagnoses carry a planted link into the report's plan", () => {
  // Three sittings of 16: the net serves mostly met low (the engine names a low
  // contact at a reach of 1.05 and not at 1.25), the ones that went in mostly not.
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  let seed = 400
  for (let day = 0; day < 3; day++) {
    for (let i = 0; i < 16; i++) {
      const net = i < 8
      const low = net ? i < 6 : i - 8 < 2
      const s = engineServe({ contactReach: low ? 1.05 : 1.25 }, seed++, (day + 1) * 3 * DAY + i * MINUTE)
      sessions.push(s)
      tags.push({ id: s.id, outcome: net ? 'net' : 'in', taggedAt: s.createdAt })
    }
  }
  const now = engineServe({ contactReach: 1.05 }, 999, 30 * DAY)
  const links = missLinks(now, sessions, tags)
  assert(links.some((l) => l.flaw === 'low_contact' && l.miss === 'net'), `links: ${links.map((l) => `${l.flaw}/${l.miss}`).join(', ') || 'none'}`)
  const before = causalPlan(now.triage, now.diagnosis)
  const { plan, why } = linkedPlan(now.triage, now.diagnosis, links)
  note(`${flawsOf(before)}  becomes  ${flawsOf(plan)}`)
  assert(plan[0].flaw === before[0].flaw, 'the first fix moved')
  assert(plan[1]?.flaw === 'low_contact', `second is ${plan[1]?.flaw}`)
  assert(plan.length === before.length, 'the plan changed length')
  if (before.findIndex((p) => p.flaw === 'low_contact') > 1) assert(why.low_contact?.startsWith('I moved this up.') === true, `"${why.low_contact}"`)

  // The same serves tagged in and net in turn, which spreads the low reach
  // evenly over both: nothing.
  const evenTags = tags.map((t, i) => ({ ...t, outcome: (i % 2 ? 'net' : 'in') as ServeOutcome }))
  const quiet = missLinks(now, sessions, evenTags)
  assert(!quiet.some((l) => l.flaw === 'low_contact'), `a link from evenly spread tags: ${quiet.map((l) => l.flaw).join(', ')}`)
})

check(`the minimum split is ${MIN_SIDE} a side`, () => {
  // Six net serves with the fault against none in, perfectly split, are too few
  // to say anything however clear, which is what the minimum is for.
  const rows: Row[] = []
  for (let i = 0; i < 6; i++) rows.push({ outcome: 'net', stratum: 'a', faults: { low_contact: true } })
  for (let i = 0; i < 60; i++) rows.push({ outcome: 'in', stratum: 'a', faults: { low_contact: false } })
  assert(linksIn(rows, LINK_ALPHA).length === 0, 'six a side was asked')
  rows.push({ outcome: 'net', stratum: 'a', faults: { low_contact: true } })
  assert(linksIn(rows, LINK_ALPHA).length === 1, 'seven a side, perfectly split, was not found')
})

report()
