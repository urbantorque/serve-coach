/**
 * Which figures may reach across a recalibration or a change of serve, said
 * once and checked, instead of restated in nine doc comments and enforced eight
 * times.
 *
 * WHY. Every cross-session number in this app carries the same two rules:
 *
 *   · **One rubric.** A saved report keeps no frames, so it can never be
 *     re-scored; when the marking is recalibrated the old numbers stay as they
 *     were computed and two scales live in one history permanently. Subtracting
 *     across that line measures the recalibration.
 *   · **One serve type.** A flat serve and a kick are graded against different
 *     target bands, so the difference between them measures the switch.
 *
 * Both are written out at length wherever they are applied, and on
 * 2026-08-16 that turned out to be the problem rather than the safeguard:
 * `bestOverallScore` applied the serve-type half and not the rubric half, and
 * nothing could see it, because there was no place where the rule existed as
 * anything but prose. The consequence was on screen — the home card printed one
 * "best" and the report printed another, from the same history — and it took
 * opening both at once to notice.
 *
 * HOW. Not a table of intentions, which would be more prose. Each entry below
 * runs a real figure over a clean history, then over the same history with one
 * contaminating report added, and asserts the answer did not move. A guard that
 * is missing cannot pass that, and a guard that is added to a tenth figure gets
 * a line here rather than a paragraph somewhere.
 *
 * WHAT IS DELIBERATELY EXEMPT is at the bottom, with its reason. `tripStreak`
 * and `longestStreak` count trips to the court rather than scores, so a serve of
 * any type under any rubric is evidence for them — and an exemption asserted is
 * worth more than an exemption assumed.
 */
import {
  bestConsistencyGap,
  bestOverallScore,
  buildConsistencyTrend,
  buildProgress,
  gapDeltaFor,
  longestStreak,
  thenAndNow,
  tripStreak,
} from '../progress'
import { findPracticeFocus } from '../practice'
import { KEEP_STILLS, type Session } from '../storage/db'
import type { ServeType } from '../storage/prefs'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const DAY = 24 * 60 * 60 * 1000

/**
 * A stored report, thin but carrying everything the figures below read.
 *
 * `overall` is deliberately high on the contaminating rows: a guard that is
 * missing has to *change the answer*, or the check would pass on a history
 * where crossing the line happened not to matter.
 */
function serve(
  daysAgo: number,
  overall: number,
  opts: { type?: ServeType; rubric?: number; basket?: number[]; id?: string } = {},
): Session {
  const id = opts.id ?? `s-${daysAgo}-${overall}-${opts.type ?? 'flat'}-${opts.rubric ?? 2}`
  return {
    id,
    createdAt: 1_800_000_000_000 - daysAgo * DAY,
    overall,
    overallStatus: 'good',
    serveType: opts.type ?? 'flat',
    scoringVersion: opts.rubric ?? 2,
    phases: [{ id: 'toss', label: 'Toss', caption: '', frame: 0, t: 0, thumbnail: 'x' }],
    fundamentals: [
      {
        id: 'swing',
        label: 'Swing',
        score: overall,
        status: 'good',
        blurb: '',
        headline: '',
        phase: 'drop',
        drill: { name: 'D', how: 'H', reps: 'R' },
        metrics: [
          { id: 'dropDepth', label: 'Racket drop', score: overall, value: overall / 100 },
        ],
      },
    ],
    consistency: opts.basket && {
      serves: opts.basket.length,
      overallScores: opts.basket,
      serveNumbers: opts.basket.map((_, i) => i + 1),
      metrics: [
        {
          id: 'dropDepth',
          label: 'Racket drop',
          unit: '',
          decimals: 2,
          values: opts.basket.map((b) => b / 100),
          average: 0.6,
          min: 0.5,
          max: 0.7,
          spread: 0.2,
          volatility: 0.5,
          score: 70,
          status: 'good',
          ideal: [0.5, 0.8],
          range: [0, 1],
        },
      ],
      score: 70,
      skipped: 0,
      possibleHandoff: false,
    },
  } as unknown as Session
}

/**
 * A history worth drawing every figure from: five trips, baskets on three,
 * spanning long enough for the milestone and the practice window.
 */
const CLEAN: Session[] = [
  serve(60, 62, { basket: [58, 66] }),
  serve(58, 64),
  serve(44, 66, { basket: [62, 70] }),
  serve(42, 65),
  serve(30, 68),
  serve(16, 70, { basket: [67, 73] }),
  serve(14, 69),
  serve(2, 72),
]

/**
 * The two ways a history gets contaminated, each one report that a missing
 * guard would let through — and both scoring far higher than anything real in
 * `CLEAN`, so letting one in moves every figure it touches.
 */
const CONTAMINANTS: { what: string; row: Session }[] = [
  {
    what: 'a report from before the last recalibration',
    row: serve(90, 97, { rubric: 1, basket: [95, 99] }),
  },
  {
    what: 'a serve of another type',
    row: serve(20, 96, { type: 'kick', basket: [94, 98] }),
  },
]

/**
 * Every figure that is only meaningful within one rubric and one serve type.
 *
 * The answer is stringified rather than compared field by field, because what
 * is being asserted is that *nothing* moved — a guard that protected the
 * headline number and let a contaminant into the points behind it would be
 * exactly the half-applied rule this file exists to catch.
 */
const GUARDED: { name: string; answer: (h: Session[]) => unknown }[] = [
  {
    name: 'buildProgress — the form card and the whole trend sheet',
    answer: (h) => {
      const p = buildProgress(h, 'flat')
      return p && {
        best: p.best,
        latest: p.latest.overall,
        previous: p.previous?.overall,
        recentAverage: p.recentAverage,
        overallDelta: p.overallDelta,
        formDelta: p.formDelta,
        first: p.first.overall,
        areaDeltas: p.areaDeltas.map((d) => d.delta),
      }
    },
  },
  {
    name: 'bestOverallScore — the record on the report and the season card',
    answer: (h) => bestOverallScore(h, 'flat'),
  },
  {
    name: 'buildConsistencyTrend — the repeatability chart',
    answer: (h) => {
      const t = buildConsistencyTrend(h, 'flat')
      return t && { points: t.points.map((p) => p.gap), gapDelta: t.gapDelta, recurring: t.recurring?.id }
    },
  },
  {
    name: 'bestConsistencyGap — the tightest-gap record',
    answer: (h) => bestConsistencyGap(buildConsistencyTrend(h, 'flat')),
  },
  {
    name: 'gapDeltaFor — this basket against the one before it',
    answer: (h) => gapDeltaFor(buildConsistencyTrend(h, 'flat'), CLEAN[5].id),
  },
  {
    name: 'thenAndNow — the paired keyframe stills',
    answer: (h) => {
      const p = thenAndNow(h, KEEP_STILLS, 'flat')
      return p && { then: p.then.id, now: p.now.id }
    },
  },
  {
    name: 'findPracticeFocus — what the player is told to practise',
    answer: (h) => {
      const f = findPracticeFocus(h, undefined, 'flat')
      return f && {
        metricId: f.metricId,
        average: f.average,
        trend: f.trend,
        verdict: f.verdict,
        sessionsConsidered: f.sessionsConsidered,
      }
    },
  },
]

heading('No figure reaches across a recalibration or a change of serve')

for (const figure of GUARDED) {
  const clean = JSON.stringify(figure.answer(CLEAN) ?? null)

  // A figure that answers nothing on the clean history would pass every check
  // below while proving nothing at all.
  check(`${figure.name} — has something to say about a clean history`, () => {
    assert(clean !== 'null' && clean !== undefined, `produced no answer at all: ${clean}`)
  })

  for (const { what, row } of CONTAMINANTS) {
    check(`${figure.name} — unmoved by ${what}`, () => {
      const dirty = JSON.stringify(figure.answer([row, ...CLEAN]) ?? null)
      assert(
        dirty === clean,
        `the answer moved when ${what} was added to the history:\n      ` +
          `clean: ${clean}\n      dirty: ${dirty}`,
      )
    })
  }
}

/* ----------------------------------------------------------------- exempt -- */

heading('And what is exempt, on purpose')

/**
 * Attendance, not scores.
 *
 * `tripStreak` and `longestStreak` count trips to the court. A serve is
 * evidence that somebody turned up whatever it was scored against and whatever
 * kind of serve it was, so confining these to a rubric era would delete a
 * player's streak on the day the marking changed — which is the app punishing
 * them for something it did itself.
 */
check('the streak counts a trip whatever the serve was scored against', () => {
  const withOldRubric = [serve(90, 97, { rubric: 1 }), ...CLEAN]
  assert(
    tripStreak(withOldRubric, CLEAN[7].createdAt) >= tripStreak(CLEAN, CLEAN[7].createdAt),
    'an old-rubric trip was not counted towards the streak',
  )
})

check('the longest run counts a trip whatever kind of serve was hit', () => {
  const withKick = [serve(20, 96, { type: 'kick' }), ...CLEAN]
  assert(
    longestStreak(withKick) >= longestStreak(CLEAN),
    'a kick-serve trip was not counted towards the longest run',
  )
})

report()
