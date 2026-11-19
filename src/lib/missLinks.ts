/**
 * Which named faults go with which kind of miss, in the player's own tags, and
 * what the report does about it (N2.9).
 *
 * The player taps where each serve went (in, net, long, wide). Until now only
 * Progress read those taps. This lets a report's plan use them: a fault this
 * serve shows, which on the player's earlier serves came with one kind of miss
 * more often than with serves that went in, moves up the plan. Only past chance,
 * and "past chance" is this, every part of it written down here:
 *
 *   - **The serves compared** are the player's own, of this serve's type, rubric
 *     era and serve number (`servesLike`, the baseline's rule: first serves and
 *     untagged together, tagged seconds apart), filmed before this one, each
 *     tagged with where it went. A fault counts on a serve only where the serve
 *     was read well enough to name it (`MIN_EVIDENCE`): named is "with", read
 *     and not named is "without", and a serve where it could not be read is in
 *     neither. A missing reading is never a fault, and never a clean serve.
 *   - **The test** is one-sided and exact: of the serves that were in or this
 *     miss, did the ones with the fault go this way more often than chance
 *     allows? Asked within each sitting and camera view, and summed (the exact
 *     conditional test for a common odds ratio, Fisher's test stratified). A
 *     windy day misses more and a tired one shows more faults; across the whole
 *     history those two go together for no reason in the serve. Within a
 *     sitting they cannot.
 *   - **Every fault and every miss is asked at once**, Holm-corrected, so the
 *     chance of naming any link that is not there is the stated rate however
 *     many were asked.
 *   - **The minimum**: `FIRST_LOOK` tagged serves before anything is asked, and
 *     `MIN_SIDE` on each side of both splits (that miss and in, with the fault
 *     and without) among the sittings that hold both, before a pair is asked.
 *   - **The rate**: `LINK_ALPHA`, 5%, over the player's whole tagged history,
 *     not per look. A report is read after every serve, and a test asked again
 *     each time a history grows by one will in the end find something in pure
 *     noise. So it looks only when the tagged serves double, from `FIRST_LOOK`,
 *     each look spending half what is left: 2.5% at 48, 1.25% at 96, 0.625% at
 *     192 and so on, which adds up to under 5% however long the history runs.
 *     Between looks the answer holds still, so a link does not flicker.
 *   - And the whole history must lean the same way, so the counts a line quotes
 *     agree with what it says.
 *
 * Worded as association, never as cause. "It showed on 8 of your 10 serves into
 * the net" is a fact about the taps. "It puts the ball in the net" is a claim
 * nothing here supports.
 *
 * What changes on a report: nothing, unless a fault this serve shows is linked.
 * The first fix never moves. It is the stored verdict the glance, Today's week,
 * the drill check and the carry-forward all read, and the order puts it first
 * because it can cause the rest; moving it on one screen would make two screens
 * disagree. A linked fault moves up to straight after it, ahead of the faults
 * that are not linked, and the cap of four can let one in that it held back.
 * A rough reading still comes after a firm one, as everywhere else in the plan.
 *
 * Every rate is measured on synthetic histories by `missLinks.test.ts`. That
 * proves the test keeps its stated rate, not that a link is a cause.
 */
import { isFirm } from './analysis/faultOrder'
import { MIN_EVIDENCE, type FlawFinding, type FlawId } from './analysis/flaws'
import type { Diagnosis } from './analysis/diagnose'
import type { Triage } from './analysis/triage'
import type { Analysis } from './analysis/types'
import { causalPlan } from './analysis/verdict'
import { cue } from './analysis/voice'
import { SITTING_GAP_MS, servesLike } from './baseline'
import { scoringVersionOf, tripsOf, typeOf } from './progress'
import type { ServeTag, Session } from './storage/db'

/**
 * The chance, over a player's whole tagged history of one serve, of naming any
 * link that is not there. Spent half at a time, one half per look.
 */
export const LINK_ALPHA = 0.05

/**
 * Tagged serves before the first look.
 *
 * A look spends its share of the 5% whether or not anything could pass it. On
 * the synthetic histories in `missLinks.test.ts` a strong link (a fault on half
 * the serves that takes the net from 12% of them to 40%) would be found 3.8% of
 * the time by a look at 24 serves, so a look there would spend half the budget
 * for almost nothing.
 * Starting at 48 gives that look the 2.5% instead, and every later look twice
 * what it would have had.
 */
export const FIRST_LOOK = 48

/**
 * Serves on each side of both splits before a pair is asked: seven of the miss
 * and seven in, seven with the fault and seven without.
 *
 * Seven from the test's own arithmetic, the same seven `serveLinks` came to.
 * With eleven named faults and three misses a look can ask 33 pairs, and at
 * the first look's 2.5% Holm's first step wants a chance under 0.025 / 33, about
 * 0.0008. The rarest table a split of n a side can make has a chance of
 * 1 / C(2n, n): 0.0011 at six, 0.0003 at seven. Under seven a side, a pair
 * could not pass the first look however strong the link, and asking it would
 * only make the others' bar higher.
 */
export const MIN_SIDE = 7

/* ------------------------------------------------------------ the test -- */

/** One sitting's table: serves, how many showed the fault, how many were this miss, how many both. */
export interface Table {
  serves: number
  fault: number
  miss: number
  both: number
}

const logFactorials: number[] = [0]

/** ln(n!), kept as it grows: a history's counts are small and asked over and over. */
function logFactorial(n: number): number {
  for (let i = logFactorials.length; i <= n; i++) logFactorials.push(logFactorials[i - 1] + Math.log(i))
  return logFactorials[n]
}

const logChoose = (n: number, k: number) => logFactorial(n) - logFactorial(k) - logFactorial(n - k)

/**
 * How often chance alone puts at least this many of the misses on the serves
 * with the fault, summed over the sittings, with each sitting's counts held as
 * they were. Exact: each sitting's count is hypergeometric, and the sum's
 * spread is theirs convolved.
 */
export function chanceOfAtLeast(tables: readonly Table[]): number {
  let spread = [1]
  let floor = 0
  let seen = 0
  for (const t of tables) {
    const lo = Math.max(0, t.miss + t.fault - t.serves)
    const hi = Math.min(t.miss, t.fault)
    const all = logChoose(t.serves, t.miss)
    const one: number[] = []
    for (let a = lo; a <= hi; a++) {
      one.push(Math.exp(logChoose(t.fault, a) + logChoose(t.serves - t.fault, t.miss - a) - all))
    }
    const next = new Array<number>(spread.length + one.length - 1).fill(0)
    for (let i = 0; i < spread.length; i++) for (let j = 0; j < one.length; j++) next[i + j] += spread[i] * one[j]
    spread = next
    floor += lo
    seen += t.both
  }
  // The fewest the margins allow is certain, and said so rather than summed to
  // 0.9999999. Otherwise summed from the far end, smallest first, so the
  // rounding stays small.
  if (seen <= floor) return 1
  let tail = 0
  for (let s = spread.length - 1; s >= seen - floor; s--) tail += spread[s]
  return Math.min(1, tail)
}

/**
 * Holm's step-down: the tests that pass, smallest chance first. Holds the chance
 * of passing any test whose link is not there at `alpha`, however the tests
 * lean on each other.
 */
export function holm<T extends { p: number }>(tests: readonly T[], alpha: number): T[] {
  const sorted = [...tests].sort((a, b) => a.p - b.p)
  const out: T[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].p > alpha / (sorted.length - i)) break
    out.push(sorted[i])
  }
  return out
}

/** One tagged serve, as the test reads it. */
export interface Row {
  /** 'in', or the kind of miss. */
  outcome: string
  /** Serves in one stratum were filmed the same way at one sitting. */
  stratum: string
  /** Read and named is true, read and not named false. A fault not read is absent, never false. */
  faults: Partial<Record<FlawId, boolean>>
}

/** A fault that went with one kind of miss, past chance. */
export interface MissLink {
  flaw: FlawId
  miss: string
  /** Every serve compared: those with the fault, how many went this way and how many in. */
  withFault: { miss: number; in: number }
  /** And those without it. */
  without: { miss: number; in: number }
  /** The exact chance, before Holm's correction. */
  p: number
}

/**
 * Every fault and every miss in some rows, asked at once at `alpha`. What
 * passes, strongest first. Usually nothing.
 */
export function linksIn(rows: readonly Row[], alpha: number): MissLink[] {
  const misses = [...new Set(rows.map((r) => r.outcome))].filter((o) => o !== 'in').sort()
  const flaws = [...new Set(rows.flatMap((r) => Object.keys(r.faults) as FlawId[]))].sort()
  const tests: MissLink[] = []
  for (const flaw of flaws) {
    for (const miss of misses) {
      const used = rows.filter((r) => r.faults[flaw] !== undefined && (r.outcome === 'in' || r.outcome === miss))
      const strata = new Map<string, Table>()
      for (const r of used) {
        const t = strata.get(r.stratum) ?? { serves: 0, fault: 0, miss: 0, both: 0 }
        const fault = r.faults[flaw] === true
        const missed = r.outcome === miss
        strata.set(r.stratum, {
          serves: t.serves + 1,
          fault: t.fault + Number(fault),
          miss: t.miss + Number(missed),
          both: t.both + Number(fault && missed),
        })
      }
      // A sitting all one way, on either split, says nothing: chance alone puts
      // its count exactly where it is. It joins neither the test nor the minimum.
      const told = [...strata.values()].filter((t) => t.fault > 0 && t.fault < t.serves && t.miss > 0 && t.miss < t.serves)
      const total = (k: keyof Table) => told.reduce((sum, t) => sum + t[k], 0)
      const serves = total('serves')
      if (Math.min(total('miss'), serves - total('miss'), total('fault'), serves - total('fault')) < MIN_SIDE) continue
      const count = (fault: boolean, missed: boolean) =>
        used.filter((r) => r.faults[flaw] === fault && (r.outcome === miss) === missed).length
      tests.push({
        flaw,
        miss,
        withFault: { miss: count(true, true), in: count(true, false) },
        without: { miss: count(false, true), in: count(false, false) },
        p: chanceOfAtLeast(told),
      })
    }
  }
  // Holm over every pair asked; then the whole history has to lean the same
  // way, so a line's counts never contradict it. That second gate only ever
  // removes a link, so it cannot raise the rate.
  const share = (s: { miss: number; in: number }) => s.miss / Math.max(1, s.miss + s.in)
  return holm(tests, alpha).filter((t) => share(t.withFault) > share(t.without))
}

/**
 * Which look a history of `tagged` serves is on: the oldest serves that look
 * reads, and its share of `LINK_ALPHA`. Nothing before `FIRST_LOOK`.
 */
export function lookFor(tagged: number): { serves: number; alpha: number } | undefined {
  if (tagged < FIRST_LOOK) return undefined
  let serves = FIRST_LOOK
  let alpha = LINK_ALPHA / 2
  while (serves * 2 <= tagged) {
    serves *= 2
    alpha /= 2
  }
  return { serves, alpha }
}

/**
 * The links a tagged history holds, on the look it has reached. `rows` oldest
 * first. The function both the app and the tests ask, so they ask the same thing.
 */
export function linksAtLook(rows: readonly Row[]): MissLink[] {
  const look = lookFor(rows.length)
  return look ? linksIn(rows.slice(0, look.serves), look.alpha) : []
}

/* --------------------------------------------------- from the history -- */

/** What one serve's diagnosis says about each fault: named, read and not named, or nothing. */
export function faultsOf(flaws: readonly FlawFinding[]): Row['faults'] {
  const out: Row['faults'] = {}
  for (const f of flaws) {
    if (out[f.flaw] !== undefined || !Number.isFinite(f.value) || !(f.confidence >= MIN_EVIDENCE)) continue
    out[f.flaw] = f.detected
  }
  return out
}

/** Comparable serves, oldest first, as rows: only those tagged with where they went and diagnosed. */
export function rowsOf(serves: readonly Session[], tags: readonly ServeTag[]): Row[] {
  const outcome = new Map(tags.map((t) => [t.id, t.outcome]))
  const told = serves.filter((s) => outcome.get(s.id) !== undefined && s.diagnosis?.flaws)
  const stratum = new Map<string, string>()
  tripsOf([...told], SITTING_GAP_MS).forEach((sitting, i) => {
    for (const s of sitting) stratum.set(s.id, `${i}|${s.quality?.view}`)
  })
  return told
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => ({ outcome: outcome.get(s.id)!, stratum: stratum.get(s.id)!, faults: faultsOf(s.diagnosis!.flaws) }))
}

/**
 * The links behind one report: from the player's serves like it, filmed
 * before it. `history` must be one player's.
 */
export function missLinks(
  serve: Pick<Session, 'id' | 'createdAt' | 'serveType' | 'scoringVersion'>,
  history: readonly Session[],
  tags: readonly ServeTag[],
): MissLink[] {
  const second = tags.find((t) => t.id === serve.id)?.serveNumber === 2
  const like = servesLike(history, {
    serveType: typeOf(serve),
    scoringVersion: scoringVersionOf(serve),
    serveNumber: second ? 2 : 1,
    tags,
    before: serve.createdAt,
  })
  return like ? linksAtLook(rowsOf(like.serves, tags)) : []
}

/* ------------------------------------------------------- on the report -- */

const WHERE: Record<string, string> = {
  net: 'into the net',
  long: 'that went long',
  wide: 'that went wide',
}

/** What one link says under its fix: why it moved up, or what the taps show. */
export function linkLine(link: MissLink, moved: boolean): string {
  const where = WHERE[link.miss] ?? `that went ${link.miss}`
  const said = `It showed on ${link.withFault.miss} of your ${link.withFault.miss + link.without.miss} serves ${where}, against ${link.withFault.in} of your ${link.withFault.in + link.without.in} that went in.`
  return cue(moved ? `I moved this up. ${said}` : said)
}

/**
 * The whole causal walk, past the cap: `causalPlan` asked again with the
 * faults it has listed set aside, until it lists nothing new. Its own rules
 * (the order, firm before rough, symptoms out) decide every entry.
 */
function wholeWalk(triage: Triage | undefined, diagnosis: Diagnosis | undefined): Analysis['focus'][] {
  const walk = causalPlan(triage, diagnosis)
  const primary = triage?.primary_flaw?.flaw
  while (diagnosis && walk.length) {
    const listed = new Set(walk.map((p) => p.flaw))
    const rest = causalPlan(triage, {
      ...diagnosis,
      flaws: diagnosis.flaws.map((f) => (f.flaw !== primary && listed.has(f.flaw) ? { ...f, detected: false } : f)),
    }).slice(1)
    if (!rest.length) break
    walk.push(...rest)
  }
  return walk
}

export interface LinkedPlan {
  plan: Analysis['focus'][]
  /** A line for each fix with a link, by its fault. */
  why: Partial<Record<FlawId, string>>
}

/**
 * The report's plan with the player's tags taken into it. With no link, the
 * plan `causalPlan` gives, unchanged and with no lines.
 */
export function linkedPlan(
  triage: Triage | undefined,
  diagnosis: Diagnosis | undefined,
  links: readonly MissLink[],
): LinkedPlan {
  const plan = causalPlan(triage, diagnosis)
  if (!plan.length || !links.length) return { plan, why: {} }

  // The strongest link per fault: one line each, from the clearest evidence.
  const strongest = new Map<FlawId, MissLink>()
  for (const l of [...links].sort((a, b) => a.p - b.p)) if (!strongest.has(l.flaw)) strongest.set(l.flaw, l)
  const linked = (item: Analysis['focus']) => item.flaw !== undefined && strongest.has(item.flaw)
  const firm = (item: Analysis['focus']) => {
    const f = diagnosis?.flaws.find((x) => x.flaw === item.flaw)
    return f !== undefined && isFirm(f)
  }

  // The whole walk, not the capped plan, so a linked fault the cap held back
  // can come in; the plan keeps its length, so whatever it lets in pushes the
  // last unlinked fix out, and the count of what was held back stays true.
  const [first, ...rest] = wholeWalk(triage, diagnosis)
  const ordered = [
    ...rest.filter((i) => firm(i) && linked(i)),
    ...rest.filter((i) => firm(i) && !linked(i)),
    ...rest.filter((i) => !firm(i) && linked(i)),
    ...rest.filter((i) => !firm(i) && !linked(i)),
  ]
  const out = [first, ...ordered].slice(0, plan.length)
  const why: LinkedPlan['why'] = {}
  out.forEach((item, at) => {
    if (!item.flaw || !linked(item)) return
    const was = at === 0 ? 0 : 1 + rest.indexOf(item)
    why[item.flaw] = linkLine(strongest.get(item.flaw)!, at < was)
  })
  return { plan: out, why }
}
