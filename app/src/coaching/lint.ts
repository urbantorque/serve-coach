/**
 * Content lint over the coaching library (COACHING §14, rules 1 to 15). Pure: returns the problems,
 * so the unit test can run it over the real library and over deliberately broken fixtures.
 */
import { METRIC_IDS, type ServePhase } from '../analysis/types.ts'
import type { LibraryItem } from './library.ts'

const PHASES: readonly ServePhase[] = ['setup', 'toss', 'loading', 'drive', 'contact', 'landing', 'recovery']
const OVERLAYS = ['apex-scatter', 'apex-vs-toe', 'toss-arc', 'contact-height-line', 'contact-vs-toe', 'hip-rise', 'shoulder-line', 'timing-strip', 'outcome-tally', 'none']
const COMPARE_TO = ['best-serve', 'previous-session', 'none']

/** Rule 14 deny-list (whole words or phrases, case-insensitive). */
export const DENY_PHRASES = [
  'sit',
  'bend more',
  'deeper',
  'lower your hips',
  'hold your landing',
  'freeze',
  'keep pointing',
  'pull your arm down',
  'drop your arm',
  'cm above',
  'above your reach',
  'be tall',
  'lighthouse',
  'brim',
  'before it drops',
  'head height',
  'trunk',
  'arch',
] as const

/** Rule 15: phrases that would contradict another item's cue ("brush up and across" in second-serve-margin). */
export const CONTRADICTION_PHRASES = [
  { phrase: 'not across', conflictsWith: 'second-serve-margin' },
  { phrase: 'straight through', conflictsWith: 'second-serve-margin', cueOnly: true },
  { phrase: 'stop at the top', conflictsWith: 'steady-rhythm', cueOnly: true },
  { phrase: 'wait for the ball', conflictsWith: 'toss-to-reach-height', cueOnly: true },
] as const

/** Rule 10: source keys the attribution register rejects (unseen paid material). */
const REJECTED_SOURCES = ['research 04 [S2]', 'research 04 [S4]', 'research 04 [S5]', 'research 04 [S6]', 'research 04 [S7]', 'research 04 [S8]', 'research 04 [S9]']
const SOURCE_FORM = /^(research \d{2} (\[[SM]\d+\]|M\d+|§[\d.]+|F\d+)|gap-(geometry|ranges|audit|segment)( \[[A-Z]\d+\]| §[\d.]+)?|research 10 M\d+|physics)/

const sentences = (text: string) =>
  text
    .replace(/\b(e\.g|i\.e|vs|approx|Dr)\./g, '$1')
    .split(/(?<=[.?])\s+/)
    .filter((s) => s.trim().length > 0)
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean)
const has = (text: string, phrase: string) => new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)

function drillTexts(item: LibraryItem): { field: string; text: string }[] {
  const d = item.drill
  return [
    { field: 'setup', text: d.setup },
    ...d.steps.map((s, i) => ({ field: `steps[${i}]`, text: s })),
    { field: 'successCriterion', text: d.successCriterion },
    { field: 'regression', text: d.regression },
    ...(d.progressionAlt ? [{ field: 'progressionAlt', text: d.progressionAlt }] : []),
  ]
}

export function lintItem(item: LibraryItem): string[] {
  const p: string[] = []
  const add = (rule: number, msg: string) => p.push(`${item.id}: rule ${rule}: ${msg}`)
  const cues = [item.cues.analogy, item.cues.outcome, ...(item.cues.outcomeSecondServe ? [item.cues.outcomeSecondServe] : [])]

  // 1. Cues under 8 words.
  for (const c of cues) if (words(c).length >= 8) add(1, `cue has ${words(c).length} words: "${c}"`)
  // 2. whyItMatters and every variant: exactly 2 sentences.
  for (const t of [item.whyItMatters, ...(item.whyItMattersVariants ?? []).map((v) => v.text)]) {
    if (sentences(t).length !== 2) add(2, `whyItMatters must be 2 sentences (has ${sentences(t).length})`)
  }
  // 3. Drill minutes 5 to 10.
  if (item.drill.minutes < 5 || item.drill.minutes > 10) add(3, `drill.minutes ${item.drill.minutes} outside 5 to 10`)
  // 4. Canonical metric ids.
  const known = new Set<string>(METRIC_IDS)
  for (const id of [...item.detection.metricIds, ...item.evidence.statIds]) if (!known.has(id)) add(4, `unknown metric id ${id}`)
  // 5. trunk-tilt-band anywhere.
  if (JSON.stringify(item).includes('trunk-tilt-band')) add(5, 'trunk-tilt-band is removed')
  // 6. Rear-only bands never in side or any items.
  if (item.view !== 'rear') {
    for (const id of ['knee-bend-band', 'shoulder-over-shoulder-contact']) {
      if ((item.detection.metricIds as string[]).includes(id) || (item.evidence.statIds as string[]).includes(id)) add(6, `${id} in a ${item.view} item`)
    }
  }
  // 7. Depth metrics never drive coaching.
  for (const id of ['loading-depth', 'deep-bend-flag']) {
    if ((item.detection.metricIds as string[]).includes(id) || (item.evidence.statIds as string[]).includes(id)) add(7, `${id} in metricIds or statIds`)
  }
  // 8. landing-distance never first and never a stat.
  if (item.detection.metricIds[0] === 'landing-distance') add(8, 'landing-distance is the first metricId')
  if ((item.evidence.statIds as string[]).includes('landing-distance')) add(8, 'landing-distance is a statId')
  // 9. Enums.
  const phase = item.evidence.keyFramePhase
  if (phase === null ? item.itemType !== 'routine' : !PHASES.includes(phase)) add(9, `keyFramePhase ${String(phase)}`)
  if (!COMPARE_TO.includes(item.evidence.compareTo)) add(9, `compareTo ${item.evidence.compareTo}`)
  if (item.evidence.compareTo === 'none' && item.itemType !== 'routine') add(9, 'compareTo none is for routines only')
  if (!OVERLAYS.includes(item.evidence.overlay)) add(9, `overlay ${item.evidence.overlay}`)
  // 10. Sources: known key forms; rejected register rows.
  for (const s of item.sources) {
    if (REJECTED_SOURCES.includes(s)) add(10, `rejected source ${s}`)
    else if (!SOURCE_FORM.test(s)) add(10, `unrecognised source key "${s}"`)
  }
  // 12. Toss-only reps.
  if (item.drill.tossOnlyReps > 5) add(12, `tossOnlyReps ${item.drill.tossOnlyReps} > 5`)
  if (item.drill.tossOnlyReps > 0) {
    const all = drillTexts(item).map((t) => t.text).join(' ')
    // Every toss rep moves the racquet arm (P7): "taking the racquet back", "reach up with the racquet".
    if (!/racquet[^.]*\b(back|up|going|moves|moving)\b|\b(take|taking|reach|reaching)\b[^.]*racquet/i.test(all)) {
      add(12, 'toss-only reps without the racquet arm moving')
    }
  }
  // 13. Level gating.
  for (const { field, text } of drillTexts(item)) {
    if (has(text, 'kick')) add(13, `"kick" in drill.${field}`)
    if (/back[- ]leg/i.test(text)) add(13, `"back leg" in drill.${field}`)
  }
  for (const { field, text } of [...drillTexts(item), { field: 'progression', text: item.drill.progression }, { field: 'note', text: item.drill.note ?? '' }]) {
    if (/\bjump/i.test(text)) add(13, `"jump" in drill.${field}`)
  }
  const gate = item.drill.progressionGate
  const prog = item.drill.progression
  const gated = gate.levels.length < 2 || gate.excludeIfComfort.length > 0
  if (has(prog, 'kick')) {
    if (gate.levels.join() !== 'utr-4-7') add(13, 'kick progression must be gated to utr-4-7')
    if (!gate.excludeIfComfort.includes('back')) add(13, 'kick progression must exclude the back comfort setting')
  }
  if (/back[- ]leg/i.test(prog)) {
    if (gate.levels.join() !== 'utr-4-7') add(13, 'back-leg progression must be gated to utr-4-7')
    if (!gate.excludeIfComfort.includes('knee') || !gate.excludeIfComfort.includes('back')) add(13, 'back-leg progression must exclude knee and back')
    if (gate.label !== 'coaches-differ') add(13, 'back-leg progression must be labelled coaches-differ')
  }
  if (gated && item.itemType !== 'routine' && !item.drill.progressionAlt) add(13, 'gated progression without progressionAlt')
  // 14. Deny-list in cues, drills and whyItMatters.
  const texts = [
    ...cues,
    item.whyItMatters,
    ...(item.whyItMattersVariants ?? []).map((v) => v.text),
    ...drillTexts(item).map((t) => t.text),
    item.drill.progression,
    item.drill.note ?? '',
  ]
  for (const t of texts) for (const phrase of DENY_PHRASES) if (has(t, phrase)) add(14, `deny-listed "${phrase}" in "${t.slice(0, 60)}"`)
  return p
}

export function lintLibrary(items: readonly LibraryItem[]): string[] {
  const p = items.flatMap(lintItem)
  // 11. Unique fault ids; keep-going and warm-up-routine present.
  const faults = items.filter((i) => i.itemType === 'focus').map((i) => i.faultId)
  const dup = faults.filter((f, i) => faults.indexOf(f) !== i)
  if (dup.length) p.push(`rule 11: duplicate faultId ${dup.join(', ')}`)
  if (!items.some((i) => i.id === 'keep-going')) p.push('rule 11: keep-going missing')
  if (!items.some((i) => i.id === 'warm-up-routine')) p.push('rule 11: warm-up-routine missing')
  // 15. No cue contradicts another item's cue.
  for (const it of items) {
    const cues = [it.cues.analogy, it.cues.outcome, it.cues.outcomeSecondServe ?? '']
    for (const c of CONTRADICTION_PHRASES) {
      if (c.conflictsWith === it.id) continue
      const scope = 'cueOnly' in c && c.cueOnly ? cues : [...cues, ...drillTexts(it).map((t) => t.text), it.drill.progression]
      if (scope.some((t) => has(t, c.phrase))) p.push(`${it.id}: rule 15: "${c.phrase}" contradicts ${c.conflictsWith}`)
    }
  }
  return p
}
