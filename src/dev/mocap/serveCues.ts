/**
 * What a phone could tell a first from a second serve by, or a flat from a kick.
 *
 * Pure, like `report.ts`. `npm run bench:mocap -- --serve-cues` prints it. It is
 * the provenance of the "not adopted" half of ANALYSIS-REVIEW.md (2026-11-05):
 * `lib/serveGuess.ts` rests on the player's own tags and the ball, and this is
 * why it rests on nothing else.
 *
 * The Bath set has outcomes and no type or number, so nothing here is a measured
 * difference between two kinds of serve. What it does measure is the side of the
 * sum a phone controls: how far each reading moves from serve to serve and from
 * take to take on real motion. The other side is published. A reading is worth
 * something when the published gap is large against the first two.
 *
 * WHY THE SLOWED SERVES ARE ONLY HALF AN ANSWER. `slowedServe` runs a real swing
 * slower, which moves every speed and every interval together. Published second
 * serves move speed and leave timing where it was (van Trigt 2024), so a reading
 * that separates them here because it is a duration is reading the plant.
 */
import { poseAt } from '../../lib/analysis/between'
import { sided } from '../../lib/analysis/geometry'
import { planarSpeedSeries, sampleRadius, timeline } from '../../lib/analysis/kinematics'
import { slowedServe, swingCompleted, trackedTake, type MocapServe, type VirtualPhone } from '../../lib/analysis/mocapServe'
import { buildServe, type ServeDials } from '../../lib/analysis/syntheticServe'
import { MEDIAPIPE_FIT } from '../../lib/analysis/trackerNoise'
import type { Frame } from '../../lib/analysis/types'
import { runEngine } from './engine'

export const READINGS = [
  'handPeak',
  'elbowPeak',
  'handLast120',
  'dropToContact',
  'motion',
  'tossToContact',
  'contactAhead',
  'tossAhead',
  'tossAcross',
  'shoulderTilt',
  'contactHeight',
] as const
export type Cue = (typeof READINGS)[number]

const SLOWDOWNS = [1, 0.95, 0.9, 0.85, 0.8, 0.75]

/** One clip's readings, at the rate the app reads a real-time clip. */
function read(frames: Frame[], fps: number): Partial<Record<Cue, number>> | undefined {
  const result = runEngine(frames, fps)
  if (!result.ok) return undefined
  const { fundamentals, diagnosis, skel } = result.run
  const f = result.run.frames
  const metric = (id: string) => fundamentals.flatMap((x) => x.metrics).find((m) => m.id === id)?.value
  const t = timeline(f)
  const R = sided(skel.racket)
  const contact = skel.times.contact
  const peak = (lm: number, seconds: number) => {
    const speed = planarSpeedSeries(f, lm, skel.bodyHeight, sampleRadius(t, seconds))
    let best = 0
    for (let i = skel.keys.drop; i <= skel.keys.contact; i++) best = Math.max(best, speed[i])
    return best
  }
  const end = poseAt(f, contact).image[R.wrist]
  const start = poseAt(f, contact - 0.12).image[R.wrist]
  return {
    handPeak: peak(R.wrist, 0.05),
    elbowPeak: peak(R.elbow, 0.09),
    handLast120: Math.hypot(end.x - start.x, end.y - start.y) / skel.bodyHeight / 0.12,
    dropToContact: metric('dropToContact'),
    motion: (contact - f[skel.keys.ready].t) * 1000,
    tossToContact: (contact - f[skel.keys.toss].t) * 1000,
    contactAhead: metric('contactAhead'),
    tossAhead: diagnosis.tossPlacement?.ahead === undefined ? undefined : diagnosis.tossPlacement.ahead * 100,
    tossAcross: diagnosis.tossPlacement?.across === undefined ? undefined : diagnosis.tossPlacement.across * 100,
    shoulderTilt: metric('shoulderTilt'),
    contactHeight: metric('contactHeight'),
  }
}

/** Every take: reading, then how slowed, then serve, then its takes. */
type Takes = Partial<Record<Cue, Record<string, number[][]>>>

export function measureCues(serves: MocapServe[], phone: Partial<VirtualPhone>, takes = 6): Takes {
  const complete = serves.filter(swingCompleted)
  const seeds = Array.from({ length: takes }, (_, i) => 7000 + i * 4523)
  const out: Takes = {}
  complete.forEach((serve, si) => {
    for (const rate of SLOWDOWNS) {
      const planted = rate === 1 ? serve : slowedServe(serve, rate)
      for (const seed of seeds) {
        const r = read(trackedTake(planted, { fps: 30, grid: 32, fit: MEDIAPIPE_FIT, seed, phone }), 32)
        if (!r) continue
        for (const cue of READINGS) {
          const v = r[cue]
          if (v === undefined || !Number.isFinite(v)) continue
          const byRate = (out[cue] ??= {})
          ;(byRate[rate] ??= complete.map(() => []))[si].push(v)
        }
      }
    }
  })
  return out
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const variance = (xs: number[]) => {
  const m = mean(xs)
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)
}

export interface CueSpread {
  cue: Cue
  mean: number
  /** Standard deviation of the serves' own means. */
  serve: number
  /** Standard deviation between takes of one serve, pooled. */
  camera: number
  total: number
  /** Mean move when the swing is run 5, 10, 15, 20 and 25% slower. */
  moved: number[]
}

export function cueSpreads(takes: Takes): CueSpread[] {
  return READINGS.flatMap((cue) => {
    const byRate = takes[cue]
    if (!byRate?.[1]) return []
    const groups = byRate[1].filter((x) => x.length > 1)
    const means = groups.map(mean)
    const camera = Math.sqrt(mean(groups.map(variance)))
    const serve = Math.sqrt(variance(means))
    const base = mean(means)
    const moved = SLOWDOWNS.slice(1).map((rate) => {
      const held = byRate[rate]?.filter((x) => x.length).map(mean) ?? []
      return held.length ? mean(held) - base : NaN
    })
    return [{ cue, mean: base, serve, camera, total: Math.hypot(serve, camera), moved }]
  })
}

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export interface OwnTagRow {
  cue: Cue
  tagged: number
  /** By how much the swing was slowed: the share of questions answered, and the share of those wrong. */
  cells: { slowed: number; spoke: number; wrong: number }[]
}

/**
 * The best a guess from one reading could do with the player's own tags: `n`
 * tagged serves a side, teaching it, and a held-out serve asked. Gates as
 * `secondServeSlower` keeps them, plus a separation of one and a half spreads
 * and a held-out check on the tagged serves. `slowed: 0` is the null: no gap at
 * all, so whatever it says, it said about nothing.
 */
export function ownTagGuess(takes: Takes, cue: Cue, n: number, trials = 20000): OwnTagRow {
  const byRate = takes[cue]!
  const noise = Math.sqrt(mean(byRate[1].filter((x) => x.length > 1).map(variance)))
  const cells = SLOWDOWNS.map((rate) => {
    const rand = seeded(777 + Math.round(rate * 1000) + n)
    const count = byRate[1].length
    let asked = 0
    let spoke = 0
    let wrong = 0
    const draw = (si: number, r: number) => {
      const xs = byRate[r]?.[si] ?? []
      return xs.length ? xs[Math.floor(rand() * xs.length)] : NaN
    }
    for (let trial = 0; trial < trials; trial++) {
      const order = Array.from({ length: count }, (_, i) => i)
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      const firsts = order.slice(0, n).map((si) => draw(si, 1)).filter(Number.isFinite)
      const seconds = order.slice(n, 2 * n).map((si) => draw(si, rate)).filter(Number.isFinite)
      const second = rand() < 0.5
      const q = draw(order[2 * n], second ? rate : 1)
      if (!Number.isFinite(q) || firsts.length < 5 || seconds.length < 5) continue
      asked++
      const [a, b] = [mean(firsts), mean(seconds)]
      const [va, vb] = [Math.max(noise ** 2, variance(firsts)), Math.max(noise ** 2, variance(seconds))]
      const spread = Math.sqrt((va + vb) / 2)
      const gap = Math.abs(a - b)
      if (gap < 2 * Math.sqrt(va / firsts.length + vb / seconds.length) || gap < 1.5 * spread) continue
      const stays = (xs: number[], other: number) =>
        xs.filter((x, i) => Math.abs(x - mean(xs.filter((_, j) => j !== i))) < Math.abs(x - other)).length
      if ((stays(firsts, b) + stays(seconds, a)) / (firsts.length + seconds.length) < 0.8) continue
      const odds = Math.exp(-0.5 * (((q - b) / spread) ** 2 - ((q - a) / spread) ** 2))
      const towardsSecond = odds / (1 + odds)
      if (Math.max(towardsSecond, 1 - towardsSecond) < 0.9) continue
      spoke++
      if (towardsSecond > 0.5 !== second) wrong++
    }
    return { slowed: Math.round((1 - rate) * 100), spoke: spoke / Math.max(1, asked), wrong: spoke ? wrong / spoke : 0 }
  })
  return { cue, tagged: n, cells }
}

/** The standard normal's cumulative share, by Abramowitz and Stegun 26.2.17. */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

export interface TypeRow {
  claim: string
  cue: Cue
  /** The published gap between the two types, in the reading's units. */
  gap: number
  /** The best any rule can do with this reading alone, two types equally likely. */
  ownHistory: number
  /** The same with no history, against everyone: published spread between players added in. */
  noHistory?: number
  /** The switch rate above which the reading beats keeping the player's remembered choice. */
  breakEven: number
}

/**
 * Flat against kick on published gaps, with spreads taken from real motion. No
 * row exists for slice: nothing published gives it a position of its own.
 *
 * The published figures, as statures of a 1.85 m player:
 *   - contact ahead, professional men: 56.2 ± 15.8 cm flat, 51.4 ± 22.7 kick (Vacek 2023)
 *   - contact ahead, elite adolescent boys: 0.30–0.37 flat, 0.23–0.24 kick (Connolly 2021)
 *   - contact ahead, junior boys: 59.1 cm flat, 35.1 kick (Vacek 2023)
 *   - toss peak sideways, professional men: 18–21 cm (Carboch 2018), behind the server only
 * Campbell 2013 finds no flat and kick difference in ball position at all.
 */
export function typeTable(spreads: CueSpread[]): TypeRow[] {
  const row = (claim: string, cue: Cue, gap: number, between?: number): TypeRow[] => {
    const s = spreads.find((x) => x.cue === cue)
    if (!s) return []
    const ownHistory = phi(gap / s.total / 2)
    return [
      {
        claim,
        cue,
        gap,
        ownHistory,
        noHistory: between === undefined ? undefined : phi(gap / Math.hypot(s.total, between) / 2),
        // The remembered choice is right unless the player switched.
        breakEven: 1 - ownHistory,
      },
    ]
  }
  return [
    ...row('contact ahead, professional men', 'contactAhead', 2.6, 8.5),
    ...row('contact ahead, elite adolescent boys', 'contactAhead', 9, 8.5),
    ...row('contact ahead, junior boys', 'contactAhead', 13, 8.5),
    ...row('toss ahead, as contact in adolescents', 'tossAhead', 9, 8.5),
    ...row('toss sideways, professional men', 'tossAcross', 10.5),
  ]
}

export interface RigRow {
  dial: string
  contactAhead: number
  contactSd: number
  tilt: number
  tiltSd: number
}

/**
 * The rig with a type's published moves dialled in, at 30 fps under the rig's
 * own jitter. It is here to answer one question: whether the type table above is
 * the camera failing. It is not. The readings follow their dials, and what a
 * type cannot do is move them far enough against a real serve's spread.
 */
export function rigResponse(takes = 16): RigRow[] {
  const seeds = Array.from({ length: takes }, (_, i) => 7000 + i * 4523)
  const cases: [string, Partial<ServeDials>][] = [
    ['as built', {}],
    ['contact 5 cm further back', { contactBehind: 0.05 }],
    ['contact 17 cm further back', { contactBehind: 0.17 }],
    ['contact 24 cm further back', { contactBehind: 0.24 }],
    ['10 degrees more shoulder tilt', { shoulderTilt: 34 }],
  ]
  return cases.map(([dial, dials]) => {
    const reads = seeds.flatMap((seed) => {
      const r = read(buildServe({ noise: 0.006, depthNoise: 4, depthBias: 0.006, seed, ...dials }, 30), 30)
      return r ? [r] : []
    })
    const of = (cue: Cue) => reads.map((r) => r[cue]).filter((v): v is number => v !== undefined)
    return {
      dial,
      contactAhead: mean(of('contactAhead')),
      contactSd: Math.sqrt(variance(of('contactAhead'))),
      tilt: mean(of('shoulderTilt')),
      tiltSd: Math.sqrt(variance(of('shoulderTilt'))),
    }
  })
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`

export function formatRig(rows: RigRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.dial.padEnd(32)} contact ahead ${r.contactAhead.toFixed(1).padStart(5)} ± ${r.contactSd.toFixed(1)}%` +
        `   shoulder tilt ${r.tilt.toFixed(1).padStart(5)} ± ${r.tiltSd.toFixed(1)}°`,
    )
    .join('\n')
}

export function formatCues(spreads: CueSpread[]): string {
  const lines = ['reading            mean   serve  camera   moved by a swing 5 / 10 / 15 / 20 / 25% slower']
  for (const s of spreads) {
    lines.push(
      `${s.cue.padEnd(16)} ${s.mean.toFixed(2).padStart(7)} ${s.serve.toFixed(2).padStart(7)} ${s.camera.toFixed(2).padStart(7)}   ` +
        s.moved.map((m) => `${m.toFixed(2).padStart(7)}`).join(' '),
    )
  }
  return lines.join('\n')
}

export function formatOwnTags(rows: OwnTagRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.cue.padEnd(16)} ${String(r.tagged).padStart(2)} a side  ` +
        r.cells.map((c) => `${c.slowed}%: ${pct(c.spoke)}, wrong ${pct(c.wrong)}`.padEnd(26)).join(''),
    )
    .join('\n')
}

export function formatTypes(rows: TypeRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.claim.padEnd(40)} gap ${r.gap.toFixed(1).padStart(5)}  own history ${pct(r.ownHistory).padStart(4)}` +
        `  no history ${r.noHistory === undefined ? ' -- ' : pct(r.noHistory).padStart(4)}  beats the remembered choice past ${pct(r.breakEven)} switches`,
    )
    .join('\n')
}

export const SIDE_PLACEMENT: Partial<VirtualPhone> = {}
export const BEHIND_PLACEMENT: Partial<VirtualPhone> = { bearing: 180, distance: 6 }
