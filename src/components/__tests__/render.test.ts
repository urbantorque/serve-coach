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
import Glance from '../../screens/Glance'
import Home from '../../screens/Home'
import Progress from '../../screens/Progress'
import Report from '../../screens/Report'
import { DEMO_DIALS, sampleAnalysis, sampleBasket } from '../../dev/sampleAnalysis'
import { CHECK_SERVES, progressionFor } from '../../lib/analysis/progressions'
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
  assert(out.includes('Every area we scored'), 'the fundamentals never reached the page')
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
  assert(out.includes('Tag this serve'), 'a reopened report offered no way to tag it')
  for (const label of ['First serve', 'Second serve', 'In', 'Long', 'Net', 'Wide']) {
    assert(out.includes(`>${label}</button>`), `no "${label}" control`)
  }
  assert(/aria-pressed="true"[^>]*>Second serve</.test(out), 'the second-serve tag was not shown as chosen')
  assert(/aria-pressed="true"[^>]*>Net</.test(out), 'the net tag was not shown as chosen')
  assert(!/aria-pressed="true"[^>]*>In</.test(out), 'an outcome nobody chose was shown as chosen')
  const bare = html(createElement(Report, { analysis: stored(sampleAnalysis()), onBack: noop, onAnalyzeAnother: noop }))
  assert(!bare.includes('Tag this serve'), 'tag controls rendered with nothing to save them')
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

check('the consistency panel renders on its own', () => {
  const c = basket().consistency!
  const out = html(createElement(ConsistencyPanel, { consistency: c, onDismiss: noop, createdAt: 0 }))
  assert(out.includes('Overall, serve by serve'), 'the panel rendered nothing recognisable')
})

check('the glance renders', () => {
  const out = html(
    createElement(Glance, { analysis: sampleAnalysis(), onOpenReport: noop, onBack: noop }),
  )
  assert(out.includes('Show me everything'), 'the glance lost its way out')
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
  assert(out.includes(`Film a basket of ${CHECK_SERVES} on this step`), 'nothing says what to film to check it')

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
