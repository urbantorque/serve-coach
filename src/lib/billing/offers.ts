/**
 * What the pricing page offers beyond the monthly price (F1.1), read only there,
 * so the first screen does not carry it.
 */

/** The yearly price as the owner writes it, when they sell one; no yearly button without it. */
export const PRICE_LINE_ANNUAL = (import.meta.env?.VITE_PRICE_LINE_ANNUAL as string | undefined) || undefined

/** Free days before the first charge, said on the pricing page when the owner offers a trial. */
export const TRIAL_DAYS = Number(import.meta.env?.VITE_TRIAL_DAYS) || undefined
