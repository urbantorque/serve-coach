/**
 * Whether paid plans exist, set by the owner at build time (N6.4).
 *
 *   VITE_PAYMENTS unset   the app ships as it is: everything open, no prices,
 *                         no request to any payment service. The default.
 *   VITE_PAYMENTS=mock    the whole flow against a local stand-in for the
 *                         payment provider, on the dev server only (N6.5).
 *   VITE_PAYMENTS=on      the real provider, once the owner has an account and
 *                         keys (`docs/next/OWNER-STEPS.md`).
 *
 * In development `?paywall` shows the gates without any of that, so the
 * paywalls can be looked at and tested; a build ignores it.
 */
const mode = import.meta.env?.VITE_PAYMENTS as string | undefined
const query = typeof location === 'undefined' ? undefined : new URLSearchParams(location.search)

export const PAYMENTS: 'off' | 'on' | 'mock' = mode === 'on' ? 'on' : mode === 'mock' ? 'mock' : 'off'

/** Whether a paid plan exists, so a gate can close. */
export const GATED = PAYMENTS !== 'off' || Boolean(import.meta.env?.DEV && query?.has('paywall'))

/** The price as the owner writes it, such as "£4 a month". Unset, no price shows anywhere. */
export const PRICE_LINE = (import.meta.env?.VITE_PRICE_LINE as string | undefined) || undefined
