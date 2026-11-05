/**
 * Every screen, rendered, against data shaped like what storage actually holds.
 *
 * WHY THIS FILE EXISTS. The suite had 798 checks and not one of them mounted a
 * component, so the entire class of "the report throws while rendering" was
 * invisible to it — and that class is not hypothetical: `ErrorBoundary` exists
 * because it happens, and a stored basket missing one field took the whole app
 * to a blank screen with every engine test green. An engine test cannot see
 * that. It checks the numbers; the crash is in the reading of them.
 *
 * WHY `renderToStaticMarkup` AND NOT A DOM. A real DOM would mean a new
 * dependency and a second runtime for the suite to disagree with. Server
 * rendering needs neither: `react-dom` is already here, it runs the whole render
 * path — every component function, every hook that runs during render, every
 * `.map` over stored data — and it throws exactly where the browser throws.
 *
 * WHAT IT THEREFORE DOES NOT COVER, said plainly rather than discovered later:
 * effects, refs into real elements, event handlers, and anything that only
 * happens after paint. `PosePlayer`'s canvas work is all in effects and is
 * invisible here; so is every `onClick`. This file is a crash net over the
 * render path and the assertions below are deliberately about *what reached the
 * page*, not about how it looked.
 *
 * WHAT THE DATA IS. `sampleAnalysis` — the same rig `?demo` and the home
 * screen's own "See an example report" run on, built by the real engine rather
 * than hand-assembled, so a report here is a report. Where a screen is about
 * stored history rather than a live analysis, the analysis is put through
 * `normalise` first, because that is the shape a reopened report actually
 * arrives in and it is not the same object.
 */
import { createElement } from 'react'
// `server.browser`, not `server`. The Node entry pulls in `stream` through a
// dynamic `require`, which esbuild cannot bundle into the ESM the runner
// executes; the browser entry is the same renderer with the streaming half left
// out, and `renderToStaticMarkup` is not the streaming half.
import { renderToStaticMarkup } from 'react-dom/server.browser'
import ConsistencyPanel from '../ConsistencyPanel'
import { ScoreTrend, TrendTable } from '../Trend'
import type { TripPoint } from '../../lib/progress'
import Glance from '../../screens/Glance'
import Home from '../../screens/Home'
import Progress from '../../screens/Progress'
import Report from '../../screens/Report'
import DrillCard from '../../screens/report/DrillCard'
import PracticeCard from '../PracticeCard'
import Analyzing from '../../screens/Analyzing'
import FilmingGuide from '../FilmingGuide'
import FirstRunDownload from '../FirstRunDownload'
import HistoryList from '../HistoryList'
import TodayPlan from '../TodayPlan'
import FixedPair from '../FixedPair'
import { STEP_PASSED_DAYS, beforeAfter, recentStepPass, stepPassPair } from '../../lib/graduationCard'
import { StepPassedCard } from '../StepPassed'
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsForSource from 'fs'
import { CLEAN_SERVE } from '../../lib/analysis/syntheticServe'
import { Cue } from '../primitives'
import TermCue from '../TermCue'
import { termSpans } from '../../lib/glossary'
import ModelServe from '../ModelServe'
import { modelMotion } from '../../lib/figure/modelMotion'
import { PHASE_COPY } from '../../lib/analysis/phases'
import { DEMO_DIALS, sampleAnalysis, sampleBasket } from '../../dev/sampleAnalysis'
import { findPracticeFocus, type PracticeFocus } from '../../lib/practice'
import { progressionFor, stepCheckLine } from '../../lib/analysis/progressions'
import { causalPlan } from '../../lib/analysis/verdict'
import { buildConsistency } from '../../lib/analysis/consistency'
import { normalise, type Session } from '../../lib/storage/db'
import type { Analysis } from '../../lib/analysis/types'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

/** Render, and let anything thrown out of the render path fail the check. */
const html = (node: Parameters<typeof renderToStaticMarkup>[0]): string =>
  renderToStaticMarkup(node)

/** A stored report, through the same repair a reopened one goes through. */
function stored(a: Analysis): Session {
  const { frames: _f, ...rest } = a
  void _f
  const s = normalise({ ...rest, id: `serve-${a.overall}-0` })
  assert(s !== undefined, 'normalise dropped a report the engine had just produced')
  return s!
}

/** A basket report: one serve, carrying the comparison the sweep produced. */
function basket(): Analysis {
  const serves = sampleBasket()
  const consistency = buildConsistency(serves, 5)
  assert(consistency !== undefined, 'the sample basket produced no comparison to render')
  return { ...serves[serves.length - 1], consistency, serves: { count: 5, index: 4 } }
}

const noop = () => {}

heading('Every screen renders, on the data storage actually hands it')

check('the report renders from a live analysis', () => {
  const out = html(
    createElement(Report, {
      analysis: sampleAnalysis(),
      onBack: noop,
      onAnalyzeAnother: noop,
    }),
  )
  assert(out.includes('Work on this next'), 'the focus card never reached the page')
  assert(out.includes('Every area I scored'), 'the fundamentals never reached the page')
})

check('any report can be tagged, and shows what was tagged (D5.1)', () => {
  // Every report, reopened ones included — not only the glance after a
  // recording. The chosen tags render pressed; a report with no handlers, such
  // as the example, renders no controls at all.
  const out = html(
    createElement(Report, {
      analysis: stored(sampleAnalysis()),
      serveNumber: 2,
      outcome: 'net',
      onTagServe: noop,
      onTagOutcome: noop,
      onBack: noop,
      onAnalyzeAnother: noop,
    }),
  )
  assert(out.includes('What you said about this serve'), 'a reopened report offered no way to tag it')
  for (const label of ['First serve', 'Second serve', 'In', 'Long', 'Net', 'Wide']) {
    assert(out.includes(`>${label}</button>`), `no "${label}" control`)
  }
  assert(/aria-pressed="true"[^>]*>Second serve</.test(out), 'the second-serve tag was not shown as chosen')
  assert(/aria-pressed="true"[^>]*>Net</.test(out), 'the net tag was not shown as chosen')
  assert(!/aria-pressed="true"[^>]*>In</.test(out), 'an outcome nobody chose was shown as chosen')
  const bare = html(createElement(Report, { analysis: stored(sampleAnalysis()), onBack: noop, onAnalyzeAnother: noop }))
  assert(!bare.includes('What you said about this serve'), 'tag controls rendered with nothing to save them')
})

check('a live report offers its glance, whatever the clip came from (D6.1)', () => {
  const live = html(createElement(Report, { analysis: sampleAnalysis(), onGlance: noop, onBack: noop, onAnalyzeAnother: noop }))
  assert(live.includes('At a glance'), 'a report with a glance to open offered none')
  const saved = html(createElement(Report, { analysis: stored(sampleAnalysis()), onBack: noop, onAnalyzeAnother: noop }))
  assert(!saved.includes('At a glance'), 'a glance was offered with nothing to open it')
})

check('the report renders from a reopened one, with no frames behind it', () => {
  const out = html(
    createElement(Report, {
      analysis: stored(sampleAnalysis()),
      onBack: noop,
      onAnalyzeAnother: noop,
    }),
  )
  // The one sentence that is only true of a report with no clip left.
  assert(
    out.includes('the video itself was never saved'),
    'a frameless report did not render as a saved one',
  )
})

check('the example report says it is one, and cannot be shared as a real serve', () => {
  const out = html(
    createElement(Report, {
      analysis: stored(sampleAnalysis()),
      example: true,
      onBack: noop,
      onAnalyzeAnother: noop,
    }),
  )
  assert(out.includes('This is an example.'), 'the example lost its label')
  assert(!out.includes('Save or share this report'), 'a simulated serve can be shared as if it were real')
  assert(!out.includes('Measured on this device'), 'the example claims to have been measured on this device')
})

check('a report carrying a basket renders its comparison', () => {
  const out = html(
    createElement(Report, { analysis: basket(), onBack: noop, onAnalyzeAnother: noop }),
  )
  assert(out.includes('serves in this clip'), 'the serve count never reached the page')
  assert(out.includes('best serve against your worst'), 'the comparison never reached the page')
})

check('a reopened basket renders — the shape that used to blank the app', () => {
  // The regression this file was written for. A stored comparison goes through
  // `normalise`, and the panel then indexes fields that repair is responsible
  // for; when it missed one, this render threw and the ErrorBoundary replaced
  // the entire app with an apology.
  const out = html(
    createElement(Report, { analysis: stored(basket()), onBack: noop, onAnalyzeAnother: noop }),
  )
  assert(out.includes('best serve against your worst'), 'a reopened comparison did not render')
})

check('a stored basket with no serve numbers still renders, numbered by position', () => {
  const b = basket()
  const raw = { ...b, consistency: { ...b.consistency!, serveNumbers: undefined } }
  const out = html(
    createElement(Report, {
      analysis: stored(raw as unknown as Analysis),
      onBack: noop,
      onAnalyzeAnother: noop,
    }),
  )
  assert(out.includes('#1'), 'the chips lost their numbering entirely')
})

check('a stored basket with half a gap renders without the gap', () => {
  const b = basket()
  const half = { ...b.consistency!.gap!, differences: undefined }
  const raw = { ...b, consistency: { ...b.consistency!, gap: half } }
  const out = html(
    createElement(Report, {
      analysis: stored(raw as unknown as Analysis),
      onBack: noop,
      onAnalyzeAnother: noop,
    }),
  )
  assert(!out.includes('best serve against your worst'), 'half a gap was drawn rather than dropped')
  assert(out.includes('Overall, serve by serve'), 'the rest of the comparison went with the gap')
})

heading('One place to start (L1.6)')

check('a practice card that repeats the focus does not print the drill twice', () => {
  const a = sampleAnalysis()
  const practice: PracticeFocus = {
    metricId: 'tossArmHold',
    label: a.focus.title,
    fundamentalId: 'toss',
    fundamentalLabel: 'Toss',
    drill: a.focus.drill,
    scores: [40, 42, 41],
    average: 41,
    timesWeakest: 3,
    sessionsConsidered: 3,
    verdict: 'stuck',
    serveType: 'flat',
    fix: a.focus.why,
    drilled: 0,
  }
  // The lesson carries the drill and the season's log (lift): the report's first
  // screen names the drill, and the how is one tap down.
  const out = html(
    createElement(DrillCard, {
      item: a.focus,
      racket: 'right',
      rung: -1,
      season: createElement(PracticeCard, { focus: practice, onLogDrill: noop, sameAsFocus: true }),
    }),
  )
  const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
  const times = out.split(escaped(a.focus.drill.how)).length - 1
  assert(times === 1, `the drill's instruction is on the page ${times} times`)
  assert(out.includes('Practise this'), 'the season card went entirely, log and all')
  assert(out.includes('I did this drill'), 'the log button went with the duplicate')
})

check('a season card that names a different fault stays off the report: one first priority', () => {
  const a = sampleAnalysis()
  const practice: PracticeFocus = {
    metricId: 'kneeBend',
    label: 'Knee bend at trophy',
    fundamentalId: 'loading',
    fundamentalLabel: 'Loading',
    drill: { name: 'Some other drill', how: 'Do something else entirely.', reps: '15 serves' },
    scores: [40, 42, 41],
    average: 41,
    timesWeakest: 3,
    sessionsConsidered: 3,
    verdict: 'stuck',
    serveType: 'flat',
    drilled: 0,
  }
  assert(practice.label !== a.focus.title, 'the sample focus is the knee bend, so this checks nothing')
  const out = html(createElement(Report, { analysis: a, practice, onLogDrill: noop, onBack: noop, onAnalyzeAnother: noop }))
  assert(out.includes('Work on this next'), 'the fix went too')
  assert(!out.includes('Practise this'), 'the report handed over a second first priority')
})

check('the fix is the report\'s headline, and the band is its caption', () => {
  const a = sampleAnalysis()
  const out = html(createElement(Report, { analysis: a, onBack: noop, onAnalyzeAnother: noop }))
  const h1 = /<h1>([^<]*)<\/h1>/.exec(out)?.[1]
  const escaped = a.focus.title.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
  assert(h1 === escaped, `the headline is "${h1}", not the fix "${a.focus.title}"`)
  assert(out.includes('class="hero-band"'), 'the band caption is missing')
})

check('a soft read says so beside the score, and a clear one does not', () => {
  const a = sampleAnalysis()
  const soft: Analysis = { ...a, quality: { ...a.quality, confidence: 0.45 } }
  const clear: Analysis = { ...a, quality: { ...a.quality, confidence: 0.9 } }
  const softOut = html(createElement(Report, { analysis: soft, onBack: noop, onAnalyzeAnother: noop }))
  const clearOut = html(createElement(Report, { analysis: clear, onBack: noop, onAnalyzeAnother: noop }))
  assert(softOut.includes('Rough read'), 'a soft read looked as sure as any other')
  assert(softOut.indexOf('Rough read') < softOut.indexOf('What to do now'), 'the rough-read line is not up by the score')
  assert(!clearOut.includes('Rough read'), 'a clear read was called rough')
})

check('the basket line beside the chips defers to the first fix', () => {
  const out = html(createElement(Report, { analysis: basket(), onBack: noop, onAnalyzeAnother: noop }))
  assert(!out.includes('before anything else'), 'the basket still claims to come first')
  assert(out.includes('once your first fix holds'), 'the basket line does not say where it sits in the order')
})

check('home does not name a second thing to work on beside this week\'s plan', () => {
  // Two trips on the injury demo: the plan leads on the grip and the fold, and
  // the season's weakest reading is the tossing arm, which no fault in the
  // plan reads: two answers, one screen.
  const DAY = 86_400_000
  const now = Date.now()
  const sessions = [0, 2].map((d) => ({
    ...stored(sampleAnalysis(DEMO_DIALS.injury)),
    id: `serve-week-${d}-0`,
    createdAt: now - d * DAY,
  }))
  const out = html(
    createElement(Home, {
      sessions,
      offlineReady: true,
      sessionsLoaded: true,
      onPick: noop,
      onOpen: noop,
      onShowGuide: noop,
      onShowHistory: noop,
      onShowSettings: noop,
      onShowProgress: noop,
      onGuideThen: noop,
      onShowExample: noop,
      needsHandedness: false,
      onMakeOffline: noop,
    }),
  )
  assert(out.includes('This week'), 'the seeded season has no plan to compare against')
  const season = findPracticeFocus(sessions)
  assert(season !== undefined, 'the seeded season has no practice focus, so this checks nothing')
  assert(!out.includes('Working on'), 'home named a working-on that is not in this week\'s plan')
})

check('the refusal screen renders instead of a score', () => {
  const refused: Analysis = {
    ...sampleAnalysis(),
    triage: { status: 'rejected', reason: 'too_blurry' } as Analysis['triage'],
  }
  const out = html(
    createElement(Report, { analysis: refused, onBack: noop, onAnalyzeAnother: noop }),
  )
  assert(out.includes('No score for this clip'), 'a rejected clip rendered as an ordinary report')
  assert(!out.includes('Work on this next'), 'a rejected clip still offered an instruction')
})

check('the panel says which serves it compared when it did not compare them all (L2.2)', () => {
  const c = basket().consistency!
  // The demo basket read four of five, one too unclear: every serve attempted.
  const whole = html(createElement(ConsistencyPanel, { consistency: c, onDismiss: noop, createdAt: 0, clipServes: 5 }))
  assert(!whole.includes('This clip holds'), 'a comparison that tried every serve claimed to have skipped some')
  // The same serves out of a clip of twelve: six were never read.
  const part = html(createElement(ConsistencyPanel, { consistency: c, onDismiss: noop, createdAt: 0, clipServes: 12 }))
  assert(part.includes('This clip holds 12 serves. I compared 4 of them'), 'the panel did not say which serves it covered')
})

check('the analysing screen names the serves a sweep is comparing (L2.2)', () => {
  const out = html(
    createElement(Analyzing, {
      progress: { step: 'engine', ratio: 0.2 },
      fileName: 'IMG_0001.MOV',
      onCancel: noop,
      sweep: { total: 6, firstNumber: 5, done: [] },
    }),
  )
  assert(out.includes('Found 10 serves · comparing 5–'), 'the sweep did not say which serves it was reading')
  const all = html(
    createElement(Analyzing, {
      progress: { step: 'engine', ratio: 0.2 },
      fileName: 'IMG_0001.MOV',
      onCancel: noop,
      sweep: { total: 4, firstNumber: 1, done: [] },
    }),
  )
  assert(!all.includes('Found'), 'a sweep of every serve claimed to be comparing a subset')
})

check('the consistency panel renders on its own', () => {
  const c = basket().consistency!
  const out = html(createElement(ConsistencyPanel, { consistency: c, onDismiss: noop, createdAt: 0 }))
  assert(out.includes('Overall, serve by serve'), 'the panel rendered nothing recognisable')
})

check('a steady fault in a basket is called off target, not praised (L1.8)', () => {
  // Every demo serve keeps its legs straight: the knee row holds still and is
  // outside its band on every serve.
  const c = basket().consistency!
  const knee = c.metrics.find((m) => m.id === 'kneeBend')
  assert(knee?.offTarget === true, 'the straight-legged basket did not mark the knee off target')
  const out = html(createElement(ConsistencyPanel, { consistency: c, onDismiss: noop, createdAt: 0 }))
  assert(out.includes('steady, but outside the target'), 'a steady fault was shown without saying it is off target')
})

check('the report answers on its first screen, then the plan, the serve, and one fold for the rest (lift)', () => {
  const out = html(
    createElement(Report, {
      analysis: { ...sampleAnalysis(DEMO_DIALS.example), consistency: buildConsistency(sampleBasket(), 5) },
      onBack: noop,
      onAnalyzeAnother: noop,
      onTagServe: noop,
      onTagOutcome: noop,
    }),
  )
  const at = (marker: string) => {
    const i = out.indexOf(marker)
    assert(i >= 0, `"${marker}" is not on the report`)
    return i
  }
  const order = [
    ['the score', 'class="hero"'],
    ['the fix', '<h1>'],
    ['what to do now', 'What to do now'],
    ['the rest of the plan', 'Then, in this order'],
    ['the serve', 'side by side'],
    ['the tags', 'What you said about this serve'],
    ['the fold', 'Everything I measured'],
    ['the basket', 'best serve against your worst'],
    ['how it was read', 'How I read this clip'],
    ['the areas', 'Every area I scored'],
  ] as const
  for (let i = 1; i < order.length; i++) {
    assert(at(order[i - 1][1]) < at(order[i][1]), `${order[i - 1][0]} comes after ${order[i][0]}`)
  }
  const fold = out.slice(at('<details class="report-more"'), out.indexOf('</details>', at('<details class="report-more"')))
  for (const [what, marker] of order.slice(7)) assert(fold.includes(marker), `${what} is outside the fold`)
  assert(!/<details class="report-more"[^>]*open/.test(out), 'the fold starts open')
  // One way forward at the end, and sharing is one button at the top.
  assert((out.match(/class="report-bar"/g) ?? []).length === 1, 'the report does not end on one action')
  assert(!out.includes('Send to my coach') && !out.includes('Save or share this report'), 'the three stacked exits came back')
})

check('a fix opens to a lesson: the feel, how the step is passed, the ladder folded (L4.2, lift)', () => {
  const analysis = sampleAnalysis(DEMO_DIALS.injury)
  const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
  const plan = causalPlan(analysis.triage, analysis.diagnosis)
  assert(plan.length >= 2, `the fixture ranked ${plan.length} fix(es); the check needs two`)
  const ladder = progressionFor(plan[0].flaw!, plan[0].axis)!
  const rung = ladder.steps.findIndex((s) => s.name === plan[0].drill.name)
  const step = ladder.steps[rung]
  const lesson = html(createElement(DrillCard, { item: plan[0], racket: 'right', rung, onLadderStep: noop }))
  // The ladder starts folded; the feel does not.
  assert(/<details class="drill-ladder">/.test(lesson), 'the ladder started open')
  assert(lesson.includes(escaped(ladder.cue)), 'the feel is folded away')
  assert(lesson.includes(escaped(stepCheckLine(ladder, step))), 'the step does not say how it is passed')
  assert(
    lesson.includes('I can do this') === (step.check.by === 'self'),
    `a ${step.check.by}-checked step ${step.check.by === 'self' ? 'has no' : 'has a'} self-pass button`,
  )
  // On the report, every later fix is a row that opens its own lesson.
  const out = html(createElement(Report, { analysis, onBack: noop, onAnalyzeAnother: noop, onLadderStep: noop }))
  const rows = out.split('class="plan-item"').length - 1
  assert(rows === plan.length - 1, `${rows} rows for ${plan.length - 1} later fixes`)
})

check('a model serve to watch: a real serve looped with its moments and checkpoints, in three places (L4.3, lift)', () => {
  const serve = modelMotion('right')
  assert(serve !== undefined, 'the real serve could not be built')
  const player = html(createElement(ModelServe, { racket: 'right', serve }))
  // Six moment pills, in the serve's order, each a button.
  const at = Object.values(PHASE_COPY).map((p) => player.indexOf(`>${p.label}</button>`))
  assert(at.every((i) => i >= 0), `a moment pill is missing: ${at.join(', ')}`)
  assert(at.every((i, k) => k === 0 || i > at[k - 1]), 'the moments are out of order')
  // A checkpoint under them, and a way to stop the loop.
  assert(Object.values(PHASE_COPY).some((p) => player.includes(p.caption)), 'no checkpoint caption')
  assert(player.includes('aria-label="Pause"') || player.includes('aria-label="Play"'), 'a loop with no pause')
  assert(player.includes('Speed: Slow'), 'the full player lost its speeds')
  const quiet = html(createElement(ModelServe, { racket: 'right', serve, quiet: true }))
  assert(!quiet.includes('Speed: Slow') && quiet.includes('model-serve--quiet'), 'the quiet player is not quiet')

  // In the guide, one tap down and closed.
  const guide = html(createElement(FilmingGuide, { racket: 'left' }))
  assert(/<details class="guide-model">/.test(guide) && guide.includes('Watch a model serve'), 'the guide has no model serve')
  // On the analysing screen, under the status.
  const reading = html(createElement(Analyzing, { progress: { step: 'tracking', ratio: 0.4 }, fileName: 'serve.mp4', onCancel: noop }))
  assert(
    reading.indexOf('While you wait, a model serve') > reading.indexOf('role="progressbar"'),
    'the analysing screen has no model serve under its status',
  )
  // On the example, and not on a player's own report.
  const example = html(createElement(Report, { analysis: sampleAnalysis(DEMO_DIALS.example), example: true, onBack: noop, onAnalyzeAnother: noop }))
  const own = html(createElement(Report, { analysis: sampleAnalysis(DEMO_DIALS.example), onBack: noop, onAnalyzeAnother: noop }))
  assert(example.includes('A model serve to watch'), 'the example has no model serve')
  assert(!own.includes('A model serve to watch'), "a player's own report carries the model serve")
  assert(
    example.indexOf('A model serve to watch') > example.indexOf('Watch your serve') &&
      example.indexOf('A model serve to watch') < example.indexOf('Everything I measured'),
    'the model serve is not between the serve and the fold',
  )
})

check('a live report draws the best serve under the video, and says so (L4.8)', () => {
  const analysis = sampleAnalysis(DEMO_DIALS.example)
  const best = { ...stored(sampleAnalysis()), id: 'serve-best-0', createdAt: analysis.createdAt - 86_400_000 }
  const live = html(createElement(Report, { analysis, videoUrl: 'blob:clip', best, onBack: noop, onAnalyzeAnother: noop }))
  assert(live.includes('The dashed body is your best serve so far'), 'the live report does not draw the best serve')
  const alone = html(createElement(Report, { analysis, videoUrl: 'blob:clip', onBack: noop, onAnalyzeAnother: noop }))
  assert(!alone.includes('The dashed body is'), 'a dashed body was promised with no serve to draw')
})

check('each week-plan item can be checked straight from home, where the app can record (N1.4)', () => {
  const last = stored(sampleAnalysis(DEMO_DIALS.injury))
  const base = {
    sessions: [last, { ...last, id: 'serve-older-0', createdAt: last.createdAt - 2 * 86_400_000 }],
    offlineReady: true,
    sessionsLoaded: true,
    onPick: noop,
    onOpen: noop,
    onShowGuide: noop,
    onShowHistory: noop,
    onShowSettings: noop,
    onShowProgress: noop,
    onGuideThen: noop,
    onShowExample: noop,
    needsHandedness: false,
    onMakeOffline: noop,
  }
  const can = html(createElement(Home, { ...base, onRecorded: noop, onCheckDrill: noop }))
  assert(can.includes('This week'), 'the seeded season has no plan')
  assert(can.includes('Check this drill'), 'no week-plan item offered a check')
  const cannot = html(createElement(Home, { ...base, onCheckDrill: noop }))
  assert(!cannot.includes('Check this drill'), 'a check was offered where nothing can record')
})

check("home says the week once: today's minutes sit on the drills, not in a second list (Q9)", () => {
  const last = stored(sampleAnalysis(DEMO_DIALS.injury))
  const out = html(
    createElement(Home, {
      sessions: [last, { ...last, id: 'serve-older-0', createdAt: last.createdAt - 2 * 86_400_000 }],
      offlineReady: true,
      sessionsLoaded: true,
      onPick: noop,
      onOpen: noop,
      onShowGuide: noop,
      onShowHistory: noop,
      onShowSettings: noop,
      onShowProgress: noop,
      onGuideThen: noop,
      onShowExample: noop,
      needsHandedness: false,
      onMakeOffline: noop,
    }),
  )
  assert(out.includes('This week'), 'the seeded season has no plan')
  assert(!out.includes('Today on court'), 'the week is still listed twice')
  assert(/min today/.test(out), 'the drills do not carry their minutes')
  assert(out.includes('45 min') && out.includes('Warm up with easy serves'), 'the length or the warm-up went missing')
  const at = (s: string) => out.indexOf(s)
  assert(at('Warm up with easy serves') < at('week-list') && at('week-list') < at('Serve freely'), 'the hit is not in the order it runs')
  assert(!/<strong>[^<]+<\/strong>: \d+ (tosses|serves|reps)/.test(out), 'a drill is named again in the timed lines')
})

check('home knows a returning player: a compact hero, then This week and the form, before the straps (L4.10)', () => {
  const last = stored(sampleAnalysis(DEMO_DIALS.injury))
  const older = (n: number) => ({ ...stored(sampleAnalysis({ seed: 40 + n })), id: `serve-old${n}-0`, createdAt: last.createdAt - n * 3 * 86_400_000 })
  const props = (sessions: Session[]) => ({
    sessions,
    offlineReady: true,
    sessionsLoaded: true,
    onPick: noop,
    onOpen: noop,
    onShowGuide: noop,
    onShowHistory: noop,
    onShowSettings: noop,
    onShowProgress: noop,
    onGuideThen: noop,
    onShowExample: noop,
    needsHandedness: false,
    onMakeOffline: noop,
  })
  const known = html(createElement(Home, props([last, older(1), older(2), older(3)])))
  assert(known.includes('home-hero--compact') && !known.includes('World-class eyes'), 'a returning player got the full pitch')
  const at = (s: string) => known.indexOf(s)
  assert(at('This week') > at('Your next serve'), 'This week is above the hero')
  assert(at('Your form') > at('This week'), 'the form is above This week')
  assert(at('How to film it') > at('Your form'), 'the help straps come before the form')
  const fresh = html(createElement(Home, props([])))
  assert(fresh.includes('World-class eyes') && !fresh.includes('home-hero--compact'), 'a new player lost the pitch')
})

check('the glance renders', () => {
  const out = html(
    createElement(Glance, { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop }),
  )
  assert(out.includes('Show me everything'), 'the glance lost its way out')
})

/** Render with these prefs in storage, and the window a phone or a desk would have. */
function withPrefs<T>(prefs: object | undefined, coarse: boolean, run: () => T): T {
  const g = globalThis as { localStorage?: unknown; window?: unknown }
  const had = { storage: 'localStorage' in g, window: 'window' in g }
  const before = { storage: g.localStorage, window: g.window }
  g.localStorage = { getItem: () => (prefs ? JSON.stringify(prefs) : null), setItem: () => {}, removeItem: () => {} }
  g.window = { matchMedia: (q: string) => ({ matches: coarse && q === '(pointer: coarse)' }) }
  try {
    return run()
  } finally {
    if (had.storage) g.localStorage = before.storage
    else delete g.localStorage
    if (had.window) g.window = before.window
    else delete g.window
  }
}

check('on court, the next serve sits under the figure, not under every tag (Q8)', () => {
  const props = { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop, onRecordAnother: noop, onTagServe: noop, onTagOutcome: noop }
  const court = withPrefs({ handsFree: true }, false, () => html(createElement(Glance, props)))
  assert(court.includes('court-readout'), 'hands-free did not open the court glance')
  assert((court.match(/Record another/g) ?? []).length === 1, 'the next serve is offered twice, or not at all')
  assert(court.indexOf('Record another') < court.indexOf('Which serve was it?'), 'the next serve is still under the tags')
  const desk = withPrefs({ handsFree: false }, false, () => html(createElement(Glance, props)))
  assert(!desk.includes('court-readout'), 'a glance with hands-free off opened in court mode')
  assert(desk.indexOf('Record another') > desk.indexOf('Where did it land?'), 'the footer lost its order off court')
})

check("a phone player who never set hands-free gets the court glance, as the viewfinder filmed (Q8)", () => {
  const props = { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop, onRecordAnother: noop }
  assert(withPrefs(undefined, true, () => html(createElement(Glance, props))).includes('court-readout'), 'the phone default stopped at the viewfinder')
  assert(!withPrefs(undefined, false, () => html(createElement(Glance, props))).includes('court-readout'), 'a desk opened in court mode')
})

check('which serve it was is one row of chips, like the landing (Q8)', () => {
  const out = html(createElement(Glance, { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop, onTagServe: noop }))
  const tags = out.slice(out.indexOf('Which serve was it?'))
  assert(/class="reading-chips"/.test(tags), 'the serve tags are not a chip row')
  assert(!/btn--full[^>]*aria-pressed/.test(tags.slice(0, 600)), 'a serve tag is still a full-width button')
})

check('the glance sets the score against the last serve, on the line the camera sets', () => {
  // Inside the camera's own move: the dash, and the plain caption.
  const same = html(
    createElement(Glance, { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop, scoreMove: { delta: 4, alike: true } }),
  )
  assert(same.includes('vs your last serve'), 'the glance did not say what the chip is against')
  assert(same.includes('no real change'), 'a four-point move was shown as a change')
  // Past it, an arrow and the number.
  const up = html(
    createElement(Glance, { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop, scoreMove: { delta: 9, alike: true } }),
  )
  assert(up.includes('delta--great') && up.includes('>9<'), 'a nine-point gain was not shown')
  // Measured differently: the soft mark, and words that do not compare.
  const soft = html(
    createElement(Glance, { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop, scoreMove: { delta: 9, alike: false } }),
  )
  assert(soft.includes('measured differently from your last serve'), 'the soft move was captioned as a comparison')
  assert(!soft.includes('delta--great'), 'a move between serves read differently was coloured as a gain')
})

check('the glance shows the trip drill check, and offers the move only once it is passed (N1.3)', () => {
  // Driven the way the app drives it: the history and the ladder, worked out
  // inside the glance. Six serves of this trip judged for the drop.
  const live = sampleAnalysis()
  const judged = (k: number, detected: boolean) =>
    ({
      ...stored(sampleAnalysis()),
      id: `serve-trip${k}-0`,
      createdAt: live.createdAt - (6 - k) * 60_000,
      triage: { schema: 1, status: 'ok', injury_risk: [], suppressed_count: 0 },
      diagnosis: { flaws: [{ flaw: 'shallow_drop', detected, severity: detected ? 'medium' : 'none', confidence: 0.9, signal: 's', value: 0, unit: 'ratio', miss: 0, target: [0, 1], target_tier: 4 }], signals: {} },
    }) as unknown as Session
  const glance = (history: Session[], rung = 1) =>
    html(
      createElement(Glance, {
        analysis: live,
        onOpenReport: noop,
        onBack: noop,
        onLadderStep: noop,
        history,
        trip: { ladder: { shallow_drop: rung }, target: 'shallow_drop' },
      }),
    )
  const clean = [0, 1, 2, 3, 4, 5].map((k) => judged(k, false))
  const passed = glance(clean)
  assert(passed.includes('passed this step'), 'a passed trip did not say so')
  assert(passed.includes('Move up a step'), 'a passed trip offered no move')
  const short = glance([0, 1, 2, 3, 4, 5].map((k) => judged(k, true)))
  assert(short.includes('Stay on this step') && !short.includes('Move up a step'), 'a failed trip offered the move')
  const steps = progressionFor('shallow_drop')!.steps.length
  assert(!glance(clean, steps - 1).includes('Move up a step'), 'the last step offered a move past the end of the ladder')
  assert(!html(createElement(Glance, { analysis: live, onOpenReport: noop, onBack: noop })).includes('glance-check'), 'a check was drawn with no history')
})

check('the trip chart draws each trip with the range its serves ran over (L3.2)', () => {
  const tripAt = (i: number, overall: number, low: number, high: number, serves: number): TripPoint => ({
    id: `t${i}`,
    createdAt: i * 3 * 86_400_000,
    to: i * 3 * 86_400_000 + 3_600_000,
    overall,
    status: 'good',
    byArea: {},
    scoringVersion: 5,
    serves,
    low,
    high,
  })
  const trips = [tripAt(0, 62, 55, 70, 5), tripAt(1, 71, 71, 71, 1), tripAt(2, 74, 66, 80, 6)]
  const chart = html(createElement(ScoreTrend, { points: trips }))
  // A range bar for each trip with a spread, and none for the trip of one.
  assert((chart.match(/opacity="0.35"/g) ?? []).length === 2, 'the range bars were not one per spread trip')
  assert(chart.includes('across 3 trips, most recent 74'), 'the chart did not name what it plots')
  const table = html(createElement(TrendTable, { points: trips }))
  assert(table.includes('6, 66–80') && table.includes('>1<'), 'the table lost the serves or the range')
})

check('the glance refuses rather than scoring an unreadable clip', () => {
  const refused: Analysis = {
    ...sampleAnalysis(),
    triage: { status: 'rejected', reason: 'body_not_visible' } as Analysis['triage'],
  }
  const out = html(createElement(Glance, { analysis: refused, onOpenReport: noop, onBack: noop }))
  assert(
    out.includes('could not see enough of you'),
    'the glance did not lead with the refusal',
  )
})

check('the home screen renders with no history at all', () => {
  const out = html(
    createElement(Home, {
      sessions: [],
      offlineReady: false,
      sessionsLoaded: true,
      onPick: noop,
      onOpen: noop,
      onShowGuide: noop,
      onShowHistory: noop,
      onShowSettings: noop,
      onShowProgress: noop,
      onGuideThen: noop,
      onShowExample: noop,
      needsHandedness: false,
      onMakeOffline: noop,
    }),
  )
  assert(out.includes('Analyse a serve'), 'the first-run home screen lost its one button')
  assert(out.includes('See an example report'), 'a first-time player lost the example report')
})

check('before storage answers, a returning player is not invited to see an example', () => {
  const out = html(
    createElement(Home, {
      sessions: [],
      offlineReady: undefined,
      sessionsLoaded: false,
      onPick: noop,
      onOpen: noop,
      onShowGuide: noop,
      onShowHistory: noop,
      onShowSettings: noop,
      onShowProgress: noop,
      onGuideThen: noop,
      onShowExample: noop,
      needsHandedness: false,
      onMakeOffline: noop,
    }),
  )
  assert(!out.includes('See an example report'), 'the first-run strap flashed before the history loaded')
  assert(!out.includes('Download now'), 'the offline badge offered a download before the cache was asked')
})

check('the home screen renders with a history behind it', () => {
  const history = [70, 64, 76].map((overall, i) => {
    const s = stored(sampleAnalysis())
    return { ...s, id: `serve-h-${i}`, overall, createdAt: i * 86_400_000 }
  })
  const out = html(
    createElement(Home, {
      sessions: history,
      offlineReady: true,
      sessionsLoaded: true,
      onPick: noop,
      onOpen: noop,
      onShowGuide: noop,
      onShowHistory: noop,
      onShowSettings: noop,
      onShowProgress: noop,
      onGuideThen: noop,
      onShowExample: noop,
      needsHandedness: false,
      onMakeOffline: noop,
    }),
  )
  assert(out.includes('best '), 'the form card never reached the page')
})

check("the home screen carries this week's plan, in the report's order, on the player's own rung", () => {
  // D4.4. A report with two fixes in it: the grip, and the spine.
  const last = stored(sampleAnalysis(DEMO_DIALS.injury))
  const plan = causalPlan(last.triage, last.diagnosis)
  assert(plan.length >= 2, `the fixture report ranked ${plan.length} fix(es); the check needs two`)
  const home = (sessions: Session[], ladder?: Partial<Record<string, number>>) =>
    html(
      createElement(Home, {
        sessions,
        offlineReady: true,
        sessionsLoaded: true,
        onPick: noop,
        onOpen: noop,
        ladder,
        onShowGuide: noop,
        onShowHistory: noop,
        onShowSettings: noop,
        onShowProgress: noop,
        onGuideThen: noop,
        onShowExample: noop,
        needsHandedness: false,
        onMakeOffline: noop,
      }),
    )
  const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
  const out = home([last])
  assert(out.includes('This week'), 'no plan on the home screen')
  const at = plan.map((p) => out.indexOf(escaped(p.title)))
  assert(at.every((i) => i >= 0), `a fix the report ranked is missing: ${plan.map((p) => p.title).join(' / ')}`)
  assert(at.every((i, k) => k === 0 || i > at[k - 1]), 'the plan is not in the order the report ranked it')
  // Each fix says how its step is passed: a basket to film, or the player's own bar (L4.2).
  for (const p of plan) {
    const own = progressionFor(p.flaw!, p.axis)!
    const step = own.steps.find((s) => s.name === p.drill.name)!
    assert(out.includes(escaped(stepCheckLine(own, step))), `"${p.title}" does not say how its step is passed`)
  }

  // The rung the player moved to, not the report's.
  const ladder = progressionFor(plan[0].flaw!, plan[0].axis)!
  const moved = home([last], { [plan[0].flaw!]: 1 })
  assert(
    moved.includes(escaped(ladder.steps[1].name)) && moved.includes(`step 2 of ${ladder.steps.length}`),
    'the plan ignored the rung the player had moved to',
  )

  // A refused clip filmed since does not blank it.
  const refused: Session = {
    ...stored(sampleAnalysis()),
    id: 'serve-refused-0',
    createdAt: last.createdAt + 1,
    triage: { ...last.triage!, status: 'rejected', reason: 'too_blurry' },
  }
  assert(home([refused, last]).includes(escaped(plan[0].title)), 'a refused clip blanked the plan')
})

check('progress keeps first and second serves apart, and counts the weeks (D5.3, D5.4)', () => {
  const day = 86_400_000
  const history = Array.from({ length: 8 }, (_, i) => {
    const s = stored(sampleAnalysis())
    return { ...s, id: `serve-p-${i}`, overall: 70 + i, createdAt: Date.now() - (7 - i) * 4 * day }
  })
  const tags = history.map((s, i) => ({
    id: s.id,
    serveNumber: (i % 2 ? 2 : 1) as 1 | 2,
    outcome: i < 6 ? ('in' as const) : ('net' as const),
    taggedAt: s.createdAt,
  }))
  const out = html(
    createElement(Progress, {
      sessions: history,
      tags,
      onLogDrill: noop,
      onUndoDrill: noop,
      seeded: false,
      onBack: noop,
    }),
  )
  assert(out.includes('First and second serves'), 'no serve-number block')
  assert(out.includes('First serves: 4 tagged'), 'first serves were not counted on their own')
  assert(out.includes('Second serves: 4 tagged'), 'second serves were not counted on their own')
  assert(out.includes('in on 6 of 8 tagged'), 'no in-rate for the serve type')
  assert(out.includes('Serves per week'), 'no weekly count')
  const bare = html(createElement(Progress, { sessions: history, onLogDrill: noop, onUndoDrill: noop, seeded: false, onBack: noop }))
  assert(!bare.includes('First and second serves'), 'a serve-number block with no taps behind it')
})

check('progress leads its faults and serves with pictures, and folds the prose (N4.3)', () => {
  const day = 86_400_000
  const history = Array.from({ length: 12 }, (_, i) => ({
    ...stored(sampleAnalysis(DEMO_DIALS.injury)),
    id: `serve-pic-${i}`,
    overall: 70 + (i % 5),
    createdAt: Date.now() - (11 - i) * 3 * day,
  }))
  const tags = history.map((s, i) => ({ id: s.id, serveNumber: (i % 2 ? 2 : 1) as 1 | 2, outcome: i % 3 ? ('in' as const) : ('net' as const), taggedAt: s.createdAt }))
  const out = html(createElement(Progress, { sessions: history, tags, onLogDrill: noop, onUndoDrill: noop, seeded: false, onBack: noop }))
  assert(/class="fault-cells"[^>]*role="img"[^>]*aria-label="[^"]+named on \d+ of \d+/.test(out), 'no fault grid with a text version')
  assert((out.match(/class="fault-cell is-named"/g) ?? []).length > 0, 'the grid drew no named serve')
  assert(out.includes('class="inrate-bars"') && /aria-label="First serves: in on \d+ of \d+"/.test(out), 'no in-rate bar with a text version')
  const open = (out.match(/<section class="block"/g) ?? []).length
  assert(open <= 7, `${open} sections stand open`)
  assert(out.includes('class="block progress-more"'), 'nothing was folded')
})

check('progress says what the misses share, and the best sets, and nothing from noise (N3.1, N3.2)', () => {
  // The fixture `misses.test.ts` plants: the net serves struck lower.
  let clock = 0
  const tagged = (outcome: 'in' | 'net', reach: number, n: number, seed: number) =>
    Array.from({ length: n }, (_, i) => {
      const { frames: _f, ...rest } = sampleAnalysis({ noise: 0.004, seed: seed + i, contactReach: reach }) as Analysis
      void _f
      clock += 86_400_000
      return { ...rest, id: `serve-miss${seed + i}`, createdAt: clock } as Session
    }).map((s) => ({ s, tag: { id: s.id, outcome, taggedAt: s.createdAt } }))
  const planted = [...tagged('in', 1.25, 6, 11), ...tagged('net', 1.05, 6, 17)]
  const sets = [{ serveNumber: 1 as const, startedAt: 1, endedAt: 2, inServes: 7 }]
  const out = html(
    createElement(Progress, {
      sessions: planted.map((p) => p.s),
      tags: planted.map((p) => p.tag),
      sets,
      onLogDrill: noop,
      onUndoDrill: noop,
      seeded: false,
      onBack: noop,
    }),
  )
  assert(out.includes('Your serves into the net had contact lower.'), 'the planted pattern was not said')
  assert(out.includes('Best set of 10 first serves: 7 in.'), 'the best set was not in the records')
  const same = [...tagged('in', 1.15, 7, 40), ...tagged('net', 1.15, 7, 47)]
  const noise = html(
    createElement(Progress, { sessions: same.map((p) => p.s), tags: same.map((p) => p.tag), onLogDrill: noop, onUndoDrill: noop, seeded: false, onBack: noop }),
  )
  assert(!noise.includes('Your serves into the net had'), 'a pattern was read out of noise')
})

check('home points a player with reports at reading a whole practice, until they have one (N3.6)', () => {
  const last = stored(sampleAnalysis(DEMO_DIALS.injury))
  const base = {
    offlineReady: true,
    sessionsLoaded: true,
    onPick: noop,
    onOpen: noop,
    onShowGuide: noop,
    onShowHistory: noop,
    onShowSettings: noop,
    onShowProgress: noop,
    onGuideThen: noop,
    onShowExample: noop,
    needsHandedness: false,
    onMakeOffline: noop,
  }
  assert(html(createElement(Home, { ...base, sessions: [last] })).includes('Read a whole practice'), 'no way into sessions was offered')
  assert(!html(createElement(Home, { ...base, sessions: [] })).includes('Read a whole practice'), 'a new player was offered sessions before a serve')
  const withSession = html(createElement(Home, { ...base, sessions: [last], practiceSessions: [{ id: 'p1', createdAt: last.createdAt, updatedAt: last.createdAt, fileName: 'p.mp4', duration: 600, serveType: 'flat', handedness: 'right', mode: 'sample', found: [10, 20], lines: [], phase: 'done' } as never] }))
  assert(!withSession.includes('Read a whole practice'), 'a player with a session was still told how to make one')
})

check('the first-run sheet offers the download with its size, only while it is needed (N3.7)', () => {
  const needed = html(createElement(FirstRunDownload, { ready: false, busy: false, onDownload: noop }))
  assert(/one-time \d+ MB download/.test(needed) && needed.includes('Download now'), 'the download was not offered with its size')
  assert(html(createElement(FirstRunDownload, { ready: true, busy: false, onDownload: noop })) === '', 'offered a download already stored')
  assert(html(createElement(FirstRunDownload, { ready: undefined, busy: false, onDownload: noop })) === '', 'offered a download before the cache answered')
  assert(html(createElement(FirstRunDownload, { ready: false, busy: true, onDownload: noop })).includes('Downloading'), 'a running download was offered again')
})

check('the history groups serves by trip, newest first, each with its typical score (N3.5)', () => {
  const base = stored(sampleAnalysis())
  const at = (id: string, day: number, hour: number, overall: number) =>
    ({ ...base, id, overall, createdAt: day * 86_400_000 + hour * 3_600_000 }) as Session
  const sessions = [at('a', 100, 9, 60), at('b', 100, 10, 70), at('c', 100, 11, 80), at('d', 103, 9, 75)]
  const out = html(createElement(HistoryList, { sessions, onOpen: noop, onDelete: noop }))
  assert((out.match(/history-trip"/g) ?? []).length === 2, 'serves three days apart were one trip')
  assert(out.includes('3 serves, typical 70'), 'the trip of three did not lead with its median')
  assert(out.indexOf('1 serve') < out.indexOf('3 serves'), 'the older trip came first')
})

check('a glossary word in a coaching line is a tap away, once, wherever the line opts in (N3.4)', () => {
  const spans = termSpans('Hold the trophy. At the trophy, let the racket drop begin.')
  const terms = spans.filter((s) => 'id' in s)
  assert(terms.length === 2, `marked ${terms.length} words`)
  assert(spans.map((s) => s.text).join('') === 'Hold the trophy. At the trophy, let the racket drop begin.', 'the sentence changed')
  assert(termSpans('Stanced trophyish').every((s) => !('id' in s)), 'a word inside another word was marked')
  const on = html(createElement(TermCue, { text: '**Knees bent** at the trophy.' }))
  assert(on.includes('term-word') && on.includes('cue-key'), 'the term or the bold was lost')
  assert(!html(createElement(Cue, { text: 'At the trophy.' })).includes('term-word'), 'a line that did not opt in was marked')
})

check('a step passed draws the fault then and now; nothing is drawn without both halves (N3.3)', () => {
  // The example serve names its tossing arm; the rig's clean serve judges it clean.
  const then = { ...stored(sampleAnalysis(DEMO_DIALS.example)), id: 'serve-then-0', createdAt: 1_000 }
  const now = { ...stored(sampleAnalysis(CLEAN_SERVE)), id: 'serve-now-0', createdAt: 5_000 }
  const flaw = then.triage?.primary_flaw?.flaw
  assert(Boolean(flaw), 'the example serve named nothing, so this checks nothing')
  const pair = beforeAfter([then, now], flaw!, 2_000)
  assert(Boolean(pair), 'a named serve before and a clean one after drew no pair')
  assert(beforeAfter([then], flaw!, 2_000) === undefined, 'a pair was drawn with no serve after')
  if (!pair) return
  assert(pair.then.at === 1_000 && pair.now.at === 5_000, 'the halves were the wrong serves')
  const out = html(createElement(FixedPair, { then: pair.then, now: pair.now, title: 'That step, then and now' }))
  assert(out.includes('Then,') && out.includes('Now,') && (out.match(/<canvas/g) ?? []).length === 2, 'the pair did not draw both halves')
  assert(beforeAfter([then, now], flaw!, 10_000) === undefined, 'a pair was drawn with nothing since the change')
})

check('a step passed is a moment on Home, then and now, for a few days (Q10)', () => {
  const then = { ...stored(sampleAnalysis(DEMO_DIALS.example)), id: 'serve-then-0', createdAt: 1_000 }
  const now = { ...stored(sampleAnalysis(CLEAN_SERVE)), id: 'serve-now-0', createdAt: 5_000 }
  const later = { ...now, id: 'serve-later-0', createdAt: 9_000 }
  const flaw = then.triage?.primary_flaw?.flaw
  assert(Boolean(flaw), 'the example serve named nothing, so this checks nothing')
  if (!flaw) return
  // The evidence is what came before the move: a serve on the new step never stands in.
  const pair = stepPassPair([then, now, later], flaw, 6_000)
  assert(pair?.then.at === 1_000 && pair.now.at === 5_000, 'the pair was not the serves that passed the step')
  assert(stepPassPair([then, now], flaw, 3_000) === undefined, 'a pair was drawn with no clean serve before the move')
  // Which step Home shows, and for how long.
  const day = 86_400_000
  const at = 100 * day
  assert(recentStepPass({ [flaw]: at - day }, { [flaw]: 2 }, at)?.rung === 2, 'a step passed yesterday was not shown')
  assert(recentStepPass({ [flaw]: at - STEP_PASSED_DAYS * day }, { [flaw]: 2 }, at) === undefined, 'an old step stayed up')
  assert(recentStepPass({ [flaw]: at - day }, { [flaw]: 0 }, at) === undefined, 'the first rung was shown as a step passed')
  const two = recentStepPass({ toss_height: at - 2 * day, [flaw]: at - day }, { toss_height: 1, [flaw]: 1 }, at)
  assert(two?.flaw === flaw, 'the older of two passes was shown')
  // The card itself.
  const out = html(createElement(StepPassedCard, { sessions: [then, now], flaw, rung: 1, passedAt: 6_000 }))
  const ladder = progressionFor(flaw)!
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
  assert(out.includes('Step passed') && out.includes(esc(ladder.steps[0].name)) && out.includes(esc(ladder.steps[1].name)), 'the card did not name both steps')
  assert(out.includes('That step, then and now'), 'the card did not draw the step')
  assert(html(createElement(StepPassedCard, { sessions: [then, now], flaw, rung: 0, passedAt: 6_000 })) === '', 'a card was drawn for the first rung')
})

check('only a move up is recorded as a step passed, and every ladder button says where it came from (Q10)', () => {
  const fs = fsForSource as { readFileSync: (p: string, e: 'utf8') => string }
  const app = fs.readFileSync('src/App.tsx', 'utf8')
  assert(/const passed = from !== undefined && step > from/.test(app), 'a step back could be recorded as a pass')
  assert(app.includes('...(passed ? { ladderPassedAt:'), 'a pass is not stored apart from a move')
  for (const f of ['src/screens/Report.tsx', 'src/screens/Glance.tsx', 'src/components/SessionDashboard.tsx']) {
    const calls = fs.readFileSync(f, 'utf8').match(/onLadderStep\([^)]*\)/g) ?? []
    assert(calls.length > 0, `${f} has no ladder button`)
    for (const c of calls) assert(c.split(',').length === 3, `${f}: ${c} does not say which rung it leaves`)
  }
})

check("today's tools: a court card for the first drill, and the week in the calendar (N1.6, N1.7, Q9)", () => {
  const week = {
    from: {},
    items: [{ title: 'Toss', flaw: 'toss_height', drill: { name: 'Toss and point', how: 'Toss and point.', reps: '15 tosses' }, check: 'Twelve of fifteen.' }],
    graduated: [],
  } as unknown as Parameters<typeof TodayPlan>[0]['week']
  const out = html(createElement(TodayPlan, { week, minutes: 45 }))
  assert(out.includes('Open the court card'), 'no way to the court card')
  assert(out.includes('Add to calendar'), 'no way to the calendar')
  assert(!out.includes('Toss and point'), 'the tools named the drill again')
})

check('a basket\'s drill check leads the focus card, above the drill (N4.2)', () => {
  const base = sampleAnalysis()
  const flaw = causalPlan(base.triage, base.diagnosis)[0].flaw!
  const analysis = { ...base, drillCheck: { flaw, read: 6, clean: 5, need: progressionFor(flaw)!.pass, outcome: 'passed' as const } }
  const out = html(createElement(DrillCard, { item: causalPlan(base.triage, base.diagnosis)[0], racket: 'right', check: analysis.drillCheck, rung: 0, onLadderStep: noop }))
  const said = out.indexOf('passed this step')
  assert(said > 0, 'the passed check was not said')
  assert(said < out.indexOf('class="drill-how"'), 'the check still follows the drill')
})

check('a first read says so, with the full read a tap away; a full read says nothing (M1.3)', () => {
  const first = html(createElement(Report, { analysis: { ...sampleAnalysis(), firstRead: true }, onBack: noop, onAnalyzeAnother: noop, onReadFully: noop }))
  assert(first.includes('A first read.') && first.includes('Read it in full'), 'a first read was not said, or had no way to the full read')
  const full = html(createElement(Report, { analysis: sampleAnalysis(), onBack: noop, onAnalyzeAnother: noop, onReadFully: noop }))
  assert(!full.includes('A first read.'), 'a full read was called a first read')
})

check('tagging is one short row above the fold, under the fix (N1.9, lift)', () => {
  const out = html(createElement(Report, { analysis: sampleAnalysis(), onBack: noop, onAnalyzeAnother: noop, onTagServe: noop, onTagOutcome: noop }))
  const tag = out.indexOf('What you said about this serve')
  assert(tag > 0, 'no tag row on a live report')
  assert(tag < out.indexOf('Everything I measured'), 'tagging is still inside the fold')
  assert(tag > out.indexOf('Work on this next'), 'tagging jumped above the fix')
})

check('the glance says the best set on each set chip (N3.2)', () => {
  const out = html(createElement(Glance, { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop, onTagOutcome: noop, onStartSet: noop, bestSets: { 1: 7 } }))
  assert(out.includes('best 7'), 'the first-serve chip did not carry its best')
  assert((out.match(/best \d/g) ?? []).length === 1, 'a best was shown for a serve number with no set')
})

/* ------------------------------------------- every stored shape, one at a time */

/**
 * The generalisation of the two checks above.
 *
 * A stored report outlives the code that wrote it. Fields get added, backups get
 * hand-edited, a newer build writes a key an older one has never seen, and a
 * half-written row survives a browser being killed mid-save. `normalise` is the
 * one gate between all of that and a render, and its contract is two-valued:
 * either it drops the row, or what it hands back can be drawn. Nothing in
 * between — a partially repaired row is a blank screen behind the ErrorBoundary,
 * which is the worst outcome available, because the player has lost the whole
 * app rather than one report.
 *
 * So this asserts the contract directly instead of enumerating the fields that
 * have bitten so far. Every key on a real report, and every key on the nested
 * shapes the screens reach through, is knocked out four ways in turn; whatever
 * survives `normalise` is rendered. It found the two defects this file opens
 * with by construction, and it is the part that will find the third.
 */
const KNOCKOUTS: { name: string; to: unknown }[] = [
  { name: 'absent', to: undefined },
  { name: 'null', to: null },
  { name: 'a number', to: 0 },
  { name: 'an empty array', to: [] },
]

/** The same row with one path replaced, without touching the original. */
function mutate(row: Record<string, unknown>, path: string[], to: unknown): unknown {
  if (path.length === 0) return to
  const [head, ...rest] = path
  const base = row[head]
  if (Array.isArray(base)) {
    const copy = [...base]
    copy[0] = mutate(copy[0] as Record<string, unknown>, rest, to)
    return { ...row, [head]: copy }
  }
  return { ...row, [head]: mutate((base ?? {}) as Record<string, unknown>, rest, to) }
}

/** Every path worth knocking out: the top level, plus what the screens index into. */
function pathsOf(row: Record<string, unknown>): string[][] {
  const nested = ['phases', 'fundamentals', 'consistency', 'triage', 'diagnosis', 'quality', 'focus']
  const out: string[][] = Object.keys(row).map((k) => [k])
  for (const key of nested) {
    const value = row[key]
    const inner = Array.isArray(value) ? value[0] : value
    if (inner && typeof inner === 'object') {
      out.push(...Object.keys(inner as object).map((k) => [key, k]))
    }
  }
  // One level deeper on the two the panel and the cards walk element by element.
  const metric = (row.fundamentals as { metrics?: unknown[] }[] | undefined)?.[0]?.metrics?.[0]
  if (metric && typeof metric === 'object') {
    out.push(...Object.keys(metric as object).map((k) => ['fundamentals', 'metrics', k]))
  }
  const spread = (row.consistency as { metrics?: unknown[] } | undefined)?.metrics?.[0]
  if (spread && typeof spread === 'object') {
    out.push(...Object.keys(spread as object).map((k) => ['consistency', 'metrics', k]))
  }
  const gap = (row.consistency as { gap?: object } | undefined)?.gap
  if (gap) out.push(...Object.keys(gap).map((k) => ['consistency', 'gap', k]))
  return out
}

heading('normalise either drops a stored row or hands back one that draws')

check('every field of a stored basket, knocked out four ways, still ends in a screen', () => {
  const { frames: _f, ...whole } = basket()
  void _f
  const row = { ...whole, id: 'serve-fuzz-0' } as unknown as Record<string, unknown>

  const paths = pathsOf(row)
  assert(paths.length > 30, `only ${paths.length} paths found — the walk is not reaching the shape`)

  const broken: string[] = []
  let drawn = 0
  let dropped = 0

  for (const path of paths) {
    for (const knockout of KNOCKOUTS) {
      const where = `${path.join('.')} = ${knockout.name}`
      let markup: string | undefined
      try {
        const s = normalise(mutate(row, path, knockout.to))
        if (!s) {
          dropped++
          continue
        }
        markup = html(
          createElement(Report, { analysis: s, onBack: noop, onAnalyzeAnother: noop }),
        )
      } catch (err) {
        broken.push(`${where} → ${(err as Error).message}`)
        continue
      }
      // Surviving `normalise` is a promise that the row is drawable, so an
      // empty render is a failure of the same contract by a quieter route.
      if (!markup || markup.length < 200) broken.push(`${where} → rendered almost nothing`)
      else drawn++
    }
  }

  assert(
    broken.length === 0,
    `${broken.length} of ${paths.length * KNOCKOUTS.length} mutations broke the render:\n      ` +
      broken.slice(0, 40).join('\n      ') +
      (broken.length > 40 ? `\n      …and ${broken.length - 8} more` : ''),
  )
  // A walk that dropped everything would pass the assertion above while
  // proving nothing, which is the failure mode of every fuzz test.
  assert(drawn > paths.length, `only ${drawn} mutations reached a render (${dropped} dropped)`)
})

report()
