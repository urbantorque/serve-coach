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
 * the table to a fresh measurement on the app's own read, holds a noise-only
 * basket of real serves to "steady", and checks a real difference is still found.
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
import { runEngine } from '../../../dev/mocap/engine'
import { overallOf } from '../coaching'
import { LM } from '../geometry'
import { filmMocap } from '../mocapServe'
import { detectServe } from '../phases'
import { unswapFrames } from '../swapGuard'
import { type ServeDials } from '../syntheticServe'
import type { Analysis, Frame } from '../types'
import { REAL_CHANGE, bestWorstGap } from '../realChange'
import { FILE_RATES, REAL_SERVES, realOnFile, rigOnFile, seeds } from './repeatability'
import { cueIssues } from '../voice'
import { assert, check, heading, note, report } from './harness'

/** The takes behind every figure here. The table is measured on exactly these. */
const TAKES = seeds(240)


/** One take through the app's own path, as the slice of an analysis a basket needs. */
function take(frames: Frame[], index: number): Analysis | undefined {
  const read = runEngine(unswapFrames(frames).frames, 32)
  if (!read.ok) return undefined
  const { fundamentals, skel, diagnosis, quality } = read.run
  return {
    fundamentals,
    overall: overallOf(fundamentals),
    serves: { count: 6, index },
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    // What the register's lines read: the tempo, the view and the diagnosis.
    phases: [
      { id: 'ready', t: read.run.frames[skel.keys.ready].t },
      { id: 'contact', t: skel.times.contact },
    ],
    quality,
    diagnosis,
  } as unknown as Analysis
}

/** Baskets of six, in order. */
const basketsOf = (takes: Analysis[]) => {
  const out = []
  for (let start = 0; start + 6 <= takes.length; start += 6) out.push(buildConsistency(takes.slice(start, start + 6), 6)!)
  return out
}

const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

/** Every take of every real serve on one file, from one placement, with the suite's camera noise. */
function realTakes(phone: { bearing?: number; distance?: number }, fileFps: number) {
  return REAL_SERVES.map((serve) =>
    TAKES.map((seed, i) => take(realOnFile(serve, phone, seed, fileFps), i)).filter((a): a is Analysis => a !== undefined),
  )
}

const rigTakes = (dials: Partial<ServeDials>, fileFps: number) =>
  TAKES.map((seed, i) => take(rigOnFile(dials, seed, fileFps), i)).filter((a): a is Analysis => a !== undefined)

const guide = FILE_RATES.flatMap((fps) => realTakes({}, fps))
const back = FILE_RATES.flatMap((fps) => realTakes({ bearing: 180, distance: 6 }, fps))
const rig = FILE_RATES.map((fps) => rigTakes({}, fps))

heading('The camera, measured')

check('the noise table covers what the camera does to every card reading', () => {
  const worst: Record<string, number> = {}
  for (const takes of [...guide, ...back, ...rig]) {
    const ids = new Set(takes.flatMap((a) => a.fundamentals.flatMap((f) => f.metrics.map((m) => m.id))))
    for (const id of ids) {
      const values = takes
        .map((a) => a.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === id)?.value)
        .filter((v): v is number => Number.isFinite(v))
      if (values.length >= 120) worst[id] = Math.max(worst[id] ?? 0, sd(values))
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

heading('Noise alone isn’t called a wandering serve')

check('a real serve filmed six times is called steady, from the side and from behind', () => {
  // None told a row changes most; at most one in a hundred told a row drifts,
  // which names it too (H38: one of 480 from the guide, arm extension).
  for (const [where, serves] of [
    ['the guide', guide],
    ['the back fence', back],
  ] as const) {
    let drifts = 0
    let baskets = 0
    serves.forEach((takes, s) => {
      for (let start = 0; start + 6 <= takes.length; start += 6) {
        const basket = buildConsistency(takes.slice(start, start + 6), 6)!
        const headline = consistencyHeadline(basket)
        baskets++
        if (headline.includes('drifts')) drifts++
        assert(
          !headline.includes('changes most'),
          `${where}, serve ${s + 1}, takes ${start + 1}–${start + 6}: "${headline}" (${basket.weakest?.label} ${basket.weakest?.score})`,
        )
      }
    })
    note(`${where}: ${drifts} of ${baskets} noise-only baskets told a row drifts, none that one changes most`)
    assert(drifts <= baskets * 0.01, `${where}: ${drifts} of ${baskets} noise-only baskets told a row drifts`)
  }
})

check('legs that barely bend are called steady too, and hold their timing', () => {
  // Noise decides take by take whether these knees show a trough, and off the
  // knees the moment moved load ratio 4.5 points at 170° and 6.5 at 165°. Against
  // a table of 1.67 that called a still serve wandering, and these legs are not
  // in the table, which is one clean rig serve and the Bath serves. So they are
  // held here.
  for (const trophyKneeAngle of [165, 170, 174]) {
    const takes = rigTakes({ trophyKneeAngle }, 30)
    const load = takes
      .map((a) => a.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'loadRatio')?.value)
      .filter((v): v is number => Number.isFinite(v))
    note(`${trophyKneeAngle}°: load ratio ${sd(load).toFixed(2)} points over ${load.length} takes`)
    assert(sd(load) <= 2, `legs held at ${trophyKneeAngle}° moved load ratio ${sd(load).toFixed(2)} points between takes`)
    for (let start = 0; start + 6 <= takes.length; start += 6) {
      const basket = buildConsistency(takes.slice(start, start + 6), 6)!
      const headline = consistencyHeadline(basket)
      assert(!headline.includes('changes most'), `${trophyKneeAngle}°, takes ${start + 1}–${start + 6}: "${headline}"`)
    }
  }
})

check('legs bent to 155 or 160 with no drop: what load ratio still tells a still serve, held where it is', () => {
  /*
   * KNOWN, NOT FIXED (H46). Between a full load and rigid legs the load is timed
   * from the hips on some takes and from the arms' trophy on others
   * (`LOAD_MIN_SINK`), and the two read about nine points apart. A basket that
   * mixes them is told its time from trophy to contact drifts or changes most:
   * 16 to 24% of still baskets of six at 155–160° with no drop on the review's
   * own seeds (3 to 7 of 40 on the suite's takes), and up to 14% with the drop
   * at 150° at 60 fps. Comparing the row only where every serve was timed the
   * same way is the fix it wants. Until then the rate is held here, at the worst
   * cell's 7, so it cannot grow unseen.
   */
  for (const trophyKneeAngle of [155, 160]) {
    for (const fps of FILE_RATES) {
      const baskets = basketsOf(rigTakes({ trophyKneeAngle, dropBelowShoulder: -0.25 }, fps))
      const told = baskets.filter((b) => /Time from trophy to contact (drifts|changes most)/.test(consistencyHeadline(b))).length
      note(`${trophyKneeAngle}° with no drop at ${fps}: ${told} of ${baskets.length} told load ratio moves`)
      assert(told <= 8, `${trophyKneeAngle}° at ${fps}: ${told} of ${baskets.length}`)
    }
  }
})

check('a basket that really varies is still found, on the app’s read', () => {
  // The same rig serve with the hand met at a different height each time, under
  // the suite's camera noise, on a 30 fps file. Reaching lower also bends the
  // arm, so arm extension moves with it; the contact row has to be among those
  // flagged. Over a hundred baskets rather than one, so it is a rate.
  const reaches = [1.02, 1.12, 1.22, 1.32, 1.42, 1.08]
  let contactFound = 0
  let found = 0
  let baskets = 0
  for (const seed of seeds(100)) {
    const takes = reaches
      .map((contactReach, i) => take(rigOnFile({ contactReach } as Partial<ServeDials>, seed + 977 * i, 30), i))
      .filter((a): a is Analysis => a !== undefined)
    const basket = buildConsistency(takes, takes.length)
    if (!basket) continue
    baskets++
    if ((basket.metrics.find((m) => m.id === 'contactHeight')?.score ?? 100) < 70) contactFound++
    if ((basket.weakest?.score ?? 100) < 70) found++
  }
  note(`of ${baskets} baskets: contact flagged on ${contactFound}, the basket called varied on ${found}`)
  assert(found === baskets, `a basket that really varied was called steady ${baskets - found} times`)
  assert(contactFound >= 0.9 * baskets, `a contact that moved by a fifth of the body was flagged on only ${contactFound}`)
})

check('one serve too dim to compare is left out, not the whole basket', () => {
  /*
   * A row is compared only where every serve is firm on it, so one serve triage
   * let through but hedged on every row emptied the basket, and the sweep said it
   * could not read the other serves (H45). It is left out and counted as skipped,
   * which the panel calls too unclear to compare.
   */
  const six = rig[0].slice(0, 6)
  const clear = buildConsistency(six.slice(0, 5), 6)!
  const dim = { ...six[5], fundamentals: six[5].fundamentals.map((f) => ({ ...f, metrics: f.metrics.map((m) => ({ ...m, confidence: 0.5 })) })) }
  const basket = buildConsistency([...six.slice(0, 5), dim], 6)
  note(`five clear serves and one dim: ${basket ? `${basket.serves} compared on ${basket.metrics.length} rows, ${basket.skipped} skipped` : 'no basket'}`)
  assert(basket !== undefined, 'one dim serve emptied the basket')
  assert(basket!.serves === 5 && basket!.skipped === 1, `${basket!.serves} serves compared and ${basket!.skipped} skipped`)
  assert(basket!.metrics.length === clear.metrics.length, `${basket!.metrics.length} rows compared, not the ${clear.metrics.length} the clear serves share`)
  // Two as dim: leaving one out raises nothing, so both go, and four are compared.
  const two = buildConsistency([...six.slice(0, 4), dim, { ...dim }], 6)
  assert(two !== undefined && two.serves === 4 && two.skipped === 2, `two dim serves gave ${two ? `${two.serves} serves, ${two.skipped} skipped` : 'no basket'}`)
  // And where every serve is as dim, none is singled out: there is nothing to compare.
  assert(buildConsistency(six.map(() => dim), 6) === undefined, 'a basket of nothing firm was compared')
})

check('two serves with a drop and four without aren’t called steady, and a drop left out is said on every line', () => {
  /*
   * Where most serves were named for a drop the engine could not find, the drop's
   * rows were left out and the basket said "Almost nothing moved" about serves that
   * dropped the racket and serves that did not (H45). Kept in under "I found no
   * racket drop on 4 of them", the drop's own row was then graded steady beneath it,
   * and a basket whose drop rows were left out and another row drifted said nothing
   * of the drop at all (H46). THE PROMISE CHANGED: the rows are left out wherever
   * half the serves or more are named, a pair with one named included, and every
   * headline over such a basket says so.
   */
  const without = rigTakes({ dropBelowShoulder: -0.25 }, 30)
  const withDrop = rig[0]
  const bare = (b: ReturnType<typeof buildConsistency>) => !!b && consistencyHeadline(b).startsWith('Almost nothing moved')
  const DROP_ROWS = ['dropDepth', 'elbowAtDrop', 'dropToContact']
  const mixes: [string, Analysis[][]][] = [
    ['two with a drop and four without', Array.from({ length: 39 }, (_, i) => [withDrop[2 * i], withDrop[2 * i + 1], ...without.slice(4 * i, 4 * i + 4)])],
    ['three and three', Array.from({ length: 40 }, (_, i) => [...withDrop.slice(3 * i, 3 * i + 3), ...without.slice(3 * i, 3 * i + 3)])],
    ['one and two', Array.from({ length: 40 }, (_, i) => [withDrop[i], ...without.slice(2 * i, 2 * i + 2)])],
    ['one and one', Array.from({ length: 40 }, (_, i) => [withDrop[i], without[i]])],
  ]
  for (const [name, sets] of mixes) {
    const baskets = sets.map((s) => buildConsistency(s, s.length)).filter((b): b is NonNullable<typeof b> => !!b)
    const out = baskets.filter((b) => b.missingDrop?.leftOut)
    note(`${name}: ${out.length} of ${baskets.length} left the drop out, ${baskets.filter(bare).length} called steady`)
    assert(out.length > 0, `${name}: no basket left the drop out, so this checks nothing`)
    for (const b of baskets) {
      const headline = consistencyHeadline(b)
      const m = b.missingDrop
      assert(!m || m.leftOut === m.serves * 2 >= b.serves, `${name}: ${m?.serves} of ${b.serves} named, left out ${m?.leftOut}`)
      assert(cueIssues(headline).length === 0, name + ': "' + headline + '": ' + cueIssues(headline).join('; '))
      if (!m?.leftOut) continue
      assert(/no racket drop on .* so I left it out\.$/.test(headline), `${name}: the drop was left out and the headline didn’t say so: "${headline}"`)
      assert(!b.metrics.some((r) => DROP_ROWS.includes(r.id)), `${name}: a drop row was graded under "${headline}"`)
    }
    if (name === 'two with a drop and four without') assert(!baskets.some(bare), `${name}: a drop that came and went was called steady`)
  }
  const steady = basketsOf(without)
  const said = steady.filter((b) => /so I left it out\.$/.test(consistencyHeadline(b))).length
  note(`six without a drop: ${said} of ${steady.length} told the drop was left out`)
  assert(steady.every((b) => !bare(b)), 'a basket with no drop to find was called steady without saying so')
  assert(said >= 0.9 * steady.length, `only ${said} of ${steady.length} said the drop was left out`)
})

check('a serve with no drop isn’t told its drop drifts', () => {
  /*
   * The commonest club serve: rigid legs and a racket left up. With no drop to
   * find, the drop lands on the toss or the trophy by take, and the row read
   * there jumps between them. 38 noise-only baskets of 40 were told "Racket drop
   * drifts" or that it changes most. Where every serve is named for the missing
   * drop, those rows are not compared (H44).
   */
  for (const [name, dials] of [
    ['the modal club serve', { trophyKneeAngle: 170, dropBelowShoulder: -0.25 }],
    ['the modal serve, met low', { trophyKneeAngle: 170, dropBelowShoulder: -0.25, contactReach: 1.0 }],
    ['no drop', { dropBelowShoulder: -0.25 }],
  ] as const) {
    for (const fps of FILE_RATES) {
      const baskets = basketsOf(rigTakes(dials, fps))
      const said = baskets.filter((b) => /drifts|changes most/.test(consistencyHeadline(b)))
      note(`${name} at ${fps}: ${said.length} of ${baskets.length} called wandering${said.length ? `, ${said[0].weakest?.label}` : ''}`)
      assert(said.length <= 2, `${name} at ${fps}: ${said.length} noise-only baskets called wandering`)
      assert(!said.some((b) => b.weakest?.id === 'dropDepth'), `${name} at ${fps}: told its drop drifts`)
    }
  }
})

check('a still serve gets no line about its sequence, its landing or its arm', () => {
  // The register compares a basket's extremes. Bounded as two serves picked in
  // advance, 184 noise-only baskets of 238 from the guide printed a line (H44).
  // And from the rear corners and the edge of the view from behind, where the arm
  // reads noisier: with the arm line on every view but side-on, a still serve
  // there was told its shoulder laid back further on up to one basket in five (H45).
  const corners = [{ bearing: 135 }, { bearing: 225 }].flatMap((phone) =>
    REAL_SERVES.map((serve) => seeds(60).map((seed, i) => take(realOnFile(serve, phone, seed, 30), i)).filter((a): a is Analysis => a !== undefined)),
  )
  const edge = seeds(60).map((seed, i) => take(rigOnFile({ cameraYaw: 27 } as Partial<ServeDials>, seed, 30), i)).filter((a): a is Analysis => a !== undefined)
  let lines = 0
  let baskets = 0
  for (const takes of [...guide, ...back, ...rig, ...corners, edge]) {
    for (const b of basketsOf(takes)) {
      baskets++
      lines += b.uncalibrated?.length ?? 0
    }
  }
  note(`${lines} lines over ${baskets} noise-only baskets`)
  assert(lines <= baskets * 0.01, `${lines} lines over ${baskets} baskets of nothing changing`)
})

check('a moved basket with its steadiest rows tied names none of them', () => {
  // Nine or ten rows of a moved basket still read 100, and the last of them in
  // card order was printed under "holds steadiest".
  const moved = [...guide, ...back, ...rig].flatMap(basketsOf).filter((b) => b.weakest)
  const tiedTop = moved.filter((b) => b.metrics.filter((m) => m.score === b.metrics[b.metrics.length - 1].score).length > 1)
  note(`${moved.length} baskets moved; ${tiedTop.length} of them with a tie at the top`)
  for (const b of tiedTop) assert(!b.steadiest, `a tie at the top named ${b.steadiest?.label}`)
})

check('a steady basket names no weakest row, because nothing is', () => {
  // Most baskets of one serve read 100 on every row. Whichever row a sort left
  // first used to be printed as the one that wanders most (H43).
  const steady = guide.flatMap(basketsOf)
  const tied = steady.filter((b) => b.metrics.every((m) => m.score >= 100))
  note(`${tied.length} of ${steady.length} baskets from the guide read 100 on every row`)
  assert(tied.length > 0, 'no basket tied, so this checks nothing')
  for (const b of tied) {
    assert(!b.weakest && !b.steadiest, `a tie at 100 named ${b.weakest?.label}`)
    assert(consistencyHeadline(b).includes('Almost nothing moved'), `a tie at 100 said "${consistencyHeadline(b)}"`)
  }
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
  assert(row.offTarget === true, 'six straight-legged serves weren’t marked off target')
  assert(row.score >= 85, `a reading that held still scored ${row.score} for steadiness`)
})

check('best against worst needs a gap the score can tell apart', () => {
  // Two serves are held to the report's own line between two scores (L3.1).
  assert(
    bestWorstGap(2) === REAL_CHANGE.overall,
    `two serves need ${bestWorstGap(2)}, the report's line is ${REAL_CHANGE.overall}`,
  )
  // One row at least: a basket with nothing compared is no basket (H44).
  const mk = (overall: number, i: number, rows: string[] = ['releaseHeight']) =>
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

heading('A change of side isn’t a change of server (L2.3)')

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
    assert(possibleHandoff([player, player, other]), `${serve.id}: a shorter body on the same spot wasn’t flagged`)
  }
})

report()
