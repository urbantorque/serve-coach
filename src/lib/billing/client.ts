/**
 * The app's side of paying for Plus (N6.5). Loaded only when the owner has
 * switched payments on (`config.ts`), never in the entry chunk, so a build
 * without payments carries none of it and makes no request.
 *
 * Every request goes to this site's own `/api/`, and none carries anything
 * about a serve: a checkout's id coming back from Stripe, or the pass.
 */
import { FREE } from '../plans'
import { entitlementStore } from './entitlementStore'
import { importKey, readPass } from './pass'

const STORE = 'serve-coach-pass'
/** Renew a pass this close to its end, so Plus never lapses while the subscription runs. */
const RENEW_WITHIN = 3 * 86_400_000
const BASE = import.meta.env?.BASE_URL || '/'

let key: Promise<CryptoKey | undefined> | undefined
const publicKey = () =>
  (key ??= (async () => {
    const jwk = import.meta.env?.VITE_ENTITLEMENT_PUBLIC_JWK as string | undefined
    return jwk ? importKey(JSON.parse(jwk) as JsonWebKey, 'verify') : undefined
  })())

const stored = (): string | undefined => {
  try {
    return localStorage.getItem(STORE) ?? undefined
  } catch {
    return undefined
  }
}

const keep = (pass: string | undefined) => {
  try {
    if (pass) localStorage.setItem(STORE, pass)
    else localStorage.removeItem(STORE)
  } catch {
    // Storage refused: the pass lives for this visit only.
  }
}

async function post(route: string, body: unknown): Promise<{ status: number; data: { url?: string; pass?: string; error?: string } }> {
  try {
    const res = await fetch(`${BASE}api/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, data: await res.json().catch(() => ({})) }
  } catch {
    return { status: 0, data: { error: 'No connection. Try again when you have signal.' } }
  }
}

/** Adopt a pass if it is one the server signed; free otherwise. */
async function adopt(pass: string | undefined, now = Date.now()): Promise<boolean> {
  const k = await publicKey()
  const c = pass && k ? await readPass(pass, k) : undefined
  if (!c || c.until <= now) {
    entitlementStore.set(FREE)
    return false
  }
  keep(pass)
  entitlementStore.set({ plan: 'plus', until: c.until })
  return true
}

/** On opening the app: the stored pass, renewed when it is near its end. */
export async function restore(now = Date.now()): Promise<void> {
  const pass = stored()
  if (!pass) return
  const k = await publicKey()
  const c = k ? await readPass(pass, k) : undefined
  if (!c) return keep(undefined)
  if (c.until - now < RENEW_WITHIN) await renew(pass, now)
  else await adopt(pass, now)
}

async function renew(pass: string, now: number): Promise<void> {
  const r = await post('refresh', { pass })
  if (r.status === 200 && r.data.pass) await adopt(r.data.pass, now)
  else if (r.status === 410 || r.status === 401) {
    keep(undefined)
    entitlementStore.set(FREE)
  } else await adopt(pass, now) // No answer: the pass stands until it runs out.
}

/** To Stripe's checkout. Returns a sentence to show if it could not start. */
export async function startCheckout(plan: 'monthly' | 'annual' = 'monthly'): Promise<string | undefined> {
  const r = await post('checkout', { plan })
  if (r.status === 200 && r.data.url) {
    location.assign(r.data.url)
    return undefined
  }
  return r.data.error ?? 'I could not start the checkout. Try again in a minute.'
}

/**
 * Back from paying, at `/plus?session_id=…`, or on another device at
 * `/plus#pass=…`: claim or adopt the pass, then say whether Plus is on.
 */
export async function arrive(url: URL = new URL(location.href)): Promise<'plus' | 'not-yet' | 'none'> {
  const fromHash = new URLSearchParams(url.hash.slice(1)).get('pass')
  if (fromHash) return (await adopt(fromHash)) ? 'plus' : 'not-yet'
  const sessionId = url.searchParams.get('session_id')
  if (!sessionId) return 'none'
  const r = await post('claim', { sessionId })
  return r.status === 200 && r.data.pass && (await adopt(r.data.pass)) ? 'plus' : 'not-yet'
}

/** To Stripe's own page, to change the card or cancel. */
export async function manage(): Promise<string | undefined> {
  const pass = stored()
  if (!pass) return 'There is no Plus on this device.'
  const r = await post('portal', { pass })
  if (r.status === 200 && r.data.url) {
    location.assign(r.data.url)
    return undefined
  }
  return r.data.error ?? 'I could not open your billing. Try again in a minute.'
}

/** A link that brings Plus to another device. The pass rides in the fragment, which no server sees. */
export function anotherDevice(): string | undefined {
  const pass = stored()
  return pass ? `${location.origin}${BASE}plus#pass=${pass}` : undefined
}
