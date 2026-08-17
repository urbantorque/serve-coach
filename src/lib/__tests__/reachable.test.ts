/**
 * Props a screen declares and nothing ever passes.
 *
 * WHY THIS FILE EXISTS. Round 41 went to add a tap beside an existing one and
 * found the existing one had never rendered: `onTagServe` shipped with its
 * markup, its pressed state and its argument for using no new styling, and
 * nothing ever passed it a handler. Three rounds invisible, and the block is
 * gated on the prop — `{onTagServe && ...}` — so an absent handler is not a
 * crash or a warning. It is a screen quietly missing a feature.
 *
 * Caught by hand, at a consolidation, which is not a thing anybody keeps doing:
 * the same sentence `jsxCopy.test.ts` opens with, about the same kind of gap.
 *
 * WHY IT IS THIS NARROW, AND THE WIDER VERSION WAS TRIED FIRST. The obvious
 * gate is "any export with no shipping caller". Built, run, and it flags 116 of
 * 483 exports — because this codebase deliberately exports constants so a test
 * can name them rather than copy the number, an argument written out in
 * `FINE_FPS`, `MAX_FINE_FRAMES`, `KEEP_STILLS` and a dozen more. A gate needing
 * a 116-row allow list is a list nobody prunes, which is the failure
 * `jsxCopy.test.ts` had to grow a second check to survive at four rows.
 *
 * So it is scoped to the shape the defect actually had. A prop is a contract
 * between two files: one declares it, another passes it, and there is no reason
 * for the first without the second. That is judgeable. "Exported and unused" is
 * not, in a repo where being nameable by a test is a reason to export.
 *
 * TEXT-MATCHED, NOT PARSED, and the ruling list is checked against the scan
 * rather than assumed correct — `jsxCopy.test.ts`'s trade, for its reason.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[]
  readFileSync: (p: string, e: 'utf8') => string
}
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }

/** Every `.tsx` under `src`, `__tests__` excluded — `jsxCopy.test.ts`'s walker. */
function componentFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== '__tests__') componentFiles(full, out)
    } else if (e.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * One `name?: type` line inside a `Props` block.
 *
 * Optional props only, and that is the whole point rather than a simplification.
 * A required prop that nobody passes is a compile error and `tsc` already owns
 * it — this gate exists precisely because an optional one is legal, silent, and
 * renders as a missing feature. `onTagServe` was optional.
 */
const PROP = /^ {2}(\w+)\?:/gm

/** A prop the scan flagged, with a verdict. */
interface Ruling {
  prop: string
  why: string
}

/**
 * Optional props declared and never passed, each with a reason.
 *
 * The rule for adding a row: name the caller that is coming, or wire it up. A
 * row with a vague reason is how a dead feature gets a permanent home — which
 * is what happened to `onTagServe` for three rounds without even a row.
 */
const RULINGS: readonly Ruling[] = []

heading('Props a screen declares and nothing passes')

const root = path.join(process.cwd(), 'src')
const files = componentFiles(root)
const bodies = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))

/**
 * The same file with its comments blanked out.
 *
 * CANARIED INTO EXISTENCE. Unwiring `onTagServe` — the defect this whole file
 * was written for — left the gate green, because the comment beside the wiring
 * says the words "nothing ever passed `onTagServe`". A search that counts prose
 * about a prop as a use of it cannot catch a prop that is only ever talked
 * about, which is precisely what a dead feature looks like in a codebase that
 * documents its intentions this heavily.
 *
 * Blanked rather than deleted so nothing shifts: `{ '/* … *\/': same length of
 * spaces }`, which keeps this cheap and keeps a stray brace inside a comment
 * from being counted by `propsBlock` either.
 */
const blankComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))

const code = new Map(files.map((f) => [f, blankComments(bodies.get(f)!)]))

/**
 * The `interface Props { ... }` block of one file, or nothing.
 *
 * Brace-counted from the declaration rather than regex-matched to the closing
 * brace, because these blocks are full of doc comments containing braces —
 * and a naive match would stop at the first `}` inside a comment and read half
 * the props.
 */
function propsBlock(body: string): string | undefined {
  const at = body.search(/^interface Props \{/m)
  if (at < 0) return undefined
  let depth = 0
  for (let i = body.indexOf('{', at); i < body.length; i++) {
    if (body[i] === '{') depth++
    else if (body[i] === '}' && --depth === 0) return body.slice(at, i)
  }
  return undefined
}

const declared: { prop: string; file: string }[] = []
for (const f of files) {
  const block = propsBlock(bodies.get(f)!)
  if (!block) continue
  for (const m of block.matchAll(PROP)) declared.push({ prop: m[1], file: f })
}

/*
 * Passed by somebody, in any file but the one that declares it.
 *
 * NOT `name={`, WHICH WAS THE FIRST VERSION AND WAS WRONG. It flagged
 * `leftIsBetter`, which `ConsistencyPanel` passes as a bare boolean shorthand —
 * `leftIsBetter` on its own line, no `=` at all. A gate whose first finding is
 * its own regex is a gate that would have taught everyone to ignore it.
 *
 * So it is the bare name, with type positions excluded so a re-declaration
 * elsewhere does not count as a use. That over-matches on a comment mentioning
 * the name and on a different component's prop of the same name — both in the
 * safe direction: this misses a dead prop rather than accusing a live one. A
 * gate that cries wolf grows an allow list the length of the codebase, which is
 * exactly how the wider version of this file died.
 */
const isPassed = (prop: string, declaredIn: string) => {
  const re = new RegExp(`\\b${prop}\\b(?!\\s*\\??:)`)
  return files.some((f) => f !== declaredIn && re.test(code.get(f)!))
}

const orphaned = declared.filter((d) => !isPassed(d.prop, d.file))
note(`${declared.length} optional props across ${files.length} components, ${orphaned.length} never passed`)

check('every optional prop a component declares is passed by somebody', () => {
  const ruled = new Set(RULINGS.map((r) => r.prop))
  const unruled = orphaned.filter((o) => !ruled.has(o.prop))
  assert(
    unruled.length === 0,
    `declared and never passed: ${unruled
      .map((u) => `${u.prop} (${u.file.slice(root.length + 1)})`)
      .join(', ')}. Wire it up, delete it, or add a ruling naming the caller that is coming.`,
  )
})

check('no ruling has outlived the prop it ruled on', () => {
  // The half `jsxCopy.test.ts` had to grow: a list nobody prunes becomes a list
  // of props that are fine now, and the next real one is added beside them
  // without anybody noticing the difference.
  const live = new Set(orphaned.map((o) => o.prop))
  const stale = RULINGS.filter((r) => !live.has(r.prop))
  assert(stale.length === 0, `passed now, so these rulings should go: ${stale.map((r) => r.prop).join(', ')}`)
})

check('the scan can still see a props block at all', () => {
  /*
   * The check that keeps the two above honest. A regex that stopped matching
   * reports zero orphans and passes everything, which is the failure mode of
   * every text-matched gate — and `tallies.test.ts` exists because this repo
   * has already shipped a suite that passed while proving nothing.
   */
  assert(declared.length > 40, `only ${declared.length} optional props found across ${files.length} files`)
  const withBlocks = files.filter((f) => propsBlock(bodies.get(f)!) !== undefined).length
  assert(withBlocks > 10, `only ${withBlocks} components had a readable Props block`)
  note(`${withBlocks} components with a Props block`)
})

report()
