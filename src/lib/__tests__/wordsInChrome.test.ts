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
  assert(/<button[^>]*class="term-word"[^>]*aria-expanded="false"/.test(html), 'the word isn’t a closed disclosure')
  assert(html.includes('aria-controls='), 'the word doesn’t name its meaning')
  assert(html.includes('>Trophy<'), 'the word is missing')
})

check('trophy, racket drop, stance and firing order are each a tap away on the report', () => {
  const a = sampleAnalysis(DEMO_DIALS.example, undefined, 60)
  const html = renderToStaticMarkup(createElement(Report, { analysis: a, onBack: noop, onAnalyzeAnother: noop }))
  const words = [...html.matchAll(/class="term-word"[^>]*>([^<]+)</g)].map((m) => m[1])
  note(`terms on the report: ${words.join(', ')}`)
  // On the word where the report uses it, not in a row of words of its own
  // (E3.4): wherever prose names the moment, that word is the tap. A button's
  // own label is a control, not prose, and a tap on it does what it says.
  const prose = html.replace(/<button[\s\S]*?<\/button>/g, ' ').replace(/<[^>]+>/g, ' ')
  for (const [w, re] of [['trophy', /\btrophy\b/i], ['racket drop', /\bracket drop\b/i]] as const) {
    if (re.test(prose)) assert(words.some((x) => re.test(x)), `${w} is used on the report but isn’t defined on a tap`)
  }
  assert(words.some((x) => /^trophy$/i.test(x)), 'the fixture no longer holds its frame at the trophy, so this check reaches nothing')
  assert(!html.includes('Tap a word to see what it means'), 'the row of words is back')
  assert(words.some((w) => /stance/i.test(w)) === Boolean(a.diagnosis?.stance), 'the stance chip isn’t a term')
  assert(words.includes('The order your body moved in') === html.includes('The order your body moved in'), 'firing order isn’t a term')
  assert(html.includes('The order your body moved in') && a.diagnosis?.stance !== undefined, 'the fixture shows neither stance nor firing order')
})

heading('Renamed, and one narrator')

check('the coil row is named for what it shows', () => {
  const label = READINGS.hipShoulderSeparation.label
  assert(label === 'Shoulders turned past the hips', `still "${label}"`)
  for (const m of [...Object.values(METRICS), ...Object.values(READINGS)]) assert(!/separation/i.test(m.label), `${m.id} is labelled "${m.label}"`)
})

check('the lint holds the coach to "I"', () => {
  assert(cueIssues('Every serve since we changed how we mark.').some((i) => i.startsWith('two narrators')), 'we passed')
  assert(cueIssues('What I saw in this video.').every((i) => !i.startsWith('two narrators')), 'I failed')
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

heading('Nothing a player reads under 14px (DESIGN.md, the floor)')

check('every font size in every stylesheet is at least 14px', () => {
  const small: string[] = []
  const files = filesUnder(path.join(process.cwd(), 'src'), '.css')
  for (const file of files) {
    const css = fs.readFileSync(file, 'utf8')
    for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
      if (Number(m[1]) < 14) small.push(`${file.split(/[\\/]/).pop()}: ${m[0]}`)
    }
  }
  note(`${files.length} stylesheets read`)
  assert(files.length > 5, 'the stylesheets weren’t found')
  assert(small.length === 0, `text under 14px:\n    ${small.join('\n    ')}`)
})

check('no stylesheet sets words in capitals, and a chip or a tag reads at 15px (N7.6)', () => {
  // The copy is sentence case (DESIGN.md); capitals set in a stylesheet undo it
  // where no copy check can see.
  const caps: string[] = []
  for (const file of filesUnder(path.join(process.cwd(), 'src'), '.css')) {
    const css = fs.readFileSync(file, 'utf8')
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*text-transform:\s*uppercase/g)) {
      caps.push(`${file.split(/[\\/]/).pop()}: ${m[1].trim()}`)
    }
  }
  assert(caps.length === 0, `capitals where the copy is sentence case:\n    ${caps.join('\n    ')}`)
  const controls = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', 'controls.css'), 'utf8')
  for (const name of ['chip', 'tag']) {
    const rule = new RegExp(`(^|\\n)\\.${name} \\{([^}]*)\\}`).exec(controls)?.[2] ?? ''
    const size = Number(/font-size:\s*([\d.]+)px/.exec(rule)?.[1])
    assert(size >= 15, `.${name} reads at ${size}px`)
  }
})

heading('Signposts a player can read (N4.4)')

check('the labels that carry meaning are 15px and in the readable grey, not the faint one', () => {
  const where: Record<string, string> = {
    '.t-overline': 'tokens.css',
    '.block-title': 'blocks.css',
    '.judged-lead': 'depth.css',
    '.now-label': 'report.css',
    '.serve-tags-lead': 'report.css',
    '.drill-kicker': 'fundamentals.css',
    // The court's own (Q7): what a player reads and touches from the baseline.
    '.seg-item': 'controls.css',
    '.framer-cue': 'court.css',
    '.framer-foot': 'court.css',
  }
  for (const [sel, file] of Object.entries(where)) {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'styles', file), 'utf8')
    const i = css.indexOf(sel + ' {')
    assert(i >= 0, `${sel} not found in ${file}`)
    const body = css.slice(i, css.indexOf('}', i))
    const size = Number(/font-size:\s*([\d.]+)px/.exec(body)?.[1])
    assert(size >= 15, `${sel} is ${size}px`)
    assert(!/--fg-faint/.test(body), `${sel} is still in the faint grey`)
  }
})

report()
