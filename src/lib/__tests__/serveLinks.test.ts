/**
 * What a player's fastest and in-court serves share (lift item 14), and mostly,
 * when to say nothing.
 *
 * Seeded readings carry the statistics, because a false-alarm rate needs
 * hundreds of histories. The real engine on the rig carries the proof that real
 * report rows behave, with a speed and an outcome tagged on, since the rig flies
 * no ball.
 *
 * WHAT THIS PROVES. Consistency, not accuracy. The histories are synthetic, so
 * a rate below is the test keeping its stated rate on the noise it was given. It
 * says nothing about how often a link is true of a real player's serve.
 */
import { HOLDS_WITHOUT, LINK_FDR, MAX_LINKS, MIN_LINK_SERVES, discoveries, linkLine, permutationP, serveLinks, withinStrata } from '../serveLinks'
import { ROW_WORDS } from '../baseline'
import { missesInCommon } from '../progress'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { CARD_NOISE_SD } from '../analysis/cardNoise'
import { METRICS } from '../analysis/coaching'
import { MAX_WORDS, command, cueIssues, wordCount } from '../analysis/voice'
import type { ServeDials } from '../analysis/syntheticServe'
import type { ServeOutcome, ServeTag, Session } from '../storage/db'
import { assert, check, heading, near, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ROWS = Object.keys(CARD_NOISE_SD)
const VERSION = 5

function seeded(seed: number) {
  let a = seed | 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform())
  return { uniform, normal }
}

const middle = (id: string) => (METRICS[id].ideal[0] + METRICS[id].ideal[1]) / 2

/** A reading the way `readingOf` finds one, ±3%: a good clip's range, wide enough to mean it. */
const speedAt = (ms: number) => ({
  speed: { ms, low: ms * 0.97, high: ms * 1.03, samples: 6, span: 0.08, depthAngle: 4 },
})

let ids = 0

function stub(at: number, values: Record<string, number>, ms?: number, over: Partial<Session> = {}): Session {
  const metrics = Object.entries(values).map(([id, value]) => ({
    id,
    label: METRICS[id].label,
    value,
    unit: METRICS[id].unit,
    decimals: METRICS[id].decimals,
    ideal: METRICS[id].ideal,
    confidence: 1,
    score: 70,
  }))
  return {
    id: `serve-l${ids++}-0`,
    createdAt: at,
    overall: 70,
    serveType: 'flat',
    scoringVersion: VERSION,
    triage: { status: 'ok' },
    quality: { view: 'side' },
    fundamentals: [{ id: 'toss', score: 70, metrics }],
    ...(ms === undefined ? {} : { speed: speedAt(ms) }),
    ...over,
  } as unknown as Session
}

/** When the `i`th of a history's serves was filed: a week between trips. */
const when = (i: number, trips: number, serves: number) => {
  const perTrip = Math.ceil(serves / trips)
  return Math.floor(i / perTrip) * 7 * DAY + (i % perTrip) * 0.1 * HOUR
}

/**
 * A history where every row is pure noise at `ratio` camera noises, every speed
 * wide enough for the two ends' ranges to clear, every outcome a coin flip.
 */
function noiseHistory(r: ReturnType<typeof seeded>, serves: number, trips: number, ratio = 8) {
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  const misses: ServeOutcome[] = ['net', 'long', 'wide']
  for (let i = 0; i < serves; i++) {
    const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * ratio * r.normal()]))
    const s = stub(when(i, trips, serves), values, 36 + 4 * r.normal())
    sessions.push(s)
    const outcome = r.uniform() < 0.5 ? 'in' : misses[Math.floor(r.uniform() * 3)]
    tags.push({ id: s.id, outcome, taggedAt: s.createdAt })
  }
  return { sessions, tags }
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`

/** Six a trip, speed `fast ?? slow` by position, `kneeBend` following it inside each trip. */
function plantedSpeed(serves: number, trips: number, seed: number, strength = 1) {
  const r = seeded(seed)
  const sessions: Session[] = []
  for (let i = 0; i < serves; i++) {
    const z = r.normal()
    const knee = 50 + CARD_NOISE_SD.kneeBend * (strength * 4 * z + r.normal())
    const values = { ...Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * r.normal()])), kneeBend: knee }
    sessions.push(stub(when(i, trips, serves), values, 36 + 4 * z))
  }
  return sessions
}

/** In-court serves with `row` higher by `gap`, misses of the kinds given. */
function plantedOutcome(row: string, gap: number, misses: ServeOutcome[], inServes = 16, seed = 4) {
  const r = seeded(seed)
  const outcomes: ServeOutcome[] = [...Array.from({ length: inServes }, (): ServeOutcome => 'in'), ...misses]
  const order = outcomes.map((o, i) => ({ o, k: r.uniform(), i })).sort((a, b) => a.k - b.k)
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  order.forEach(({ o }, i) => {
    const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * 0.8 * r.normal()]))
    if (o === 'in') values[row] += gap
    const s = stub(when(i, 5, order.length), values)
    sessions.push(s)
    tags.push({ id: s.id, outcome: o, taggedAt: s.createdAt })
  })
  return { sessions, tags }
}

heading('The test itself')

check('a shuffle within a stratum keeps a trip\'s labels inside it', () => {
  const samples = (values: number[], stratum: string) => values.map((value) => ({ value, stratum }))
  // Every trip's serves all sit on one side: nothing to shuffle, so never a link.
  const p = permutationP(samples([9, 9, 9, 9, 9, 9, 9], 'a'), samples([1, 1, 1, 1, 1, 1, 1], 'b'), seeded(1).uniform)
  assert(p === 1, `a difference between two days came out at p ${p}`)
  // The same numbers in one stratum are as strong as a test of this size gets.
  const same = permutationP(samples([9, 9, 9, 9, 9, 9, 9], 'a'), samples([1, 1, 1, 1, 1, 1, 1], 'a'), seeded(1).uniform)
  assert(same < 0.002, `seven against seven in one trip came out at p ${same}`)
})

check('only a day holding both sides counts, and only for how it splits', () => {
  const samples = (values: number[], stratum: string) => values.map((value) => ({ value, stratum }))
  const { a, b } = withinStrata(
    [...samples([10, 12], 'both'), ...samples([100], 'ours only')],
    [...samples([8, 6], 'both'), ...samples([-100], 'theirs only')],
  )
  assert(a.length === 2 && b.length === 2, 'a day with one side in it was counted')
  // The day's mean is 9: what is left is the split, not how high the day read.
  assert(JSON.stringify([...a, ...b].map((s) => s.value)) === '[1,3,-1,-3]', JSON.stringify([...a, ...b]))
})

check('the smallest p seven a side can reach clears the first step of the correction', () => {
  const samples = (values: number[]) => values.map((value) => ({ value, stratum: 'a' }))
  const p = permutationP(samples([9, 9, 9, 9, 9, 9, 9]), samples([1, 1, 1, 1, 1, 1, 1]), seeded(2).uniform)
  assert(p <= LINK_FDR / 28, `p ${p} cannot pass 28 rows at ${LINK_FDR}`)
})

check('a permutation p is a p: flat on noise', () => {
  const r = seeded(9)
  let below = 0
  const runs = 2000
  for (let k = 0; k < runs; k++) {
    const side = (n: number) => Array.from({ length: n }, (_, i) => ({ value: r.normal(), stratum: `t${i % 3}` }))
    if (permutationP(side(9), side(9), r.uniform) <= LINK_FDR) below++
  }
  note(`noise under ${pct(LINK_FDR)}: ${pct(below / runs)}`)
  near(below / runs, LINK_FDR, 0.015, 'the share of noise under the line')
})

check('Benjamini-Hochberg steps up to the largest p under its line', () => {
  const ps = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216].map((p) => ({ p }))
  assert(discoveries(ps, 0.05).length === 2, `${discoveries(ps, 0.05).length} found on the textbook list`)
  assert(discoveries(ps, 0.3).length === 10, 'a generous rate found less than everything')
  assert(discoveries([{ p: 0.04 }, { p: 0.03 }], 0.05).length === 2, 'the step up did not carry the smaller p with it')
  assert(discoveries([{ p: 0.06 }, { p: 0.5 }], 0.05).length === 0, 'something was found over the line')
  assert(discoveries([], 0.05).length === 0, 'something was found in nothing')
})

heading('A link that is there')

check('a planted link between speed and the knees is found, as association', () => {
  const sessions = plantedSpeed(36, 6, 3)
  const links = serveLinks(sessions, [])
  note(links.map((l) => `${l.line} (${l.gap}${l.unit}, p ${l.p.toFixed(4)})`).join(' · ') || 'nothing')
  const knee = links.find((l) => l.metricId === 'kneeBend')
  assert(knee?.kind === 'speed' && knee.direction === 'higher', JSON.stringify(links))
  assert(knee!.line === 'Your fastest serves **bend the knees further** than your slower ones.', knee!.line)
  assert(knee!.gap > CARD_NOISE_SD.kneeBend && knee!.serves === 12 && knee!.others === 12, JSON.stringify(knee))
})

check('the same link running the other way is said the other way', () => {
  const sessions = plantedSpeed(36, 6, 3, -1)
  const knee = serveLinks(sessions, []).find((l) => l.metricId === 'kneeBend')
  assert(knee?.direction === 'lower' && knee.line.includes('**bend the knees less**'), JSON.stringify(knee))
})

check('a link in what went in is found, when no one kind of miss has enough to say it', () => {
  const misses = ['net', 'long', 'wide'].flatMap((m) => Array.from({ length: 4 }, () => m as ServeOutcome))
  const { sessions, tags } = plantedOutcome('contactHeight', 4 * CARD_NOISE_SD.contactHeight, misses)
  const withSignal = sessions.map((s) => ({
    ...s,
    diagnosis: { signals: { contact_height_ratio: s.fundamentals[0].metrics.find((m) => m.id === 'contactHeight')!.value } },
  })) as unknown as Session[]
  assert(missesInCommon(withSignal, tags).length === 0, 'the fixture lost its point: one miss could say this')
  const links = serveLinks(withSignal, tags)
  note(links.map((l) => l.line).join(' · ') || 'nothing')
  assert(links[0]?.kind === 'outcome' && links[0].metricId === 'contactHeight' && links[0].direction === 'higher', JSON.stringify(links))
  assert(links[0].line === 'Your serves that go in **meet the ball higher** than your misses.', links[0].line)
})

check('what the misses already said is not said twice', () => {
  // Every miss in the net, and low: `missesInCommon` reads this itself. It reads
  // from the diagnosis, so these stubs carry the signal it reads.
  const { sessions, tags } = plantedOutcome('contactHeight', 4 * CARD_NOISE_SD.contactHeight, Array.from({ length: 12 }, (): ServeOutcome => 'net'))
  const withSignal = sessions.map((s) => ({
    ...s,
    diagnosis: { signals: { contact_height_ratio: s.fundamentals[0].metrics.find((m) => m.id === 'contactHeight')!.value } },
  })) as unknown as Session[]
  assert(missesInCommon(withSignal, tags).some((m) => m.signal === 'contact_height_ratio'), 'the fixture lost its point: the misses said nothing')
  const links = serveLinks(withSignal, tags)
  assert(!links.some((l) => l.metricId === 'contactHeight'), `said twice: ${links.map((l) => l.line).join(' / ')}`)
  // A row the misses never read still gets its link.
  const { sessions: knees, tags: kneeTags } = plantedOutcome('kneeBend', 4 * CARD_NOISE_SD.kneeBend, Array.from({ length: 12 }, (): ServeOutcome => 'net'))
  assert(serveLinks(knees, kneeTags).some((l) => l.metricId === 'kneeBend'), 'a row the misses cannot read lost its link')
})

check('at most two links, each on its own row, strongest first', () => {
  const r = seeded(6)
  const serves = 36
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  for (let i = 0; i < serves; i++) {
    const z = r.normal()
    const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * (6 * z + r.normal())]))
    const s = stub(when(i, 6, serves), values, 36 + 4 * z)
    sessions.push(s)
    tags.push({ id: s.id, outcome: z > 0 ? 'in' : 'net', taggedAt: s.createdAt })
  }
  const links = serveLinks(sessions, tags)
  note(`${links.length} links from a history where every row follows the speed`)
  assert(links.length === MAX_LINKS, `${links.length} links`)
  assert(new Set(links.map((l) => l.metricId)).size === links.length, 'one row said twice')
  assert(links[0].p <= links[1].p, 'not strongest first')
})

check('one row is said once, even when both questions find it', () => {
  const r = seeded(31)
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  for (let i = 0; i < 36; i++) {
    const z = r.normal()
    const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * r.normal()]))
    values.kneeBend = 50 + CARD_NOISE_SD.kneeBend * (6 * z + r.normal())
    const s = stub(when(i, 6, 36), values, 36 + 4 * z)
    sessions.push(s)
    tags.push({ id: s.id, outcome: z > 0 ? 'in' : 'net', taggedAt: s.createdAt })
  }
  const links = serveLinks(sessions, tags)
  assert(links.length === 1 && links[0].metricId === 'kneeBend', links.map((l) => l.line).join(' / '))
})

heading('The gates')

check('too few on a side says nothing, however big the gap', () => {
  const { sessions, tags } = plantedOutcome('kneeBend', 8 * CARD_NOISE_SD.kneeBend, Array.from({ length: MIN_LINK_SERVES - 1 }, (): ServeOutcome => 'net'), 30)
  assert(serveLinks(sessions, tags).length === 0, 'six misses were enough to say something')
  const speed = plantedSpeed(3 * MIN_LINK_SERVES - 1, 3, 3, 1)
  assert(serveLinks(speed, []).length === 0, `${speed.length} speeds were enough for two thirds of seven`)
})

check('speeds the reader cannot tell apart are not "fastest"', () => {
  // Knees that really follow the figure, on speeds inside each other's ranges.
  const sessions = plantedSpeed(36, 6, 3).map((s) => {
    const { ms } = (s.speed as unknown as { speed: { ms: number } }).speed
    const close = 36 + (ms - 36) * 0.1
    return { ...s, speed: speedAt(close) } as unknown as Session
  })
  assert(serveLinks(sessions, []).length === 0, 'a link on speeds whose ranges overlap')
})

check('a gap inside one take of the camera says nothing, however steady the serves', () => {
  const r = seeded(8)
  const sessions: Session[] = []
  for (let i = 0; i < 36; i++) {
    const fast = i % 2 === 0
    // Half a camera noise between the two ends, with next to no spread at all.
    const knee = 50 + (fast ? 0.5 : 0) * CARD_NOISE_SD.kneeBend + 0.01 * r.normal()
    sessions.push(stub(when(i, 6, 36), { ...Object.fromEntries(ROWS.map((id) => [id, middle(id)])), kneeBend: knee }, fast ? 42 + r.uniform() : 30 + r.uniform()))
  }
  assert(serveLinks(sessions, []).length === 0, 'a gap the camera could have made was said')
})

check('a season\'s drift is not a link: speed and the knees rising together, trip by trip', () => {
  // Faster and deeper from one trip to the next, and nothing between them inside
  // a trip. Pooled, the two rise as one. A shuffle across trips would call it a link.
  let said = 0
  const runs = 100
  for (let k = 0; k < runs; k++) {
    const r = seeded(100 + k)
    const trips = 6
    const sessions: Session[] = []
    for (let t = 0; t < trips; t++) {
      for (let i = 0; i < 6; i++) {
        const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * r.normal()]))
        values.kneeBend = 30 + 6 * t + CARD_NOISE_SD.kneeBend * r.normal()
        sessions.push(stub(t * 7 * DAY + i * 0.1 * HOUR, values, 30 + 2.4 * t + r.normal()))
      }
    }
    if (serveLinks(sessions, []).some((l) => l.metricId === 'kneeBend')) said++
  }
  note(`a drift across six trips raised a link in ${pct(said / runs)} of histories`)
  assert(said / runs <= LINK_FDR, `${pct(said / runs)} of drifting histories raised a link`)
})

check('nor is a player who simply misses less as their knees improve over a season', () => {
  // More in, deeper knees, trip by trip, and nothing between the two on any one
  // day. Only a shuffle inside the trip can tell this from a link.
  let said = 0
  const runs = 100
  for (let k = 0; k < runs; k++) {
    const r = seeded(300 + k)
    const sessions: Session[] = []
    const tags: ServeTag[] = []
    for (let t = 0; t < 7; t++) {
      for (let i = 0; i < 6; i++) {
        const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * r.normal()]))
        values.kneeBend = 30 + 6 * t + CARD_NOISE_SD.kneeBend * r.normal()
        const s = stub(t * 7 * DAY + i * 0.1 * HOUR, values)
        sessions.push(s)
        tags.push({ id: s.id, outcome: r.uniform() < 0.15 + 0.12 * t ? 'in' : 'net', taggedAt: 1 })
      }
    }
    if (serveLinks(sessions, tags).some((l) => l.metricId === 'kneeBend')) said++
  }
  note(`a season of improving outcomes raised a link in ${pct(said / runs)} of histories`)
  assert(said / runs <= LINK_FDR, `${pct(said / runs)} of drifting histories raised a link`)
})

check('a phone moved between trips is not a link either', () => {
  // The serves on the second angle read deeper, and happen to be the fast ones.
  const r = seeded(13)
  const sessions: Session[] = []
  for (let i = 0; i < 36; i++) {
    const moved = i % 2 === 0
    const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * r.normal()]))
    values.kneeBend = (moved ? 60 : 40) + CARD_NOISE_SD.kneeBend * r.normal()
    const over = { quality: { view: moved ? 'angled' : 'side' } } as Partial<Session>
    sessions.push(stub(when(i, 3, 36), values, (moved ? 42 : 32) + r.normal(), over))
  }
  assert(!serveLinks(sessions, []).some((l) => l.metricId === 'kneeBend'), 'a change of angle read as a link')
})

heading('Like with like')

check('other serve types never mix', () => {
  const r = seeded(14)
  const sessions: Session[] = []
  // Flat serves fast and deep, kicks slow and shallow: only the type differs.
  for (let i = 0; i < 40; i++) {
    const flat = i % 2 === 0
    const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * r.normal()]))
    values.kneeBend = (flat ? 60 : 40) + CARD_NOISE_SD.kneeBend * r.normal()
    sessions.push(stub(when(i, 4, 40), values, (flat ? 44 : 30) + r.normal(), { serveType: flat ? 'flat' : 'kick' } as Partial<Session>))
  }
  assert(serveLinks(sessions, [], { serveType: 'flat' }).length === 0, 'a kick was set against a flat serve')
  assert(serveLinks(sessions, [], { serveType: 'kick' }).length === 0, 'a flat serve was set against a kick')
})

check('other scoring versions never mix', () => {
  const r = seeded(15)
  const sessions: Session[] = []
  for (let i = 0; i < 40; i++) {
    const recent = i >= 20
    const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * r.normal()]))
    values.kneeBend = (recent ? 60 : 40) + CARD_NOISE_SD.kneeBend * r.normal()
    sessions.push(stub(when(i % 20, 4, 20) + (recent ? 60 * DAY : 0), values, (recent ? 44 : 30) + r.normal(), { scoringVersion: recent ? VERSION : VERSION - 1 }))
  }
  assert(serveLinks(sessions, []).length === 0, 'two rubrics were set against each other')
})

check('second serves stand apart: a slow second is not a slow serve', () => {
  const r = seeded(16)
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  for (let i = 0; i < 40; i++) {
    const second = i % 2 === 1
    const values = Object.fromEntries(ROWS.map((id) => [id, middle(id) + CARD_NOISE_SD[id] * r.normal()]))
    values.kneeBend = (second ? 40 : 60) + CARD_NOISE_SD.kneeBend * r.normal()
    const s = stub(when(i, 4, 40), values, (second ? 30 : 44) + r.normal())
    sessions.push(s)
    if (second) tags.push({ id: s.id, serveNumber: 2, taggedAt: 1 })
  }
  assert(serveLinks(sessions, tags).length === 0, 'first serves were set against second serves')
  assert(serveLinks(sessions, tags, { serveNumber: 2 }).length === 0, 'seconds were set against firsts')
})

check('refused clips and soft readings stay out', () => {
  const sessions = plantedSpeed(36, 6, 3)
  const refused = sessions.map((s) => ({ ...s, triage: { status: 'rejected' } })) as unknown as Session[]
  assert(serveLinks(refused, []).length === 0, 'refused clips made a link')
  const soft = sessions.map((s) => ({
    ...s,
    fundamentals: s.fundamentals.map((f) => ({ ...f, metrics: f.metrics.map((m) => (m.id === 'kneeBend' ? { ...m, confidence: 0.3 } : m)) })),
  }))
  assert(!serveLinks(soft, []).some((l) => l.metricId === 'kneeBend'), 'soft readings made a link')
})

check('one history, one answer, in any order', () => {
  const sessions = plantedSpeed(36, 6, 3)
  const shuffled = [...sessions].reverse()
  const a = JSON.stringify(serveLinks(sessions, []))
  assert(a === JSON.stringify(serveLinks(sessions, [])), 'the same history gave two answers')
  assert(a === JSON.stringify(serveLinks(shuffled, [])), 'the order of the list changed the answer')
})

heading('Pure noise, measured')

check('a history of pure noise raises nothing past the stated rate', () => {
  const runs = 200
  let total = 0
  for (const [serves, trips] of [[30, 5], [36, 6], [48, 8], [60, 6]]) {
    const r = seeded(serves)
    let said = 0
    for (let k = 0; k < runs; k++) {
      const { sessions, tags } = noiseHistory(r, serves, trips)
      if (serveLinks(sessions, tags).length) said++
    }
    total += said
    note(`${serves} serves over ${trips} trips: ${pct(said / runs)} of histories raised a false link`)
  }
  // Pooled, because 200 histories alone move a 5% rate by a point either way.
  const pooled = total / (4 * runs)
  note(`pooled over ${4 * runs} histories: ${pct(pooled)}`)
  assert(pooled <= LINK_FDR, `${pct(pooled)} past the stated ${pct(LINK_FDR)}`)
})

check('a player who reads their history as it grows stays near the rate too', () => {
  // The honest worst case: each reading is another chance, so this is what
  // `HOLDS_WITHOUT` is for. Without it, this fails at about 13%.
  const runs = 60
  let ever = 0
  for (let k = 0; k < runs; k++) {
    const r = seeded(500 + k)
    const { sessions, tags } = noiseHistory(r, 60, 12)
    for (let n = 24; n <= 60; n += HOLDS_WITHOUT) {
      if (serveLinks(sessions.slice(0, n), tags).length) {
        ever++
        break
      }
    }
  }
  note(`re-read every six serves from 24 to 60: ${pct(ever / runs)} of players saw a false link at some point`)
  assert(ever / runs <= 0.1, `${pct(ever / runs)} of players`)
})

/** Takes through the real engine, with a speed and an outcome that know nothing about them. */
function rigTakes(count: number, seed: number, dial: (r: ReturnType<typeof seeded>, i: number) => Partial<ServeDials>) {
  const r = seeded(seed)
  return Array.from({ length: count }, (_, i) => {
    const { frames: _f, speed: _s, ...a } = sampleAnalysis({ trophyKneeAngle: 133, contactHipHeight: 1.09, noise: 0.006, seed: seed + i, ...dial(r, i) })
    void _f
    void _s
    return { ...a, id: `rig-${seed}-${i}`, scoringVersion: VERSION } as Session
  })
}

const wandering = (r: ReturnType<typeof seeded>): Partial<ServeDials> => ({
  trophyKneeAngle: 133 + r.normal() * 7,
  contactHipHeight: 1.09 + r.normal() * 0.012,
  contactReach: 1.22 + r.normal() * 0.03,
  dropBelowShoulder: 0.08 + r.normal() * 0.05,
  shoulderTilt: 22 + r.normal() * 4,
  tossArmHold: 0.62 + r.normal() * 0.05,
  dropElbowLift: 0.4 + r.normal() * 0.15,
  motionSeconds: 1.45 + r.normal() * 0.06,
})

check('on the real engine, speed and outcome tagged at random raise nothing past the rate', () => {
  const pool = rigTakes(240, 7000, wandering)
  const r = seeded(77)
  const runs = 200
  let said = 0
  for (let k = 0; k < runs; k++) {
    const take = [...pool]
    for (let i = take.length - 1; i > 0; i--) {
      const j = Math.floor(r.uniform() * (i + 1))
      ;[take[i], take[j]] = [take[j], take[i]]
    }
    const tags: ServeTag[] = []
    const sessions = take.slice(0, 36).map((s, i) => {
      const placed = { ...s, id: `h${i}`, createdAt: when(i, 6, 36), speed: speedAt(36 + 4 * r.normal()) } as unknown as Session
      tags.push({ id: placed.id, outcome: r.uniform() < 0.5 ? 'in' : 'net', taggedAt: 1 })
      return placed
    })
    if (serveLinks(sessions, tags).length) said++
  }
  note(`a wandering player on the rig, 36 serves over 6 trips: ${pct(said / runs)} of histories raised a false link`)
  assert(said / runs <= LINK_FDR + 0.03, `${pct(said / runs)} past the stated rate`)
})

heading('Through the real engine')

check('knees that really bend further on the fast serves are found', () => {
  const r = seeded(21)
  const zs = Array.from({ length: 36 }, () => r.normal())
  const takes = rigTakes(36, 8000, (_, i) => ({ trophyKneeAngle: 133 - 9 * zs[i] }))
  const sessions = takes.map((s, i) => ({ ...s, createdAt: when(i, 6, 36), speed: speedAt(36 + 4 * zs[i]) })) as unknown as Session[]
  const links = serveLinks(sessions, [])
  note(links.map((l) => `${l.line} (${l.metricId} ${l.gap}${l.unit})`).join(' · ') || 'nothing')
  assert(links.some((l) => l.metricId === 'kneeBend' && l.direction === 'higher'), JSON.stringify(links.map((l) => l.line)))
})

check('a lower contact on the misses is found, in the words the card uses', () => {
  const r = seeded(22)
  const miss = Array.from({ length: 36 }, () => r.uniform() < 0.5)
  const takes = rigTakes(36, 9000, (_, i) => ({ contactReach: miss[i] ? 1.12 : 1.28 }))
  const tags: ServeTag[] = []
  const sessions = takes.map((s, i) => {
    const placed = { ...s, createdAt: when(i, 6, 36), diagnosis: undefined } as unknown as Session
    tags.push({ id: placed.id, outcome: miss[i] ? (i % 2 ? 'net' : 'long') : 'in', taggedAt: 1 })
    return placed
  })
  const links = serveLinks(sessions, tags)
  note(links.map((l) => `${l.line} (${l.metricId} ${l.gap}${l.unit})`).join(' · ') || 'nothing')
  assert(links.some((l) => l.line === 'Your serves that go in **meet the ball higher** than your misses.'), JSON.stringify(links.map((l) => l.line)))
})

heading('The words')

check('every row, every question, passes the editor and says association', () => {
  for (const id of ROWS) {
    for (const kind of ['speed', 'outcome'] as const) {
      for (const direction of ['higher', 'lower'] as const) {
        const line = linkLine(kind, id, direction)
        const issues = cueIssues(line)
        assert(issues.length === 0, `${issues.join('; ')}\n        "${line}"`)
        assert(command(line) === line, `the filter changes "${line}"`)
        assert(wordCount(line) <= MAX_WORDS, `${wordCount(line)} words: "${line}"`)
        assert(!/\d/.test(line), `a figure in "${line}"`)
        assert(
          !/\b(because|cause[sd]?|makes?|making|leads?|gives?|helps?|adds?|creates?|produces?|drives?|so that|in order|therefore|if you|should|must|try)\b/i.test(line.replace('drive up further', '')),
          `not association: "${line}"`,
        )
      }
    }
  }
})

check('the brief\'s own example reads as written', () => {
  assert(linkLine('speed', 'kneeBend', 'higher') === 'Your fastest serves **bend the knees further** than your slower ones.', 'the sentence moved')
  assert(ROW_WORDS.kneeBend.more === 'bend the knees further', 'the row\'s words moved')
})

report()
