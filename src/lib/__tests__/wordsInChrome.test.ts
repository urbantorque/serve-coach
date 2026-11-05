/**
 * Words in the chrome (L4.11): the four terms a club player may not know are
 * defined on a tap, the coach's jargon row is renamed, the app speaks with one
 * narrator, and no text a player must read is set under 11px.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - node's path, same
import pathUntyped from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { GLOSSARY } from '../glossary'
import Term from '../../components/Term'
import Report from '../../screens/Report'
import { DEMO_DIALS, sampleAnalysis } from '../../dev/sampleAnalysis'
import { METRICS, READINGS } from '../analysis/coaching'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as {
  readFileSync: (p: string, e: string) => string
  readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[]
}
const path = pathUntyped as { join: (...p: string[]) => string }
declare const process: { cwd(): string }

function filesUnder(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'dev') out.push(...filesUnder(full, ext))
    } else if (e.name.endsWith(ext)) out.push(full)
  }
  return out
}

const noop = () => {}

heading('Defined on a tap')

check('every term has a meaning that passes the copy rules', () => {
  for (const [id, entry] of Object.entries(GLOSSARY)) {
    const issues = cueIssues(entry.meaning)
    assert(issues.length === 0, `${id}: "${entry.meaning}" — ${issues.join('; ')}`)
  }
})

check('a term is a button that says whether its meaning is open', () => {
  const html = renderToStaticMarkup(createElement(Term, { id: 'trophy' }))
  assert(/<button[^>]*class="term-word"[^>]*aria-expanded="false"/.test(html), 'the word is not a closed disclosure')
  assert(html.includes('aria-controls='), 'the word does not name its meaning')
  assert(html.includes('>Trophy<'), 'the word is missing')
})

check('trophy, racket drop, stance and firing order are each a tap away on the report', () => {
  const a = sampleAnalysis(DEMO_DIALS.example, undefined, 60)
  const html = renderToStaticMarkup(createElement(Report, { analysis: a, onBack: noop, onAnalyzeAnother: noop }))
  const words = [...html.matchAll(/class="term-word"[^>]*>([^<]+)</g)].map((m) => m[1])
  note(`terms on the report: ${words.join(', ')}`)
  for (const w of ['Trophy', 'Racket drop']) assert(words.includes(w), `${w} is not defined on a tap`)
  assert(words.some((w) => /stance/i.test(w)) === Boolean(a.diagnosis?.stance), 'the stance chip is not a term')
  assert(words.includes('The order you fired in') === html.includes('The order you fired in'), 'firing order is not a term')
  assert(html.includes('The order you fired in') && a.diagnosis?.stance !== undefined, 'the fixture shows neither stance nor firing order')
})

heading('Renamed, and one narrator')

check('the coil row is named for what it shows', () => {
  const label = READINGS.hipShoulderSeparation.label
  assert(label === 'Shoulders turned past the hips', `still "${label}"`)
  for (const m of [...Object.values(METRICS), ...Object.values(READINGS)]) assert(!/separation/i.test(m.label), `${m.id} is labelled "${m.label}"`)
})

check('the lint holds the coach to "I"', () => {
  assert(cueIssues('Every serve since we changed how we mark.').some((i) => i.startsWith('two narrators')), 'we passed')
  assert(cueIssues('How I read this clip.').every((i) => !i.startsWith('two narrators')), 'I failed')
})

check('no string in a component says we, our or us', () => {
  const hits: string[] = []
  for (const file of filesUnder(path.join(process.cwd(), 'src'), '.tsx')) {
    const code = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    for (const m of code.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|>[^<>{}]+</g)) {
      if (/\b(we|our|ours|us)\b/i.test(m[0])) hits.push(`${file.split(/[\\/]/).pop()}: ${m[0].trim().slice(0, 70)}`)
    }
  }
  assert(hits.length === 0, `a second narrator:\n    ${hits.join('\n    ')}`)
})

heading('Nothing a player reads under 11px')

check('every font size in every stylesheet is at least 11px', () => {
  const small: string[] = []
  const files = filesUnder(path.join(process.cwd(), 'src'), '.css')
  for (const file of files) {
    const css = fs.readFileSync(file, 'utf8')
    for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
      if (Number(m[1]) < 11) small.push(`${file.split(/[\\/]/).pop()}: ${m[0]}`)
    }
  }
  note(`${files.length} stylesheets read`)
  assert(files.length > 5, 'the stylesheets were not found')
  assert(small.length === 0, `text under 11px:\n    ${small.join('\n    ')}`)
})

heading('Signposts a player can read (N4.4)')

check('the labels that carry meaning are 12px and in the readable grey, not the faint one', () => {
  const where: Record<string, string> = {
    '.t-overline': 'tokens.css',
    '.block-title': 'blocks.css',
    '.judged-lead': 'depth.css',
    '.now-label': 'report.css',
    '.serve-tags-lead': 'report.css',
    '.drill-kicker': 'fundamentals.css',
    // The court's own (Q7): what a player reads and touches from the baseline.
    '.seg-item': 'player.css',
    '.framer-cue': 'court.css',
    '.framer-foot': 'court.css',
  }
  for (const [sel, file] of Object.entries(where)) {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', file), 'utf8')
    const i = css.indexOf(sel + ' {')
    assert(i >= 0, `${sel} not found in ${file}`)
    const body = css.slice(i, css.indexOf('}', i))
    const size = Number(/font-size:\s*([\d.]+)px/.exec(body)?.[1])
    assert(size >= 12, `${sel} is ${size}px`)
    assert(!/--fg-faint/.test(body), `${sel} is still in the faint grey`)
  }
})

report()
