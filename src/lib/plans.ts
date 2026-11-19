/**
 * Free and Plus, and the one question every screen asks of them (N6.4).
 *
 * The handover's proposal, kept in one place for the owner to change: free
 * reads every serve and gives the score and the top fix, the whole breakdown
 * on the first serve, and a short history; Plus adds the rest. Which features
 * are paid, and the price, are the owner's to agree (`OWNER-STEPS.md`); this
 * table is the only thing that would change.
 *
 * Every gate in the app goes through `can`. With the gate off, which is how
 * the app ships until the owner switches payments on, it says yes to
 * everything, so nothing is locked before there is a way to pay.
 *
 * DOM-free and pure, so `plans.test.ts` walks every case in Node.
 */

export const FEATURES = ['breakdown', 'compare', 'pathway', 'sessions', 'speedTrend', 'coachShare', 'history'] as const
export type Feature = (typeof FEATURES)[number]

/** How many of the newest serves a free history reopens. The rest stay on the device. */
export const FREE_HISTORY = 5

export type Plan = 'free' | 'plus'

export interface Entitlement {
  plan: Plan
  /** When a paid plan runs out, in ms. Absent on free, and on a plan with no end. */
  until?: number
}

export const FREE: Entitlement = { plan: 'free' }

export interface CanContext {
  entitlement: Entitlement
  /** Whether paid plans exist at all. Off, everything is open. */
  gated: boolean
  now?: number
  /** This report is the player's first serve, which free reads in full. */
  firstServe?: boolean
}

/** A paid plan that has not run out. */
export function hasPlus(e: Entitlement, now = Date.now()): boolean {
  return e.plan === 'plus' && (e.until === undefined || e.until > now)
}

/** The one gate. */
export function can(feature: Feature, ctx: CanContext): boolean {
  if (!ctx.gated) return true
  if (hasPlus(ctx.entitlement, ctx.now)) return true
  if (feature === 'breakdown' && ctx.firstServe) return true
  return false
}
