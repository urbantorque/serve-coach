/**
 * What Plus adds, and what is never behind it (PRODUCT §5.2, §6.15). Pure data. Screens that offer a
 * Plus feature name it by id, so the T3 sheet can say what was tapped in the player's words.
 *
 * Nothing in the "always free" list may ever be gated: body check, pain gate and referral, honesty
 * labels, "How we measure", export, every deletion and retention control, capture tips, match-log
 * entry and the sample session. `assertGateable` throws in development if a screen tries.
 */

export type PlusFeature =
  | 'ghost-compare'
  | 'any-serve-compare'
  | 'any-session-compare'
  | 'full-history'
  | 'season-view'
  | 'rear-suggested-tags'
  | 'progression-drill'
  | 'coach-progress-summary'
  | 'unlimited-analysis'

export interface PlusFeatureInfo {
  /** Short name, as the sheet's title names it ("Ghost overlay"). */
  name: string
  /** One plain sentence on what it does for the player. */
  line: string
}

export const PLUS_FEATURES: Record<PlusFeature, PlusFeatureInfo> = {
  'ghost-compare': { name: 'Ghost overlay', line: 'Your other serve drawn over this one, lined up at the toss, so small differences stand out.' },
  'any-serve-compare': { name: 'Compare any two serves', line: 'Pick any serve from any session to set beside this one.' },
  'any-session-compare': { name: 'Compare any two sessions', line: 'Line up any two matched sessions, not only the latest ones.' },
  'full-history': { name: 'Full history', line: 'Trends and comparisons past the last 30 days. Your data stays on this phone either way.' },
  'season-view': { name: 'Season view', line: 'Your practice focus beside your comp nights, week by week. Shown side by side, never combined.' },
  'rear-suggested-tags': { name: 'Suggested tags from behind', line: 'In, net, long or wide filled in from the view from behind, for you to confirm.' },
  'progression-drill': { name: 'Drill progressions', line: 'Harder and easier versions of your drill as your log shows it working or not.' },
  'coach-progress-summary': { name: 'Progress summary for your coach', line: 'Several sessions and your experiments on one page to share.' },
  'unlimited-analysis': { name: 'Unlimited analysed sessions', line: 'Every practice day analysed, with no monthly allowance.' },
}

/** Areas that are always free (PRODUCT §5.2 "Always free"; task brief: never block safety, labels, export or deletion). */
export const ALWAYS_FREE_AREAS = [
  'body-check',
  'pain-referral',
  'honesty-labels',
  'how-we-measure',
  'export',
  'deletion',
  'retention',
  'capture-tips',
  'match-log-entry',
  'sample-session',
  'recording',
  'import',
  'replay',
  'every-measurement',
  'did-it-work-verdict',
] as const
export type AlwaysFreeArea = (typeof ALWAYS_FREE_AREAS)[number]

export function isPlusFeature(id: string): id is PlusFeature {
  return Object.prototype.hasOwnProperty.call(PLUS_FEATURES, id)
}

/** Throws for anything that is not a Plus feature (a guard for screens wiring a gate). */
export function assertGateable(id: string): asserts id is PlusFeature {
  if ((ALWAYS_FREE_AREAS as readonly string[]).includes(id)) throw new Error(`${id} is always free and can never be gated`)
  if (!isPlusFeature(id)) throw new Error(`${id} is not a Plus feature`)
}
