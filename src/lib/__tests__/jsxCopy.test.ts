/**
 * The copy that lives in a component, which nothing was checking.
 *
 * WHY THIS FILE EXISTS. `LOOP.md` names `copy.test.ts` as one of three critics
 * this repo keeps in executable form, and it walks six data tables — `METRICS`,
 * `SERVE_TYPES`, `FUNDAMENTALS`, `AXIS_COPY`, `DRILLS` and `everyVerdictCue()`.
 * Every one of those is a table. **Every sentence written straight into JSX was
 * unchecked**, and there are ninety-six of them: the privacy lines, the filming
 * guide, the handedness picker, the storage panel's export warning, both player
 * notes under the replays. R28 found copy drifting over the cap *inside* the
 * tables that are linted. Outside them there was no gate at all, which is how
 * this was found — by auditing three new lines by hand at a consolidation, which
 * is not a thing anybody will keep doing.
 *
 * TEXT-MATCHED ON PURPOSE, NOT PARSED, and the allow list below is checked
 * against what the scan actually found rather than assumed correct — the same
 * trade `egress.test.ts` makes and for the same reason. A regex over source text
 * cannot tell a sentence from a label, so it over-matches, and the answer is to
 * write down every match with a verdict rather than to tune the regex until the
 * output looks tidy. A tuned regex is a gate nobody can audit.
 *
 * TWO VERDICTS, AND THE DIFFERENCE MATTERS.
 *
 *   · `exempt` — the lint is wrong about this line. It is a label rather than a
 *     cue, or a dev-only surface no player reaches, or a passive that is doing
 *     real work. Each says which.
 *   · `known` — the lint is right and the line has not been fixed. **There are
 *     none left.** R69·1 shipped this gate with eight, listed with their measured
 *     faults; R69·2 fixed all eight, and each ruling came out of the table as its
 *     line stopped failing. The verdict stays in the type because the next scan
 *     that finds something real will want it, and because a table that can only
 *     express "exempt" is a table that exempts everything.
 *
 * WHAT THIS CATCHES TODAY. A *new* line that fails. Nothing in a component is
 * over the cap, passive, hedged or preambled except the seven below, and every
 * one of those says why the lint is wrong about it.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { cueIssues, wordCount } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[]
  readFileSync: (p: string, e: 'utf8') => string
}
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }

/**
 * Every `.tsx` under `src`, `__tests__` excluded.
 *
 * Walked rather than globbed to stay dependency-free, exactly as the test
 * runner's own discovery does.
 */
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
 * Text sitting between two tags, which is as close to "a sentence a player
 * reads" as a regex can get.
 *
 * Deliberately narrow, and every narrowing is a thing this cannot see, so they
 * are named rather than left implicit:
 *
 *   · Starts with a capital, so `className` values and lowercase fragments are
 *     skipped — and so is any player-facing line that starts mid-sentence.
 *   · At least twelve characters and containing a space, so `/100`, `#4` and
 *     single words are skipped — and so is any short line that is nonetheless
 *     wrong.
 *   · No braces, so anything interpolated is skipped entirely. **This is the big
 *     one.** A line built from a template literal is invisible here, which is
 *     most of what `statusLabels.ts` and the progress copy produce — those are
 *     reached by `copy.test.ts` instead, through their own functions.
 */
function jsxText(source: string): string[] {
  const found: string[] = []
  for (const m of source.matchAll(/>\s*([A-Z][^<>{}]{12,}?)\s*</g)) {
    const text = m[1].replace(/\s+/g, ' ').trim()
    if (!/[a-z]/.test(text) || !/\s/.test(text)) continue
    found.push(text)
  }
  return found
}

interface Ruling {
  /** Enough of the line to identify it — matched as a prefix, so a rewrite fails. */
  text: string
  verdict: 'exempt' | 'known'
  why: string
}

/**
 * Every line the scan currently flags, with a verdict on each.
 *
 * Matched as a prefix rather than in full so the table stays readable, and
 * because the first dozen words are enough to identify a line uniquely — checked
 * below, since two rulings matching one line would let a real violation hide
 * behind an exemption.
 */
const RULINGS: Ruling[] = [
  /* ------------------------------------------------------------- exempt -- */
  {
    text: 'Overall score by session',
    verdict: 'exempt',
    why: 'A chart label, not a cue. `voice.ts` reads a leading "overall" as a preamble, which it is in a sentence and is not in a heading.',
  },
  {
    text: 'Overall, serve by serve',
    verdict: 'exempt',
    why: 'The same label on the basket panel, flagged for the same wrong reason.',
  },
  {
    text: 'Every clip in the folder is analysed here',
    verdict: 'exempt',
    why: '`?corpus` is dev-only and says so in `App.tsx` — a tool for building the engine, not a surface a player reaches.',
  },
  {
    text: 'Stop and keep what is read',
    verdict: 'exempt',
    why: 'A button on the same dev-only corpus screen.',
  },
  {
    text: 'Reports are kept on this device only',
    verdict: 'exempt',
    why: 'The passive is the claim. An active rewrite needs a subject, and the whole promise is that there is no "we" doing the keeping — no server, no account, nobody.',
  },
  {
    text: 'Nothing here is sent anywhere',
    verdict: 'exempt',
    why: 'Same sentence, same reason, on the `?check` panel.',
  },
  {
    text: 'An export is one file holding your scores and real photos',
    verdict: 'exempt',
    why: '"not just numbers" — the hedge carries the meaning, and dropping it inverts the sentence. R30 wrote this line to be read before the Export button.',
  },
]

heading('Copy written straight into a component')

const FILES = componentFiles(path.join(process.cwd(), 'src'))
const ALL = FILES.flatMap((f) => jsxText(fs.readFileSync(f, 'utf8')))
const FAILING = ALL.filter((t) => cueIssues(t).length > 0)

note(`${FILES.length} components, ${ALL.length} readable lines, ${FAILING.length} failing the editor`)
note(
  `  ${RULINGS.filter((r) => r.verdict === 'exempt').length} ruled exempt with a reason, ` +
    `${RULINGS.filter((r) => r.verdict === 'known').length} real and unfixed`,
)

check('the scan is finding something to scan', () => {
  // A scan that matched nothing would pass every check below while proving
  // nothing at all, which is the failure mode `egress.test.ts` guards the same
  // way. Bounds rather than an exact count, so adding a component is not a
  // failure and deleting the copy layer is.
  assert(FILES.length > 15, `only ${FILES.length} components found — has the walk broken?`)
  assert(ALL.length > 60, `only ${ALL.length} readable lines found — has the pattern broken?`)
})

check('no line fails the editor that has not been ruled on', () => {
  /*
   * THE CHECK THAT DOES THE WORK. Everything else here is scaffolding; this is
   * what stops the next line written into a component from being unchecked. It
   * names the line and its fault, so the failure message is the fix.
   */
  const unruled = FAILING.filter((t) => !RULINGS.some((r) => t.startsWith(r.text)))
  assert(
    unruled.length === 0,
    `${unruled.length} line(s) in a component fail the editor and are not ruled on:\n` +
      unruled
        .map((t) => `      ${wordCount(t)} words — ${cueIssues(t).join('; ')}\n        "${t}"`)
        .join('\n') +
      '\n      Fix the line, or add it to RULINGS with a reason.',
  )
})

check('no ruling has quietly stopped applying to anything', () => {
  /*
   * The opposite failure, and the one `egress.test.ts` was written to catch on
   * its own allow list: a line fixed or deleted leaves a stale exemption behind,
   * and the next line that happens to start the same way inherits a pass it was
   * never granted.
   */
  const stale = RULINGS.filter((r) => !FAILING.some((t) => t.startsWith(r.text)))
  assert(
    stale.length === 0,
    `${stale.length} ruling(s) no longer match any failing line — the copy was fixed, so remove them:\n` +
      stale.map((r) => `      "${r.text}"`).join('\n'),
  )
})

check('no two rulings claim the same line', () => {
  // A real violation could otherwise hide behind an exemption whose prefix
  // happens to be shorter, which is the one way this table could lie.
  for (const text of FAILING) {
    const claims = RULINGS.filter((r) => text.startsWith(r.text))
    assert(claims.length <= 1, `"${text.slice(0, 40)}" is claimed by ${claims.length} rulings`)
  }
})

check('every ruling says why, and every exemption gives a reason a person can argue with', () => {
  for (const r of RULINGS) {
    assert(r.why.trim().length > 30, `"${r.text}" is exempted without a reason worth the name`)
  }
})

report()
