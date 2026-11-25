/**
 * Paying for Plus, end to end against the stand-in for Stripe (N6.5): the
 * same handler a Cloudflare function runs, the same pass the app checks.
 * No account, no key and no network: the stand-in answers in place of Stripe.
 */
import { handlePayments, type PayEnv } from '../payments'
import { stripeMock } from '../stripeMock'
import { importKey, makeKeys, readPass } from '../../lib/billing/pass'
import { can, FREE } from '../../lib/plans'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

heading('Paying for Plus, against a stand-in for Stripe')

const ORIGIN = 'http://localhost:5186'
let clock = Date.parse('2026-11-19T12:00:00Z')
const mock = stripeMock(ORIGIN, () => clock)
const keys = await makeKeys()
const env: PayEnv = { STRIPE_SECRET_KEY: 'sk_test_stand_in', STRIPE_PRICE_ID: 'price_stand_in', ENTITLEMENT_PRIVATE_JWK: JSON.stringify(keys.privateJwk) }
const verify = await importKey(keys.publicJwk, 'verify')
const DAY = 86_400_000

type Reply = { status: number; data: { url?: string; pass?: string; error?: string } }

const call = async (route: string, body: unknown = {}, e: PayEnv = env, method = 'POST'): Promise<Reply> => {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } }
  if (method === 'POST') init.body = JSON.stringify(body)
  const res = await handlePayments(new Request(`${ORIGIN}/api/${route}`, init), e, mock.send, clock)
  return { status: res.status, data: (await res.json()) as Reply['data'] }
}

let sessionId = ''
let pass = ''

await check('a checkout opens on the stand-in, and comes back with its id', async () => {
  const r = await call('checkout')
  note(r.data.url ?? '')
  assert(r.status === 200 && Boolean(r.data.url?.startsWith(`${ORIGIN}/api/mock/checkout?session=cs_`)), JSON.stringify(r))
  sessionId = new URL(r.data.url!).searchParams.get('session')!
  const back = mock.sessions.get(sessionId)!.success_url
  assert(back === `${ORIGIN}/plus?session_id=${sessionId}`, `returns to ${back}`)
})

await check('before paying, the checkout gives no pass', async () => {
  const r = await call('claim', { sessionId })
  assert(r.status === 402 && !r.data.pass, JSON.stringify(r))
})

await check('after paying, it gives a pass the device can check, good to the end of the period', async () => {
  mock.pay(sessionId)
  const r = await call('claim', { sessionId })
  assert(r.status === 200 && typeof r.data.pass === 'string', JSON.stringify(r))
  pass = r.data.pass!
  const c = await readPass(pass, verify)
  assert(c !== undefined && c.until - clock > 29 * DAY && c.until - clock <= 30 * DAY, JSON.stringify(c))
  assert(can('compare', { entitlement: { plan: 'plus', until: c!.until }, gated: true, now: clock }), 'the pass doesn’t open Plus')
  assert(!can('compare', { entitlement: FREE, gated: true, now: clock }), 'free opened Plus')
})

await check('a renewal moves the pass on while the subscription runs', async () => {
  const before = (await readPass(pass, verify))!.until
  mock.renew(30)
  clock += 28 * DAY
  const r = await call('refresh', { pass })
  assert(r.status === 200 && Boolean(r.data.pass), JSON.stringify(r))
  const after = (await readPass(r.data.pass!, verify))!.until
  assert(after - before === 30 * DAY, `moved ${(after - before) / DAY} days`)
  pass = r.data.pass!
})

await check('the billing portal opens for the pass holder', async () => {
  const r = await call('portal', { pass })
  assert(r.status === 200 && Boolean(r.data.url?.startsWith(`${ORIGIN}/api/mock/portal?customer=cus_`)), JSON.stringify(r))
})

await check('once cancelled, a renewal says Plus has ended', async () => {
  const customer = new URL((await call('portal', { pass })).data.url!).searchParams.get('customer')!
  mock.cancel(customer)
  const r = await call('refresh', { pass })
  assert(r.status === 410 && !r.data.pass, JSON.stringify(r))
})

await check('a forged pass, a bad id, a GET and an unset site are each refused plainly', async () => {
  const other = await makeKeys()
  const s2 = new URL((await call('checkout')).data.url!).searchParams.get('session')!
  mock.pay(s2)
  const forged = (await call('claim', { sessionId: s2 }, { ...env, ENTITLEMENT_PRIVATE_JWK: JSON.stringify(other.privateJwk) })).data.pass
  assert(Boolean(forged), 'the other key signed nothing to test with')
  assert((await call('refresh', { pass: forged })).status === 401, 'a pass from another key was renewed')
  assert((await call('claim', { sessionId: 'cs_x"; drop' })).status === 400, 'a malformed id reached Stripe')
  assert((await call('claim', { sessionId: 'cs_unknown' })).status === 404, 'an unknown checkout wasn’t a 404')
  assert((await call('checkout', {}, env, 'GET')).status === 405, 'a GET was answered')
  const unset = await call('checkout', {}, {})
  assert(unset.status === 503 && /(not|n’t) switched on/.test(unset.data.error ?? ''), JSON.stringify(unset))
  assert((await call('nope')).status === 404, 'an unknown route was answered')
})

await check('when Stripe doesn’t answer, the player is told to try again, and nothing is signed', async () => {
  const down = async (): Promise<Response> => {
    throw new Error('offline')
  }
  const res = await handlePayments(new Request(`${ORIGIN}/api/claim`, { method: 'POST', body: JSON.stringify({ sessionId }) }), env, down, clock)
  const data = (await res.json()) as Reply['data']
  assert(res.status === 502 && !data.pass && /Try again/.test(data.error ?? ''), JSON.stringify(data))
})

await check('Stripe is sent a price and return addresses, never anything about a serve', async () => {
  const seen: string[] = []
  const spy = async (input: string, init?: RequestInit) => {
    seen.push(`${init?.method} ${new URL(input).pathname} ${typeof init?.body === 'string' ? init.body : ''}`)
    return mock.send(input, init)
  }
  await handlePayments(new Request(`${ORIGIN}/api/checkout`, { method: 'POST', body: '{}' }), env, spy, clock)
  note(seen.join(' | '))
  for (const s of seen) assert(!/score|landmark|video|frame|fault/i.test(s), `Stripe was sent: ${s}`)
})

heading('A year, and a trial, when the owner sells them (F1.1)')

await check('a yearly checkout asks Stripe for the yearly price, and is refused when there is none', async () => {
  const withYear: PayEnv = { ...env, STRIPE_ANNUAL_PRICE_ID: 'price_annual_stand_in' }
  const r = await call('checkout', { plan: 'annual' }, withYear)
  const id = new URL(r.data.url!).searchParams.get('session')!
  assert(mock.sessions.get(id)?.price === 'price_annual_stand_in', 'the yearly price wasn’t asked for')
  const monthly = new URL((await call('checkout', {}, withYear)).data.url!).searchParams.get('session')!
  assert(mock.sessions.get(monthly)?.price === 'price_stand_in', 'a plain checkout didn’t stay monthly')
  const none = await call('checkout', { plan: 'annual' })
  assert(none.status === 400 && /(not|n’t) on sale/.test(none.data.error ?? ''), JSON.stringify(none))
  // Paid for a year: the pass runs to the year's end.
  mock.pay(id)
  const claimed = await call('claim', { sessionId: id }, withYear)
  const c = await readPass(claimed.data.pass!, verify)
  assert(c !== undefined && c.until - clock > 300 * DAY, 'a year bought a pass for less than a year')
})

await check('a trial starts Plus at once, ends with the trial, and only a whole number of days from 1 to 30 counts', async () => {
  const trial: PayEnv = { ...env, TRIAL_DAYS: '7' }
  const id = new URL((await call('checkout', {}, trial)).data.url!).searchParams.get('session')!
  assert(mock.sessions.get(id)?.trialDays === 7, 'the trial wasn’t asked for')
  mock.pay(id)
  const c = await readPass((await call('claim', { sessionId: id }, trial)).data.pass!, verify)
  assert(c !== undefined && Math.abs(c.until - (clock + 7 * DAY)) < DAY, 'the pass doesn’t end with the trial')
  assert(can('pathway', { gated: true, entitlement: { plan: 'plus', until: c!.until }, now: clock }), 'Plus isn’t on during the trial')
  for (const bad of ['0', '45', '2.5', 'seven']) {
    const s = new URL((await call('checkout', {}, { ...env, TRIAL_DAYS: bad })).data.url!).searchParams.get('session')!
    assert(mock.sessions.get(s)?.trialDays === undefined, `a trial of "${bad}" was asked for`)
  }
  note('7-day trial: Plus on at once, pass to the trial’s end')
})

report()
