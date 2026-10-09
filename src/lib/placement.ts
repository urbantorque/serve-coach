/**
 * Where the phone goes, said one way everywhere (L1.10).
 *
 * The same placement used to be given four ways on one first afternoon: the
 * guide said "four metres", the analysing tips "four or five metres", a refusal
 * "4–5 metres back" and two others "ten steps to your side", which is nearer
 * seven or eight. The live framing check then told a player standing exactly
 * where the guide put them to "move a step round". Every sentence that says
 * where to stand reads its distance from here, and `placement.test.ts` fails on
 * a hint that gives a distance of its own.
 *
 * Four to five metres because that is what the guide's diagram draws and what
 * the virtual phone films the Bath serves from (4.5 m, `GUIDE_PHONE`).
 */
export const PLACEMENT = {
  /** How far from the player, as a phrase that drops into a sentence. */
  distance: 'four to five metres',
  /** Where, relative to the court. */
  where: 'level with the baseline',
  /** How high. */
  height: 'at about waist height',
} as const
