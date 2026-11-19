#!/usr/bin/env node
/**
 * Makes the Plus pass key pair (N6.5), once, on the owner's own machine:
 *
 *   node scripts/pass-keys.mjs
 *
 * Prints two lines and writes nothing. The private half signs passes on the
 * host and must stay secret: put it in the Cloudflare Pages project as the
 * secret ENTITLEMENT_PRIVATE_JWK. The public half only checks them: put it in
 * the build settings as VITE_ENTITLEMENT_PUBLIC_JWK. Make a new pair and every
 * pass already issued stops working, so do this once.
 *
 * Uses Node's own Web Crypto: no package, no network.
 */
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)

console.log('Secret, on the host only (ENTITLEMENT_PRIVATE_JWK):')
console.log(JSON.stringify(privateJwk))
console.log('')
console.log('Public, in the build (VITE_ENTITLEMENT_PUBLIC_JWK):')
console.log(JSON.stringify(publicJwk))
