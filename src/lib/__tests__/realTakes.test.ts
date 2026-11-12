/**
 * The player's own comparisons on real takes, in real units (H43).
 *
 * The seeded cases in `baseline.test.ts`, `serveLinks.test.ts` and the session
 * stats draw their noise in units of `CARD_NOISE_SD`, so those rates come out the
 * same whatever the table says; the baseline and link suites' rig checks do move
 * with it. These take the question to real takes: real motion, filmed with the
 * suite's camera noise, read the way the app reads a file and scored through the
 * app's path, so the noise is whatever it is and the table has to cover it.
 *
 * WHAT THIS PROVES. Consistency, not accuracy, and under the suite's noise only:
 * under the tracker noise fitted to MediaPipe the usual's false rate sits near its
 * 5% budget. Six serves, a modelled camera, and one serve filmed many times stands
 * in for a player, who would also move.
 */
import { againstUsual, baselineFor, FALSE_READINGS_PER_SERVE } from '../baseline'
import { serveLinks } from '../serveLinks'
import { runEngine, type EngineRun } from '../../dev/mocap/engine'
import { overallOf } from '../analysis/coaching'
import { unswapFrames } from '../analysis/swapGuard'
import { SCORING_VERSION } from '../analysis/types'
import { REAL_SERVES, realOnFile, seeds } from '../analysis/__tests__/repeatability'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'
import type { Session } from '../storage/db'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const PLACES = [
  ['the guide', {}],
  ['the back fence', { bearing: 180, distance: 6 }],
] as const

/** Every take of every serve, as the fields a stored report keeps. */
function pool(phone: { bearing?: number; distance?: number }): EngineRun[][] {
  return REAL_SERVES.map((serve) =>
    seeds(120).flatMap((seed) => {
      const read = runEngine(unswapFrames(realOnFile(serve, phone, seed, 30)).frames, 32)
      return read.ok ? [read.run] : []
    }),
  )
}

let ids = 0
function stored(run: EngineRun, at: number, ms?: number): Session {
  return {
    id: `real-${ids++}-0`,
    createdAt: at,
    overall: overallOf(run.fundamentals),
    serveType: 'flat',
    scoringVersion: SCORING_VERSION,
    triage: { status: 'ok' },
    quality: { view: run.quality.view },
    fundamentals: run.fundamentals,
    ...(ms === undefined ? {} : { speed: { speed: { ms, low: ms * 0.97, high: ms * 1.03, samples: 6, span: 0.08, depthAngle: 4 } } }),
  } as unknown as Session
}

/** A small seeded shuffle, so a history is a different draw from one pool each time. */
function shuffler(seed: number) {
  let s = seed
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
  return { next, draw: <T,>(xs: readonly T[]) => xs.map((x) => [next(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x) }
}

const history = (runs: EngineRun[], trips: number, speed?: () => number) => {
  const perTrip = Math.ceil(runs.length / trips)
  return runs.map((run, i) => stored(run, Math.floor(i / perTrip) * 7 * DAY + (i % perTrip) * 0.1 * HOUR, speed?.()))
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`
const places = PLACES.map(([where, phone]) => ({ where, serves: pool(phone) }))

heading('One serve, filmed again and again')

check('the player’s own usual says nothing false about a real serve at its stated rate', () => {
  for (const { where, serves } of places) {
    let said = 0
    let spoken = 0
    let worst = 0
    serves.forEach((takes, s) => {
      const { draw } = shuffler(1000 + s)
      let saidHere = 0
      const runs = 200
      for (let k = 0; k < runs; k++) {
        const [now, ...rest] = draw(takes)
        const past = history(rest.slice(0, 24), 6)
        const serve = stored(now, Math.max(...past.map((p) => p.createdAt)) + 7 * DAY)
        const base = baselineFor(serve, past)
        if (!base) continue
        spoken++
        if (againstUsual(serve, base).length) saidHere++
      }
      said += saidHere
      worst = Math.max(worst, saidHere / runs)
    })
    note(`${where}: ${pct(said / spoken)} of ${spoken} serves said something, the worst serve ${pct(worst)}`)
    assert(spoken > 1000, `only ${spoken} histories gave a baseline`)
    assert(said / spoken <= FALSE_READINGS_PER_SERVE, `${where}: ${pct(said / spoken)} past the stated rate`)
  }
})

check('a player’s fastest serves share nothing with each other when speed is a coin flip', () => {
  for (const { where, serves } of places) {
    let found = 0
    let runs = 0
    serves.forEach((takes, s) => {
      const { draw, next } = shuffler(2000 + s)
      for (let k = 0; k < 40; k++) {
        const past = history(draw(takes).slice(0, 30), 5, () => 36 + 4 * (next() - 0.5))
        runs++
        if (serveLinks(past).length) found++
      }
    })
    note(`${where}: a link in ${pct(found / runs)} of ${runs} histories of real noise`)
    assert(found / runs <= 0.05, `${where}: links found in ${pct(found / runs)} of noise histories`)
  }
})

report()
