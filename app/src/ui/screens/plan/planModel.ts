/**
 * Plans and prices (PRODUCT §5.2, §6.15, §10; research 08 §6). Prices are AUD including GST. In the
 * PWA prototype nothing is sold: a plan button only switches a local test flag (see entitlement.ts).
 */
import type { EntitlementSetting } from '../../../data/records.ts'
import { allowanceLine as entitlementAllowanceLine, FREE_DAYS_PER_MONTH, isPlus, monthKey as entitlementMonthKey } from '../../../entitlement/index.ts'

export type PlanId = NonNullable<EntitlementSetting['plan']>

export interface PlanOption {
  id: PlanId
  title: string
  price: string
  /** "a year", "a month", "for 4 months". */
  per: string
  /** Second line in the radio card. */
  detail: (now: Date) => string
  /** Primary button label for this plan (1 to 3 words). */
  action: string
  /** Test cell (research 08 §6): shown with a "Test" pill. */
  test?: boolean
}

const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "4 Oct" (local date). */
export function dayMonth(d: Date): string {
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d)
  const day = out.getDate()
  out.setDate(1)
  out.setMonth(out.getMonth() + months)
  // Clamp to the month's last day (31 Jan + 1 month = 28 or 29 Feb).
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate()
  out.setDate(Math.min(day, last))
  return out
}

export const TRIAL_DAYS = 7
export const SEASON_MONTHS = 4

export const PLANS: readonly PlanOption[] = [
  {
    id: 'annual',
    title: 'Yearly',
    price: 'A$99.99',
    per: 'a year',
    // A non-breaking space keeps the trial length on one line.
    detail: () => `About A$8.33 a month. Free for ${TRIAL_DAYS} days first.`,
    action: 'Start 7-day trial',
  },
  {
    id: 'monthly',
    title: 'Monthly',
    price: 'A$14.99',
    per: 'a month',
    detail: () => 'No trial. Cancel any time.',
    action: 'Choose monthly',
  },
  {
    id: 'season',
    title: 'Season pass',
    price: 'A$39.99',
    per: `for ${SEASON_MONTHS} months`,
    detail: (now) => `To ${dayMonth(addMonths(now, SEASON_MONTHS))}. Doesn't renew.`,
    action: 'Get season pass',
    test: true,
  },
]

/** PRODUCT §6.15 item 4: trial terms in plain words, with the real cancel-by date. */
export function trialTerms(now: Date): string {
  const cancelBy = dayMonth(addDays(now, TRIAL_DAYS))
  return `Free for ${TRIAL_DAYS} days, then A$99.99 a year. Cancel any time before ${cancelBy} and you won't be charged. We'll remind you 2 days before.`
}

/** Renewal terms per plan (DPLA Schedule 2 §3.8 disclosure: title, length, price). */
export function renewalTerms(plan: PlanId, now: Date): string {
  switch (plan) {
    case 'annual':
      return trialTerms(now) + ' Renews each year until you cancel.'
    case 'monthly':
      return 'A$14.99 a month. Renews each month until you cancel. Cancel any time in your App Store subscriptions.'
    case 'season':
      return `A$39.99 once, for ${SEASON_MONTHS} months, to ${dayMonth(addMonths(now, SEASON_MONTHS))}. It doesn't renew and there is nothing to cancel.`
  }
}

/**
 * PRODUCT §6.15 item 2: what Plus adds, four lines. Only what exists: suggested outcome tags from the
 * view from behind are not built (FUNCTIONAL_STATUS), and would be experimental (PRODUCT §5.2), so
 * they come back only when they ship, labelled. Comparisons are matched only (D7).
 */
export const PLUS_ADDS = [
  'Unlimited analysed sessions',
  'Your full history, and a season view of practice beside comp nights',
  'Compare any two matched sessions, with ghost overlays',
  'Drill progressions that follow your practice log',
] as const

/** PRODUCT §5.2 "Always free" row, in player words. */
export const ALWAYS_FREE = [
  'Unlimited recording, import and annotated replay',
  'Every measurement, from the side and from behind, with its label',
  'Your first experiment, then 2 analysed practice days a month',
  'Body check, pain referral, export and every deletion control',
] as const

/** Free-tier allowance (PRODUCT §5.2): analysed practice days per calendar month after the first loop. */
export { FREE_DAYS_PER_MONTH }

export function allowanceLine(daysUsed: number): string {
  return entitlementAllowanceLine({ used: daysUsed, limit: FREE_DAYS_PER_MONTH })
}

/** "YYYY-MM" for the allowance query (local month). */
export const monthKey = entitlementMonthKey

/** The local test flag a prototype "purchase" writes. No payment, no store call. */
export function prototypeEntitlement(plan: PlanId, now: Date, via?: EntitlementSetting['via'], feature?: string): EntitlementSetting {
  const base: EntitlementSetting = { tier: 'plus', plan, source: 'prototype', at: now.toISOString(), ...(via ? { via } : {}), ...(feature ? { feature } : {}) }
  if (plan === 'annual') return { ...base, trialEndsAt: addDays(now, TRIAL_DAYS).toISOString() }
  if (plan === 'season') return { ...base, endsAt: addMonths(now, SEASON_MONTHS).toISOString() }
  return base
}

export const FREE_ENTITLEMENT: EntitlementSetting = { tier: 'free', source: 'prototype' }

/** Plus is on, and a season pass has not run out (the rule lives in src/entitlement). */
export { isPlus }

export function planLabel(e: EntitlementSetting | undefined, now: Date = new Date()): string {
  if (!isPlus(e, now)) return 'Free'
  const title = PLANS.find((p) => p.id === e?.plan)?.title ?? 'Plus'
  return `Plus, ${title.toLowerCase()} (test)`
}
