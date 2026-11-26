/**
 * Each fault said as the thing, the cost and the feel (E3.2).
 *
 * The title says the thing. The line under it used to say it again, "Your
 * tossing arm comes down early" over "Your tossing arm comes down before the
 * swing", so the first words a player read twice were the only words they
 * read. Every line under a title is now two sentences, what the fault costs and
 * what to feel instead, and neither opens by repeating its title.
 */
import { VERDICT_TABLES } from '../analysis/verdict'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const words = (s: string) => s.toLowerCase().replace(/[^a-z’' ]/g, ' ').split(/\s+/).filter(Boolean)
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean)

/** Every title with the line under it, the second sides and the axes included. */
const pairs = Object.entries(VERDICT_TABLES.flaws).flatMap(([flaw, c]) => [
  { at: flaw, title: c.title, line: c.low },
  ...(c.high && c.highTitle ? [{ at: `${flaw}/high`, title: c.highTitle, line: c.high }] : []),
  ...Object.entries(c.byAxis ?? {}).map(([axis, a]) => ({ at: `${flaw}/${axis}`, title: a?.title ?? c.title, line: a?.low ?? c.low })),
])

heading('Each fault said as the thing, the cost and the feel (E3.2)')

check('every line under a title is two sentences: the cost, then the feel', () => {
  note(`${pairs.length} titled lines`)
  for (const p of pairs) {
    assert(sentences(p.line).length === 2, `${p.at}: "${p.line}" is ${sentences(p.line).length} sentences`)
    assert(cueIssues(p.line).length === 0, `${p.at}: ${cueIssues(p.line).join('; ')}`)
  }
})

check('no line opens by saying its title again', () => {
  for (const p of pairs) {
    // The title's first four words, in order, at the start of the line, is the repeat this replaced.
    const head = words(p.title).slice(0, 4).join(' ')
    assert(!words(p.line).join(' ').startsWith(head), `${p.at}: "${p.line}" restates "${p.title}"`)
  }
})

check('no line tells the swing to pause or stop', () => {
  for (const p of pairs) assert(!/\b(pause|stop|hold the swing)\b/i.test(p.line), `${p.at}: "${p.line}"`)
})

report()
