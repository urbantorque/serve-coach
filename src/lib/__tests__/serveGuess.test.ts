/**
 * Guessing first or second from the player's own record: what it says, when it
 * refuses, that a guess goes nowhere, and how often it is wrong.
 *
 * The rates are simulated, because there are no labelled clips. A simulated
 * practice style cannot show that the rule fits real players. It can show the
 * thing the rule claims: that a guess speaks only where the player's own tags
 * already show the pattern, and that a player who practises some other way is
 * left alone. The ball speed noise is `ServeSpeed`'s own: 4.5% at the 95th
 * percentile and a range of ±5–7%, from `vision/__tests__/serveSpeed.test.ts`.
 */
import { byServeNumber, inRateByType, secondServeSlower } from '../progress'
import { FAIR_BOUND, LIKELY_BOUND, guessLine, guessServeNumber, rateFloor, type GuessReason, type ServeGuess } from '../serveGuess'
import { normaliseServeTag, type ServeOutcome, type ServeTag, type Session } from '../storage/db'
import type { ServeSpeed } from '../vision/serveSpeed'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

function seeded(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, next()))) * Math.cos(2 * Math.PI * next())
  return { next, gauss }
}

let clock = 1_000_000

/** One report: the fields a guess reads, and enough of the rest for the statistics. */
function report_(clip: string, index: number, start: number, extra: Partial<Session> = {}): Session {
  clock += 1000
  return {
    id: `serve-${clip}-${index}`,
    createdAt: clock,
    serves: { count: 20, index },
    window: { start, end: start + 3 },
    overall: 70,
    fundamentals: [],
    serveType: 'flat',
    ...extra,
  } as unknown as Session
}

const tagOf = (id: string, serveNumber?: 1 | 2, outcome?: ServeOutcome): ServeTag => ({ id, serveNumber, outcome, taggedAt: clock })

const speed = (ms: number, half = 0.05): Pick<Session, 'speed'> => ({
  speed: { speed: { ms, low: ms * (1 - half), high: ms * (1 + half), samples: 8, span: 0.1, depthAngle: 5 } as ServeSpeed },
})

/** One clip of a sitting, every serve tagged, played as a match is. */
function matchFlow(clip: string, outcomes: ServeOutcome[]) {
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  let n: 1 | 2 = 1
  outcomes.forEach((outcome, i) => {
    const s = report_(clip, i, i * 20)
    sessions.push(s)
    tags.push(tagOf(s.id, n, outcome))
    n = n === 1 && outcome !== 'in' ? 2 : 1
  })
  return { sessions, tags }
}

const WEEK: ServeOutcome[] = ['net', 'in', 'in', 'long', 'in', 'wide', 'net', 'in', 'net', 'in', 'in', 'long', 'in', 'in', 'wide', 'in', 'net', 'in', 'in', 'long', 'in']

heading('Guessing first or second')

check('a serve straight after a tagged fault is guessed a second, once the player’s record shows it', () => {
  const { sessions, tags } = matchFlow('aaa', WEEK)
  const fault = report_('bbb', 0, 0)
  const next = report_('bbb', 1, 18)
  const all = [...sessions, fault]
  const said = [...tags, tagOf(fault.id, 1, 'net')]
  const guess = guessServeNumber(next, all, said)
  note(JSON.stringify(guess))
  assert(guess?.serveNumber === 2 && guess.reason === 'after_a_fault', `guessed ${JSON.stringify(guess)}`)
  assert(guess!.agreed === guess!.cases, 'the record held a case that went the other way')
})

check('with no record it says nothing, however much it looks like a second serve', () => {
  const fault = report_('ccc', 0, 0)
  const next = report_('ccc', 1, 15)
  assert(guessServeNumber(next, [fault], [tagOf(fault.id, 1, 'net')]) === undefined, 'a guess with no record behind it')
})

check('a player who hits first serves in a row is never told a second', () => {
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  WEEK.forEach((outcome, i) => {
    const s = report_('ddd', i, i * 20)
    sessions.push(s)
    tags.push(tagOf(s.id, 1, outcome))
  })
  const fault = report_('eee', 0, 0)
  const next = report_('eee', 1, 18)
  const guess = guessServeNumber(next, [...sessions, fault], [...tags, tagOf(fault.id, 1, 'net')])
  assert(guess?.serveNumber !== 2, `told ${JSON.stringify(guess)}`)
})

check('a serve the player tagged is not guessed', () => {
  const { sessions, tags } = matchFlow('fff', WEEK)
  const last = sessions[sessions.length - 1]
  const next = report_('fff', WEEK.length, WEEK.length * 20)
  assert(guessServeNumber(next, [...sessions, next], [...tags, tagOf(next.id, 2)]) === undefined, 'a tagged serve was guessed')
  assert(guessServeNumber(last, sessions, tags) === undefined, 'a tagged serve was guessed')
})

check('serves that may not be consecutive are not a sequence', () => {
  const { sessions, tags } = matchFlow('ggg', WEEK)
  const fault = report_('hhh', 0, 0)
  const said = [...tags, tagOf(fault.id, 1, 'net')]
  // Two minutes on in the same file.
  const late = report_('hhh', 1, 120)
  assert(guessServeNumber(late, [...sessions, fault], said) === undefined, 'a serve two minutes on was read as following')
  // A serve missing between them.
  const skipped = report_('hhh', 2, 40)
  assert(guessServeNumber(skipped, [...sessions, fault], said) === undefined, 'a gap in the clip was read as following')
  // Another clip, picked from the camera roll: the report's time is not the filming's.
  const picked = report_('iii', 0, 0)
  assert(guessServeNumber(picked, [...sessions, fault], said) === undefined, 'a picked clip was read as following')
})

check('two clips recorded in the app, one straight after the other, are a sequence', () => {
  const { sessions, tags } = matchFlow('jjj', WEEK)
  const capture = { capture: { width: 1280 } } as Partial<Session>
  const fault = report_('kkk', 0, 0, capture)
  clock += 60_000
  const next = report_('lll', 0, 0, capture)
  const guess = guessServeNumber(next, [...sessions, fault], [...tags, tagOf(fault.id, 1, 'long')])
  assert(guess?.serveNumber === 2, `guessed ${JSON.stringify(guess)}`)
  clock += 600_000
  const later = report_('mmm', 0, 0, capture)
  assert(guessServeNumber(later, [...sessions, fault], [...tags, tagOf(fault.id, 1, 'long')]) === undefined, 'ten minutes on was read as following')
})

check('reports from before a clip’s serves were counted cost nothing', () => {
  const { sessions, tags } = matchFlow('qqq', WEEK)
  const old = { id: 'serve-1', createdAt: 5 } as unknown as Session
  const next = report_('rrr', 1, 18)
  assert(guessServeNumber(old, [...sessions, old], tags) === undefined, 'a report with no place in a clip was guessed')
  assert(guessServeNumber(next, [old, ...sessions], tags) === undefined, 'a serve with nothing before it was guessed')
})

check('a short record cannot be sure: the bound rises with the cases', () => {
  note(`5 of 5 ${rateFloor(5, 5).toFixed(2)}, 6 of 6 ${rateFloor(6, 6).toFixed(2)}, 12 of 12 ${rateFloor(12, 12).toFixed(2)}, 9 of 12 ${rateFloor(9, 12).toFixed(2)}`)
  assert(rateFloor(5, 5) < FAIR_BOUND, 'five cases were enough')
  assert(rateFloor(6, 6) >= FAIR_BOUND && rateFloor(6, 6) < LIKELY_BOUND, 'six cases were not fair')
  assert(rateFloor(12, 12) >= LIKELY_BOUND, 'twelve straight were not likely')
  assert(rateFloor(9, 12) < FAIR_BOUND, 'three in four over twelve cases spoke')
})

heading('A guess goes nowhere')

check('it cannot become a tag, and no statistic moves when one is made', () => {
  const { sessions, tags } = matchFlow('nnn', WEEK)
  const fault = report_('ooo', 0, 0)
  const next = report_('ooo', 1, 18)
  const all = [...sessions, fault, next]
  const said = [...tags, tagOf(fault.id, 1, 'net')]
  const before = JSON.stringify([byServeNumber(all, said), inRateByType(all, said), secondServeSlower(all, said)])
  const frozen = JSON.stringify(said)
  const guess = guessServeNumber(next, all, said) as ServeGuess
  assert(guess !== undefined, 'nothing was guessed')
  assert(JSON.stringify(said) === frozen, 'guessing wrote to the tags')
  // No id and no time: the store refuses it, and it could not say which serve.
  assert(normaliseServeTag(guess) === undefined, 'a guess was accepted as a tag')
  assert(!('id' in guess) && !('taggedAt' in guess), 'a guess carries what a tag needs')
  assert(JSON.stringify([byServeNumber(all, said), inRateByType(all, said), secondServeSlower(all, said)]) === before, 'a statistic moved')
})

heading('How often it is wrong, on simulated practice')

type Style = 'match' | 'firsts' | 'seconds' | 'pairs' | 'mixed'

/**
 * Walking through a run of sittings serve by serve: each untagged serve is
 * asked about, from what was tagged before it, and scored against what it was.
 * In-rates are about what club players land; no rate here is a claim about
 * them, only something for a pattern to come out of.
 */
function simulate(style: Style, tagRate: number, slip: number, trials: number) {
  let asked = 0
  let spoke = 0
  let wrong = 0
  for (let trial = 0; trial < trials; trial++) {
    const r = seeded(4100 + trial * 7919)
    const sessions: Session[] = []
    const tags: ServeTag[] = []
    for (let sitting = 0; sitting < 5; sitting++) {
      const kind = style === 'mixed' ? (r.next() < 0.5 ? 'match' : 'firsts') : style
      let n: 1 | 2 = kind === 'seconds' ? 2 : 1
      const count = 12 + Math.floor(r.next() * 9)
      for (let i = 0; i < count; i++) {
        const went = r.next() < (n === 1 ? 0.55 : 0.8)
        const outcome: ServeOutcome = went ? 'in' : r.next() < 0.5 ? 'net' : 'long'
        const s = report_(`t${trial}s${sitting}`, i, i * 20)
        if (r.next() < tagRate) {
          const told = r.next() < slip ? (n === 1 ? 2 : 1) : n
          tags.push(tagOf(s.id, told, r.next() < tagRate ? outcome : undefined))
        } else {
          asked++
          const guess = guessServeNumber(s, sessions, tags)
          if (guess) {
            spoke++
            if (guess.serveNumber !== n) wrong++
          }
        }
        sessions.push(s)
        if (kind === 'match') n = n === 1 && !went ? 2 : 1
        else if (kind === 'pairs') n = n === 1 ? 2 : 1
      }
    }
  }
  return { asked, spoke, wrong }
}

check('over practice styles, tag rates and wrong taps, a guess is rarely wrong', () => {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  for (const [tagRate, slip] of [
    [0.8, 0],
    [0.8, 0.05],
    [0.5, 0],
    [0.5, 0.05],
  ]) {
    for (const style of ['match', 'firsts', 'seconds', 'pairs', 'mixed'] as Style[]) {
      const { asked, spoke, wrong } = simulate(style, tagRate, slip, 12)
      const rate = spoke ? wrong / spoke : 0
      note(`${style}, ${pct(tagRate)} tagged, ${pct(slip)} mis-tapped: spoke on ${pct(spoke / Math.max(1, asked))} of ${asked}, wrong on ${pct(rate)}`)
      assert(spoke === 0 || rate <= 0.08, `${style} at ${tagRate}, slip ${slip}: wrong on ${pct(rate)}`)
    }
  }
})

/**
 * The ball: first serves at a base speed, second serves slower by `gap`, a
 * player's own spread from serve to serve, and the reader's error and range.
 */
function ballTrial(gap: number, spread: number, n: number, r: ReturnType<typeof seeded>) {
  const reading = (second: boolean) => {
    const truth = 45 * (second ? 1 - gap : 1) * (1 + spread * r.gauss())
    return speed(truth * (1 + 0.023 * r.gauss()), 0.048 + r.next() * 0.024)
  }
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  for (let i = 0; i < 2 * n; i++) {
    const s = report_(`b${Math.floor(r.next() * 1e9).toString(36)}`, 0, 0, reading(i % 2 === 1))
    sessions.push(s)
    tags.push(tagOf(s.id, i % 2 === 1 ? 2 : 1))
  }
  const second = r.next() < 0.5
  const query = report_(`q${Math.floor(r.next() * 1e9).toString(36)}`, 0, 0, reading(second))
  const guess = guessServeNumber(query, sessions, tags)
  return { guess, second }
}

check('from the ball speed, no gap says nothing, and the published gap is rarely wrong', () => {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  const rows: Record<string, { spoke: number; wrong: number }> = {}
  const TRIALS = 1000
  for (const spread of [0.05, 0.08]) {
    for (const gap of [0, 0.05, 0.1, 0.17, 0.24]) {
      for (const n of [6, 12]) {
        const r = seeded(9000 + Math.round(gap * 100) + n)
        let spoke = 0
        let wrong = 0
        for (let i = 0; i < TRIALS; i++) {
          const { guess, second } = ballTrial(gap, spread, n, r)
          if (!guess) continue
          spoke++
          if ((guess.serveNumber === 2) !== second) wrong++
        }
        rows[`${gap}/${spread}/${n}`] = { spoke: spoke / TRIALS, wrong: spoke ? wrong / spoke : 0 }
        note(`gap ${pct(gap)}, spread ${pct(spread)}, ${n} tagged each side: spoke on ${pct(spoke / TRIALS)}, wrong on ${pct(spoke ? wrong / spoke : 0)}`)
      }
    }
  }
  for (const spread of [0.05, 0.08]) {
    for (const n of [6, 12]) {
      assert(rows[`0/${spread}/${n}`].spoke <= 0.01, `no gap at all spoke on ${pct(rows[`0/${spread}/${n}`].spoke)}`)
      assert(rows[`0.05/${spread}/${n}`].spoke <= 0.02, `a gap inside the reader's range spoke on ${pct(rows[`0.05/${spread}/${n}`].spoke)}`)
      for (const gap of [0.17, 0.24]) {
        const row = rows[`${gap}/${spread}/${n}`]
        assert(row.spoke === 0 || row.wrong <= 0.08, `a ${pct(gap)} gap was wrong on ${pct(row.wrong)}`)
      }
    }
  }
  assert(rows['0.17/0.05/12'].spoke >= 0.2, `the published gap spoke on ${pct(rows['0.17/0.05/12'].spoke)}`)
})

check('a reading whose range straddles the midpoint says nothing', () => {
  const r = seeded(5)
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  for (let i = 0; i < 12; i++) {
    const s = report_(`w${i}`, 0, 0, speed((i % 2 ? 37 : 45) * (1 + 0.01 * r.gauss()), 0.04))
    sessions.push(s)
    tags.push(tagOf(s.id, i % 2 ? 2 : 1))
  }
  assert(guessServeNumber(report_('x', 0, 0, speed(44.5, 0.04)), sessions, tags)?.serveNumber === 1, 'a clear first was not guessed')
  assert(guessServeNumber(report_('x', 0, 0, speed(41, 0.04)), sessions, tags) === undefined, 'a serve on the midpoint was guessed')
  assert(guessServeNumber(report_('x', 0, 0, speed(44.5, 0.12)), sessions, tags) === undefined, 'a wide range was guessed')
})

check('a player whose second serves read faster than their firsts is not guessed from the ball', () => {
  const sessions: Session[] = []
  const tags: ServeTag[] = []
  for (let i = 0; i < 12; i++) {
    const s = report_(`y${i}`, 0, 0, speed(i % 2 ? 45 : 37, 0.04))
    sessions.push(s)
    tags.push(tagOf(s.id, i % 2 ? 2 : 1))
  }
  assert(guessServeNumber(report_('z', 0, 0, speed(45, 0.04)), sessions, tags) === undefined, 'the published direction was ignored')
})

check('when the serve before it and the ball disagree, it says nothing', () => {
  const { sessions, tags } = matchFlow('ppp', WEEK)
  const all = [...sessions]
  const said = [...tags]
  for (let i = 0; i < 12; i++) {
    const s = report_(`r${i}`, 0, 0, speed(i % 2 ? 37 : 45, 0.04))
    all.push(s)
    said.push(tagOf(s.id, i % 2 ? 2 : 1))
  }
  const fault = report_('sss', 0, 0)
  // After a fault, and hit as hard as a first serve.
  const next = report_('sss', 1, 18, speed(45, 0.04))
  all.push(fault)
  said.push(tagOf(fault.id, 1, 'net'))
  assert(guessServeNumber(next, all, said) === undefined, 'two kinds of evidence pulling apart produced a guess')
})

heading('What it says')

check('every reason at both levels is a line in the house voice', () => {
  const reasons: GuessReason[] = ['after_a_fault', 'after_a_second', 'after_a_first_in', 'speed_like_firsts', 'speed_like_seconds']
  for (const reason of reasons) {
    for (const confidence of ['likely', 'fair'] as const) {
      const line = guessLine({ reason, confidence })
      note(line)
      assert(cueIssues(line).length === 0, `${reason}: ${cueIssues(line).join(', ')}`)
      assert(!/\d/.test(line), `a number in "${line}"`)
    }
  }
})

report()
