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

/**
 * Where the phone goes for a serve speed (N2.7), said once here like the rest.
 *
 * Further back and looking past the player towards the net, on its side, so
 * the struck ball stays in the picture for longer. Measured on the simulated
 * launches (`serveSpeed.test.ts`): from the guide's placement a 30 fps clip
 * almost never gives a speed and a 60 fps one about one in five; from six to
 * seven metres with the net side open, 30 fps gives one in three and 60 fps
 * three in four. The body read is unchanged: the whole player is still in
 * the picture, just smaller.
 */
export const SPEED_PLACEMENT = {
  distance: 'six to seven metres',
  where: 'with you in the half of the picture away from the net',
} as const
