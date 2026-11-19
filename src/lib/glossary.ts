/**
 * The words the screens use that a club player may not know (L4.11), each
 * defined in one sentence a tap away. Said in the narrator's own voice and
 * held to the copy rules like every other line (`jsxCopy.test.ts`).
 */
export const GLOSSARY = {
  trophy: {
    word: 'Trophy',
    meaning: 'The moment before the swing: racket up behind you, knees bent, tossing arm still reaching for the ball.',
  },
  racketDrop: {
    word: 'Racket drop',
    meaning: 'The racket head falling behind your back in the moment before you swing up to the ball.',
  },
  stance: {
    word: 'Stance',
    meaning: 'How your feet stand as you serve. Pinpoint brings the back foot up to the front one; platform keeps them apart.',
  },
  firingOrder: {
    word: 'Firing order',
    meaning: 'Which parts of your body reach their top speed first, from the legs up through the hips and shoulders to the racket arm.',
  },
  // What the headline number is and is not (N2.11): built from published
  // serves, steady to a few points, and never checked against a coach.
  score: {
    word: 'Your score',
    meaning: 'Every area of your serve against published serves, in one number. Set it against your own serves; no coach has checked it.',
  },
  likelyRange: {
    word: 'Likely range',
    meaning: 'Where I am sure your speed off the racket sits, as a radar gun reads it. Test serves fell inside nineteen times in twenty.',
  },
} as const

export type GlossaryId = keyof typeof GLOSSARY

/**
 * A sentence cut into plain runs and glossary words (N3.4): the first mention
 * of each word, whole words only, in any case. Later mentions stay plain, so a
 * line that says "trophy" twice offers one tap, not two.
 */
export function termSpans(text: string): ({ text: string } | { text: string; id: GlossaryId })[] {
  const ids = Object.keys(GLOSSARY) as GlossaryId[]
  const words = ids.map((id) => GLOSSARY[id].word.toLowerCase()).join('|')
  const pattern = new RegExp('\\b(' + words + ')\\b', 'gi')
  const seen = new Set<GlossaryId>()
  const out: ({ text: string } | { text: string; id: GlossaryId })[] = []
  let last = 0
  for (const m of text.matchAll(pattern)) {
    const id = ids.find((i) => GLOSSARY[i].word.toLowerCase() === m[0].toLowerCase())!
    if (seen.has(id)) continue
    seen.add(id)
    if (m.index! > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[0], id })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
