/**
 * A session's serves read together (L2.7).
 *
 * Two kinds of evidence. Seeded timelines of lines, drawn with the camera's
 * measured noise, where the truth is planted and known: a serve that tires, a
 * change of side, a knocked phone, and a session where nothing happens at all.
 * Then the engine itself on real motion: the six Bath serves filmed from two
 * placements twenty-four times each, read through `lineOf` exactly as a
 * session reads a serve, against the same serves judged one take at a time.
 */
import {
  DRIFT_NOISE,
  FAR_PAST,
  MIN_JUDGED,
  REPRESENTATIVE,
  sessionStats,
} from '../stats'
import { lineOf } from '../line'
import type { ServeLine } from '../session'
import { CARD_NOISE_SD } from '../../analysis/consistency'
import { overallOf } from '../../analysis/coaching'
import { diagnose } from '../../analysis/diagnose'
import type { FlawId } from '../../analysis/flaws'
import { measure } from '../../analysis/metrics'
import { detectServe } from '../../analysis/phases'
import { assessSpatial, viewFromCourtYaw } from '../../analysis/spatial'
import { buildServe, type ServeDials } from '../../analysis/syntheticServe'
import type { Analysis, Frame } from '../../analysis/types'
import { DEPTH_AWARE, REAL_SERVES, SEEDS, realOnFile, seeds } from '../../analysis/__tests__/repeatability'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

/* ------------------------------------------------------- seeded timelines */

/** mulberry32: small, seeded, and the same on every machine. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A standard normal draw, by Box–Muller. */
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())

/** Each reading's centre, roughly where a club serve sits. */
const CENTRE: Record<string, number> = {
  releaseHeight: 1.1,
  tossArmHold: 20,
  tossPathWobble: 1.5,
  kneeBend: 25,
  hipShoulderSeparation: 20,
  shoulderTilt: 25,
  legDrive: 0.08,
  dropDepth: 0.15,
  elbowAtDrop: 90,
  handUnderElbow: 10,
  dropToContact: 160,
  contactHeight: 1.25,
  armExtension: 165,
  contactAhead: 5,
  loadRatio: 40,
}

/** The guide's near side, and its far side by the slope one body gives (0.52 on Bath). */
const NEAR = { h: 0.3, g: 0.85, x: 0.5 }
const FAR = { h: 0.3 / 1.44, g: 0.85 + 0.52 * (0.3 / 1.44 - 0.3), x: 0.5 }

interface Plan {
  n?: number
  /** Which side each serve was hit from; the near side when absent. */
  sideOf?: (i: number) => typeof NEAR
  /** A reading that moves, by this many of its noise deviations, over the last third. */
  drift?: { id: string; by: number }
  /** The phone knocked before this serve: the footing steps by this much. */
  bump?: { at: number; by: number }
  /** Faults named with these chances, by this many floors. */
  faults?: Partial<Record<FlawId, { chance: number; past: number }>>
}

function timeline(seed: number, plan: Plan = {}): ServeLine[] {
  const r = rng(seed)
  const n = plan.n ?? 40
  return Array.from({ length: n }, (_, i) => {
    const late = i >= n - Math.floor(n / 3)
    const readings: ServeLine['readings'] = {}
    for (const [id, centre] of Object.entries(CENTRE)) {
      const noise = CARD_NOISE_SD[id]
      // The player's own scatter, half the camera's, and the camera's.
      let value = centre + 0.5 * noise * normal(r) + noise * normal(r)
      if (plan.drift?.id === id && late) value += plan.drift.by * noise
      readings[id] = { value, confidence: 0.9, score: 70 }
    }
    const place = plan.sideOf?.(i) ?? NEAR
    const bumped = plan.bump && i + 1 >= plan.bump.at ? plan.bump.by : 0
    const named: FlawId[] = []
    const past: ServeLine['past'] = {}
    for (const [flaw, f] of Object.entries(plan.faults ?? {}) as [FlawId, { chance: number; past: number }][]) {
      if (r() < f.chance) {
        named.push(flaw)
        past[flaw] = f.past
      }
    }
    return {
      number: i + 1,
      t: 5 + 12 * i,
      status: 'read',
      overall: Math.round(60 + 8 * normal(r)),
      readings,
      named,
      judged: Object.keys(plan.faults ?? {}) as FlawId[],
      past,
      scale: {
        bodyHeight: place.h * (1 + 0.01 * normal(r)),
        groundY: place.g + 0.002 * normal(r) + bumped,
        x: place.x + 0.01 * normal(r),
      },
    }
  })
}

heading('A session where nothing happens')

check('a steady session finds no change, one side, one footing and no fault', () => {
  let changed = 0
  let split = 0
  let moved = 0
  let named = 0
  const runs = 200
  for (let s = 0; s < runs; s++) {
    const st = sessionStats(timeline(1000 + s, { faults: { shallow_drop: { chance: 0.2, past: 1.3 } } }))
    if (st.drifts.length) changed++
    if (st.sides.length > 1) split++
    if (st.segments.length > 1) moved++
    if (st.verdict.length) named++
  }
  note(`of ${runs} steady sessions: ${changed} changed, ${split} split, ${moved} moved, ${named} named a fault`)
  assert(changed <= runs * 0.02, `${changed} of ${runs} steady sessions were said to change`)
  assert(split === 0 && moved === 0, 'a steady session was split or said to have moved')
  assert(named <= runs * 0.01, `a fault named on a fifth of serves was given to ${named} sessions`)
})

heading('A serve that changes')

check('a reading that moves over the last third is found, and the others aren’t', () => {
  let found = 0
  let others = 0
  const runs = 100
  for (let s = 0; s < runs; s++) {
    const st = sessionStats(timeline(2000 + s, { drift: { id: 'dropDepth', by: 3 } }))
    if (st.drifts.some((d) => d.id === 'dropDepth' && d.gap > 0)) found++
    others += st.drifts.filter((d) => d.id !== 'dropDepth').length
  }
  note(`a drop that moved three noise deviations: found in ${found} of ${runs}, ${others} others flagged`)
  assert(found >= runs * 0.9, `found in only ${found} of ${runs}`)
  assert(others <= runs * 0.03, `${others} readings that didn’t move were flagged`)
})

check('a move inside the camera’s noise isn’t called a change, however many serves', () => {
  let flagged = 0
  for (let s = 0; s < 50; s++) {
    const st = sessionStats(timeline(3000 + s, { n: 120, drift: { id: 'kneeBend', by: DRIFT_NOISE * 0.6 } }))
    if (st.drifts.some((d) => d.id === 'kneeBend')) flagged++
  }
  assert(flagged === 0, `a move smaller than the camera's noise was flagged ${flagged} times`)
})

heading('Where the player stood')

check('a change of side is two sides, not a moved phone, from the side and from behind', () => {
  // Blocks of ten from each side, the way a practice basket goes.
  const blocks = (i: number) => (Math.floor(i / 10) % 2 ? FAR : NEAR)
  const behind = (i: number) => ({ ...NEAR, x: Math.floor(i / 10) % 2 ? 0.2 : 0.8 })
  for (const [where, sideOf] of [
    ['the guide', blocks],
    ['behind', behind],
  ] as const) {
    let right = 0
    for (let s = 0; s < 50; s++) {
      const st = sessionStats(timeline(4000 + s, { sideOf }))
      const placeOf = (n: number) => JSON.stringify(sideOf(n - 1))
      const expected =
        st.sides.length === 2 && st.sides.every((side) => side.lines.every((n) => placeOf(n) === placeOf(side.lines[0])))
      if (expected && st.segments.length === 1) right++
    }
    note(`${where}: two clean sides and no move in ${right} of 50`)
    assert(right >= 48, `${where}: the sides were found cleanly in only ${right} of 50`)
  }
})

check('a knocked phone splits the session where it happened', () => {
  let right = 0
  for (let s = 0; s < 50; s++) {
    const st = sessionStats(timeline(5000 + s, { bump: { at: 21, by: 0.04 } }))
    if (st.segments.length === 2 && st.segments[1][0] === 21 && st.sides.length === 1) right++
  }
  note(`split at serve 21 in ${right} of 50`)
  assert(right >= 48, `the move was placed right in only ${right} of 50`)
})

check('the start and the end are compared on one side and one footing only', () => {
  // Every serve from the near side, then every serve from the far side: the
  // start-to-end comparison must not set one side against the other.
  const halves = (i: number) => (i < 20 ? NEAR : FAR)
  const st = sessionStats(timeline(6000, { sideOf: halves }))
  assert(st.sides.length === 2, `${st.sides.length} sides`)
  assert(st.driftOver <= 20, `the comparison stood on ${st.driftOver} serves across both sides`)
})

heading('Which faults the session has')

check('a fault on most serves is the session’s; one on a few isn’t, unless it is far out', () => {
  const st = sessionStats(
    timeline(7000, {
      faults: {
        no_leg_drive: { chance: 0.75, past: 1.2 },
        toss_drift: { chance: 0.15, past: 1.2 },
        shallow_drop: { chance: 0.45, past: FAR_PAST + 0.5 },
        posture_collapse: { chance: 0.45, past: 1.2 },
      },
    }),
  )
  const verdict = new Set(st.verdict)
  assert(verdict.has('no_leg_drive'), 'a fault on three serves in four wasn’t given to the session')
  assert(!verdict.has('toss_drift'), 'a fault on one serve in seven was given to the session')
  assert(verdict.has('shallow_drop'), 'a fault on nearly half the serves, far out each time, wasn’t given')
  assert(!verdict.has('posture_collapse'), 'a fault on under half the serves, by a hair each time, was given')
  // Causal order, the triage hierarchy's: the toss before the legs before the drop.
  const order = st.faults.map((f) => f.flaw)
  assert(order.indexOf('toss_drift') < order.indexOf('no_leg_drive'), `order: ${order.join(', ')}`)
  assert(order.indexOf('no_leg_drive') < order.indexOf('shallow_drop'), `order: ${order.join(', ')}`)
})

check('a fault that could be judged on too few serves is never the session’s', () => {
  const st = sessionStats(timeline(7100, { n: MIN_JUDGED - 1, faults: { no_leg_drive: { chance: 1, past: 3 } } }))
  assert(st.verdict.length === 0, 'four serves made a verdict')
})

check('the representative serves span the scores, best and worst included, in time order', () => {
  const lines = timeline(8000)
  const st = sessionStats(lines)
  assert(st.representative.length === REPRESENTATIVE, `${st.representative.length} picked`)
  assert(st.representative.includes(st.overall!.best) && st.representative.includes(st.overall!.worst), 'best or worst left out')
  assert(st.representative.every((n, i, a) => i === 0 || a[i - 1] < n), 'not in time order')
  assert(sessionStats(lines.slice(0, 5)).representative.length === 5, 'a short session lost serves from its picks')
})

check('unclear serves are counted and kept out of everything else', () => {
  const lines: ServeLine[] = [...timeline(8100, { n: 10 }), { number: 11, t: 200, status: 'unclear' }]
  const st = sessionStats(lines)
  assert(st.read === 10 && st.unclear === 1, `read ${st.read}, unclear ${st.unclear}`)
})

/* ---------------------------------------------------------- real motion */

heading('The engine, on real motion')

/** One take read as a session reads a serve: the engine, then `lineOf`. */
function lineFrom(frames: Frame[], number: number): ServeLine | undefined {
  let skel
  try {
    skel = detectServe(frames, 50)
  } catch {
    return undefined
  }
  const view = viewFromCourtYaw(assessSpatial(frames, skel.keys.ready, skel.bodyHeight, skel).court_yaw_deg)
  const fundamentals = measure(frames, skel, view === 'side', { serveType: 'flat' })
  const analysis = {
    fundamentals,
    overall: overallOf(fundamentals),
    diagnosis: diagnose(frames, skel, { tier: 5 }),
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    frames,
  } as unknown as Analysis
  return lineOf(analysis, number, number * 12)
}

/** Every take of every Bath serve from one placement, as one basket per serve. */
function bathBaskets(phone: { bearing?: number; distance?: number }): ServeLine[][] {
  return REAL_SERVES.map((serve) =>
    SEEDS.map((seed, i) => lineFrom(realOnFile(serve, phone, seed, 30), i + 1)).filter((l): l is ServeLine => l !== undefined),
  )
}

check('the Bath serves as baskets name fewer faults than the same takes judged one at a time', () => {
  /*
   * Real motion, filmed twice-twenty-four times per serve from the guide and
   * from the back fence. Judged one take at a time, the back fence names a
   * collapsing posture on a handful of takes (the L1.3 alarms). A basket has to
   * see it on most of the serves it could judge, so the same takes name nothing.
   */
  let single = 0
  let takes = 0
  let basket = 0
  for (const phone of [{}, { bearing: 180, distance: 6 }]) {
    for (const lines of bathBaskets(phone)) {
      takes += lines.length
      single += lines.reduce((n, l) => n + (l.named?.length ?? 0), 0)
      basket += sessionStats(lines).verdict.length
    }
  }
  note(`judged one take at a time: ${single} faults named over ${takes} takes; as twelve baskets: ${basket}`)
  assert(basket <= single, 'the baskets named more than the takes did')
  assert(basket === 0, `${basket} faults were given to baskets of real serves filmed with nothing but noise`)
})

check('a planted fault the takes name on most serves is the basket’s too', () => {
  // Straight legs and planted hips, which cannot drive: `depth.test.ts`'s missing leg drive.
  const lines = seeds(24)
    .map((seed, i) => lineFrom(buildServe({ ...DEPTH_AWARE, seed, trophyKneeAngle: 170, contactHipHeight: 0.95 } as Partial<ServeDials>, 50), i + 1))
    .filter((l): l is ServeLine => l !== undefined)
  const rate = lines.filter((l) => l.named?.includes('no_leg_drive')).length / lines.length
  const st = sessionStats(lines)
  note(`named on ${(rate * 100).toFixed(0)}% of takes; the basket's verdict: ${st.verdict.join(', ') || 'nothing'}`)
  assert(rate >= 0.5, `the planted fault was named on only ${(rate * 100).toFixed(0)}% of takes`)
  assert(st.verdict.includes('no_leg_drive'), 'a fault named on most takes wasn’t given to the basket')
})

check('real serves on one side and one footing aren’t split or said to have moved', () => {
  for (const lines of bathBaskets({})) {
    const st = sessionStats(lines)
    assert(st.sides.length === 1 && st.segments.length === 1, `${st.sides.length} sides, ${st.segments.length} segments`)
    assert(st.drifts.length === 0, `takes of one serve drifted: ${st.drifts.map((d) => d.id).join(', ')}`)
  }
})

report()
