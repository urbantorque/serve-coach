/**
 * The Plus pass (N6.5): a statement only the server can sign and any device
 * can check. These hold that it cannot be forged, stretched or misread.
 */
import { importKey, makeKeys, readPass, signPass, type PassClaims } from '../pass'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

heading('A pass the device can check by itself')

const keys = await makeKeys()
const other = await makeKeys()
const sign = await importKey(keys.privateJwk, 'sign')
const verify = await importKey(keys.publicJwk, 'verify')
const claims: PassClaims = { v: 1, plan: 'plus', sub: 'sub_123', until: Date.parse('2026-12-19T00:00:00Z'), iat: Date.parse('2026-11-19T00:00:00Z') }
const pass = await signPass(claims, sign)

const unb64 = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

await check('a signed pass reads back exactly as it was signed', async () => {
  const read = await readPass(pass, verify)
  assert(JSON.stringify(read) === JSON.stringify(claims), JSON.stringify(read))
  assert(/^[\w-]+\.[\w-]+$/.test(pass), `a pass is not two url-safe parts: ${pass}`)
})

await check('a pass stretched by editing it is refused', async () => {
  const [body, sig] = pass.split('.')
  const json = JSON.parse(unb64(body)) as PassClaims
  json.until += 365 * 86_400_000
  assert((await readPass(`${b64(JSON.stringify(json))}.${sig}`, verify)) === undefined, 'a stretched pass was accepted')
})

await check('a pass signed by any other key is refused', async () => {
  const forged = await signPass(claims, await importKey(other.privateJwk, 'sign'))
  assert((await readPass(forged, verify)) === undefined, 'a pass from another key was accepted')
})

await check('nonsense is refused without throwing', async () => {
  for (const junk of ['', '.', 'abc', 'abc.def', `${pass}x`, 'e30.e30']) assert((await readPass(junk, verify)) === undefined, `accepted "${junk}"`)
})

await check('the public half cannot sign', async () => {
  assert(!('d' in keys.publicJwk), 'the public key carries the private part')
  let refused = false
  try {
    await importKey(keys.publicJwk, 'sign')
  } catch {
    refused = true
  }
  assert(refused, 'a public key was accepted for signing')
})

report()
