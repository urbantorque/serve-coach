/**
 * The LAN preview's certificate (`npm run preview:lan`).
 *
 * A phone off localhost needs HTTPS it trusts for the camera preview, the
 * service worker and install, so the script keeps a certificate authority the
 * player installs on their phone. That authority is name-constrained to private
 * addresses. This holds the two halves of `scripts/lan-hosts.mjs` together:
 * every address the certificate names is one the authority may vouch for (a
 * name outside it fails on the phone as a bare certificate error), and the
 * constraint is the whole permitted list. It also holds that nothing is served
 * over HTTPS unasked.
 */
// @ts-expect-error - node's fs, and this project carries no @types/node
import fsUntyped from 'fs'
// @ts-expect-error - a plain .mjs helper shared with the LAN preview script
import { PERMITTED, lanHosts, nameConstraintsLine, permitted, sanLine } from '../../../scripts/lan-hosts.mjs'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const fs = fsUntyped as { readFileSync: (p: string, enc: string) => string }

type Address = { address: string; family: string | number; internal: boolean }
const v4 = (address: string, internal = false): Address => ({ address, family: 'IPv4', internal })

heading('The LAN preview certificate')

check('the certificate names this computer’s private IPv4 addresses, once each, and nothing else', () => {
  const hosts = lanHosts({
    'Wi-Fi': [v4('192.168.1.23'), { address: 'fe80::1', family: 'IPv6', internal: false }],
    'vEthernet (WSL)': [v4('172.24.80.1')],
    Tailscale: [{ address: '100.101.7.9', family: 4, internal: false }],
    Loopback: [v4('127.0.0.1', true)],
    Cellular: [v4('8.8.4.4'), v4('172.32.0.1')],
    Duplicate: [v4('192.168.1.23')],
    Down: undefined,
  }) as { name: string; address: string }[]
  const got = hosts.map((h) => h.address).join(' ')
  assert(got === '192.168.1.23 172.24.80.1 100.101.7.9', `got ${got}`)
  assert(hosts[0].name === 'Wi-Fi', 'the adapter name is lost')
  const san = sanLine(hosts) as string
  assert(san === 'DNS:localhost,IP:127.0.0.1,IP:192.168.1.23,IP:172.24.80.1,IP:100.101.7.9', `san ${san}`)
})

check('every address the certificate can name is one the authority may vouch for', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '10.255.255.255', '172.16.0.0', '172.31.255.255', '192.168.0.1', '100.64.0.1', '100.127.255.255'])
    assert(permitted(ip), `${ip} is refused`)
  for (const ip of ['8.8.8.8', '172.15.255.255', '172.32.0.0', '192.169.0.1', '100.63.255.255', '100.128.0.0', '1.2.3', 'localhost'])
    assert(!permitted(ip), `${ip} is permitted`)
})

check('the authority’s constraint is the whole permitted list, critical, and localhost', () => {
  const line = nameConstraintsLine() as string
  assert(line.startsWith('critical,'), 'the constraint is not critical, so a phone could ignore it')
  for (const [net, mask] of PERMITTED as [string, string][]) assert(line.includes(`permitted;IP:${net}/${mask}`), `${net} is missing`)
  assert(line.endsWith('permitted;DNS:localhost'), 'localhost is not permitted, and the certificate names it')
  assert(!line.includes('excluded'), 'an excluded subtree crept in')
})

check('unasked, nothing is served over HTTPS', () => {
  const config = fs.readFileSync('vite.config.ts', 'utf8')
  assert(config.includes('const lanTlsDir = process.env.LAN_TLS_DIR'), 'the TLS switch is not LAN_TLS_DIR')
  assert(config.includes('...(lanTls ? { server: { https: lanTls }, preview: { https: lanTls } } : {})'), 'HTTPS is on without the switch')
  const script = fs.readFileSync('scripts/lan-preview.mjs', 'utf8')
  assert(script.includes('LAN_TLS_DIR: dir'), 'the LAN preview does not turn HTTPS on')
  assert(!/fetch\(/.test(script), 'the LAN preview fetches something')
})

report()
