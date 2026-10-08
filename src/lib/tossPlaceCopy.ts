/**
 * Where a toss peaked against the front foot, in the player's words.
 *
 * One phrasing for every place it is said — the toss map's readout and the
 * marker on the toss still (D4.6) — so a player who reads one and then looks
 * at the other meets the same sentence. A share of their own height, because
 * nothing in a single phone clip knows how tall they are in centimetres.
 */
export type TossAxis = 'ahead' | 'across'

const shareOf = (v: number) => `${Math.round(Math.abs(v) * 100)}% of your height`

export function placeLine(axis: TossAxis, v: number): string {
  if (Math.abs(v) < 0.01) return 'over your front foot'
  if (axis === 'ahead') return `${shareOf(v)} ${v > 0 ? 'in front of' : 'behind'} your front foot`
  return `${shareOf(v)} to your ${v > 0 ? 'hitting' : 'tossing'} side`
}
