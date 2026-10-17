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
    meaning: 'Which parts of your body start moving first, from the legs up through the hips and shoulders to the racket arm.',
  },
} as const

export type GlossaryId = keyof typeof GLOSSARY
