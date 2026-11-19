/**
 * The Plus pass (N6.5): proof of a paid plan that this device checks itself.
 *
 * No account and no database. When a payment goes through, the server signs a
 * small statement (which subscription, and until when) with a private key only
 * it holds; the app keeps the statement and checks the signature against the
 * public key built into it. A pass cannot be written by hand or stretched by
 * editing it, and checking it needs no network.
 *
 * ECDSA on P-256 through Web Crypto, which every browser, Cloudflare's runtime
 * and Node share, so one module signs on the server and verifies in the app.
 */

export interface PassClaims {
  v: 1
  plan: 'plus'
  /** The subscription it stands for, to renew or manage it. */
  sub: string
  /** When it runs out, in ms: the end of the period paid for. */
  until: number
  /** When it was signed, in ms. */
  iat: number
}

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

const b64url = (bytes: Uint8Array): string => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function importKey(jwk: JsonWebKey, use: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ALG, false, [use])
}

/** A fresh pair, for tests and the local stand-in. The owner makes the real one once (`OWNER-STEPS.md`). */
export async function makeKeys(): Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair
  return {
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
  }
}

export async function signPass(claims: PassClaims, key: CryptoKey): Promise<string> {
  const body = new TextEncoder().encode(JSON.stringify(claims))
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN, key, body))
  return `${b64url(body)}.${b64url(sig)}`
}

/** The claims, if the signature holds and the shape is right; otherwise undefined. Never throws. */
export async function readPass(pass: string, key: CryptoKey): Promise<PassClaims | undefined> {
  try {
    const [body, sig] = pass.split('.')
    if (!body || !sig) return undefined
    const bytes = unb64url(body)
    const ok = await crypto.subtle.verify(SIGN, key, unb64url(sig), bytes)
    if (!ok) return undefined
    const c = JSON.parse(new TextDecoder().decode(bytes)) as PassClaims
    if (c.v !== 1 || c.plan !== 'plus' || typeof c.sub !== 'string' || typeof c.until !== 'number') return undefined
    return c
  } catch {
    return undefined
  }
}
