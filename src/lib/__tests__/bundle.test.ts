/**
 * What the player downloads before anything works.
 *
 * WHY THIS FILE EXISTS. R75 measured the entry chunk at 416.90 kB raw and
 * 139.09 gzipped and wrote the numbers into a backlog row. Three rounds then
 * added components — a share button, a strap on the home screen, a memo — and
 * nobody looked again. **A measured number with no gate behind it is the exact
 * shape F4 found twice**: `LEG_DRIVE_FLOOR` and `LANDING_SQUARE_FLOOR` could
 * both be moved tenfold with nothing going red, because their derivations lived
 * in comments.
 *
 * This app is a PWA a club player opens on a phone at a court, often on whatever
 * signal a fence line has. The entry chunk is what stands between them and the
 * viewfinder. The pose model behind it is 9 MB and cached; this is not, on a
 * first visit.
 *
 * A RATCHET, NOT A TARGET. The budget is set a little above what the app
 * currently costs, so ordinary work does not trip it and a round that adds a
 * chunk has to say so. Raising it is allowed and is meant to be a decision
 * somebody writes down, which is what `MAX_FINE_FRAMES` says about its own
 * budget and what `footprint.ts` enforces for the heap.
 *
 * READS `dist`, SO THE BUILD IS PART OF THE GATE. Failing loudly when `dist` is
 * missing rather than skipping is deliberate: a check that quietly passes when
 * it cannot see is worse than no check, which is the lesson `tallies.test.ts`
 * and R52's audit both exist to carry.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
// @ts-expect-error - node's zlib, for the only measurement a player actually pays
import zlibUntyped from 'zlib'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  statSync: (p: string) => { size: number }
  existsSync: (p: string) => boolean
  readdirSync: (p: string) => string[]
  readFileSync: (p: string) => { length: number }
}
const path = pathUntyped as { join: (...p: string[]) => string }
const zlib = zlibUntyped as { gzipSync: (b: unknown, o: unknown) => { length: number } }
declare const process: { cwd(): string }

/**
 * What the entry chunk may cost, gzipped, in kB.
 *
 * 130 against a measured 124.64, after the report and progress screens were
 * split off the entry chunk (it had crept to 142 of the old 145). The same
 * few-rounds headroom as before, taken down with the chunk so the split cannot
 * be quietly spent. Gzip rather than raw because gzip is what
 * crosses the network and therefore what the player waits for; the raw figure is
 * carried alongside because it is what the phone has to parse, and on a mid-range
 * Android that is the half you feel.
 */
const ENTRY_GZIP_BUDGET_KB = 130

/** And the parse cost, which gzip hides. 385 against a measured 367.09. */
const ENTRY_RAW_BUDGET_KB = 385

/**
 * The pose runtime, in its own chunk and on its own budget.
 *
 * Separate because it is somebody else's code on somebody else's release
 * schedule: bundling its budget with ours would mean a MediaPipe upgrade reads
 * as this app getting heavier, and the response to each is different.
 */
const VISION_GZIP_BUDGET_KB = 45

heading('What the player downloads before anything works')

const dist = path.join(process.cwd(), 'dist', 'assets')

assert(
  fs.existsSync(dist),
  'no dist/assets to measure — run `npm run build` before the suite, which the ' +
    'consolidation gate already does. This check fails rather than skips on purpose.',
)

const files = fs.readdirSync(dist)
/**
 * Sizes in kB, where kB is 1000 bytes.
 *
 * NOT 1024, AND THE FIRST VERSION OF THIS FILE USED 1024. Vite prints its build
 * summary in decimal kB, so the budgets — which were read off that summary —
 * were being compared against numbers 2.4% smaller than the ones they came from:
 * this file said 409.87 where the build said 419.71, for the same file. Nobody
 * would have noticed until a budget was raised on a figure that did not match
 * the one in the terminal beside it.
 *
 * Gzip at level 9 rather than the default, so the number does not move when a
 * default does. That reads a little under Vite's own gzip figure, which is the
 * cost of pinning it and is worth paying: the budget is a ratchet against this
 * file's own measurements, and it has to compare like with like over time.
 */
const kB = (name: string) => {
  const raw = fs.readFileSync(path.join(dist, name))
  return {
    raw: raw.length / 1000,
    gzip: zlib.gzipSync(raw, { level: 9 }).length / 1000,
  }
}

const entryName = files.find((f) => /^index-.*\.js$/.test(f))
const visionName = files.find((f) => /vision_bundle.*\.js$/.test(f))
const cssName = files.find((f) => /^index-.*\.css$/.test(f))

check('the entry chunk is inside its budget', () => {
  assert(entryName !== undefined, `no entry chunk in dist/assets: ${files.join(', ')}`)
  const size = kB(entryName!)
  note(`entry ${size.raw.toFixed(2)} kB raw, ${size.gzip.toFixed(2)} kB gzip`)
  assert(
    size.gzip < ENTRY_GZIP_BUDGET_KB,
    `the entry chunk is ${size.gzip.toFixed(2)} kB gzipped against a ${ENTRY_GZIP_BUDGET_KB} kB ` +
      'budget. Either take something off the critical path, or raise the budget here and say ' +
      'in the commit what the player is now waiting for.',
  )
  assert(
    size.raw < ENTRY_RAW_BUDGET_KB,
    `the entry chunk is ${size.raw.toFixed(2)} kB unzipped against a ${ENTRY_RAW_BUDGET_KB} kB ` +
      'budget — that is parse time on a mid-range phone, which gzip hides',
  )
})

check('the pose runtime is still split out of the entry chunk', () => {
  /*
   * The split is worth more than the budget. R68 spent a whole round taking
   * 1.93 kB gzip off this path; a MediaPipe bundle folded back in would put
   * forty times that on it, and the app would still work, so nothing else would
   * notice.
   */
  assert(visionName !== undefined, `the pose runtime is no longer its own chunk: ${files.join(', ')}`)
  const size = kB(visionName!)
  note(`pose runtime ${size.raw.toFixed(2)} kB raw, ${size.gzip.toFixed(2)} kB gzip, separate`)
  assert(
    size.gzip < VISION_GZIP_BUDGET_KB,
    `the pose runtime is ${size.gzip.toFixed(2)} kB gzipped against ${VISION_GZIP_BUDGET_KB} kB`,
  )
})

check('the demo and fixture routes stay off the critical path', () => {
  /*
   * `?demo` and `?fixture` are dev and court-trip surfaces. R59·1 measured the
   * fixture route at 2.31 kB gzip on the critical path and R68 moved it off;
   * this is what keeps it off. Named by chunk rather than by size, because the
   * property is the split and not the bytes.
   */
  const split = ['sampleAnalysis', 'exportFixture']
  for (const name of split) {
    assert(
      files.some((f) => f.startsWith(name)),
      `${name} is no longer its own chunk, so it has been folded into something the player loads`,
    )
  }
  note(`${split.length} dev routes in their own chunks`)
})

/*
 * The one file every screen waits on before its words settle, so it has a
 * budget of its own. Archivo, cut to Latin, with its weight and width axes.
 */
const FONT_BUDGET_KB = 90

check('the typeface is measured too, and there is one', () => {
  const fonts = files.filter((f) => f.endsWith('.woff2'))
  assert(fonts.length === 1, `${fonts.length} font files: one family, one file`)
  const size = fs.statSync(path.join(dist, fonts[0])).size / 1024
  note(`${fonts[0]} ${size.toFixed(1)} kB`)
  assert(size < FONT_BUDGET_KB, `the typeface is ${size.toFixed(1)} kB against a ${FONT_BUDGET_KB} kB budget`)
})

check('the stylesheet is measured too, because nothing else measures it', () => {
  // Small, and the point is that it is watched at all: `contrast.test.ts` reads
  // this sheet for colour and has nothing to say about its size.
  assert(cssName !== undefined, 'no stylesheet in dist/assets')
  const size = kB(cssName!)
  note(`stylesheet ${size.raw.toFixed(2)} kB raw, ${size.gzip.toFixed(2)} kB gzip`)
  assert(size.gzip < 14, `the stylesheet is ${size.gzip.toFixed(2)} kB gzipped against a 14 kB budget`)
})

/**
 * Stylesheets that load with a lazy screen, all of them together, in kB gzip.
 *
 * A sheet imported by a lazy chunk is split into its own file by Vite and never
 * touches `index-*.css`, so the check above cannot see it. Without this line
 * the court surfaces' styles (C0) would be the first CSS in the app nothing
 * measures — and moving a rule out of the entry sheet would read as saving
 * bytes the player still downloads, a moment later.
 */
/*
 * Raised from 6 to 16, then to 20, on purpose (lift, 2026-11-05 and 2026-11-06).
 * Most of the app's styles used to load on first open for screens nobody had
 * reached. They now load with their screens, so this budget grew exactly as the
 * entry sheet's use of its own shrank: the first open pays less, and the total
 * is watched here. The second step is the new surfaces themselves (the serve
 * cards, the programme, the sheets behind Today), after a sweep took 12 kB of
 * rules left behind by the old screens out of the source. Everything here is
 * cached by the worker after one visit, so it costs a phone on a court nothing.
 */
const SPLIT_CSS_GZIP_BUDGET_KB = 20

check('the stylesheets that load with lazy screens are measured too', () => {
  const split = files.filter((f) => f.endsWith('.css') && f !== cssName)
  const sizes = split.map((f) => ({ f, ...kB(f) }))
  const gzip = sizes.reduce((sum, s) => sum + s.gzip, 0)
  note(`${split.length} split stylesheets, ${gzip.toFixed(2)} kB gzip together${sizes.length ? `: ${sizes.map((s) => `${s.f.split('-')[0]} ${s.gzip.toFixed(2)}`).join(', ')}` : ''}`)
  assert(
    gzip < SPLIT_CSS_GZIP_BUDGET_KB,
    `the split stylesheets are ${gzip.toFixed(2)} kB gzipped against a ${SPLIT_CSS_GZIP_BUDGET_KB} kB budget`,
  )
})

report()
