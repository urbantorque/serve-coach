/**
 * The editor, as a test.
 *
 * Every string this app can put in front of a player is a command: at most two
 * sentences, at most twenty-five words, active voice, no pleasantries, no lab
 * vocabulary, and no raw measurement — the readout says it in body language
 * instead. Those rules only hold if something enforces them, and a style guide
 * in a comment enforces nothing. This walks the whole copy database and fails
 * the build on the first sentence that drifts.
 *
 * It also checks the translation layer covers every measurement, because a
 * missing ladder is silent: the number simply disappears from the card and the
 * report looks fine while saying less than it did.
 */
import { TRANSLATED, readoutOf, targetOf } from '../anatomy'
import { DRILLS, FUNDAMENTALS, METRICS, SERVE_TYPES, metricCopy } from '../coaching'
import { MAX_SENTENCES, MAX_WORDS, command, cueIssues, plain, wordCount } from '../voice'
import { assert, check, report } from './harness'
import type { ServeType } from '../../storage/prefs'

console.log('\n\x1b[1mThe house voice\x1b[0m')

/** Every string in the database, labelled by where it came from. */
function everyCue(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = []
  for (const m of Object.values(METRICS)) {
    for (const [k, v] of Object.entries(m.insight)) out.push({ where: `${m.id}.insight.${k}`, text: v })
    for (const [k, v] of Object.entries(m.fix)) {
      // An empty fix is deliberate: nothing to correct on that side of the band.
      if (v) out.push({ where: `${m.id}.fix.${k}`, text: v })
    }
    out.push({ where: `${m.id}.drill.how`, text: m.drill.how })
  }
  for (const [id, type] of Object.entries(SERVE_TYPES)) {
    out.push({ where: `${id}.blurb`, text: type.blurb })
    for (const [metricId, insight] of Object.entries(type.insight ?? {})) {
      for (const [k, v] of Object.entries(insight)) {
        if (v) out.push({ where: `${id}.${metricId}.${k}`, text: v })
      }
    }
  }
  for (const [id, f] of Object.entries(FUNDAMENTALS)) {
    out.push({ where: `${id}.blurb`, text: f.blurb })
    out.push({ where: `${id}.drill.how`, text: f.drill.how })
  }
  // The drills the triage layer can name. Most are the same objects as above and
  // are simply checked twice, which costs nothing; the handful that exist only
  // in the registry would otherwise never face the editor at all.
  for (const [id, drill] of Object.entries(DRILLS)) {
    out.push({ where: `DRILLS.${id}.how`, text: drill.how })
  }
  return out
}

check('every line of coaching copy passes the editor', () => {
  const bad = everyCue()
    .map((c) => ({ ...c, issues: cueIssues(c.text) }))
    .filter((c) => c.issues.length > 0)

  assert(
    bad.length === 0,
    `${bad.length} line(s) failed:\n` +
      bad.map((b) => `      ${b.where}: ${b.issues.join('; ')}\n        "${b.text}"`).join('\n'),
  )
})

check('no line runs past the ceiling', () => {
  for (const { where, text } of everyCue()) {
    assert(wordCount(text) <= MAX_WORDS, `${where} runs to ${wordCount(text)} words`)
  }
})

check('key words are marked for scanning', () => {
  // Praise can be plain; an instruction has to lead with something a player can
  // find without reading the sentence.
  for (const m of Object.values(METRICS)) {
    for (const [side, text] of Object.entries(m.fix)) {
      if (!text) continue
      assert(text.includes('**'), `${m.id}.fix.${side} has no marked instruction`)
    }
  }
})

/* ----------------------------------------------------------------- anatomy -- */

console.log('\n\x1b[1mNumbers, said as body positions\x1b[0m')

check('every measurement can be spoken without a number', () => {
  for (const id of Object.keys(METRICS)) {
    assert(TRANSLATED.includes(id), `${id} has no body-language ladder`)
  }
})

check('a readout exists everywhere across each measurement axis', () => {
  for (const m of Object.values(METRICS)) {
    const [lo, hi] = m.range
    for (let i = 0; i <= 10; i++) {
      const v = lo + ((hi - lo) * i) / 10
      const tag = readoutOf(m.id, v)
      assert(tag.length > 0, `${m.id} has no readout at ${v}`)
      assert(
        cueIssues(tag).length === 0,
        `${m.id} readout "${tag}" fails the editor: ${cueIssues(tag).join('; ')}`,
      )
    }
  }
})

check('the target reads as a body position, and moves with the serve type', () => {
  for (const type of Object.keys(SERVE_TYPES) as ServeType[]) {
    for (const id of Object.keys(METRICS)) {
      const copy = metricCopy(id, type)
      const target = targetOf(id, copy.ideal)
      assert(target.length > 0, `${id} has no target phrase for a ${type} serve`)
    }
  }
  // The one that must genuinely differ: a kick is struck over the head, a flat
  // serve in front of the body. If these ever collapse to the same phrase the
  // serve-type picker has stopped meaning anything on screen.
  const flat = targetOf('contactAhead', metricCopy('contactAhead', 'flat').ideal)
  const kick = targetOf('contactAhead', metricCopy('contactAhead', 'kick').ideal)
  assert(flat !== kick, `flat and kick ask for the same contact point: "${flat}"`)
})

check('a value outside the axis still lands somewhere', () => {
  assert(readoutOf('contactHeight', -99).length > 0, 'no readout below the axis')
  assert(readoutOf('contactHeight', 99).length > 0, 'no readout above the axis')
  assert(readoutOf('contactHeight', NaN).length > 0, 'no readout for a broken value')
  assert(readoutOf('notAMeasurement', 1) === '', 'invented a readout for an unknown measurement')
})

/* ------------------------------------------------------------------ filter -- */

console.log('\n\x1b[1mThe slop filter\x1b[0m')

check('pleasantries and throat-clearing are stripped', () => {
  const cases: [string, string][] = [
    ['Great job on your serve, but your elbow bends.', 'Your elbow bends.'],
    ['It looks like you are dropping the arm early.', 'You are dropping the arm early.'],
    ['You should try to keep the arm straight.', 'Keep the arm straight.'],
    ['Basically, sink until the knees bend.', 'Sink until the knees bend.'],
  ]
  for (const [input, want] of cases) {
    const got = command(input)
    assert(got === want, `"${input}"\n        wanted "${want}"\n        got    "${got}"`)
  }
})

check('hedging words are removed', () => {
  const got = command('Just try to keep the arm a little straighter.')
  assert(!/\bjust\b|\ba little\b/i.test(got), `hedging survived: "${got}"`)
})

check('a multi-paragraph answer is cut to two sentences', () => {
  const got = command(
    'Your toss drifts. Fix it with a fence drill. Then film again next week. Then check the trend.',
  )
  assert(got === 'Your toss drifts. Fix it with a fence drill.', `got "${got}"`)
})

check('an over-long sentence is cut at a word boundary and closed off', () => {
  const long = `Keep ${Array.from({ length: 40 }, () => 'word').join(' ')}`
  const got = command(long)
  assert(wordCount(got) <= MAX_WORDS, `${wordCount(got)} words survived`)
  assert(/[.!?]$/.test(got), `no terminator: "${got}"`)
})

check('a cut never leaves the rest of the report in bold', () => {
  const got = command(`**Keep the arm straight ${Array.from({ length: 40 }, () => 'word').join(' ')}**`)
  assert((got.match(/\*\*/g)?.length ?? 0) % 2 === 0, `unbalanced markers: "${got}"`)
})

check('the filter is idempotent, so copy cannot be shortened twice', () => {
  for (const { where, text } of everyCue()) {
    assert(command(command(text)) === command(text), `${where} changes on a second pass`)
  }
})

check('marked-up copy survives being flattened for plain text', () => {
  const flat = plain('**Keep** the arm straight.')
  assert(flat === 'Keep the arm straight.', `got "${flat}"`)
})

check('the ceilings are the ones the copy was written against', () => {
  assert(MAX_WORDS === 25, `word ceiling moved to ${MAX_WORDS}`)
  assert(MAX_SENTENCES === 2, `sentence ceiling moved to ${MAX_SENTENCES}`)
})

/* ------------------------------------------------------------------- drills -- */

console.log('\n\x1b[1mOne fault, one drill\x1b[0m')

check('every measurement carries exactly one corrective drill', () => {
  for (const m of Object.values(METRICS)) {
    assert(m.drill.name.length > 0, `${m.id} has no drill`)
    assert(m.drill.how.length > 0, `${m.id} drill has no instruction`)
    assert(m.drill.reps.length > 0, `${m.id} drill has no rep count`)
    assert(
      wordCount(m.drill.how) <= MAX_WORDS,
      `${m.id} drill runs to ${wordCount(m.drill.how)} words`,
    )
  }
})

check('no two measurements share a drill name by accident', () => {
  const seen = new Map<string, string>()
  for (const m of Object.values(METRICS)) {
    const clash = seen.get(m.drill.name)
    assert(!clash, `${m.id} and ${clash} both use "${m.drill.name}"`)
    seen.set(m.drill.name, m.id)
  }
})

report()
