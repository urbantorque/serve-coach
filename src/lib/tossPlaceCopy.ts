/**
 * Where a toss peaked against the front foot, in the player's words.
 *
 * One phrasing for every place it is said — the toss map's readout and the
 * marker on the toss still (D4.6) — so a player who reads one and then looks
 * at the other meets the same sentence. A share of their own height, because
 * nothing in a single phone clip knows how tall they are in centimetres.
 */
export type TossAxis = 'ahead' | 'across'

/**
 * A foot's length as a share of standing height. Adult foot length runs at
 * about 15% of stature, so a distance in statures becomes one in the player's
 * own feet without anything knowing how tall they are (L1.5). "18% of your
 * height" was a number with no target that a player could not picture.
 */
export const FOOT_SHARE = 0.15

/** A distance in statures, said in foot-lengths to the nearest half. */
function feetOf(v: number): string {
  const halves = Math.round((Math.abs(v) / FOOT_SHARE) * 2)
  if (halves <= 1) return 'about half a foot-length'
  if (halves === 2) return 'about one foot-length'
  if (halves === 3) return 'about one and a half foot-lengths'
  if (halves === 4) return 'about two foot-lengths'
  return `about ${Math.round(halves / 2)} foot-lengths`
}

/** One end of a target band, said as a place. */
function endOf(axis: TossAxis, v: number): string {
  if (Math.abs(v) < FOOT_SHARE / 4) return 'over your front foot'
  const feet = feetOf(v).replace(/^about /, '')
  if (axis === 'ahead') return `${feet} ${v > 0 ? 'in front' : 'behind'}`
  return `${feet} to your ${v > 0 ? 'hitting' : 'tossing'} side`
}

/**
 * The toss map's target, in foot-lengths, and how many tosses peaked in it
 * (L4.7).
 */
export function targetLine(axis: TossAxis, band: [number, number], inside: number, total: number): string {
  return `Aim inside the dashed band: ${endOf(axis, band[0])} to ${endOf(axis, band[1])}. ${inside} of ${total} tosses peaked there.`
}

export function placeLine(axis: TossAxis, v: number): string {
  // Under a quarter of a foot-length either way is over the foot.
  if (Math.abs(v) < FOOT_SHARE / 4) return 'over your front foot'
  if (axis === 'ahead') return `${feetOf(v)} ${v > 0 ? 'in front of' : 'behind'} your front foot`
  return `${feetOf(v)} to your ${v > 0 ? 'hitting' : 'tossing'} side`
}
