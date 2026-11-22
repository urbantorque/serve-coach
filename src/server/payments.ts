/**
 * The payment side of Plus, on the host (N6.5). Four routes under `/api/`,
 * written against the web's own Request and Response so they run unchanged in
 * a Cloudflare Pages function (`functions/api/[[route]].ts`), in the dev
 * server's local stand-in, and in Node under test.
 *
 *   checkout  a Stripe Checkout page for the Plus subscription
 *   claim     after paying, the checkout's id for a signed Plus pass
 *   refresh   a pass near its end for a new one, while the subscription runs
 *   portal    Stripe's own page to change a card or cancel
 *
 * No database and no account: the pass carries the subscription's id, and
 * Stripe is asked what it is now whenever a pass is renewed. Nothing about a
 * serve reaches this code; it sees a checkout id or a pass and nothing else.
 *
 * Never in the player's browser: `serverBoundary.test.ts` holds that no module
 * the app ships imports from here.
 */
import { importKey, readPass, signPass, type PassClaims } from '../lib/billing/pass'

export interface PayEnv {
  /** Stripe's secret key: `sk_test_…` to try it, `sk_live_…` to take money. Owner only. */
  STRIPE_SECRET_KEY?: string
  /** The Plus price in Stripe, `price_…`. Owner only. */
  STRIPE_PRICE_ID?: string
  /** The yearly Plus price, `price_…`, when the owner offers one (F1.1). Owner only. */
  STRIPE_ANNUAL_PRICE_ID?: string
  /** Free days before the first charge, 1 to 30, when the owner offers a trial (F1.1). Owner only. */
  TRIAL_DAYS?: string
  /** The private half of the pass key, as JSON. Owner only; never in the app. */
  ENTITLEMENT_PRIVATE_JWK?: string
  /** The site's own origin for the return addresses, when it differs from the request's. */
  SITE_URL?: string
  /** Where Stripe's API is: the local stand-in sets its own. */
  STRIPE_API?: string
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** A subscription as Stripe sends it. The period's end moved onto the item in 2025's API, so both are read. */
interface StripeSub {
  id: string
  status: string
  customer: string
  current_period_end?: number
  items?: { data?: { current_period_end?: number }[] }
}

/** Paid for, or in the grace Stripe gives a failed renewal: still Plus until the period ends. */
const LIVE = new Set(['active', 'trialing', 'past_due'])

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

class StripeError extends Error {
  constructor(readonly status: number) {
    super(`stripe ${status}`)
  }
}

function stripe(env: PayEnv, send: Fetch) {
  const api = (env.STRIPE_API ?? 'https://api.stripe.com').replace(/\/+$/, '')
  return async <T>(method: 'GET' | 'POST', path: string, fields?: Record<string, string>): Promise<T> => {
    const res = await send(`${api}/v1/${path}`, {
      method,
      headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: fields ? new URLSearchParams(fields).toString() : undefined,
    })
    if (!res.ok) throw new StripeError(res.status)
    return (await res.json()) as T
  }
}

const periodEnd = (s: StripeSub): number | undefined => {
  const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end
  return typeof end === 'number' ? end * 1000 : undefined
}

/** The public half of a private key: the same JWK without its secret. */
function publicOf(jwk: JsonWebKey): JsonWebKey {
  const { kty, crv, x, y } = jwk
  return { kty, crv, x, y }
}

export async function handlePayments(req: Request, env: PayEnv, send: Fetch = (i, o) => fetch(i, o), now = Date.now()): Promise<Response> {
  const url = new URL(req.url)
  const route = url.pathname.replace(/^.*\/api\//, '').replace(/\/+$/, '')
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID || !env.ENTITLEMENT_PRIVATE_JWK) {
    return reply(503, { error: 'Paying is not switched on for this site yet.' })
  }
  const call = stripe(env, send)
  const origin = (env.SITE_URL ?? url.origin).replace(/\/+$/, '')
  const jwk = JSON.parse(env.ENTITLEMENT_PRIVATE_JWK) as JsonWebKey
  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown; pass?: unknown; plan?: unknown }

  const passFor = async (sub: StripeSub): Promise<string | undefined> => {
    const until = periodEnd(sub)
    if (!until || !LIVE.has(sub.status)) return undefined
    const claims: PassClaims = { v: 1, plan: 'plus', sub: sub.id, until, iat: now }
    return signPass(claims, await importKey(jwk, 'sign'))
  }
  const held = async () => readPass(String(body.pass ?? ''), await importKey(publicOf(jwk), 'verify'))

  try {
    if (route === 'checkout') {
      // Monthly unless a year was asked for and the owner sells one (F1.1).
      const yearly = body.plan === 'annual'
      if (yearly && !env.STRIPE_ANNUAL_PRICE_ID) return reply(400, { error: 'Paying by the year is not on sale yet.' })
      const trial = Number(env.TRIAL_DAYS)
      const s = await call<{ url: string }>('POST', 'checkout/sessions', {
        mode: 'subscription',
        'line_items[0][price]': yearly ? env.STRIPE_ANNUAL_PRICE_ID! : env.STRIPE_PRICE_ID,
        'line_items[0][quantity]': '1',
        ...(Number.isInteger(trial) && trial >= 1 && trial <= 30 ? { 'subscription_data[trial_period_days]': String(trial) } : {}),
        success_url: `${origin}/plus?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing`,
      })
      return reply(200, { url: s.url })
    }
    if (route === 'claim') {
      const id = String(body.sessionId ?? '')
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return reply(400, { error: 'That is not a checkout I know.' })
      const s = await call<{ status: string; subscription?: StripeSub | string | null }>('GET', `checkout/sessions/${id}?expand%5B%5D=subscription`)
      const sub = typeof s.subscription === 'object' && s.subscription ? s.subscription : undefined
      const pass = s.status === 'complete' && sub ? await passFor(sub) : undefined
      return pass ? reply(200, { pass }) : reply(402, { error: 'That payment has not gone through.' })
    }
    if (route === 'refresh' || route === 'portal') {
      const c = await held()
      if (!c) return reply(401, { error: 'That pass is not one I signed.' })
      const sub = await call<StripeSub>('GET', `subscriptions/${encodeURIComponent(c.sub)}`)
      if (route === 'portal') {
        const p = await call<{ url: string }>('POST', 'billing_portal/sessions', { customer: sub.customer, return_url: `${origin}/pricing` })
        return reply(200, { url: p.url })
      }
      const pass = await passFor(sub)
      return pass ? reply(200, { pass }) : reply(410, { error: 'Plus has ended.' })
    }
    return reply(404, { error: 'No such route.' })
  } catch (e) {
    if (e instanceof StripeError && e.status === 404) return reply(404, { error: 'Stripe does not know that one.' })
    return reply(502, { error: 'The payment service did not answer. Try again in a minute.' })
  }
}
