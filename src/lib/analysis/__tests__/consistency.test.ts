/**
 * A basket's spread, held to what the serve did rather than the camera (L1.8).
 *
 * The comparison used to score each reading on max − min across the basket.
 * That counts the camera's own take-to-take noise as the player's, and it grows
 * with the number of serves, so a bigger basket looked less steady for being
 * bigger. A real serve filmed six times could come back with "your hip–shoulder
 * separation changes serve to serve" from noise alone.
 *
 * It now scores the standard deviation with the camera's measured deviation
 * taken out (`CARD_NOISE_SD`), on the six-serve range's scale. This file holds
 * the table to a fresh measurement, holds a noise-only basket of real serves to
 * "steady", and checks a real difference is still found.
 */
import {
  CARD_NOISE_SD,
  RANGE_OF_SIX,
  SAME_BODY_SLOPE,
  buildConsistency,
  consistencyHeadline,
  possibleHandoff,
  servedSpread,
} from '../consistency'
import { overallOf } from '../coaching'
import { measure } from '../metrics'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { assessSpatial, viewFromCourtYaw } from '../spatial'
import { buildServe, type ServeDials } from '../syntheticServe'
import { LM } from '../geometry'
import type { Analysis, Frame } from '../types'
import { REAL_CHANGE, bestWorstGap } from '../realChange'
import { DEPTH_AWARE, DEPTH_BIAS, DEPTH_MULTIPLIER, FPS, IN_PLANE, REAL_SERVES, SEEDS } from './repeatability'
import { assert, check, heading, note, report } from './harness'

const stature = (f: Frame) =>
  (Math.max(f.image[LM.leftAnkle].y, f.image[LM.rightAnkle].y) - f.image[LM.nose].y) / 0.93
const RIG_STATURE = stature(buildServe({}, FPS)[0])

/** One take, read the way the card reads it, as the slice of an analysis a basket needs. */
function take(frames: Frame[], index: number): Analysis | undefined {
  let skel
  try {
    skel = detectServe(frames, FPS)
  } catch {
    return undefined
  }
  const view = viewFromCourtYaw(assessSpatial(frames, skel.keys.ready, skel.bodyHeight, skel).court_yaw_deg)
  const fundamentals = measure(frames, skel, view === 'side', { serveType: 'flat' })
  return {
    fundamentals,
    overall: overallOf(fundamentals),
    serves: { count: 6, index },
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
  } as unknown as Analysis
}

const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

/** Every take of every real serve, from one placement, with the suite's camera noise. */
function realTakes(phone: { bearing?: number; distance?: number }) {
  return REAL_SERVES.map((serve) => {
    const scale = stature(filmMocap(serve, { ...phone, fps: FPS })[0]) / RIG_STATURE
    return SEEDS.map((seed, i) =>
      take(
        filmMocap(serve, {
          ...phone,
          fps: FPS,
          seed,
          noise: IN_PLANE * scale,
          depthNoise: DEPTH_MULTIPLIER,
          depthBias: DEPTH_BIAS * scale,
        }),
        i,
      ),
    ).filter((a): a is Analysis => a !== undefined)
  })
}

const guide = realTakes({})
const back = realTakes({ bearing: 180, distance: 6 })
const rig = SEEDS.map((seed, i) => take(buildServe({ ...DEPTH_AWARE, seed }, FPS), i)).filter(
  (a): a is Analysis => a !== undefined,
)

heading('The camera, measured')

check('the noise table covers what the camera does to every card reading', () => {
  const worst: Record<string, number> = {}
  for (const takes of [...guide, ...back, rig]) {
    const ids = new Set(takes.flatMap((a) => a.fundamentals.flatMap((f) => f.metrics.map((m) => m.id))))
    for (const id of ids) {
      const values = takes
        .map((a) => a.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === id)?.value)
        .filter((v): v is number => Number.isFinite(v))
      if (values.length >= 12) worst[id] = Math.max(worst[id] ?? 0, sd(values))
    }
  }
  for (const [id, measured] of Object.entries(worst)) {
    assert(id in CARD_NOISE_SD, `${id} moves ${measured.toPrecision(3)} between takes and has no noise entry`)
    // Rounded to three figures in the table.
    assert(
      measured <= CARD_NOISE_SD[id] * 1.01,
      `${id} now moves ${measured.toPrecision(3)} between takes, past the table's ${CARD_NOISE_SD[id]}`,
    )
  }
  note(`${Object.keys(worst).length} readings measured against the table`)
})

heading('Noise alone is not called a wandering serve')

check('a real serve filmed six times is called steady, from the side and from behind', () => {
  for (const [where, serves] of [
    ['the guide', guide],
    ['the back fence', back],
  ] as const) {
    serves.forEach((takes, s) => {
      for (let start = 0; start + 6 <= takes.length; start += 6) {
        const basket = buildConsistency(takes.slice(start, start + 6), 6)!
        const headline = consistencyHeadline(basket)
        assert(
          !headline.includes('changes most'),
          `${where}, serve ${s + 1}, takes ${start + 1}–${start + 6}: "${headline}" (${basket.weakest?.label} ${basket.weakest?.score})`,
        )
      }
    })
  }
})

check('a basket that really varies is still found', () => {
  // The same rig serve with the hand met at a different height each time,
  // under the suite's camera noise. Reaching lower also bends the arm, so arm
  // extension moves with it; the contact row has to be among those flagged.
  const reaches = [1.02, 1.12, 1.22, 1.32, 1.42, 1.08]
  const takes = reaches
    .map((contactReach, i) => take(buildServe({ ...DEPTH_AWARE, seed: SEEDS[i], contactReach } as Partial<ServeDials>, FPS), i))
    .filter((a): a is Analysis => a !== undefined)
  const basket = buildConsistency(takes, takes.length)!
  const contact = basket.metrics.find((m) => m.id === 'contactHeight')!
  note(`weakest: ${basket.weakest?.label} ${basket.weakest?.score}; contact height ${contact.score}`)
  assert(contact.score < 70, `a contact that moved by a fifth of the body scored ${contact.score}`)
  assert(basket.weakest!.score < 70, 'a basket that really varied was called steady')
})

heading('The statistic itself')

check('the spread no longer grows with the number of serves', () => {
  // Draws from one distribution, scored at six serves and at twenty-four: the
  // range used to come out near half as large again at twenty-four.
  let s = 7
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31), s / 2 ** 31)
  const normal = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  const at = (n: number) => {
    let total = 0
    for (let k = 0; k < 400; k++) total += servedSpread('unlisted', Array.from({ length: n }, normal))
    return total / 400
  }
  const six = at(6)
  const many = at(24)
  note(`six serves ${six.toFixed(2)}, twenty-four ${many.toFixed(2)} (σ × ${RANGE_OF_SIX})`)
  assert(Math.abs(many - six) / six < 0.1, `the spread moved ${(((many - six) / six) * 100).toFixed(0)}% with the count`)
  assert(Math.abs(six - RANGE_OF_SIX) / RANGE_OF_SIX < 0.15, `six serves of σ = 1 scored a spread of ${six.toFixed(2)}`)
})

check('the camera\'s own deviation is taken out, and no further', () => {
  const noise = CARD_NOISE_SD.kneeBend
  // A basket whose deviation is exactly the camera's has nothing left, nor
  // one at half again the camera's, which six takes of noise reach by chance.
  for (const k of [1, 1.5]) {
    const flat = [0, 1, 0, 1, 0, 1].map((x) => 150 + (x - 0.5) * noise * k * 2 * Math.sqrt(5 / 6))
    assert(servedSpread('kneeBend', flat) < 1e-6, `camera noise at ${k}× left ${servedSpread('kneeBend', flat)}`)
  }
  // Three times the camera's deviation is the serve.
  const wide = [0, 1, 0, 1, 0, 1].map((x) => 150 + (x - 0.5) * noise * 3 * 2 * Math.sqrt(5 / 6))
  assert(servedSpread('kneeBend', wide) > 0, "a spread three times the camera's was called noise")
  // And a reading with no measured noise keeps all of its spread.
  assert(servedSpread('unlisted', [0, 2]) > 0, 'a reading with no noise entry lost its spread')
})

check('a steady fault is marked off target, not praised', () => {
  const values = [170, 171, 170, 169, 170, 171]
  const takes = values.map((v, i) => ({
    fundamentals: [
      {
        id: 'loading',
        metrics: [{ id: 'kneeBend', label: 'Knee bend at trophy', unit: '°', decimals: 0, value: v, ideal: [100, 145], range: [90, 180], confidence: 1, score: 40 }],
      },
    ],
    overall: 70,
    serves: { count: 6, index: i },
  })) as unknown as Analysis[]
  const row = buildConsistency(takes, 6)!.metrics.find((m) => m.id === 'kneeBend')!
  assert(row.offTarget === true, 'six straight-legged serves were not marked off target')
  assert(row.score >= 85, `a reading that held still scored ${row.score} for steadiness`)
})

check('best against worst needs a gap the score can tell apart', () => {
  // Two serves are held to the report's own line between two scores (L3.1).
  assert(
    bestWorstGap(2) === REAL_CHANGE.overall,
    `two serves need ${bestWorstGap(2)}, the report's line is ${REAL_CHANGE.overall}`,
  )
  const mk = (overall: number, i: number, rows: string[] = []) =>
    ({
      fundamentals: [
        {
          id: 'toss',
          score: rows.length ? 70 : 0,
          metrics: rows.map((id) => ({ id, label: id, unit: '%', decimals: 0, value: 50, ideal: [40, 60], range: [0, 100], confidence: 1, score: 70 })),
        },
      ],
      overall,
      serves: { count: 2, index: i },
    }) as unknown as Analysis
  const under = REAL_CHANGE.overall - 1
  assert(
    buildConsistency([mk(78, 0), mk(78 - under, 1)], 2)!.gap === undefined,
    `two serves ${under} points apart were called best and worst`,
  )
  assert(buildConsistency([mk(80, 0), mk(70, 1)], 2)!.gap !== undefined, 'a ten-point gap was hidden')
  // Six takes of one serve spread further than two, so six need more.
  const six = [80, 79, 78, 77, 76, 80 - bestWorstGap(6) + 1].map((o, i) => mk(o, i))
  assert(buildConsistency(six, 6)!.gap === undefined, 'a six-serve spread the camera makes was called best and worst')
  // Graded on different rows, the gap is partly the measuring: not a pair.
  const apart = [mk(84, 0, ['releaseHeight', 'tossArmHold']), mk(70, 1, ['releaseHeight'])]
  assert(buildConsistency(apart, 2)!.gap === undefined, 'a best and worst measured on different rows were paired')
})

heading('A change of side is not a change of server (L2.3)')

/** What a sweep reads of one serve's scale, from the virtual phone. */
const scaleOf = (frames: Frame[]) => {
  const skel = detectServe(frames, 30)
  return { scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY } } as unknown as Analysis
}

/** The same frames with somebody `k` times the height standing on the same spot. */
function otherBody(frames: Frame[], k: number): Frame[] {
  const f0 = frames[0]
  const ground = Math.max(f0.image[LM.leftAnkle].y, f0.image[LM.rightAnkle].y)
  const cx = (f0.image[LM.leftAnkle].x + f0.image[LM.rightAnkle].x) / 2
  return frames.map((fr) => ({
    ...fr,
    image: fr.image.map((l) => ({ ...l, x: cx + (l.x - cx) * k, y: ground + (l.y - ground) * k })),
  }))
}

check('the deuce and ad sides from the guide\'s placement are one server', () => {
  // Four metres and nearly six along the lens: the same body reads 44% taller
  // on the near side, and used to be told someone else served.
  for (const serve of REAL_SERVES) {
    const near = scaleOf(filmMocap(serve, { distance: 4 }))
    const far = scaleOf(filmMocap(serve, { distance: 5.75 }))
    const slope = (near.scale!.groundY - far.scale!.groundY) / (near.scale!.bodyHeight - far.scale!.bodyHeight)
    assert(slope >= SAME_BODY_SLOPE[0] && slope <= SAME_BODY_SLOPE[1], `${serve.id}: the feet moved ${slope.toFixed(2)} per unit of height`)
    assert(!possibleHandoff([near, far, near, far]), `${serve.id}: a change of side was called a hand-off`)
  }
})

check('somebody a fifth shorter on the same spot is still flagged', () => {
  for (const serve of REAL_SERVES) {
    const frames = filmMocap(serve, { distance: 4 })
    const player = scaleOf(frames)
    const other = scaleOf(otherBody(frames, 0.8))
    assert(possibleHandoff([player, player, other]), `${serve.id}: a shorter body on the same spot was not flagged`)
  }
})

report()
