/**
 * The house voice, enforced in code rather than in a style guide.
 *
 * Coaching copy rots in one direction: towards the polite, the hedged and the
 * long. A sentence gets a softener added so it does not read as harsh, then a
 * caveat so it is not overclaimed, then a second sentence explaining the first —
 * and what started as "keep the arm straight" ends up as three lines a player
 * skims past on a court in the sun. Nobody adds that in one commit; it arrives a
 * word at a time.
 *
 * So the rule lives here and runs on every string on its way to the screen.
 * `command()` is a hard filter — it strips openers, collapses whitespace and
 * truncates — and `cueIssues()` is the lint the tests run over the whole copy
 * database, so a violation fails a build rather than shipping quietly.
 *
 * Copy marks its key words with `**double asterisks**`. The markers are not
 * counted as words and are stripped for anything that needs plain text.
 */

/** A single piece of feedback gets this many words. Not a target — a ceiling. */
export const MAX_WORDS = 25

/** And this many sentences. One is better; two is the most that ever helps. */
export const MAX_SENTENCES = 2

/**
 * Openers that carry no instruction: pleasantries, throat-clearing, hedges.
 *
 * Anchored to the start, because these are the phrases that get bolted onto the
 * front of a perfectly good sentence. Removing the opener and capitalising what
 * follows leaves the actual advice intact.
 */
const OPENERS: RegExp[] = [
  // Stops at the first comma rather than running to the end of the sentence:
  // "Great job, your elbow bends" must lose the compliment and keep the fault.
  /^(great|nice|good|well done|awesome)\b[^,.!?]*[,!]\s*/i,
  /^(that('s| is)|this is) (a )?(great|good|nice|solid)\b[^,.!?]*[,!]\s*/i,
  /^(it (looks|seems) like|it appears that|we (can see|noticed) that|the (data|analysis) (shows|suggests) that)\s*/i,
  /^(you (should|might want to|may want to|could) (try|consider|think about)( to)?)\s*/i,
  /^(in order to|what (this|that) means is( that)?|the key (thing|point) here is( that)?)\s*/i,
  /^(basically|essentially|overall|in general|as a rule|remember(,| that)?|keep in mind( that)?)[,:]?\s*/i,
]

/** Words that add length and subtract instruction. */
const FILLER =
  /\b(just|really|very|quite|pretty|actually|simply|slightly|a (little|bit)|kind of|sort of|somewhat|generally|typically|essentially|basically)\b\s*/gi

/**
 * Corporate and lab vocabulary. A player has a serve, not a metric.
 *
 * Flagged rather than rewritten: a machine substitution here would produce
 * nonsense, and the point is to fail the build so a person writes the sentence.
 */
const JARGON =
  /\b(metric|parameter|coordinate|multiplier|algorithm|optimi[sz]e|leverage|utili[sz]e|robust|holistic|actionable|data point|kinematic|telemetry)\b/i

/**
 * Coach vocabulary: the images a coach uses and a player who hits twice a
 * month cannot picture. `LOOP.md` has named these since the rule was written,
 * and until this pattern existed nothing enforced it — "Steep cartwheel" was
 * on screen as a readout tag and "is the brake" as an area headline, both
 * passing every check above.
 */
const COACH_JARGON =
  /\b(windmill\w*|cartwheel\w*|back[- ]?scratch\w*|kinetic chain|the chain|head speed|the brake)\b/i

/** Passive construction, close enough for copy this short. */
const PASSIVE =
  /\b(is|are|was|were|be|been|being)\s+(\w+ed|shown|taken|seen|given|held|kept|made|done|found|read)\b/i

/** Numbers dressed as measurements. The readout says it in body language. */
const MATH = /[%×÷±≥≤]|\b\d+(\.\d+)?\s*(°|deg|degrees|ms|cm|percent)\b|\d+(\.\d+)?x\b/i

const stripMarks = (s: string) => s.replace(/\*\*/g, '')

/** Words, ignoring the bold markers, so formatting never costs budget. */
export const wordCount = (s: string): number =>
  stripMarks(s).trim().split(/\s+/).filter(Boolean).length

/** Sentences, counting a trailing fragment without punctuation as one. */
export const sentenceCount = (s: string): number =>
  stripMarks(s).split(/[.!?]+(?:\s|$)/).filter((p) => p.trim().length > 0).length

/** Bold markers removed, for alt text, share cards and anything plain. */
export const plain = (s: string): string => stripMarks(s).replace(/\s+/g, ' ').trim()

/**
 * Force one string into the house voice.
 *
 * Deliberately mechanical and cheap — it runs per measurement while a report is
 * being assembled, twenty or so times, and never on a hot path. It cannot make a
 * flabby sentence good; it exists so that a flabby sentence cannot reach a
 * player at full length while `cueIssues` is telling the tests about it.
 */
export function command(text: string | undefined): string {
  if (!text) return ''
  let s = text.replace(/\s+/g, ' ').trim()

  // Openers can stack — "Great job! It looks like you..." — so keep peeling
  // until nothing matches rather than making one pass and hoping.
  for (let pass = 0; pass < OPENERS.length; pass++) {
    const before = s
    for (const opener of OPENERS) s = s.replace(opener, '')
    if (s === before) break
  }

  // Cutting the compliment off the front strands the conjunction that joined it
  // to the instruction: "Great job, but your elbow bends" becomes "but your
  // elbow bends", which reads as an argument with a sentence nobody can see.
  s = s.replace(/^(but|and|so|however|although|though)\b,?\s+/i, '')

  s = s.replace(FILLER, '')
  s = s.replace(/\s+([,.!?])/g, '$1').replace(/\s+/g, ' ').trim()
  if (!s) return ''

  // Capitalise whatever now leads, unless it is a bold marker's word, which
  // carries its own capital through the markers.
  s = s.replace(/^(\*\*)?([a-z])/, (_m, mark: string | undefined, ch: string) =>
    `${mark ?? ''}${ch.toUpperCase()}`,
  )

  s = clampSentences(s)
  s = clampWords(s)

  if (!/[.!?]$/.test(s)) s += '.'
  return balanceMarks(s)
}

/** Keep the first `MAX_SENTENCES`, punctuation included. */
function clampSentences(s: string): string {
  const parts = s.match(/[^.!?]+[.!?]*/g)
  if (!parts || parts.length <= MAX_SENTENCES) return s
  return parts
    .slice(0, MAX_SENTENCES)
    .join('')
    .trim()
}

/** Hard word ceiling, cut at a word boundary and closed off cleanly. */
function clampWords(s: string): string {
  const words = s.split(/\s+/)
  let budget = MAX_WORDS
  const kept: string[] = []
  for (const w of words) {
    // A token that is only markers costs nothing; anything else is a word.
    if (stripMarks(w).length > 0) {
      if (budget === 0) break
      budget--
    }
    kept.push(w)
  }
  if (kept.length === words.length) return s
  return kept.join(' ').replace(/[,;:]$/, '').trim()
}

/** An odd number of markers after a cut would bold the rest of the report. */
function balanceMarks(s: string): string {
  const marks = s.match(/\*\*/g)?.length ?? 0
  return marks % 2 === 0 ? s : `${s}**`
}

/**
 * Everything wrong with a string, in the words the editor would use.
 *
 * Returns an empty array for copy that passes. Used by the tests over the whole
 * database, and by the dev-only check below on anything assembled at runtime.
 */
export function cueIssues(text: string): string[] {
  const issues: string[] = []
  const s = text.trim()
  if (!s) return ['empty']

  const words = wordCount(s)
  if (words > MAX_WORDS) issues.push(`${words} words, over the ${MAX_WORDS} word ceiling`)
  if (sentenceCount(s) > MAX_SENTENCES) issues.push(`more than ${MAX_SENTENCES} sentences`)

  for (const opener of OPENERS) {
    if (opener.test(s)) issues.push('opens with filler or a pleasantry')
  }
  const filler = s.match(FILLER)
  if (filler) issues.push(`hedging: ${[...new Set(filler.map((f) => f.trim()))].join(', ')}`)

  const jargon = s.match(JARGON)
  if (jargon) issues.push(`tech jargon: ${jargon[0]}`)

  const coach = s.match(COACH_JARGON)
  if (coach) issues.push(`coach jargon: ${coach[0]}`)

  const passive = s.match(PASSIVE)
  if (passive) issues.push(`passive voice: ${passive[0]}`)

  const math = s.match(MATH)
  if (math) issues.push(`raw measurement on screen: ${math[0]}`)

  if ((s.match(/\*\*/g)?.length ?? 0) % 2 !== 0) issues.push('unclosed bold marker')

  return issues
}

/**
 * `command()`, plus a shout in development when the input needed the filter.
 *
 * Production never sees the warning and always sees the filtered string, so a
 * long sentence assembled from live data — a warning that interpolates the
 * player's handedness, say — degrades to something short rather than to
 * something broken.
 */
export function cue(text: string | undefined): string {
  const out = command(text)
  if (import.meta.env?.DEV && text) {
    const issues = cueIssues(out)
    if (issues.length) console.warn(`[voice] ${issues.join('; ')} — "${out}"`)
  }
  return out
}
