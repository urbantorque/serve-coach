/**
 * A screen change as a view transition, where the browser has them and the
 * player has not asked for less motion (N4.6).
 *
 * The glance and the report both open on the same score ring; named alike
 * (`view-transition-name: score-ring`), the ring moves from one to the other
 * instead of vanishing and reappearing. Everywhere else, and under reduced
 * motion, the change simply happens.
 */
export function withTransition(change: () => void, doc: Pick<Document, 'startViewTransition'> | undefined = typeof document === 'undefined' ? undefined : document): void {
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const start = doc?.startViewTransition
  if (still || typeof start !== 'function') {
    change()
    return
  }
  start.call(doc, change)
}
