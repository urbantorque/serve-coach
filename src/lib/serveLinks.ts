/**
 * What this player's fastest serves share, and what their in-court serves share
 * (lift item 14).
 *
 * A within-player link is the one kind of mechanical claim the app can make with
 * no calibration data: this person's own faster serves, set against this
 * person's own slower ones. It is also the easiest way to tell somebody
 * something false, because twenty-eight comparisons on a few dozen noisy serves
 * will turn up a difference whether or not one is there, and a history drifting
 * over a season moves everything together. So the rules are written to stay
 * silent, and silence is the common answer:
 *
 *   - one serve type, one rubric era, and first serves or second serves apart;
 *   - `MIN_LINK_SERVES` trusted readings on each side of every row tested;
 *   - a gap bigger than one take of the camera's noise on that row;
 *   - a permutation test, shuffled within a trip and a camera angle, so a link
 *     has to hold among serves filmed the same way on the same day;
 *   - Benjamini-Hochberg across every row and question tested, at `LINK_FDR`;
 *   - the same link found again with the newest serves taken away (`HOLDS_WITHOUT`);
 *   - for speed, the two sides' ranges clear of each other, so "fastest" is a
 *     thing the speed reader can stand behind (`apart`, the rule `speedTrend` keeps).
 *
 * Worded as association and never as cause. "Your fastest serves bend the knees
 * further" is a fact about this history. "Bending more makes you faster" is a
 * claim nothing here can support: a player who swings harder may bend more for
 * that reason, and a serve can be fast and in for reasons no row measures.
 *
 * `baseline.ts` says what any one serve did. `missesInCommon` says which rows
 * mark out one kind of miss, and when it has spoken about a row, this says
 * nothing about that row rather than say it twice.
 *
 * Every rate here is measured on synthetic histories by `serveLinks.test.ts`.
 * That proves consistency with the stated rate, not accuracy on real serves.
 */
import { CARD_NOISE_SD } from './analysis/cardNoise'
import { mean } from './analysis/geometry'
import { CARD_SIGNAL } from './analysis/tiers'
import { cue } from './analysis/voice'
import { ROW_WORDS, SITTING_GAP_MS, servesLike, trustedRows, type Direction, type ServeNumber } from './baseline'
import { missesInCommon, tripsOf } from './progress'
import { apart, readingOf, summarise } from './speedTrend'
import type { ServeTag, Session } from './storage/db'
import type { ServeType } from './storage/prefs'

/**
 * Trusted readings each side of a row needs.
 *
 * Seven, from the test's own arithmetic. With fourteen rows on each of two
 * questions, Benjamini-Hochberg's first step wants a p of 0.05/28, and a
 * permutation test cannot report less than 2/C(2n, n) for n serves a side: 0.0079
 * at five, 0.0022 at six, 0.0006 at seven. Under seven a side, a history asked
 * both questions could not pass however strong the link.
 * `MIN_SERVES_EACH_SIDE` is five because `missesInCommon` uses a different test.
 */
export const MIN_LINK_SERVES = 7

/** Links one history can say. More than two is a list, not a coach. */
export const MAX_LINKS = 2

/**
 * The false discovery rate across every row and question tested. On a history
 * with no links in it at all, that is also how often any link is said.
 */
export const LINK_FDR = 0.05

/**
 * Shuffles per row. Enough to resolve 0.05/28 about ten times over, and few
 * enough for a phone: a row stops as soon as it cannot pass (`permutationP`).
 */
export const PERMUTATIONS = 4999

/**
 * Serves a link has to stand without.
 *
 * A history is read again each time it grows, and every reading is another
 * chance. Re-read every six serves from 24 to 60, 13% of four hundred seeded
 * players of pure noise saw a false link at some point. Luck rarely says the same
 * thing twice about a row and a real link does, so a link has to be there with
 * the newest six serves taken away as well. That brought it to 3.8%, 7% re-read
 * every two serves, and it stops one serve's luck making a link flicker. What it
 * costs is time: a strong link is said a few serves later, and a weaker one less
 * often (a within-day correlation of 0.7 over 36 serves, said 67% to 48%).
 */
export const HOLDS_WITHOUT = 6

/** Fixed, so one history always gets one answer and nothing flickers between visits. */
const SEED = 0x5e12e

/** Which question a link answers: what the fastest share, or what the in-court serves share. */
export type LinkKind = 'speed' | 'outcome'

export interface ServeLink {
  kind: LinkKind
  metricId: string
  /** The row as the card names it. */
  label: string
  /** Which way the fastest or in-court serves sit from the others, on the row's own axis. */
  direction: Direction
  /** Their mean less the others', day by day (`withinStrata`), in the row's unit and to its decimals. */
  gap: number
  unit: string
  decimals: number
  /** Readings behind each side, from days that held both. */
  serves: number
  others: number
  /** The permutation p, before the correction across rows. */
  p: number
  /** One sentence, in the copy rules' voice. */
  line: string
}

export interface LinkOptions {
  serveType?: ServeType
  /** First serves and untagged by default. Tagged seconds are a different serve. */
  serveNumber?: ServeNumber
}

/** A seeded uniform draw (mulberry32): no state outside the call, so the answer is fixed. */
function stream(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Sample {
  value: number
  /** Serves in one stratum were filmed the same way on the same day. */
  stratum: string
}

/**
 * The two sides as one day can compare them: only strata holding both, and each
 * reading as its distance from its stratum's mean.
 *
 * A season moves speed and form together, and a moved phone moves several rows at
 * once, so a gap taken across the whole history can be neither serve's doing. A
 * day with one side in it says nothing about the two sides, and a day that read
 * high on everything says nothing about a link, so neither gets a vote: not in
 * the gap, which is what the camera gate is held against, and not in the test.
 */
export function withinStrata(a: readonly Sample[], b: readonly Sample[]): { a: Sample[]; b: Sample[] } {
  const strata = new Map<string, { sum: number; count: number; ours: number }>()
  for (const [side, ours] of [[a, 1], [b, 0]] as const) {
    for (const { value, stratum } of side) {
      const held = strata.get(stratum) ?? { sum: 0, count: 0, ours: 0 }
      strata.set(stratum, { sum: held.sum + value, count: held.count + 1, ours: held.ours + ours })
    }
  }
  const keep = (side: readonly Sample[]) =>
    side.flatMap(({ value, stratum }) => {
      const { sum, count, ours } = strata.get(stratum)!
      return ours > 0 && ours < count ? [{ value: value - sum / count, stratum }] : []
    })
  return { a: keep(a), b: keep(b) }
}

/**
 * How often shuffling the two sides' labels makes a gap this big, two-sided.
 *
 * Shuffled only inside a stratum, and that is the design: of serves filmed alike
 * on one day, do the ones on this side differ? `withinStrata` has taken out
 * whatever a day shares, so the shuffled gaps sit around nothing.
 *
 * A row out of the running stops early and reports 1: past `LINK_FDR` it can
 * never be a discovery, so the rest of the shuffles could not change the answer.
 */
export function permutationP(a: readonly Sample[], b: readonly Sample[], random: () => number): number {
  const strata = new Map<string, { value: number; ours: boolean }[]>()
  for (const [side, ours] of [[a, true], [b, false]] as const) {
    for (const { value, stratum } of side) {
      const held = strata.get(stratum)
      if (held) held.push({ value, ours })
      else strata.set(stratum, [{ value, ours }])
    }
  }
  // Laid end to end so that a shuffle is one tight loop: these lines run
  // thousands of times a row.
  const groups = [...strata.values()]
  const flat = groups.flat()
  const values = Float64Array.from(flat, (s) => s.value)
  const labels = Uint8Array.from(flat, (s) => (s.ours ? 1 : 0))
  let filled = 0
  const ends = Int32Array.from(groups, (g) => (filled += g.length))

  const total = values.reduce((sum, v) => sum + v, 0)
  const gapOf = (ours: number) => ours / a.length - (total - ours) / b.length
  const observed = Math.abs(gapOf(a.reduce((sum, s) => sum + s.value, 0)))

  const hopeless = Math.ceil(LINK_FDR * (PERMUTATIONS + 1))
  let beyond = 0
  for (let k = 0; k < PERMUTATIONS; k++) {
    let from = 0
    for (let g = 0; g < ends.length; g++) {
      const end = ends[g]
      for (let i = end - 1; i > from; i--) {
        const j = from + Math.floor(random() * (i - from + 1))
        const held = labels[i]
        labels[i] = labels[j]
        labels[j] = held
      }
      from = end
    }
    let ours = 0
    for (let i = 0; i < values.length; i++) if (labels[i]) ours += values[i]
    if (Math.abs(gapOf(ours)) >= observed - 1e-12 && ++beyond >= hopeless) return 1
  }
  return (beyond + 1) / (PERMUTATIONS + 1)
}

/**
 * Benjamini-Hochberg: the discoveries among `tests`, smallest p first. Holds
 * the share of false ones among those said at `q`, and on a history with nothing
 * in it, the chance of saying anything at all.
 */
export function discoveries<T extends { p: number }>(tests: readonly T[], q: number = LINK_FDR): T[] {
  const sorted = [...tests].sort((x, y) => x.p - y.p)
  let cut = 0
  sorted.forEach((t, i) => {
    if (t.p <= ((i + 1) / sorted.length) * q) cut = i + 1
  })
  return sorted.slice(0, cut)
}

interface Sides {
  kind: LinkKind
  ours: Session[]
  others: Session[]
}

/** One row tested on one question. */
interface Found {
  link: Omit<ServeLink, 'p'>
  p: number
}

/**
 * Each day's fastest third against that day's slowest third, the middle left out.
 *
 * Each day's, because the test can only move serves within a day. Taken over the
 * whole history, a good day would fill one side and a bad day the other, and
 * there would be nothing left to shuffle. And thirds rather than halves on both
 * counts: comparing the two ends keeps 79% of what a correlation knows against a
 * median split's 64%, and the two sides sit 1.9 spreads apart against 1.35, so
 * their ranges can clear each other on speeds a halved history could not.
 *
 * Two serves on a day still make a pair. One has nothing to be faster than.
 */
function speedSides(strata: readonly Session[][]): Sides | undefined {
  const ours: Session[] = []
  const others: Session[] = []
  for (const stratum of strata) {
    const read = stratum
      .filter((s) => readingOf(s) !== undefined)
      .sort((a, b) => readingOf(a)!.ms - readingOf(b)!.ms || a.createdAt - b.createdAt)
    if (read.length < 2) continue
    const third = Math.max(1, Math.floor(read.length / 3))
    others.push(...read.slice(0, third))
    ours.push(...read.slice(-third))
  }
  const [fastest, slowest] = [summarise(ours), summarise(others)]
  return fastest && slowest && apart(fastest, slowest) === 'faster' ? { kind: 'speed', ours, others } : undefined
}

/** Serves the player said went in, against every miss together. Which miss is `missesInCommon`'s. */
function outcomeSides(serves: readonly Session[], tags: readonly ServeTag[]): Sides {
  const outcome = new Map(tags.map((t) => [t.id, t.outcome]))
  const said = serves.filter((s) => outcome.get(s.id) !== undefined)
  return {
    kind: 'outcome',
    ours: said.filter((s) => outcome.get(s.id) === 'in'),
    others: said.filter((s) => outcome.get(s.id) !== 'in'),
  }
}

const WHO: Record<LinkKind, { these: string; others: string }> = {
  speed: { these: 'Your fastest serves', others: 'your slower ones' },
  outcome: { these: 'Your serves that go in', others: 'your misses' },
}

/** The sentence for one link. Says what goes together, never what makes what. */
export function linkLine(kind: LinkKind, metricId: string, direction: Direction): string {
  const words = ROW_WORDS[metricId][direction === 'higher' ? 'more' : 'less']
  return cue(`${WHO[kind].these} **${words}** than ${WHO[kind].others}.`)
}

/** The row each diagnosis signal reads, the other way round from `CARD_SIGNAL`. */
const ROW_OF_SIGNAL = new Map(Object.entries(CARD_SIGNAL).map(([row, signal]) => [signal, row]))

/**
 * What `missesInCommon` has already said, as `row:direction` of the in-court
 * serves, so the two cannot put one fact on a screen twice.
 */
function saidOfMisses(history: readonly Session[], tags: readonly ServeTag[], serveType: ServeType): Set<string> {
  const said = new Set<string>()
  for (const miss of missesInCommon([...history], tags, serveType)) {
    const row = ROW_OF_SIGNAL.get(miss.signal)
    if (row) said.add(`${row}:${miss.gap > 0 ? 'lower' : 'higher'}`)
  }
  return said
}

/** Every discovery in some serves, strongest first, before anything is held back. */
function linksIn(serves: Session[], tags: readonly ServeTag[]): Found[] {
  const rows = new Map(serves.map((s) => [s.id, trustedRows(s)]))
  const strata = new Map<string, Session[]>()
  const stratumOf = new Map<string, string>()
  tripsOf(serves, SITTING_GAP_MS).forEach((trip, t) => {
    for (const s of trip) {
      const key = `${t}|${s.quality?.view}`
      stratumOf.set(s.id, key)
      strata.set(key, [...(strata.get(key) ?? []), s])
    }
  })

  const speed = speedSides([...strata.values()])
  const questions = [...(speed ? [speed] : []), outcomeSides(serves, tags)]

  const tests: Found[] = []
  for (const { kind, ours, others } of questions) {
    Object.entries(CARD_NOISE_SD).forEach(([metricId, camera], index) => {
      const read = (side: Session[]) =>
        side.flatMap((s) => {
          const value = rows.get(s.id)?.get(metricId)?.value
          return value === undefined ? [] : [{ value, stratum: stratumOf.get(s.id) ?? '' }]
        })
      const { a, b } = withinStrata(read(ours), read(others))
      if (a.length < MIN_LINK_SERVES || b.length < MIN_LINK_SERVES) return
      const gap = mean(a.map((x) => x.value)) - mean(b.map((x) => x.value))
      // Tested or not, it counts in the correction: a row is only left out of
      // the family for having too few serves, never for how it came out.
      const clear = Math.abs(gap) > camera
      const p = clear ? permutationP(a, b, stream(SEED + 2 * index + (kind === 'speed' ? 0 : 1))) : 1
      const { label, unit, decimals } = ours.flatMap((s) => rows.get(s.id)?.get(metricId) ?? [])[0]
      const direction: Direction = gap > 0 ? 'higher' : 'lower'
      tests.push({
        p,
        link: {
          kind,
          metricId,
          label,
          direction,
          gap: Number(gap.toFixed(decimals)),
          unit,
          decimals,
          serves: a.length,
          others: b.length,
          line: linkLine(kind, metricId, direction),
        },
      })
    })
  }

  // Shuffles run out at one p, so ties there go to the bigger gap against the camera.
  const effect = ({ link }: Found) => Math.abs(link.gap) / CARD_NOISE_SD[link.metricId]
  return discoveries(tests).sort((x, y) => x.p - y.p || effect(y) - effect(x))
}

/**
 * What this player's fastest serves share against their slower ones, and what
 * their in-court serves share against their misses: at most `MAX_LINKS`,
 * strongest first, and usually none. See the top of this file for every gate.
 *
 * `history` must be one player's. Runs a few thousand shuffles on a row that
 * clears the camera, so it belongs in a memo keyed on the history.
 */
export function serveLinks(
  history: readonly Session[],
  tags: readonly ServeTag[] = [],
  opts: LinkOptions = {},
): ServeLink[] {
  const like = servesLike(history, { ...opts, tags })
  if (!like) return []
  const found = linksIn(like.serves, tags)
  if (!found.length) return []

  const earlier = linksIn(like.serves.slice(0, -HOLDS_WITHOUT), tags)
  const held = ({ link }: Found) =>
    earlier.some((e) => e.link.kind === link.kind && e.link.metricId === link.metricId && e.link.direction === link.direction)
  const missesSaid = found.some((t) => t.link.kind === 'outcome')
    ? saidOfMisses(history, tags, like.serveType)
    : new Set<string>()

  const out: ServeLink[] = []
  for (const { link, p } of found.filter(held)) {
    if (out.length === MAX_LINKS) break
    if (out.some((l) => l.metricId === link.metricId)) continue
    if (link.kind === 'outcome' && missesSaid.has(`${link.metricId}:${link.direction}`)) continue
    out.push({ ...link, p })
  }
  return out
}
