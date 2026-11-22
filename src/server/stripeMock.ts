/**
 * A stand-in for Stripe (N6.5), for the tests and for `VITE_PAYMENTS=mock` on
 * the dev server: the four calls `payments.ts` makes, answered the way
 * Stripe's API answers them, and a checkout page of its own in place of
 * Stripe's. No account, no key, no card and no money: paying here only marks
 * a pretend subscription active for thirty days.
 */

interface MockSession {
  id: string
  status: 'open' | 'complete'
  success_url: string
  cancel_url: string
  subscription?: string
  /** The price asked for, and the free days before the first charge (F1.1). */
  price?: string
  trialDays?: number
}

interface MockSub {
  id: string
  status: string
  customer: string
  items: { data: { current_period_end: number }[] }
}

const DAY = 86_400

export function stripeMock(origin: string, now: () => number = () => Date.now()) {
  let n = 0
  const sessions = new Map<string, MockSession>()
  const subs = new Map<string, MockSub>()
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const missing = () => json(404, { error: { message: 'No such object' } })

  /** What Stripe's API would answer, for the paths `payments.ts` calls. */
  const send = async (input: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(input)
    const path = u.pathname.replace(/^\/v1\//, '')
    const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
    if (!/^Bearer sk_/.test(String((init?.headers as Record<string, string> | undefined)?.authorization ?? ''))) {
      return json(401, { error: { message: 'Invalid API key' } })
    }
    if (init?.method === 'POST' && path === 'checkout/sessions') {
      const id = `cs_test_${++n}${Math.random().toString(36).slice(2, 10)}`
      const success = (form.get('success_url') ?? '').replace('{CHECKOUT_SESSION_ID}', id)
      const trial = Number(form.get('subscription_data[trial_period_days]') ?? 0)
      sessions.set(id, {
        id,
        status: 'open',
        success_url: success,
        cancel_url: form.get('cancel_url') ?? origin,
        price: form.get('line_items[0][price]') ?? undefined,
        ...(trial > 0 ? { trialDays: trial } : {}),
      })
      return json(200, { id, url: `${origin}/api/mock/checkout?session=${id}` })
    }
    let m = /^checkout\/sessions\/(cs_\w+)$/.exec(path)
    if (m) {
      const s = sessions.get(m[1])
      if (!s) return missing()
      const sub = s.subscription ? subs.get(s.subscription) : undefined
      const expand = u.searchParams.getAll('expand[]').includes('subscription')
      return json(200, { id: s.id, status: s.status, subscription: sub ? (expand ? sub : sub.id) : null })
    }
    m = /^subscriptions\/(sub_\w+)$/.exec(path)
    if (m) {
      const sub = subs.get(m[1])
      return sub ? json(200, sub) : missing()
    }
    if (init?.method === 'POST' && path === 'billing_portal/sessions') {
      const back = encodeURIComponent(form.get('return_url') ?? origin)
      return json(200, { url: `${origin}/api/mock/portal?customer=${form.get('customer')}&back=${back}` })
    }
    return missing()
  }

  /** The pretend card went through: the session completes on a new, active subscription. */
  const pay = (id: string): string | undefined => {
    const s = sessions.get(id)
    if (!s) return undefined
    if (s.status === 'open') {
      const sub = `sub_test_${++n}`
      // A trial runs first and the period ends with it; a year runs a year (F1.1).
      const days = s.trialDays ?? (/annual|year/.test(s.price ?? '') ? 365 : 30)
      subs.set(sub, {
        id: sub,
        status: s.trialDays ? 'trialing' : 'active',
        customer: `cus_test_${n}`,
        items: { data: [{ current_period_end: Math.floor(now() / 1000) + days * DAY }] },
      })
      s.status = 'complete'
      s.subscription = sub
    }
    return s.success_url
  }

  /** Cancelled in the pretend portal, which is the state a renewal then finds. */
  const cancel = (customer: string) => {
    for (const sub of subs.values()) if (sub.customer === customer) sub.status = 'canceled'
  }

  /** Time passing, for a renewal: every period moves on by `days`. */
  const renew = (days: number) => {
    for (const sub of subs.values()) for (const item of sub.items.data) item.current_period_end += days * DAY
  }

  return { send, pay, cancel, renew, sessions }
}

const PAGE = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" href="data:,">
<style>
:root { color-scheme: light; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f5f7; font: 16px/1.5 system-ui, sans-serif; color: #1b1f27; }
main { box-sizing: border-box; width: min(420px, 92vw); padding: 28px; border-radius: 16px; background: #fff; box-shadow: 0 8px 32px rgba(0,0,0,.08); }
h1 { font-size: 20px; margin: 0 0 6px; } p { margin: 0 0 18px; color: #4a5263; }
.tag { display: inline-block; margin-bottom: 14px; padding: 2px 8px; border-radius: 6px; background: #fff4d6; color: #7a5600; font-size: 13px; font-weight: 600; }
button, a.b { display: block; width: 100%; box-sizing: border-box; margin-top: 10px; padding: 14px; border: 0; border-radius: 10px; font: 600 16px system-ui, sans-serif; text-align: center; text-decoration: none; cursor: pointer; }
.pay { background: #1b1f27; color: #fff; } .quiet { background: #eceef2; color: #1b1f27; }
</style></head><body><main>${body}</main></body></html>`

/** The checkout page the stand-in shows where Stripe's would be. */
export function mockCheckoutPage(id: string, cancelUrl: string): string {
  return PAGE(
    'Test checkout',
    `<span class="tag">Test checkout, not Stripe</span>
<h1>Serve Coach Plus</h1>
<p>A stand-in for the payment page, on this computer only. No card, and no money moves.</p>
<form method="post" action="/api/mock/pay?session=${encodeURIComponent(id)}"><button class="pay" type="submit">Pay, as a test</button></form>
<a class="b quiet" href="${cancelUrl}">Back to the plans</a>`,
  )
}

/** The pretend billing portal: one button to cancel. */
export function mockPortalPage(customer: string, back: string): string {
  return PAGE(
    'Test billing',
    `<span class="tag">Test billing, not Stripe</span>
<h1>Your Plus subscription</h1>
<p>Stripe's own page would let you change your card or cancel here.</p>
<form method="post" action="/api/mock/cancel?customer=${encodeURIComponent(customer)}&back=${encodeURIComponent(back)}"><button class="pay" type="submit">Cancel Plus, as a test</button></form>
<a class="b quiet" href="${back}">Back</a>`,
  )
}
